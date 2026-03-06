import type { FlattenedEntity } from '../../../../core-engine/src/normalize/index.js';
import { DXFEntityType } from '../../../../core-engine/src/types/index.js';

function asObj(fe: FlattenedEntity): Record<string, unknown> {
  return fe.entity as unknown as Record<string, unknown>;
}

type Pt = { x: number; y: number; z?: number };

function fmt(n: number): string {
  return n.toFixed(6);
}

function writeLine(e: Record<string, unknown>): string {
  const s = e['start'] as Pt;
  const end = e['end'] as Pt;
  const layer = (e['layer'] as string | undefined) ?? '0';
  return [
    '0\nLINE',
    `8\n${layer}`,
    `10\n${fmt(s.x)}`, `20\n${fmt(s.y)}`, `30\n${fmt(s.z ?? 0)}`,
    `11\n${fmt(end.x)}`, `21\n${fmt(end.y)}`, `31\n${fmt(end.z ?? 0)}`,
  ].join('\n');
}

function writeArc(e: Record<string, unknown>): string {
  const c = e['center'] as Pt;
  const r = e['radius'] as number;
  const sa = e['startAngle'] as number;
  const ea = e['endAngle'] as number;
  const layer = (e['layer'] as string | undefined) ?? '0';
  return [
    '0\nARC',
    `8\n${layer}`,
    `10\n${fmt(c.x)}`, `20\n${fmt(c.y)}`, `30\n${fmt(c.z ?? 0)}`,
    `40\n${fmt(r)}`,
    `50\n${fmt(sa)}`,
    `51\n${fmt(ea)}`,
  ].join('\n');
}

function writeCircle(e: Record<string, unknown>): string {
  const c = e['center'] as Pt;
  const r = e['radius'] as number;
  const layer = (e['layer'] as string | undefined) ?? '0';
  return [
    '0\nCIRCLE',
    `8\n${layer}`,
    `10\n${fmt(c.x)}`, `20\n${fmt(c.y)}`, `30\n${fmt(c.z ?? 0)}`,
    `40\n${fmt(r)}`,
  ].join('\n');
}

function writeLWPolyline(e: Record<string, unknown>): string {
  const vertices = (e['vertices'] as Pt[]) ?? [];
  const closed = e['closed'] === true;
  const layer = (e['layer'] as string | undefined) ?? '0';
  const lines: string[] = [
    '0\nLWPOLYLINE',
    `8\n${layer}`,
    `90\n${vertices.length}`,
    `70\n${closed ? 1 : 0}`,
  ];
  for (const v of vertices) {
    lines.push(`10\n${fmt(v.x)}`, `20\n${fmt(v.y)}`);
  }
  return lines.join('\n');
}

function writeEntity(fe: FlattenedEntity): string | null {
  const e = asObj(fe);
  const type = e['type'] as string;
  if (type === DXFEntityType.LINE) return writeLine(e);
  if (type === DXFEntityType.ARC) return writeArc(e);
  if (type === DXFEntityType.CIRCLE) return writeCircle(e);
  if (type === DXFEntityType.LWPOLYLINE) return writeLWPolyline(e);
  return null;
}

function yieldToBrowser(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function serializeEntitiesToDxf(entities: FlattenedEntity[]): string {
  const header = [
    '0\nSECTION',
    '2\nHEADER',
    '9\n$ACADVER',
    '1\nAC1015',
    '0\nENDSEC',
    '0\nSECTION',
    '2\nENTITIES',
  ].join('\n');

  const body = entities
    .map((fe) => writeEntity(fe))
    .filter((s): s is string => s !== null)
    .join('\n');

  const footer = ['0\nENDSEC', '0\nEOF'].join('\n');

  return [header, body, footer].join('\n');
}

export async function serializeEntitiesToDxfAsync(
  entities: FlattenedEntity[],
  chunkSize = 200,
): Promise<string> {
  const header = [
    '0\nSECTION',
    '2\nHEADER',
    '9\n$ACADVER',
    '1\nAC1015',
    '0\nENDSEC',
    '0\nSECTION',
    '2\nENTITIES',
  ].join('\n');

  const bodyParts: string[] = [];
  for (let i = 0; i < entities.length; i++) {
    const serialized = writeEntity(entities[i]!);
    if (serialized !== null) bodyParts.push(serialized);
    if ((i + 1) % chunkSize === 0) {
      await yieldToBrowser();
    }
  }

  const footer = ['0\nENDSEC', '0\nEOF'].join('\n');
  return [header, bodyParts.join('\n'), footer].join('\n');
}

export async function serializeEntitiesToDxfBytesAsync(
  entities: FlattenedEntity[],
  chunkSize = 100,
): Promise<Uint8Array> {
  const parts: Uint8Array[] = [encodeText([
    '0\nSECTION',
    '2\nHEADER',
    '9\n$ACADVER',
    '1\nAC1015',
    '0\nENDSEC',
    '0\nSECTION',
    '2\nENTITIES',
  ].join('\n'))];

  let totalLength = parts[0]!.length;
  for (let i = 0; i < entities.length; i++) {
    const serialized = writeEntity(entities[i]!);
    if (serialized !== null) {
      const bytes = encodeText(`\n${serialized}`);
      parts.push(bytes);
      totalLength += bytes.length;
    }
    if ((i + 1) % chunkSize === 0) {
      await yieldToBrowser();
    }
  }

  const footer = encodeText('\n0\nENDSEC\n0\nEOF');
  parts.push(footer);
  totalLength += footer.length;

  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0; i < parts.length; i++) {
    out.set(parts[i]!, offset);
    offset += parts[i]!.length;
    if ((i + 1) % chunkSize === 0) {
      await yieldToBrowser();
    }
  }
  return out;
}
