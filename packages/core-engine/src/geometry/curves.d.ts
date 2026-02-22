/**
 * @module core/geometry/curves
 * Тесселяция кривых: дуги, эллипсы, сплайны, bulge-сегменты.
 * Все функции возвращают массив точек (полилинию).
 */
import type { Point2D, Point3D, Vector3D } from '../types/index.js';
/**
 * Тесселяция дуги окружности в массив 3D точек.
 * @param center - Центр
 * @param radius - Радиус
 * @param startAngleDeg - Начальный угол в градусах
 * @param endAngleDeg - Конечный угол в градусах
 * @param segments - Количество сегментов
 * @returns Массив точек на дуге
 */
export declare function tessellateArc(center: Point3D, radius: number, startAngleDeg: number, endAngleDeg: number, segments: number): Point3D[];
/**
 * Тесселяция полной окружности.
 */
export declare function tessellateCircle(center: Point3D, radius: number, segments: number): Point3D[];
/**
 * Тесселяция эллипса/эллиптической дуги.
 * @param center - Центр
 * @param majorAxis - Вектор большой полуоси
 * @param minorRatio - Отношение малой оси к большой (0..1)
 * @param startAngle - Начальный параметр (радианы, 0 = начало большой оси)
 * @param endAngle - Конечный параметр (радианы)
 * @param segments - Количество сегментов
 * @returns Массив точек
 */
export declare function tessellateEllipse(center: Point3D, majorAxis: Vector3D, minorRatio: number, startAngle: number, endAngle: number, segments: number): Point3D[];
/**
 * Тесселяция NURBS-сплайна.
 * @param degree - Степень сплайна
 * @param controlPoints - Контрольные точки
 * @param knots - Узловой вектор
 * @param weights - Веса (пустой массив = равные веса)
 * @param segments - Количество выходных сегментов
 * @returns Массив точек на сплайне
 */
export declare function tessellateSpline(degree: number, controlPoints: readonly Point3D[], knots: readonly number[], weights: readonly number[], segments: number): Point3D[];
/**
 * Тесселяция bulge-сегмента между двумя 2D точками.
 * Bulge = tan(θ/4), где θ — центральный угол дуги.
 * Положительный bulge = дуга против часовой стрелки.
 * @param p1 - Начальная точка
 * @param p2 - Конечная точка
 * @param bulge - Значение bulge
 * @param segments - Количество сегментов
 * @returns Массив промежуточных 2D точек (без p1 и p2)
 */
export declare function tessellateBulge(p1: Point2D, p2: Point2D, bulge: number, segments: number): Point2D[];
/**
 * Тесселяция LWPOLYLINE с учётом bulge.
 * @param vertices - Вершины полилинии
 * @param bulges - Массив bulge значений (по одному на вершину)
 * @param closed - Замкнутая ли полилиния
 * @param segments - Сегменты на дугу
 * @returns Массив 2D точек
 */
export declare function tessellateLWPolyline(vertices: readonly Point2D[], bulges: readonly number[] | undefined, closed: boolean, segments: number): Point2D[];
//# sourceMappingURL=curves.d.ts.map