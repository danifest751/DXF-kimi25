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
  readonly density: number; // g/cm³
}

export interface Thickness {
  readonly material: Material;
  readonly value: number; // mm
  readonly pricePerMeter: number; // руб/м
  readonly pricePerPierce: number; // руб/врезка
}

export interface PriceRule {
  readonly id: string;
  readonly name: string;
  readonly apply: (params: PriceParams) => number;
}

export interface PriceParams {
  readonly cutLength: number; // mm
  readonly pierces: number;
  readonly sheets: number;
  readonly material: string;
  readonly thickness: number;
  readonly complexity: number; // 1.0 - 2.0
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

// Стандартные материалы
export const MATERIALS: Record<string, Material> = {
  steel: { name: 'Сталь', density: 7.85 },
  stainless: { name: 'Нержавейка', density: 7.9 },
  aluminum: { name: 'Алюминий', density: 2.7 },
  brass: { name: 'Латунь', density: 8.5 },
  copper: { name: 'Медь', density: 8.96 },
};

// Базовая функция расчёта (заглушка)
export function calculatePrice(params: PriceParams): PriceResult {
  const baseCutCost = (params.cutLength / 1000) * 50; // 50 руб/м базовая
  const pierceCost = params.pierces * 10; // 10 руб за врезку
  const sheetCost = params.sheets * 500; // 500 руб за лист
  
  const complexityMultiplier = params.complexity;
  
  const total = (baseCutCost + pierceCost + sheetCost) * complexityMultiplier;
  
  return {
    total: Math.round(total * 100) / 100,
    breakdown: {
      cutCost: baseCutCost,
      pierceCost,
      sheetCost,
      complexityMultiplier,
    },
    currency: 'RUB',
  };
}

// Экспорт типов и правил
export type { PriceRule as PricingRule };
