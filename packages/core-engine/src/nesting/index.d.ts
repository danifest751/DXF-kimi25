/**
 * @module core/nesting
 * Модуль раскладки деталей на лист металла.
 * Алгоритм: Bottom-Left Fill (BLF) с опциональным поворотом на 90°.
 */
/** Размер листа металла (мм) */
export interface SheetSize {
    readonly width: number;
    readonly height: number;
}
/** Пресет листа */
export interface SheetPreset {
    readonly label: string;
    readonly size: SheetSize;
}
/** Деталь для раскладки */
export interface NestingItem {
    readonly id: number;
    readonly name: string;
    readonly width: number;
    readonly height: number;
    readonly quantity: number;
}
/** Размещённая деталь на листе */
export interface PlacedItem {
    readonly itemId: number;
    readonly name: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly rotated: boolean;
    readonly copyIndex: number;
}
/** Один лист с размещёнными деталями */
export interface NestingSheet {
    readonly sheetIndex: number;
    readonly placed: readonly PlacedItem[];
    readonly usedArea: number;
    readonly fillPercent: number;
}
/** Результат раскладки */
export interface NestingResult {
    readonly sheet: SheetSize;
    readonly gap: number;
    readonly sheets: readonly NestingSheet[];
    readonly totalSheets: number;
    readonly totalPlaced: number;
    readonly totalRequired: number;
    readonly avgFillPercent: number;
}
export declare const SHEET_PRESETS: readonly SheetPreset[];
/**
 * Раскладывает детали на листы металла.
 */
export declare function nestItems(items: readonly NestingItem[], sheet: SheetSize, gap?: number): NestingResult;
//# sourceMappingURL=index.d.ts.map