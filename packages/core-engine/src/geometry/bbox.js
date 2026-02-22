/**
 * @module core/geometry/bbox
 * Вычисление BoundingBox для всех типов DXF-сущностей.
 */
import { DXFEntityType } from '../types/index.js';
import { tessellateArc, tessellateEllipse, tessellateSpline } from './curves.js';
import { DEG2RAD } from './math.js';
// ─── Хелперы ────────────────────────────────────────────────────────
/** Создаёт bbox из одной точки */
function bboxFromPoint(p) {
    return { min: { x: p.x, y: p.y, z: p.z }, max: { x: p.x, y: p.y, z: p.z } };
}
/** Расширяет bbox точкой */
function expandBBox(bb, p) {
    return {
        min: {
            x: Math.min(bb.min.x, p.x),
            y: Math.min(bb.min.y, p.y),
            z: Math.min(bb.min.z, p.z),
        },
        max: {
            x: Math.max(bb.max.x, p.x),
            y: Math.max(bb.max.y, p.y),
            z: Math.max(bb.max.z, p.z),
        },
    };
}
/** Объединяет два bbox */
export function mergeBBox(a, b) {
    return {
        min: {
            x: Math.min(a.min.x, b.min.x),
            y: Math.min(a.min.y, b.min.y),
            z: Math.min(a.min.z, b.min.z),
        },
        max: {
            x: Math.max(a.max.x, b.max.x),
            y: Math.max(a.max.y, b.max.y),
            z: Math.max(a.max.z, b.max.z),
        },
    };
}
/** BBox из массива 3D точек */
function bboxFromPoints3D(points) {
    if (points.length === 0)
        return null;
    let bb = bboxFromPoint(points[0]);
    for (let i = 1; i < points.length; i++) {
        bb = expandBBox(bb, points[i]);
    }
    return bb;
}
/** BBox из массива 2D точек (z=0) */
function bboxFromPoints2D(points) {
    if (points.length === 0)
        return null;
    let bb = bboxFromPoint({ x: points[0].x, y: points[0].y, z: 0 });
    for (let i = 1; i < points.length; i++) {
        bb = expandBBox(bb, { x: points[i].x, y: points[i].y, z: 0 });
    }
    return bb;
}
// ─── BBox для каждого типа сущности ─────────────────────────────────
function bboxLine(e) {
    return mergeBBox(bboxFromPoint(e.start), bboxFromPoint(e.end));
}
function bboxCircle(e) {
    return {
        min: { x: e.center.x - e.radius, y: e.center.y - e.radius, z: e.center.z },
        max: { x: e.center.x + e.radius, y: e.center.y + e.radius, z: e.center.z },
    };
}
function bboxArc(e) {
    const pts = tessellateArc(e.center, e.radius, e.startAngle, e.endAngle, 32);
    return bboxFromPoints3D(pts) ?? bboxFromPoint(e.center);
}
function bboxEllipse(e) {
    const pts = tessellateEllipse(e.center, e.majorAxis, e.minorAxisRatio, e.startAngle, e.endAngle, 32);
    return bboxFromPoints3D(pts) ?? bboxFromPoint(e.center);
}
function bboxSpline(e) {
    // Для bbox достаточно контрольных точек (convex hull property)
    // Но для точности тесселируем
    if (e.controlPoints.length === 0)
        return bboxFromPoint({ x: 0, y: 0, z: 0 });
    const pts = tessellateSpline(e.degree, e.controlPoints, e.knots, e.weights, 64);
    return bboxFromPoints3D(pts) ?? bboxFromPoints3D(e.controlPoints);
}
function bboxPolyline(e) {
    return bboxFromPoints3D(e.vertices);
}
function bboxLWPolyline(e) {
    // Для bulge-сегментов bbox может быть больше, но для приближения берём вершины
    // TODO: учесть bulge при вычислении bbox
    return bboxFromPoints2D(e.vertices);
}
function bboxPoint(e) {
    return bboxFromPoint(e.location);
}
function bboxSolid(e) {
    return bboxFromPoints3D(e.points);
}
function bboxTrace(e) {
    return bboxFromPoints3D(e.points);
}
function bboxText(e) {
    // Приблизительный bbox для текста
    const h = e.height || 1;
    const w = h * e.widthFactor * Math.max(1, e.text.length) * 0.6;
    const rad = e.rotation * DEG2RAD;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // 4 угла прямоугольника текста
    const corners = [
        e.position,
        { x: e.position.x + w * cos, y: e.position.y + w * sin, z: e.position.z },
        { x: e.position.x + w * cos - h * sin, y: e.position.y + w * sin + h * cos, z: e.position.z },
        { x: e.position.x - h * sin, y: e.position.y + h * cos, z: e.position.z },
    ];
    return bboxFromPoints3D(corners);
}
function bboxMText(e) {
    const h = e.height || 1;
    const w = e.width || h * Math.max(1, e.text.length) * 0.6;
    // Количество строк (приблизительно)
    const lines = Math.max(1, Math.ceil(e.text.length * h * 0.6 / (w || 1)));
    const totalH = h * lines * (e.lineSpacing || 1);
    return {
        min: { x: e.position.x, y: e.position.y - totalH, z: e.position.z },
        max: { x: e.position.x + w, y: e.position.y + h, z: e.position.z },
    };
}
function bboxHatch(e) {
    const allPoints = [];
    for (const boundary of e.boundaries) {
        for (const pt of boundary) {
            allPoints.push(pt);
        }
    }
    return bboxFromPoints3D(allPoints);
}
function bboxDimension(e) {
    return mergeBBox(bboxFromPoint(e.definitionPoint), bboxFromPoint(e.textMidpoint));
}
function bboxLeader(e) {
    return bboxFromPoints3D(e.vertices);
}
function bboxMLeader(e) {
    return bboxFromPoints3D(e.vertices);
}
function bboxInsert(e) {
    // Без знания содержимого блока — bbox = точка вставки
    return bboxFromPoint(e.position);
}
function bboxAttdef(e) {
    const h = e.height || 1;
    return {
        min: { x: e.position.x, y: e.position.y, z: e.position.z },
        max: { x: e.position.x + h * 5, y: e.position.y + h, z: e.position.z },
    };
}
function bboxAttrib(e) {
    const h = e.height || 1;
    return {
        min: { x: e.position.x, y: e.position.y, z: e.position.z },
        max: { x: e.position.x + h * 5, y: e.position.y + h, z: e.position.z },
    };
}
function bbox3DFace(e) {
    return bboxFromPoints3D(e.points);
}
function bboxImage(e) {
    // Приблизительно: position + u*width + v*height
    const p = e.position;
    const corners = [
        p,
        { x: p.x + e.uVector.dx * e.width, y: p.y + e.uVector.dy * e.width, z: p.z + e.uVector.dz * e.width },
        {
            x: p.x + e.uVector.dx * e.width + e.vVector.dx * e.height,
            y: p.y + e.uVector.dy * e.width + e.vVector.dy * e.height,
            z: p.z + e.uVector.dz * e.width + e.vVector.dz * e.height,
        },
        { x: p.x + e.vVector.dx * e.height, y: p.y + e.vVector.dy * e.height, z: p.z + e.vVector.dz * e.height },
    ];
    return bboxFromPoints3D(corners);
}
function bboxUnderlay(e) {
    return bboxFromPoint(e.position);
}
function bboxViewport(e) {
    const hw = e.width / 2;
    const hh = e.height / 2;
    return {
        min: { x: e.center.x - hw, y: e.center.y - hh, z: e.center.z },
        max: { x: e.center.x + hw, y: e.center.y + hh, z: e.center.z },
    };
}
function bboxXLine(e) {
    // Бесконечная линия — bbox = большой диапазон от basePoint
    const ext = 1e6;
    return {
        min: { x: e.basePoint.x - ext, y: e.basePoint.y - ext, z: e.basePoint.z - ext },
        max: { x: e.basePoint.x + ext, y: e.basePoint.y + ext, z: e.basePoint.z + ext },
    };
}
function bboxRay(e) {
    const ext = 1e6;
    const endPt = {
        x: e.basePoint.x + e.direction.dx * ext,
        y: e.basePoint.y + e.direction.dy * ext,
        z: e.basePoint.z + e.direction.dz * ext,
    };
    return mergeBBox(bboxFromPoint(e.basePoint), bboxFromPoint(endPt));
}
// ─── Главная функция ────────────────────────────────────────────────
/**
 * Вычисляет BoundingBox для любой DXF-сущности.
 * @param entity - Сущность
 * @returns BoundingBox или null
 */
export function computeEntityBBox(entity) {
    switch (entity.type) {
        case DXFEntityType.LINE: return bboxLine(entity);
        case DXFEntityType.XLINE: return bboxXLine(entity);
        case DXFEntityType.RAY: return bboxRay(entity);
        case DXFEntityType.CIRCLE: return bboxCircle(entity);
        case DXFEntityType.ARC: return bboxArc(entity);
        case DXFEntityType.ELLIPSE: return bboxEllipse(entity);
        case DXFEntityType.SPLINE: return bboxSpline(entity);
        case DXFEntityType.POLYLINE: return bboxPolyline(entity);
        case DXFEntityType.LWPOLYLINE: return bboxLWPolyline(entity);
        case DXFEntityType.POINT: return bboxPoint(entity);
        case DXFEntityType.SOLID: return bboxSolid(entity);
        case DXFEntityType.TRACE: return bboxTrace(entity);
        case DXFEntityType.TEXT: return bboxText(entity);
        case DXFEntityType.MTEXT: return bboxMText(entity);
        case DXFEntityType.HATCH: return bboxHatch(entity);
        case DXFEntityType.DIMENSION: return bboxDimension(entity);
        case DXFEntityType.LEADER: return bboxLeader(entity);
        case DXFEntityType.MLEADER: return bboxMLeader(entity);
        case DXFEntityType.INSERT: return bboxInsert(entity);
        case DXFEntityType.ATTDEF: return bboxAttdef(entity);
        case DXFEntityType.ATTRIB: return bboxAttrib(entity);
        case DXFEntityType.THREE_D_FACE: return bbox3DFace(entity);
        case DXFEntityType.IMAGE: return bboxImage(entity);
        case DXFEntityType.UNDERLAY: return bboxUnderlay(entity);
        case DXFEntityType.VIEWPORT: return bboxViewport(entity);
        default:
            return null;
    }
}
/**
 * Вычисляет bbox для массива сущностей и записывает его в каждую сущность.
 * @param entities - Массив сущностей (мутирует boundingBox)
 * @returns Общий BoundingBox или null
 */
export function computeAllBBoxes(entities) {
    let total = null;
    for (const entity of entities) {
        const bb = computeEntityBBox(entity);
        if (bb !== null) {
            entity.boundingBox = bb;
            total = total === null ? bb : mergeBBox(total, bb);
        }
    }
    return total;
}
//# sourceMappingURL=bbox.js.map