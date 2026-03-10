import type { NestingResults, SheetResult } from './types.js';
import { loadedFiles } from '../state.js';
import { renderEntity } from '../../../core-engine/src/render/entity-renderer.js';
import type { EntityRenderOptions } from '../../../core-engine/src/render/entity-renderer.js';

const SHEET_PART_COLORS = [
  '#818cf8', '#4ade80', '#fbbf24', '#22d3ee', '#f87171',
  '#c084fc', '#f472b6', '#2dd4bf', '#fb923c', '#a78bfa',
  '#34d399', '#60a5fa', '#facc15', '#e879f9', '#38bdf8',
];

function buildSheetSvg(sheet: SheetResult): string {
  const W = sheet.sheetWidth;
  const H = sheet.sheetHeight;
  const PAD = 20;
  const svgW = W + PAD * 2;
  const svgH = H + PAD * 2;

  const colorMap = new Map<number, string>();
  let colorIdx = 0;
  for (const p of sheet.placements) {
    if (!colorMap.has(p.itemId)) {
      colorMap.set(p.itemId, SHEET_PART_COLORS[colorIdx++ % SHEET_PART_COLORS.length]!);
    }
  }

  const partsMarkup = sheet.placements.map((p) => {
    const color = colorMap.get(p.itemId) ?? '#818cf8';
    const lf = loadedFiles.find((f) => f.id === p.itemId);
    const angleDeg = p.angleDeg ?? 0;

    // SVG coordinate system: Y grows down. DXF: Y grows up.
    // p.x, p.y = bottom-left corner of placed bbox in sheet coords (Y-up).
    // SVG position of top-left corner: tx = PAD + p.x, ty = PAD + (H - p.y - p.h)
    const tx = PAD + p.x;
    const ty = PAD + (H - p.y - p.h);

    if (lf && lf.doc && lf.doc.flatEntities.length > 0) {
      const bb = lf.doc.totalBBox;
      if (bb) {
        const bbW = Math.max(1e-6, bb.max.x - bb.min.x);
        const bbH = Math.max(1e-6, bb.max.y - bb.min.y);

        // Canvas size = original (unrotated) part bbox in pixels
        const scale = Math.max(1e-6, Math.min(2000 / bbW, 2000 / bbH, 4));
        const cW = Math.max(1, Math.round(bbW * scale));
        const cH = Math.max(1, Math.round(bbH * scale));
        const cx = bb.min.x + bbW / 2;
        const cy = bb.min.y + bbH / 2;

        const canvas = document.createElement('canvas');
        canvas.width = cW;
        canvas.height = cH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, cW, cH);
          // DXF Y-up → canvas Y-down flip, no rotation (rotation handled by SVG transform)
          ctx.save();
          ctx.translate(cW / 2, cH / 2);
          ctx.scale(scale, -scale);
          ctx.translate(-cx, -cy);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1 / scale;
          const opts: EntityRenderOptions = {
            arcSegments: 32,
            splineSegments: 32,
            ellipseSegments: 32,
            pixelSize: 1 / scale,
            viewExtent: Math.max(bbW, bbH) * 2,
          };
          for (const fe of lf.doc.flatEntities) renderEntity(ctx, fe, opts);
          ctx.restore();
          const dataUrl = canvas.toDataURL('image/png');

          // SVG transform (applied right-to-left):
          // 1. scale(1,-1)          — compensate for canvas Y-flip (DXF Y-up was flipped in canvas)
          // 2. rotate(-angleDeg)    — DXF rotation is CCW, SVG rotate() is CW → negate
          // 3. translate(bboxCx,bboxCy) — move to placement bbox centre in SVG coords
          const bboxCx = (tx + p.w / 2).toFixed(3);
          const bboxCy = (ty + p.h / 2).toFixed(3);

          // After SVG rotate(-angleDeg), the image's bbW maps to p.w and bbH maps to p.h
          // (the engine stores p.w/p.h as the post-rotation bbox).
          // So the scale that makes the unrotated image fit after rotation:
          const angleRad = (angleDeg * Math.PI) / 180;
          const cosA = Math.abs(Math.cos(angleRad));
          const sinA = Math.abs(Math.sin(angleRad));
          // rotated bbox of bbW×bbH:  rW = bbW*cos + bbH*sin, rH = bbW*sin + bbH*cos
          const rW = bbW * cosA + bbH * sinA;
          const rH = bbW * sinA + bbH * cosA;
          const imgScale = Math.min(p.w / rW, p.h / rH);
          const drawW = (bbW * imgScale).toFixed(3);
          const drawH = (bbH * imgScale).toFixed(3);
          const imgX = (-(bbW * imgScale) / 2).toFixed(3);
          const imgY = (-(bbH * imgScale) / 2).toFixed(3);
          return `<image href="${dataUrl}" x="${imgX}" y="${imgY}" width="${drawW}" height="${drawH}" transform="translate(${bboxCx},${bboxCy}) rotate(${(-angleDeg).toFixed(2)}) scale(1,-1)" />`;
        }
      }
    }

    // Fallback: filled rectangle
    return `
      <rect x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" width="${p.w.toFixed(1)}" height="${p.h.toFixed(1)}"
        fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="1" rx="1">
        <title>${p.name}</title>
      </rect>
      <text x="${(tx + p.w / 2).toFixed(1)}" y="${(ty + p.h / 2 + 4).toFixed(1)}"
        text-anchor="middle" font-size="10" fill="${color}" font-family="monospace">${p.name.slice(0, 8)}</text>`;
  }).join('\n');

  const tableRows = sheet.placements.map((p, i) =>
    `<tr><td>${i + 1}</td><td>${p.name}</td><td>${p.w.toFixed(0)}×${p.h.toFixed(0)}</td><td>${(p.angleDeg ?? 0).toFixed(0)}°</td></tr>`,
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${svgW}" height="${svgH + 200}" viewBox="0 0 ${svgW} ${svgH + 200}">
  <style>
    text { font-family: 'Segoe UI', Arial, sans-serif; }
    table { font-size: 11px; }
    tr:nth-child(even) { background: #f0f4ff; }
    td { padding: 2px 6px; }
  </style>
  <!-- Sheet background -->
  <rect x="${PAD}" y="${PAD}" width="${W}" height="${H}" fill="#0a1628" stroke="#334e7a" stroke-width="1.5"/>
  <!-- Parts -->
  ${partsMarkup}
  <!-- Sheet border -->
  <rect x="${PAD}" y="${PAD}" width="${W}" height="${H}" fill="none" stroke="#5b7fa6" stroke-width="2"/>
  <!-- Info header -->
  <text x="${PAD}" y="${svgH + 16}" font-size="13" fill="#1e3a5f" font-weight="bold">
    Sheet ${sheet.id.toUpperCase()} — ${W}×${H} mm — ${sheet.utilization}% utilization — ${sheet.partCount} parts
  </text>
  <!-- Parts table -->
  <foreignObject x="${PAD}" y="${svgH + 28}" width="${svgW - PAD}" height="170">
    <table xmlns="http://www.w3.org/1999/xhtml" style="border-collapse:collapse;font-size:11px;width:100%">
      <thead><tr style="background:#1e3a5f;color:white">
        <th style="padding:2px 6px">#</th>
        <th style="padding:2px 6px">Name</th>
        <th style="padding:2px 6px">Size</th>
        <th style="padding:2px 6px">Angle</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </foreignObject>
</svg>`;
}

export function exportSheetAsSvg(sheet: SheetResult, filename?: string): void {
  const svg = buildSheetSvg(sheet);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `sheet-${sheet.id}.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function exportAllSheetsAsSvg(results: NestingResults): void {
  for (let i = 0; i < results.sheets.length; i++) {
    const sheet = results.sheets[i]!;
    setTimeout(() => exportSheetAsSvg(sheet, `sheet-${i + 1}-${sheet.id}.svg`), i * 80);
  }
}

export function printResultsAsPdf(results: NestingResults): void {
  const sheets = results.sheets;
  const svgs = sheets.map((s) => buildSheetSvg(s));

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Nesting Results</title>
  <style>
    body { margin: 0; background: #fff; font-family: 'Segoe UI', Arial, sans-serif; }
    .page { page-break-after: always; padding: 16px; }
    .page:last-child { page-break-after: auto; }
    h2 { margin: 0 0 8px; font-size: 14px; color: #1e3a5f; }
    @media print { @page { margin: 8mm; } }
  </style>
</head>
<body>
${sheets.map((s, i) => `
  <div class="page">
    <h2>Sheet ${i + 1} — ${s.sheetWidth}×${s.sheetHeight} mm — ${s.utilization}% — ${s.partCount} parts</h2>
    ${svgs[i]}
  </div>`).join('\n')}
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}
