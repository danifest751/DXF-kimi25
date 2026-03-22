/**
 * @file nesting.test.ts
 * Тесты для grouping logic в модуле nesting
 * Тестирует логику группировки деталей по материалу и слияния результатов
 */
import { describe, it, expect } from 'vitest';

/**
 * Эмуляция логики groupItemsByMaterial из nesting.ts
 * Эта функция группирует детали по materialId для раздельной раскладки
 */
function groupItemsByMaterial<T extends { materialId?: string }>(items: T[]): Map<string | null, T[]> {
  const groups = new Map<string | null, T[]>();
  for (const item of items) {
    const key = item.materialId ?? null;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(item);
  }
  return groups;
}

/**
 * Эмуляция логики mergeNestingResults из nesting.ts
 * Эта функция объединяет результаты раскладки от разных групп материалов
 */
function mergeSheets<T extends { sheetIndex: number }>(results: { sheets: T[] }[]): T[] {
  const allSheets: T[] = [];
  let sheetIndexOffset = 0;

  for (const result of results) {
    for (const s of result.sheets) {
      allSheets.push({
        ...s,
        sheetIndex: s.sheetIndex + sheetIndexOffset,
      } as T);
    }
    sheetIndexOffset += result.sheets.length;
  }

  return allSheets;
}

// Типы для тестирования
interface TestItem {
  id: number;
  name: string;
  width: number;
  height: number;
  quantity: number;
  materialId?: string;
}

interface TestSheet {
  sheetIndex: number;
  materialId?: string;
  placed: Array<{ itemId: number }>;
  fillPercent: number;
}

describe('Material grouping logic', () => {
  describe('groupItemsByMaterial', () => {
    it('should group items by materialId', () => {
      const items: TestItem[] = [
        { id: 1, name: 'Part A', width: 100, height: 50, quantity: 2, materialId: 'Сталь|08кп|2 мм' },
        { id: 2, name: 'Part B', width: 80, height: 40, quantity: 1, materialId: 'Сталь|08кп|2 мм' },
        { id: 3, name: 'Part C', width: 120, height: 60, quantity: 1, materialId: 'Алюминий|Amg3|3 мм' },
        { id: 4, name: 'Part D', width: 90, height: 45, quantity: 1 }, // без материала
      ];

      const groups = groupItemsByMaterial(items);

      expect(groups.size).toBe(3); // 2 материала + 1 без материала (null)
      expect(groups.get('Сталь|08кп|2 мм')?.length).toBe(2);
      expect(groups.get('Алюминий|Amg3|3 мм')?.length).toBe(1);
      expect(groups.get(null)?.length).toBe(1); // деталь без материала -> ключ null
    });

    it('should handle all items without materialId', () => {
      const items: TestItem[] = [
        { id: 1, name: 'Part A', width: 100, height: 50, quantity: 1 },
        { id: 2, name: 'Part B', width: 80, height: 40, quantity: 1 },
      ];

      const groups = groupItemsByMaterial(items);

      expect(groups.size).toBe(1);
      expect(groups.get(null)?.length).toBe(2);
    });

    it('should handle all items with same materialId', () => {
      const items: TestItem[] = [
        { id: 1, name: 'Part A', width: 100, height: 50, quantity: 2, materialId: 'Сталь|3|2' },
        { id: 2, name: 'Part B', width: 80, height: 40, quantity: 3, materialId: 'Сталь|3|2' },
      ];

      const groups = groupItemsByMaterial(items);

      expect(groups.size).toBe(1);
      expect(groups.get('Сталь|3|2')?.length).toBe(2);
    });

    it('should handle empty input', () => {
      const items: TestItem[] = [];

      const groups = groupItemsByMaterial(items);

      expect(groups.size).toBe(0);
    });

    it('should create separate groups for different materials', () => {
      const items: TestItem[] = [
        { id: 1, name: 'Steel 2mm', width: 100, height: 50, quantity: 1, materialId: 'Сталь|08кп|2' },
        { id: 2, name: 'Steel 3mm', width: 100, height: 50, quantity: 1, materialId: 'Сталь|08кп|3' },
        { id: 3, name: 'Aluminum 2mm', width: 100, height: 50, quantity: 1, materialId: 'Алюминий|Amg3|2' },
      ];

      const groups = groupItemsByMaterial(items);

      expect(groups.size).toBe(3);
      expect(groups.get('Сталь|08кп|2')?.length).toBe(1);
      expect(groups.get('Сталь|08кп|3')?.length).toBe(1);
      expect(groups.get('Алюминий|Amg3|2')?.length).toBe(1);
    });
  });

  describe('mergeSheets', () => {
    it('should merge results from multiple material groups with correct indexing', () => {
      const results = [
        {
          sheets: [
            { sheetIndex: 0, materialId: 'Сталь|08кп|2 мм', placed: [{ itemId: 1 }, { itemId: 2 }], fillPercent: 75 },
            { sheetIndex: 1, materialId: 'Сталь|08кп|2 мм', placed: [{ itemId: 1 }], fillPercent: 40 },
          ],
        },
        {
          sheets: [
            { sheetIndex: 0, materialId: 'Алюминий|Amg3|3 мм', placed: [{ itemId: 3 }], fillPercent: 55 },
          ],
        },
      ];

      const allSheets = mergeSheets<TestSheet>(results);

      expect(allSheets.length).toBe(3);
      expect(allSheets[0]!.sheetIndex).toBe(0);
      expect(allSheets[1]!.sheetIndex).toBe(1);
      expect(allSheets[2]!.sheetIndex).toBe(2); // Sheet from second group gets offset 2
      expect(allSheets[2]!.materialId).toBe('Алюминий|Amg3|3 мм');
    });

    it('should preserve materialId on merged sheets', () => {
      const results = [
        {
          sheets: [
            { sheetIndex: 0, materialId: 'Сталь|08кп|2 мм', placed: [{ itemId: 1 }], fillPercent: 50 },
          ],
        },
      ];

      const allSheets = mergeSheets<TestSheet>(results);

      expect(allSheets[0]!.materialId).toBe('Сталь|08кп|2 мм');
    });

    it('should handle merging three groups', () => {
      const results = [
        { sheets: [{ sheetIndex: 0, materialId: 'MatA', placed: [{ itemId: 1 }], fillPercent: 30 }] },
        { sheets: [{ sheetIndex: 0, materialId: 'MatB', placed: [{ itemId: 2 }], fillPercent: 40 }] },
        { sheets: [{ sheetIndex: 0, materialId: 'MatC', placed: [{ itemId: 3 }], fillPercent: 50 }] },
      ];

      const allSheets = mergeSheets<TestSheet>(results);

      expect(allSheets.length).toBe(3);
      expect(allSheets[0]!.sheetIndex).toBe(0);
      expect(allSheets[0]!.materialId).toBe('MatA');
      expect(allSheets[1]!.sheetIndex).toBe(1);
      expect(allSheets[1]!.materialId).toBe('MatB');
      expect(allSheets[2]!.sheetIndex).toBe(2);
      expect(allSheets[2]!.materialId).toBe('MatC');
    });

    it('should handle empty results', () => {
      const results: { sheets: TestSheet[] }[] = [];

      const allSheets = mergeSheets<TestSheet>(results);

      expect(allSheets.length).toBe(0);
    });

    it('should handle single group with multiple sheets', () => {
      const results = [
        {
          sheets: [
            { sheetIndex: 0, materialId: 'MatA', placed: [{ itemId: 1 }], fillPercent: 30 },
            { sheetIndex: 1, materialId: 'MatA', placed: [{ itemId: 2 }], fillPercent: 40 },
            { sheetIndex: 2, materialId: 'MatA', placed: [{ itemId: 3 }], fillPercent: 50 },
          ],
        },
      ];

      const allSheets = mergeSheets<TestSheet>(results);

      expect(allSheets.length).toBe(3);
      expect(allSheets[0]!.sheetIndex).toBe(0);
      expect(allSheets[1]!.sheetIndex).toBe(1);
      expect(allSheets[2]!.sheetIndex).toBe(2);
    });
  });

  describe('materialId propagation', () => {
    it('should correctly identify materialId format', () => {
      // Формат materialId: group|grade|thickness
      const materialId = 'Сталь|08кп|2 мм';

      const parts = materialId.split('|');

      expect(parts[0]).toBe('Сталь');     // group
      expect(parts[1]).toBe('08кп');      // grade
      expect(parts[2]).toBe('2 мм');      // thickness
    });

    it('should handle different material formats', () => {
      const materials = [
        'Сталь|08кп|2',
        'Алюминий|Amg3|3',
        'Нержавейка|12Х18Н10Т|1.5',
      ];

      for (const mat of materials) {
        const parts = mat.split('|');
        expect(parts.length).toBe(3);
        expect(parts.every(p => p.length > 0)).toBe(true);
      }
    });
  });
});
