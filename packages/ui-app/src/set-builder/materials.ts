/**
 * @module set-builder/materials
 * Справочник листовых материалов для лазерной резки (РФ).
 * materialId = составная строка "group|grade|thickness"
 */

export interface MaterialEntry {
  readonly id: string;
  readonly group: string;
  readonly groupLabel: string;
  readonly grade: string;
  readonly thicknessMm: number;
  readonly densityKgM3: number;
}

export interface MaterialGroup {
  readonly key: string;
  readonly label: string;
}

const STEEL_DENSITY = 7850;
const SS_DENSITY = 7900;
const AL_DENSITY = 2700;
const GALV_DENSITY = 7850;
const BRASS_DENSITY = 8500;
const COPPER_DENSITY = 8900;

function makeEntries(
  group: string,
  groupLabel: string,
  grades: string[],
  thicknesses: number[],
  density: number,
): MaterialEntry[] {
  const entries: MaterialEntry[] = [];
  for (const grade of grades) {
    for (const t of thicknesses) {
      entries.push({
        id: `${group}|${grade}|${t}`,
        group,
        groupLabel,
        grade,
        thicknessMm: t,
        densityKgM3: density,
      });
    }
  }
  return entries;
}

export const MATERIALS_DB: readonly MaterialEntry[] = [
  ...makeEntries('steel', 'Сталь углеродистая', ['Ст3 / S235'], [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20], STEEL_DENSITY),
  ...makeEntries('stainless', 'Нержавеющая сталь', ['AISI 304', 'AISI 430'], [0.8, 1, 1.5, 2, 3, 4, 5, 6, 8, 10], SS_DENSITY),
  ...makeEntries('aluminum', 'Алюминий', ['АМг3 / 5052', '6061'], [1, 1.5, 2, 3, 4, 5, 6, 8, 10], AL_DENSITY),
  ...makeEntries('galvanized', 'Оцинкованная сталь', ['Оцинкованная (Z)'], [0.5, 0.7, 0.8, 1, 1.2, 1.5, 2], GALV_DENSITY),
  ...makeEntries('brass', 'Латунь', ['Л63'], [0.8, 1, 1.5, 2, 3], BRASS_DENSITY),
  ...makeEntries('copper', 'Медь', ['М1'], [0.8, 1, 1.5, 2, 3], COPPER_DENSITY),
];

export function getMaterialGroups(): MaterialGroup[] {
  const seen = new Set<string>();
  const groups: MaterialGroup[] = [];
  for (const m of MATERIALS_DB) {
    if (!seen.has(m.group)) {
      seen.add(m.group);
      groups.push({ key: m.group, label: m.groupLabel });
    }
  }
  return groups;
}

export function getGradesByGroup(group: string): string[] {
  const seen = new Set<string>();
  for (const m of MATERIALS_DB) {
    if (m.group === group) seen.add(m.grade);
  }
  return [...seen];
}

export function getThicknessesByGrade(group: string, grade: string): number[] {
  return MATERIALS_DB
    .filter((m) => m.group === group && m.grade === grade)
    .map((m) => m.thicknessMm);
}

export function findMaterial(materialId: string): MaterialEntry | null {
  return MATERIALS_DB.find((m) => m.id === materialId) ?? null;
}

export function formatMaterialLabel(materialId: string): string {
  const m = findMaterial(materialId);
  if (!m) return materialId;
  return `${m.grade} · ${m.thicknessMm} мм`;
}

export function formatMaterialLabelFull(materialId: string): string {
  const m = findMaterial(materialId);
  if (!m) return materialId;
  return `${m.groupLabel} / ${m.grade} · ${m.thicknessMm} мм`;
}

/**
 * Рассчитывает вес детали по площади контура, толщине и плотности материала.
 * @param areaMm2 Площадь контура (мм²), за вычетом дырок
 * @param thicknessMm Толщина листа (мм)
 * @param densityKgM3 Плотность материала (кг/м³)
 */
export function calcWeightKg(areaMm2: number, thicknessMm: number, densityKgM3: number): number {
  const areaM2 = areaMm2 / 1_000_000;
  const volumeM3 = areaM2 * (thicknessMm / 1000);
  return volumeM3 * densityKgM3;
}

export function formatWeightKg(kg: number): string {
  if (kg < 0.001) return '< 0.001 кг';
  if (kg < 1) return `${(kg * 1000).toFixed(0)} г`;
  return `${kg.toFixed(3)} кг`;
}
