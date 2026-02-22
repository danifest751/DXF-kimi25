/**
 * @module core/nesting
 * Модуль раскладки деталей на лист металла.
 * Алгоритм: Bottom-Left Fill (BLF) с опциональным поворотом на 90°.
 */
// ─── Пресеты ────────────────────────────────────────────────────────
export const SHEET_PRESETS = [
    { label: '1000 × 2000', size: { width: 1000, height: 2000 } },
    { label: '1250 × 2500', size: { width: 1250, height: 2500 } },
    { label: '1500 × 3000', size: { width: 1500, height: 3000 } },
    { label: '1500 × 6000', size: { width: 1500, height: 6000 } },
    { label: '2000 × 6000', size: { width: 2000, height: 6000 } },
];
/**
 * Bottom-Left Fill: пытается разместить прямоугольник (w×h)
 * в самую нижнюю-левую свободную позицию на листе.
 * Использует список свободных прямоугольников (shelf-like).
 */
class SheetPacker {
    sheetW;
    sheetH;
    gap;
    freeRects;
    placed = [];
    usedArea = 0;
    constructor(sheet, gap) {
        this.sheetW = sheet.width;
        this.sheetH = sheet.height;
        this.gap = gap;
        this.freeRects = [{ x: 0, y: 0, w: this.sheetW, h: this.sheetH }];
    }
    tryPlace(itemId, name, w, h, copyIndex) {
        const g = this.gap;
        const wg = w + g;
        const hg = h + g;
        // Попытка без поворота
        const pos = this.findBestPosition(wg, hg);
        // Попытка с поворотом
        const posR = this.findBestPosition(hg, wg);
        // Выбираем лучшую позицию (самая нижняя, потом самая левая)
        let best = null;
        if (pos) {
            best = { x: pos.x, y: pos.y, rw: wg, rh: hg, rotated: false };
        }
        if (posR) {
            if (!best || posR.y < best.y || (posR.y === best.y && posR.x < best.x)) {
                best = { x: posR.x, y: posR.y, rw: hg, rh: wg, rotated: true };
            }
        }
        if (!best)
            return false;
        const placedW = best.rotated ? h : w;
        const placedH = best.rotated ? w : h;
        this.placed.push({
            itemId,
            name,
            x: best.x,
            y: best.y,
            width: placedW,
            height: placedH,
            rotated: best.rotated,
            copyIndex,
        });
        this.usedArea += w * h;
        this.splitFreeRects({ x: best.x, y: best.y, w: best.rw, h: best.rh });
        return true;
    }
    findBestPosition(w, h) {
        let bestX = Infinity;
        let bestY = Infinity;
        let found = false;
        for (const r of this.freeRects) {
            if (w <= r.w && h <= r.h) {
                if (r.y < bestY || (r.y === bestY && r.x < bestX)) {
                    bestX = r.x;
                    bestY = r.y;
                    found = true;
                }
            }
        }
        return found ? { x: bestX, y: bestY } : null;
    }
    splitFreeRects(used) {
        const newFree = [];
        for (const r of this.freeRects) {
            // Если нет пересечения — оставляем как есть
            if (used.x >= r.x + r.w || used.x + used.w <= r.x ||
                used.y >= r.y + r.h || used.y + used.h <= r.y) {
                newFree.push(r);
                continue;
            }
            // Правая часть
            if (used.x + used.w < r.x + r.w) {
                newFree.push({
                    x: used.x + used.w,
                    y: r.y,
                    w: r.x + r.w - (used.x + used.w),
                    h: r.h,
                });
            }
            // Левая часть
            if (used.x > r.x) {
                newFree.push({
                    x: r.x,
                    y: r.y,
                    w: used.x - r.x,
                    h: r.h,
                });
            }
            // Верхняя часть
            if (used.y + used.h < r.y + r.h) {
                newFree.push({
                    x: r.x,
                    y: used.y + used.h,
                    w: r.w,
                    h: r.y + r.h - (used.y + used.h),
                });
            }
            // Нижняя часть
            if (used.y > r.y) {
                newFree.push({
                    x: r.x,
                    y: r.y,
                    w: r.w,
                    h: used.y - r.y,
                });
            }
        }
        // Убираем вложенные прямоугольники
        this.freeRects = this.pruneContained(newFree);
    }
    pruneContained(rects) {
        const result = [];
        for (let i = 0; i < rects.length; i++) {
            const a = rects[i];
            let contained = false;
            for (let j = 0; j < rects.length; j++) {
                if (i === j)
                    continue;
                const b = rects[j];
                if (a.x >= b.x && a.y >= b.y &&
                    a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) {
                    contained = true;
                    break;
                }
            }
            if (!contained)
                result.push(a);
        }
        return result;
    }
}
// ─── Главная функция ────────────────────────────────────────────────
/**
 * Раскладывает детали на листы металла.
 */
export function nestItems(items, sheet, gap = 5) {
    const copies = [];
    for (const item of items) {
        for (let c = 0; c < item.quantity; c++) {
            copies.push({
                itemId: item.id,
                name: item.name,
                w: item.width,
                h: item.height,
                copyIndex: c,
                area: item.width * item.height,
            });
        }
    }
    const totalRequired = copies.length;
    // Сортировка: сначала большие по площади, потом по высоте
    copies.sort((a, b) => b.area - a.area || Math.max(b.w, b.h) - Math.max(a.w, a.h));
    const sheets = [];
    const packers = [];
    let totalPlaced = 0;
    for (const copy of copies) {
        let placed = false;
        // Пробуем разместить на существующих листах
        for (const packer of packers) {
            if (packer.tryPlace(copy.itemId, copy.name, copy.w, copy.h, copy.copyIndex)) {
                placed = true;
                totalPlaced++;
                break;
            }
        }
        // Новый лист
        if (!placed) {
            const packer = new SheetPacker(sheet, gap);
            if (packer.tryPlace(copy.itemId, copy.name, copy.w, copy.h, copy.copyIndex)) {
                packers.push(packer);
                totalPlaced++;
            }
            // Если даже на пустой лист не влезает — пропускаем
        }
    }
    const sheetArea = sheet.width * sheet.height;
    let totalFill = 0;
    for (let i = 0; i < packers.length; i++) {
        const p = packers[i];
        const fill = sheetArea > 0 ? (p.usedArea / sheetArea) * 100 : 0;
        totalFill += fill;
        sheets.push({
            sheetIndex: i,
            placed: p.placed,
            usedArea: p.usedArea,
            fillPercent: Math.round(fill * 10) / 10,
        });
    }
    return {
        sheet,
        gap,
        sheets,
        totalSheets: sheets.length,
        totalPlaced,
        totalRequired,
        avgFillPercent: sheets.length > 0
            ? Math.round((totalFill / sheets.length) * 10) / 10
            : 0,
    };
}
//# sourceMappingURL=index.js.map