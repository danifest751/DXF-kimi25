/**
 * @module core/render/entity-renderer
 * Отрисовка каждого типа DXF-сущности на Canvas2D.
 */
import { DXFEntityType } from '../types/index.js';
import { tessellateArc, tessellateCircle, tessellateEllipse, tessellateSpline, tessellateLWPolyline, DEG2RAD, mat4TransformPoint, IDENTITY_MATRIX, } from '../geometry/index.js';
// ─── Хелперы ────────────────────────────────────────────────────────
function colorToCSS(c) {
    if (c.a !== undefined && c.a < 1) {
        return `rgba(${c.r},${c.g},${c.b},${c.a})`;
    }
    return `rgb(${c.r},${c.g},${c.b})`;
}
function setStrokeStyle(ctx, fe, pixelSize) {
    ctx.strokeStyle = colorToCSS(fe.effectiveColor);
    const lw = fe.effectiveLineWeight;
    // lineWeight в сотых мм, конвертируем в пиксели (минимум 1 пиксель)
    ctx.lineWidth = lw > 0 ? Math.max(pixelSize, lw / 100) : pixelSize;
}
function setFillStyle(ctx, fe) {
    ctx.fillStyle = colorToCSS(fe.effectiveColor);
}
/** Трансформирует точку через матрицу (если не identity) */
function tx(m, x, y, z = 0) {
    if (m === IDENTITY_MATRIX)
        return { x, y };
    const p = mat4TransformPoint(m, { x, y, z });
    return { x: p.x, y: p.y };
}
// ─── Рендеры по типам ───────────────────────────────────────────────
function renderLine(ctx, e, m) {
    const s = tx(m, e.start.x, e.start.y, e.start.z);
    const en = tx(m, e.end.x, e.end.y, e.end.z);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(en.x, en.y);
    ctx.stroke();
}
function renderXLine(ctx, e, m, extent) {
    const p1 = tx(m, e.basePoint.x - e.direction.dx * extent, e.basePoint.y - e.direction.dy * extent);
    const p2 = tx(m, e.basePoint.x + e.direction.dx * extent, e.basePoint.y + e.direction.dy * extent);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
}
function renderRay(ctx, e, m, extent) {
    const p1 = tx(m, e.basePoint.x, e.basePoint.y, e.basePoint.z);
    const p2 = tx(m, e.basePoint.x + e.direction.dx * extent, e.basePoint.y + e.direction.dy * extent);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
}
function renderCircle(ctx, e, m, segments) {
    const pts = tessellateCircle(e.center, e.radius, segments);
    drawPolyline(ctx, pts, m, true);
}
function renderArc(ctx, e, m, segments) {
    const pts = tessellateArc(e.center, e.radius, e.startAngle, e.endAngle, segments);
    drawPolyline(ctx, pts, m, false);
}
function renderEllipse(ctx, e, m, segments) {
    const pts = tessellateEllipse(e.center, e.majorAxis, e.minorAxisRatio, e.startAngle, e.endAngle, segments);
    const isFull = Math.abs(e.endAngle - e.startAngle) >= Math.PI * 2 - 0.001;
    drawPolyline(ctx, pts, m, isFull);
}
function renderSpline(ctx, e, m, segments) {
    const pts = tessellateSpline(e.degree, e.controlPoints, e.knots, e.weights, segments);
    drawPolyline(ctx, pts, m, e.closed);
}
function renderPolyline(ctx, e, m) {
    drawPolyline3D(ctx, e.vertices, m, e.closed);
}
function renderLWPolyline(ctx, e, m, segments) {
    const pts = tessellateLWPolyline(e.vertices, e.bulges, e.closed, segments);
    if (pts.length < 2)
        return;
    ctx.beginPath();
    const p0 = tx(m, pts[0].x, pts[0].y);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
        const p = tx(m, pts[i].x, pts[i].y);
        ctx.lineTo(p.x, p.y);
    }
    if (e.closed)
        ctx.closePath();
    ctx.stroke();
}
function renderPoint(ctx, e, m, pixelSize) {
    const p = tx(m, e.location.x, e.location.y, e.location.z);
    const r = pixelSize * 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
}
function renderSolid(ctx, e, m) {
    // SOLID имеет особый порядок вершин: 0,1,3,2 (зигзаг)
    const p0 = tx(m, e.points[0].x, e.points[0].y, e.points[0].z);
    const p1 = tx(m, e.points[1].x, e.points[1].y, e.points[1].z);
    const p2 = tx(m, e.points[2].x, e.points[2].y, e.points[2].z);
    const p3 = tx(m, e.points[3].x, e.points[3].y, e.points[3].z);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.fill();
}
function renderTrace(ctx, e, m) {
    const p0 = tx(m, e.points[0].x, e.points[0].y, e.points[0].z);
    const p1 = tx(m, e.points[1].x, e.points[1].y, e.points[1].z);
    const p2 = tx(m, e.points[2].x, e.points[2].y, e.points[2].z);
    const p3 = tx(m, e.points[3].x, e.points[3].y, e.points[3].z);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.fill();
}
function renderText(ctx, e, m) {
    if (!e.text)
        return;
    const p = tx(m, e.position.x, e.position.y, e.position.z);
    const h = Math.abs(e.height) || 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, -1); // Текст рисуется в нормальной ориентации
    ctx.rotate(-e.rotation * DEG2RAD);
    ctx.font = `${h}px sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(e.text, 0, 0);
    ctx.restore();
}
function renderMText(ctx, e, m) {
    if (!e.text)
        return;
    const p = tx(m, e.position.x, e.position.y, e.position.z);
    const h = Math.abs(e.height) || 1;
    // Убираем форматирование MTEXT (\\P = перенос, {...} = стили)
    const cleanText = e.text
        .replace(/\\P/gi, '\n')
        .replace(/\\[A-Za-z][^;]*;/g, '')
        .replace(/[{}]/g, '');
    const lines = cleanText.split('\n');
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, -1);
    ctx.rotate(-e.rotation * DEG2RAD);
    ctx.font = `${h}px sans-serif`;
    ctx.textBaseline = 'top';
    const lineHeight = h * (e.lineSpacing || 1.0);
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], 0, i * lineHeight);
    }
    ctx.restore();
}
function renderHatch(ctx, e, m) {
    if (e.boundaries.length === 0)
        return;
    ctx.beginPath();
    for (const boundary of e.boundaries) {
        if (boundary.length === 0)
            continue;
        const p0 = tx(m, boundary[0].x, boundary[0].y, boundary[0].z);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < boundary.length; i++) {
            const p = tx(m, boundary[i].x, boundary[i].y, boundary[i].z);
            ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
    }
    if (e.solid) {
        ctx.globalAlpha = 0.5;
        ctx.fill('evenodd');
        ctx.globalAlpha = 1.0;
    }
    else {
        ctx.stroke();
    }
}
function renderDimension(ctx, e, m) {
    // Упрощённый рендер: линия + текст
    const dp = tx(m, e.definitionPoint.x, e.definitionPoint.y, e.definitionPoint.z);
    const tp = tx(m, e.textMidpoint.x, e.textMidpoint.y, e.textMidpoint.z);
    ctx.beginPath();
    ctx.moveTo(dp.x, dp.y);
    ctx.lineTo(tp.x, tp.y);
    ctx.stroke();
    if (e.text) {
        ctx.save();
        ctx.translate(tp.x, tp.y);
        ctx.scale(1, -1);
        ctx.font = '2px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(e.text, 0, 0);
        ctx.restore();
    }
}
function renderLeader(ctx, e, m) {
    drawPolyline3D(ctx, e.vertices, m, false);
    // Стрелка на конце (упрощённая)
    if (e.vertices.length >= 2) {
        const last = tx(m, e.vertices[e.vertices.length - 1].x, e.vertices[e.vertices.length - 1].y);
        const prev = tx(m, e.vertices[e.vertices.length - 2].x, e.vertices[e.vertices.length - 2].y);
        drawArrowHead(ctx, prev.x, prev.y, last.x, last.y);
    }
}
function renderMLeader(ctx, e, m) {
    drawPolyline3D(ctx, e.vertices, m, false);
}
function renderAttdef(ctx, e, m) {
    if (!e.defaultValue)
        return;
    const p = tx(m, e.position.x, e.position.y, e.position.z);
    const h = Math.abs(e.height) || 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, -1);
    ctx.rotate(-e.rotation * DEG2RAD);
    ctx.font = `${h}px sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(e.defaultValue, 0, 0);
    ctx.restore();
}
function renderAttrib(ctx, e, m) {
    if (!e.value)
        return;
    const p = tx(m, e.position.x, e.position.y, e.position.z);
    const h = Math.abs(e.height) || 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, -1);
    ctx.rotate(-e.rotation * DEG2RAD);
    ctx.font = `${h}px sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(e.value, 0, 0);
    ctx.restore();
}
function render3DFace(ctx, e, m) {
    const pts = e.points;
    ctx.beginPath();
    const p0 = tx(m, pts[0].x, pts[0].y, pts[0].z);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < 4; i++) {
        if (e.edgeVisibility[i - 1]) {
            const p = tx(m, pts[i].x, pts[i].y, pts[i].z);
            ctx.lineTo(p.x, p.y);
        }
        else {
            const p = tx(m, pts[i].x, pts[i].y, pts[i].z);
            ctx.moveTo(p.x, p.y);
        }
    }
    if (e.edgeVisibility[3]) {
        ctx.lineTo(p0.x, p0.y);
    }
    ctx.stroke();
}
function renderImage(_ctx, _e, _m) {
    // IMAGE рендеринг требует загрузки файла — placeholder
    // TODO: загрузка и отрисовка растрового изображения
}
function renderUnderlay(_ctx, _e, _m) {
    // UNDERLAY — placeholder
    // TODO: рендеринг PDF/DWF/DGN underlay
}
function renderViewport(ctx, e, m) {
    const hw = e.width / 2;
    const hh = e.height / 2;
    const p1 = tx(m, e.center.x - hw, e.center.y - hh);
    const p2 = tx(m, e.center.x + hw, e.center.y - hh);
    const p3 = tx(m, e.center.x + hw, e.center.y + hh);
    const p4 = tx(m, e.center.x - hw, e.center.y + hh);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.stroke();
}
// ─── Вспомогательные функции рисования ──────────────────────────────
function drawPolyline(ctx, pts, m, closed) {
    if (pts.length < 2)
        return;
    ctx.beginPath();
    const p0 = tx(m, pts[0].x, pts[0].y, pts[0].z);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
        const p = tx(m, pts[i].x, pts[i].y, pts[i].z);
        ctx.lineTo(p.x, p.y);
    }
    if (closed)
        ctx.closePath();
    ctx.stroke();
}
function drawPolyline3D(ctx, pts, m, closed) {
    drawPolyline(ctx, pts, m, closed);
}
function drawArrowHead(ctx, fromX, fromY, toX, toY) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const size = 3; // пикселей (будет масштабировано камерой)
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - size * Math.cos(angle - 0.3), toY - size * Math.sin(angle - 0.3));
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - size * Math.cos(angle + 0.3), toY - size * Math.sin(angle + 0.3));
    ctx.stroke();
}
/**
 * Рисует одну FlattenedEntity на Canvas2D.
 */
export function renderEntity(ctx, fe, opts) {
    const e = fe.entity;
    const m = fe.transform;
    setStrokeStyle(ctx, fe, opts.pixelSize);
    setFillStyle(ctx, fe);
    switch (e.type) {
        case DXFEntityType.LINE:
            renderLine(ctx, e, m);
            break;
        case DXFEntityType.XLINE:
            renderXLine(ctx, e, m, opts.viewExtent);
            break;
        case DXFEntityType.RAY:
            renderRay(ctx, e, m, opts.viewExtent);
            break;
        case DXFEntityType.CIRCLE:
            renderCircle(ctx, e, m, opts.arcSegments);
            break;
        case DXFEntityType.ARC:
            renderArc(ctx, e, m, opts.arcSegments);
            break;
        case DXFEntityType.ELLIPSE:
            renderEllipse(ctx, e, m, opts.ellipseSegments);
            break;
        case DXFEntityType.SPLINE:
            renderSpline(ctx, e, m, opts.splineSegments);
            break;
        case DXFEntityType.POLYLINE:
            renderPolyline(ctx, e, m);
            break;
        case DXFEntityType.LWPOLYLINE:
            renderLWPolyline(ctx, e, m, opts.arcSegments);
            break;
        case DXFEntityType.POINT:
            renderPoint(ctx, e, m, opts.pixelSize);
            break;
        case DXFEntityType.SOLID:
            renderSolid(ctx, e, m);
            break;
        case DXFEntityType.TRACE:
            renderTrace(ctx, e, m);
            break;
        case DXFEntityType.TEXT:
            renderText(ctx, e, m);
            break;
        case DXFEntityType.MTEXT:
            renderMText(ctx, e, m);
            break;
        case DXFEntityType.HATCH:
            renderHatch(ctx, e, m);
            break;
        case DXFEntityType.DIMENSION:
            renderDimension(ctx, e, m);
            break;
        case DXFEntityType.LEADER:
            renderLeader(ctx, e, m);
            break;
        case DXFEntityType.MLEADER:
            renderMLeader(ctx, e, m);
            break;
        case DXFEntityType.INSERT: /* уже развёрнут */ break;
        case DXFEntityType.ATTDEF:
            renderAttdef(ctx, e, m);
            break;
        case DXFEntityType.ATTRIB:
            renderAttrib(ctx, e, m);
            break;
        case DXFEntityType.THREE_D_FACE:
            render3DFace(ctx, e, m);
            break;
        case DXFEntityType.IMAGE:
            renderImage(ctx, e, m);
            break;
        case DXFEntityType.UNDERLAY:
            renderUnderlay(ctx, e, m);
            break;
        case DXFEntityType.VIEWPORT:
            renderViewport(ctx, e, m);
            break;
    }
}
//# sourceMappingURL=entity-renderer.js.map