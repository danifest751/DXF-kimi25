/**
 * @module zip-utils
 * Minimal ZIP store-mode builder (no compression, no external deps).
 * Produces a valid ZIP file with STORE method entries.
 */

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function crc32(data: Uint8Array): number {
  const table = _crc32Table();
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]!) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let _table: Uint32Array | null = null;
function _crc32Table(): Uint32Array {
  if (_table) return _table;
  _table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    _table[i] = c;
  }
  return _table;
}

function u16le(n: number): [number, number] {
  return [n & 0xff, (n >> 8) & 0xff];
}

function u32le(n: number): [number, number, number, number] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
}

function writeU16(buf: number[], n: number): void {
  const [a, b] = u16le(n);
  buf.push(a, b);
}

function writeU32(buf: number[], n: number): void {
  const [a, b, c, d] = u32le(n);
  buf.push(a, b, c, d);
}

export function buildZip(entries: ZipEntry[]): Blob {
  const parts: Uint8Array[] = [];
  const centralDir: number[] = [];
  let offset = 0;

  const encoder = new TextEncoder();

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // Local file header
    const lfh: number[] = [];
    lfh.push(0x50, 0x4b, 0x03, 0x04); // signature
    writeU16(lfh, 20);                 // version needed
    writeU16(lfh, 0);                  // flags
    writeU16(lfh, 0);                  // compression: STORE
    writeU16(lfh, 0);                  // mod time
    writeU16(lfh, 0);                  // mod date
    writeU32(lfh, crc);
    writeU32(lfh, size);               // compressed size
    writeU32(lfh, size);               // uncompressed size
    writeU16(lfh, nameBytes.length);
    writeU16(lfh, 0);                  // extra length
    for (const b of nameBytes) lfh.push(b);

    parts.push(new Uint8Array(lfh));
    parts.push(entry.data);

    // Central directory entry
    const cde: number[] = [];
    cde.push(0x50, 0x4b, 0x01, 0x02); // signature
    writeU16(cde, 20);                 // version made by
    writeU16(cde, 20);                 // version needed
    writeU16(cde, 0);                  // flags
    writeU16(cde, 0);                  // compression: STORE
    writeU16(cde, 0);                  // mod time
    writeU16(cde, 0);                  // mod date
    writeU32(cde, crc);
    writeU32(cde, size);
    writeU32(cde, size);
    writeU16(cde, nameBytes.length);
    writeU16(cde, 0);                  // extra
    writeU16(cde, 0);                  // comment
    writeU16(cde, 0);                  // disk start
    writeU16(cde, 0);                  // internal attr
    writeU32(cde, 0);                  // external attr
    writeU32(cde, offset);             // local header offset
    for (const b of nameBytes) cde.push(b);

    centralDir.push(...cde);
    offset += lfh.length + size;
  }

  const cdStart = offset;
  const cdSize = centralDir.length;

  // End of central directory
  const eocd: number[] = [];
  eocd.push(0x50, 0x4b, 0x05, 0x06); // signature
  writeU16(eocd, 0);                  // disk number
  writeU16(eocd, 0);                  // disk with CD start
  writeU16(eocd, entries.length);     // entries on disk
  writeU16(eocd, entries.length);     // total entries
  writeU32(eocd, cdSize);
  writeU32(eocd, cdStart);
  writeU16(eocd, 0);                  // comment length

  parts.push(new Uint8Array(centralDir));
  parts.push(new Uint8Array(eocd));

  return new Blob(parts, { type: 'application/zip' });
}
