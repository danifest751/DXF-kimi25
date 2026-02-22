/**
 * @module pricing
 * Pricing engine for laser cutting calculations.
 *
 * TODO: Реализовать полноценный движок расчёта стоимости
 * - Цена за метр реза (зависит от материала и толщины)
 * - Цена за врезку
 * - Цена за лист
 * - Сложность детали
 * - Скидки за объём
 */
export interface Material {
    readonly name: string;
    readonly density: number;
}
export interface Thickness {
    readonly material: Material;
    readonly value: number;
    readonly pricePerMeter: number;
    readonly pricePerPierce: number;
}
export interface PriceRule {
    readonly id: string;
    readonly name: string;
    readonly apply: (params: PriceParams) => number;
}
export interface PriceParams {
    readonly cutLength: number;
    readonly pierces: number;
    readonly sheets: number;
    readonly material: string;
    readonly thickness: number;
    readonly complexity: number;
}
export interface PriceResult {
    readonly total: number;
    readonly breakdown: {
        readonly cutCost: number;
        readonly pierceCost: number;
        readonly sheetCost: number;
        readonly complexityMultiplier: number;
    };
    readonly currency: string;
}
export declare const MATERIALS: Record<string, Material>;
export declare function calculatePrice(params: PriceParams): PriceResult;
export type { PriceRule as PricingRule };
//# sourceMappingURL=index.d.ts.map