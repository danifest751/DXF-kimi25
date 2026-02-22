/**
 * @module core/cutting
 * Подсчёт параметров лазерной резки:
 * - Количество врезок (pierces) — каждый непрерывный контур/цепочка = 1 врезка
 * - Длина реза (cut length) — суммарная длина всех режущих путей
 *
 * Алгоритм:
 * 1. Извлекаем начальную/конечную точку каждой режущей сущности
 * 2. Объединяем сущности в цепочки (chains) по совпадению конечных точек
 * 3. Каждая цепочка = 1 врезка (pierce)
 * 4. Замкнутые сущности (CIRCLE, closed POLYLINE/LWPOLYLINE/SPLINE/ELLIPSE) = 1 врезка сами по себе
 */
import { DXFEntityType } from '../types/index.js';
import { tessellateArc, tessellateEllipse, tessellateSpline, tessellateLWPolyline, distPt3, EPSILON, mat4TransformPoint, IDENTITY_MATRIX, } from '../geometry/index.js';
/** Допуск совпадения конечных точек (в единицах чертежа) */
const CHAIN_TOLERANCE = 0.01;
/** Извлекает start/end точки и длину режущей сущности */
function getEntityEndpoints(fe, flatIndex) {
    const e = fe.entity;
    const m = fe.transform;
    switch (e.type) {
        case DXFEntityType.LINE: {
            const s = transformPt(m, e.start);
            const en = transformPt(m, e.end);
            const len = distPt3(s, en);
            if (len < EPSILON)
                return null;
            return { flatIndex, startPt: s, endPt: en, cutLength: len, isSelfClosed: false, layer: fe.effectiveLayer };
        }
        case DXFEntityType.CIRCLE: {
            const c = transformPt(m, e.center);
            const edge = transformPt(m, { x: e.center.x + e.radius, y: e.center.y, z: e.center.z });
            const scaledR = distPt3(c, edge);
            const len = 2 * Math.PI * scaledR;
            return { flatIndex, startPt: c, endPt: c, cutLength: len, isSelfClosed: true, layer: fe.effectiveLayer };
        }
        case DXFEntityType.ARC: {
            const pts = tessellateArc(e.center, e.radius, e.startAngle, e.endAngle, 64);
            if (pts.length < 2)
                return null;
            const s = transformPt(m, pts[0]);
            const en = transformPt(m, pts[pts.length - 1]);
            const len = polylineLength3D(pts, m);
            if (len < EPSILON)
                return null;
            return { flatIndex, startPt: s, endPt: en, cutLength: len, isSelfClosed: false, layer: fe.effectiveLayer };
        }
        case DXFEntityType.ELLIPSE: {
            const isFull = Math.abs(e.endAngle - e.startAngle) >= Math.PI * 2 - 0.01;
            const pts = tessellateEllipse(e.center, e.majorAxis, e.minorAxisRatio, e.startAngle, e.endAngle, 64);
            if (pts.length < 2)
                return null;
            const s = transformPt(m, pts[0]);
            const en = transformPt(m, pts[pts.length - 1]);
            const len = polylineLength3D(pts, m);
            if (len < EPSILON)
                return null;
            return { flatIndex, startPt: s, endPt: en, cutLength: len, isSelfClosed: isFull, layer: fe.effectiveLayer };
        }
        case DXFEntityType.SPLINE: {
            if (e.controlPoints.length < 2)
                return null;
            const pts = tessellateSpline(e.degree, e.controlPoints, e.knots, e.weights, 128);
            if (pts.length < 2)
                return null;
            const s = transformPt(m, pts[0]);
            const en = transformPt(m, pts[pts.length - 1]);
            let len = polylineLength3D(pts, m);
            if (e.closed)
                len += distPt3(s, en);
            if (len < EPSILON)
                return null;
            return { flatIndex, startPt: s, endPt: en, cutLength: len, isSelfClosed: e.closed, layer: fe.effectiveLayer };
        }
        case DXFEntityType.POLYLINE: {
            if (e.vertices.length < 2)
                return null;
            const s = transformPt(m, e.vertices[0]);
            const en = transformPt(m, e.vertices[e.vertices.length - 1]);
            let len = polylineLength3D(e.vertices, m);
            if (e.closed)
                len += distPt3(s, en);
            if (len < EPSILON)
                return null;
            return { flatIndex, startPt: s, endPt: en, cutLength: len, isSelfClosed: e.closed, layer: fe.effectiveLayer };
        }
        case DXFEntityType.LWPOLYLINE: {
            const pts2d = tessellateLWPolyline(e.vertices, e.bulges, e.closed, 64);
            if (pts2d.length < 2)
                return null;
            const s = transformPt2to3(m, pts2d[0]);
            const en = transformPt2to3(m, pts2d[pts2d.length - 1]);
            let len = 0;
            let prev = s;
            for (let i = 1; i < pts2d.length; i++) {
                const cur = transformPt2to3(m, pts2d[i]);
                len += distPt3(prev, cur);
                prev = cur;
            }
            if (e.closed)
                len += distPt3(prev, s);
            if (len < EPSILON)
                return null;
            return { flatIndex, startPt: s, endPt: en, cutLength: len, isSelfClosed: e.closed, layer: fe.effectiveLayer };
        }
        default:
            return null;
    }
}
// ─── Chain detection (Union-Find) ───────────────────────────────────
/**
 * Объединяет сущности в цепочки по совпадению конечных точек.
 * Используем Union-Find для эффективного объединения.
 */
function buildChains(endpoints, tolerance) {
    const n = endpoints.length;
    if (n === 0)
        return [];
    // Самозамкнутые сущности — отдельные цепочки сразу
    const selfClosed = [];
    const chainable = [];
    for (const ep of endpoints) {
        if (ep.isSelfClosed) {
            selfClosed.push(ep);
        }
        else {
            chainable.push(ep);
        }
    }
    // Union-Find
    const parent = new Int32Array(chainable.length);
    for (let i = 0; i < chainable.length; i++)
        parent[i] = i;
    function find(x) {
        while (parent[x] !== x) {
            parent[x] = parent[parent[x]]; // path compression
            x = parent[x];
        }
        return x;
    }
    function union(a, b) {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb)
            parent[ra] = rb;
    }
    // Сравниваем все пары конечных точек
    // Для каждой сущности есть 2 конечных точки (start, end)
    // Если конец одной совпадает с началом/концом другой — union
    // Оптимизация: используем пространственный хеш
    const gridSize = Math.max(tolerance * 10, 1);
    const pointMap = new Map();
    function gridKey(p) {
        const gx = Math.round(p.x / gridSize);
        const gy = Math.round(p.y / gridSize);
        return `${gx},${gy}`;
    }
    function getNeighborKeys(p) {
        const gx = Math.round(p.x / gridSize);
        const gy = Math.round(p.y / gridSize);
        const keys = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                keys.push(`${gx + dx},${gy + dy}`);
            }
        }
        return keys;
    }
    const allPoints = [];
    for (let i = 0; i < chainable.length; i++) {
        const ep = chainable[i];
        allPoints.push({ pt: ep.startPt, entityIdx: i });
        allPoints.push({ pt: ep.endPt, entityIdx: i });
    }
    // Заполняем grid
    for (let k = 0; k < allPoints.length; k++) {
        const key = gridKey(allPoints[k].pt);
        let list = pointMap.get(key);
        if (list === undefined) {
            list = [];
            pointMap.set(key, list);
        }
        list.push(k);
    }
    // Для каждой точки ищем соседей в grid
    const tolSq = tolerance * tolerance;
    for (let k = 0; k < allPoints.length; k++) {
        const entry = allPoints[k];
        const neighborKeys = getNeighborKeys(entry.pt);
        for (const nk of neighborKeys) {
            const list = pointMap.get(nk);
            if (list === undefined)
                continue;
            for (const j of list) {
                if (j <= k)
                    continue; // avoid duplicate pairs
                const other = allPoints[j];
                if (other.entityIdx === entry.entityIdx)
                    continue; // same entity
                const dx = entry.pt.x - other.pt.x;
                const dy = entry.pt.y - other.pt.y;
                const dz = entry.pt.z - other.pt.z;
                const distSq = dx * dx + dy * dy + dz * dz;
                if (distSq <= tolSq) {
                    union(entry.entityIdx, other.entityIdx);
                }
            }
        }
    }
    // Группируем по корню Union-Find
    const groups = new Map();
    for (let i = 0; i < chainable.length; i++) {
        const root = find(i);
        let list = groups.get(root);
        if (list === undefined) {
            list = [];
            groups.set(root, list);
        }
        list.push(i);
    }
    // Формируем результат
    const chains = [];
    let chainIdx = 0;
    // Самозамкнутые — каждая = отдельная цепочка
    for (const ep of selfClosed) {
        chains.push({
            chainIndex: chainIdx++,
            entityIndices: [ep.flatIndex],
            cutLength: ep.cutLength,
            isClosed: true,
            layer: ep.layer,
            piercePoint: ep.startPt,
        });
    }
    // Цепочки из chainable
    for (const members of groups.values()) {
        let totalLen = 0;
        const indices = [];
        let layer = '';
        // Проверяем замкнутость цепочки:
        // Собираем все конечные точки цепочки. Если каждая точка встречается
        // чётное число раз (с учётом tolerance) — цепочка замкнута.
        const chainPoints = [];
        for (const mi of members) {
            const ep = chainable[mi];
            totalLen += ep.cutLength;
            indices.push(ep.flatIndex);
            if (!layer)
                layer = ep.layer;
            chainPoints.push(ep.startPt);
            chainPoints.push(ep.endPt);
        }
        // Подсчёт уникальных точек: если все точки спарены — замкнуто
        const isClosed = isChainClosed(chainPoints, tolerance);
        // Точка врезки — startPt первой сущности в цепочке
        const firstEp = chainable[members[0]];
        chains.push({
            chainIndex: chainIdx++,
            entityIndices: indices,
            cutLength: totalLen,
            isClosed,
            layer,
            piercePoint: firstEp.startPt,
        });
    }
    return chains;
}
/** Проверяет замкнутость цепочки: каждая конечная точка должна иметь пару */
function isChainClosed(points, tolerance) {
    if (points.length < 2)
        return false;
    const tolSq = tolerance * tolerance;
    const used = new Uint8Array(points.length);
    for (let i = 0; i < points.length; i++) {
        if (used[i])
            continue;
        let foundPair = false;
        for (let j = i + 1; j < points.length; j++) {
            if (used[j])
                continue;
            const dx = points[i].x - points[j].x;
            const dy = points[i].y - points[j].y;
            const dz = points[i].z - points[j].z;
            if (dx * dx + dy * dy + dz * dz <= tolSq) {
                used[i] = 1;
                used[j] = 1;
                foundPair = true;
                break;
            }
        }
        if (!foundPair)
            return false;
    }
    return true;
}
// ─── Хелперы ────────────────────────────────────────────────────────
function transformPt(m, p) {
    if (m === IDENTITY_MATRIX)
        return p;
    return mat4TransformPoint(m, p);
}
function transformPt2to3(m, p) {
    return transformPt(m, { x: p.x, y: p.y, z: 0 });
}
function polylineLength3D(pts, m) {
    if (pts.length < 2)
        return 0;
    let len = 0;
    let prev = transformPt(m, pts[0]);
    for (let i = 1; i < pts.length; i++) {
        const cur = transformPt(m, pts[i]);
        len += distPt3(prev, cur);
        prev = cur;
    }
    return len;
}
function isCuttingEntity(e) {
    switch (e.type) {
        case DXFEntityType.LINE:
        case DXFEntityType.CIRCLE:
        case DXFEntityType.ARC:
        case DXFEntityType.ELLIPSE:
        case DXFEntityType.SPLINE:
        case DXFEntityType.POLYLINE:
        case DXFEntityType.LWPOLYLINE:
            return true;
        default:
            return false;
    }
}
// ─── Главная функция ────────────────────────────────────────────────
/**
 * Вычисляет параметры лазерной резки для нормализованного документа.
 *
 * Алгоритм:
 * 1. Извлекаем конечные точки каждой режущей сущности
 * 2. Объединяем смежные сущности в цепочки (chains) через Union-Find
 * 3. Каждая цепочка = 1 врезка (pierce)
 * 4. Замкнутые сущности (CIRCLE, closed POLYLINE и т.д.) = 1 врезка
 *
 * @param doc - Нормализованный документ
 * @param layerFilter - Опциональный фильтр слоёв
 * @param tolerance - Допуск совпадения точек (по умолчанию 0.01)
 * @returns Статистика резки
 */
export function computeCuttingStats(doc, layerFilter, tolerance = CHAIN_TOLERANCE) {
    // 1. Собираем endpoints всех режущих сущностей
    const allEndpoints = [];
    for (let i = 0; i < doc.flatEntities.length; i++) {
        const fe = doc.flatEntities[i];
        const e = fe.entity;
        if (!e.visible)
            continue;
        if (layerFilter !== undefined && !layerFilter.has(fe.effectiveLayer))
            continue;
        if (!isCuttingEntity(e))
            continue;
        const ep = getEntityEndpoints(fe, i);
        if (ep !== null) {
            allEndpoints.push(ep);
        }
    }
    // 2. Строим цепочки
    const chains = buildChains(allEndpoints, tolerance);
    // 3. Считаем статистику
    let totalPierces = chains.length;
    let totalCutLength = 0;
    let closedContours = 0;
    let openPaths = 0;
    const layerMap = new Map();
    for (const chain of chains) {
        totalCutLength += chain.cutLength;
        if (chain.isClosed)
            closedContours++;
        else
            openPaths++;
        const layerName = chain.layer;
        let ls = layerMap.get(layerName);
        if (ls === undefined) {
            ls = { pierces: 0, cutLength: 0, entityCount: 0 };
            layerMap.set(layerName, ls);
        }
        ls.pierces += 1;
        ls.cutLength += chain.cutLength;
        ls.entityCount += chain.entityIndices.length;
    }
    const byLayer = new Map();
    for (const [name, stats] of layerMap) {
        byLayer.set(name, {
            layerName: name,
            pierces: stats.pierces,
            cutLength: stats.cutLength,
            entityCount: stats.entityCount,
        });
    }
    return {
        totalPierces,
        totalCutLength,
        chains,
        byLayer,
        closedContours,
        openPaths,
        cuttingEntityCount: allEndpoints.length,
    };
}
/**
 * Форматирует длину реза в удобочитаемый вид.
 * @param length - Длина в единицах чертежа
 * @param units - Единицы ('mm' | 'm')
 * @returns Строка с единицами
 */
export function formatCutLength(length, units = 'mm') {
    if (units === 'm') {
        return `${(length / 1000).toFixed(3)} м`;
    }
    return `${length.toFixed(2)} мм`;
}
//# sourceMappingURL=index.js.map