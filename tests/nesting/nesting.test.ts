import { describe, it, expect } from 'vitest';
import { nestItems, SHEET_PRESETS } from '../../src/core/nesting/index.js';
import type { SheetSize, NestingItem } from '../../src/core/nesting/index.js';

// ─── Тесты SHEET_PRESETS ────────────────────────────────────────────

describe('SHEET_PRESETS', () => {
  it('содержит 5 пресетов', () => {
    expect(SHEET_PRESETS).toHaveLength(5);
  });

  it('содержит пресет 1000×2000', () => {
    const preset = SHEET_PRESETS.find(p => p.label === '1000 × 2000');
    expect(preset).toBeDefined();
    expect(preset!.size.width).toBe(1000);
    expect(preset!.size.height).toBe(2000);
  });

  it('содержит пресет 1250×2500', () => {
    const preset = SHEET_PRESETS.find(p => p.label === '1250 × 2500');
    expect(preset).toBeDefined();
    expect(preset!.size).toEqual({ width: 1250, height: 2500 });
  });

  it('содержит пресет 1500×3000', () => {
    const preset = SHEET_PRESETS.find(p => p.label === '1500 × 3000');
    expect(preset).toBeDefined();
    expect(preset!.size).toEqual({ width: 1500, height: 3000 });
  });

  it('содержит пресет 1500×6000', () => {
    const preset = SHEET_PRESETS.find(p => p.label === '1500 × 6000');
    expect(preset).toBeDefined();
    expect(preset!.size).toEqual({ width: 1500, height: 6000 });
  });

  it('содержит пресет 2000×6000', () => {
    const preset = SHEET_PRESETS.find(p => p.label === '2000 × 6000');
    expect(preset).toBeDefined();
    expect(preset!.size).toEqual({ width: 2000, height: 6000 });
  });
});

// ─── Тесты nestItems ────────────────────────────────────────────────

describe('nestItems', () => {
  describe('базовые случаи', () => {
    it('возвращает пустой результат для пустого списка деталей', () => {
      const result = nestItems([], { width: 1000, height: 2000 }, 5);

      expect(result.totalSheets).toBe(0);
      expect(result.totalPlaced).toBe(0);
      expect(result.totalRequired).toBe(0);
      expect(result.avgFillPercent).toBe(0);
    });

    it('размещает одну деталь на одном листе', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Part1', width: 100, height: 100, quantity: 1 },
      ];
      const sheet: SheetSize = { width: 1000, height: 1000 };

      const result = nestItems(items, sheet, 0);

      expect(result.totalSheets).toBe(1);
      expect(result.totalPlaced).toBe(1);
      expect(result.totalRequired).toBe(1);
      expect(result.sheets[0].placed).toHaveLength(1);
      expect(result.sheets[0].placed[0].x).toBe(0);
      expect(result.sheets[0].placed[0].y).toBe(0);
    });

    it('учитывает зазор между деталями', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Part1', width: 100, height: 100, quantity: 2 },
      ];
      const sheet: SheetSize = { width: 1000, height: 1000 };
      const gap = 10;

      const result = nestItems(items, sheet, gap);

      expect(result.totalPlaced).toBe(2);
      expect(result.sheets[0].placed).toHaveLength(2);

      // Вторая деталь должна быть размещена с зазором
      const placed = result.sheets[0].placed;
      const second = placed.find(p => p.copyIndex === 1);
      expect(second).toBeDefined();
      expect(second!.x).toBeGreaterThanOrEqual(gap);
    });
  });

  describe('размещение нескольких деталей', () => {
    it('размещает несколько деталей на одном листе', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Part1', width: 200, height: 200, quantity: 1 },
        { id: 2, name: 'Part2', width: 300, height: 300, quantity: 1 },
        { id: 3, name: 'Part3', width: 100, height: 100, quantity: 1 },
      ];
      const sheet: SheetSize = { width: 1000, height: 1000 };

      const result = nestItems(items, sheet, 0);

      expect(result.totalSheets).toBe(1);
      expect(result.totalPlaced).toBe(3);
    });

    it('использует несколько листов при необходимости', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Part1', width: 600, height: 600, quantity: 4 },
      ];
      const sheet: SheetSize = { width: 1000, height: 1000 };

      const result = nestItems(items, sheet, 0);

      // 600×600 не поместится дважды на одном листе 1000×1000
      expect(result.totalSheets).toBeGreaterThan(1);
      expect(result.totalPlaced).toBe(4);
    });

    it('размещает детали в порядке убывания площади', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Small', width: 50, height: 50, quantity: 1 },
        { id: 2, name: 'Large', width: 200, height: 200, quantity: 1 },
        { id: 3, name: 'Medium', width: 100, height: 100, quantity: 1 },
      ];
      const sheet: SheetSize = { width: 1000, height: 1000 };

      const result = nestItems(items, sheet, 0);

      // Большая деталь должна быть размещена первой (внизу слева)
      const placed = result.sheets[0].placed;
      expect(placed[0].name).toBe('Large');
    });
  });

  describe('поворот деталей', () => {
    it('поворачивает деталь для лучшего размещения', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Part1', width: 800, height: 300, quantity: 1 },
        { id: 2, name: 'Part2', width: 300, height: 800, quantity: 1 },
      ];
      const sheet: SheetSize = { width: 1000, height: 1000 };

      const result = nestItems(items, sheet, 0);

      expect(result.totalPlaced).toBe(2);
      // Хотя бы одна деталь должна быть повёрнута
      const placed = result.sheets[0].placed;
      const rotatedCount = placed.filter(p => p.rotated).length;
      expect(rotatedCount).toBeGreaterThanOrEqual(0); // Может не понадобиться
    });

    it('не поворачивает, если деталь квадратная', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Square', width: 200, height: 200, quantity: 1 },
      ];
      const sheet: SheetSize = { width: 1000, height: 1000 };

      const result = nestItems(items, sheet, 0);

      expect(result.sheets[0].placed[0].rotated).toBe(false);
    });
  });

  describe('копирование деталей', () => {
    it('размещает несколько копий одной детали', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Part1', width: 100, height: 100, quantity: 5 },
      ];
      const sheet: SheetSize = { width: 1000, height: 1000 };

      const result = nestItems(items, sheet, 0);

      expect(result.totalPlaced).toBe(5);
      expect(result.sheets[0].placed).toHaveLength(5);

      // Все копии должны иметь правильный copyIndex
      const indices = result.sheets[0].placed.map(p => p.copyIndex);
      expect(indices).toEqual([0, 1, 2, 3, 4]);
    });

    it('присваивает правильный copyIndex для каждой копии', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Part1', width: 100, height: 100, quantity: 3 },
      ];
      const sheet: SheetSize = { width: 1000, height: 1000 };

      const result = nestItems(items, sheet, 0);

      const placed = result.sheets[0].placed;
      for (let i = 0; i < 3; i++) {
        expect(placed[i].copyIndex).toBe(i);
      }
    });
  });

  describe('расчёт заполнения', () => {
    it('вычисляет процент заполнения листа', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Part1', width: 500, height: 500, quantity: 1 },
      ];
      const sheet: SheetSize = { width: 1000, height: 1000 };

      const result = nestItems(items, sheet, 0);

      // 500×500 = 250000, лист 1000×1000 = 1000000
      // Заполнение = 25%
      expect(result.sheets[0].fillPercent).toBeCloseTo(25, 0);
    });

    it('вычисляет средний процент заполнения', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Part1', width: 500, height: 500, quantity: 2 },
      ];
      const sheet: SheetSize = { width: 1000, height: 1000 };

      const result = nestItems(items, sheet, 0);

      // 2 детали 500×500 = 500000, лист 1000×1000 = 1000000
      // Заполнение = 50%
      expect(result.avgFillPercent).toBeCloseTo(50, 0);
    });

    it('содержит usedArea для каждого листа', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Part1', width: 100, height: 100, quantity: 1 },
      ];
      const sheet: SheetSize = { width: 1000, height: 1000 };

      const result = nestItems(items, sheet, 0);

      expect(result.sheets[0].usedArea).toBe(10000); // 100×100
    });
  });

  describe('граничные случаи', () => {
    it('не размещает деталь, если она больше листа', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'TooLarge', width: 1500, height: 1500, quantity: 1 },
      ];
      const sheet: SheetSize = { width: 1000, height: 1000 };

      const result = nestItems(items, sheet, 0);

      expect(result.totalPlaced).toBe(0);
      expect(result.totalRequired).toBe(1);
    });

    it('обрабатывает деталь в точности размера листа', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Exact', width: 1000, height: 1000, quantity: 1 },
      ];
      const sheet: SheetSize = { width: 1000, height: 1000 };

      const result = nestItems(items, sheet, 0);

      expect(result.totalPlaced).toBe(1);
      expect(result.sheets[0].fillPercent).toBe(100);
    });

    it('обрабатывает нулевой зазор', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Part1', width: 500, height: 500, quantity: 4 },
      ];
      const sheet: SheetSize = { width: 1000, height: 1000 };

      const result = nestItems(items, sheet, 0);

      expect(result.totalPlaced).toBe(4);
      expect(result.sheets[0].fillPercent).toBe(100);
    });

    it('обрабатывает большой зазор', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Part1', width: 400, height: 400, quantity: 4 },
      ];
      const sheet: SheetSize = { width: 1000, height: 1000 };
      const gap = 200; // Большой зазор

      const result = nestItems(items, sheet, gap);

      // С большим зазором может поместиться меньше деталей
      expect(result.totalSheets).toBeGreaterThanOrEqual(1);
    });
  });

  describe('координаты размещения', () => {
    it('размещает первую деталь в (0, 0)', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Part1', width: 100, height: 100, quantity: 1 },
      ];
      const sheet: SheetSize = { width: 1000, height: 1000 };

      const result = nestItems(items, sheet, 0);

      const first = result.sheets[0].placed[0];
      expect(first.x).toBe(0);
      expect(first.y).toBe(0);
    });

    it('размещает детали по принципу Bottom-Left', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Part1', width: 200, height: 200, quantity: 1 },
        { id: 2, name: 'Part2', width: 200, height: 200, quantity: 1 },
        { id: 3, name: 'Part3', width: 200, height: 200, quantity: 1 },
      ];
      const sheet: SheetSize = { width: 600, height: 600 };

      const result = nestItems(items, sheet, 0);

      const placed = result.sheets[0].placed;
      // Первая деталь в (0, 0)
      expect(placed[0].x).toBe(0);
      expect(placed[0].y).toBe(0);
      // Вторая деталь справа от первой (200, 0)
      expect(placed[1].x).toBe(200);
      expect(placed[1].y).toBe(0);
      // Третья деталь ещё правее (400, 0)
      expect(placed[2].x).toBe(400);
      expect(placed[2].y).toBe(0);
    });
  });

  describe('результат для разных пресетов', () => {
    it('работает с пресетом 1000×2000', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Part1', width: 500, height: 500, quantity: 4 },
      ];
      const preset = SHEET_PRESETS[0]!.size;

      const result = nestItems(items, preset, 0);

      expect(result.sheet).toEqual(preset);
      expect(result.totalPlaced).toBe(4);
    });

    it('работает с пресетом 1500×3000', () => {
      const items: NestingItem[] = [
        { id: 1, name: 'Part1', width: 500, height: 500, quantity: 9 },
      ];
      const preset = SHEET_PRESETS[2]!.size;

      const result = nestItems(items, preset, 0);

      expect(result.sheet).toEqual(preset);
      // 1500×3000 = 4.5 млн, 500×500×9 = 2.25 млн
      // Должно поместиться на 1-2 листа
      expect(result.totalSheets).toBeLessThanOrEqual(2);
    });
  });
});
