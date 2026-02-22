import { describe, it, expect } from 'vitest';
import { Camera } from '../../packages/core-engine/src/render/camera.js';
import { RTree } from '../../packages/core-engine/src/render/rtree.js';
import type { BoundingBox } from '../../packages/core-engine/src/types/index.js';

// ─── Тесты Camera ───────────────────────────────────────────────────

describe('Camera', () => {
  describe('constructor & defaults', () => {
    it('создаёт камеру с настройками по умолчанию', () => {
      const camera = new Camera();
      
      expect(camera.zoom).toBe(1);
      expect(camera.panX).toBe(0);
      expect(camera.panY).toBe(0);
      expect(camera.rotation).toBe(0);
      expect(camera.width).toBe(800);
      expect(camera.height).toBe(600);
    });
  });

  describe('setViewport', () => {
    it('устанавливает размер вьюпорта', () => {
      const camera = new Camera();
      camera.setViewport(1920, 1080);
      
      expect(camera.width).toBe(1920);
      expect(camera.height).toBe(1080);
    });
  });

  describe('worldToScreen', () => {
    it('конвертирует мировые координаты в экранные (без трансформаций)', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      
      // Центр мира должен быть в центре экрана
      const center = camera.worldToScreen(0, 0);
      expect(center.x).toBe(400);
      expect(center.y).toBe(300);
      
      // Точка (1, 1) при zoom=1 должна быть выше и правее центра
      const point = camera.worldToScreen(1, 1);
      expect(point.x).toBe(401);
      expect(point.y).toBe(299); // Y инвертирован
    });

    it('учитывает zoom при конвертации', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      camera.zoom = 2;
      
      const point = camera.worldToScreen(1, 0);
      expect(point.x).toBe(402); // 400 + 1*2
    });

    it('учитывает pan при конвертации', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      camera.panX = 10;
      camera.panY = 20;
      
      // Точка (10, 20) должна быть в центре экрана
      const center = camera.worldToScreen(10, 20);
      expect(center.x).toBeCloseTo(400, 10);
      expect(center.y).toBeCloseTo(300, 10);
    });

    it('учитывает rotation при конвертации', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      camera.rotation = Math.PI / 2; // 90 градусов
      
      // При повороте на 90° точка (1, 0) в мире становится (0, 1)
      // x = 400 + (1*cos(90°) + 0*sin(90°)) * 1 = 400 + 0 = 400
      // y = 300 - (1*(-sin(90°)) + 0*cos(90°)) * 1 = 300 - (-1) = 301
      const point = camera.worldToScreen(1, 0);
      expect(point.x).toBeCloseTo(400, 5);
      expect(point.y).toBe(301);
    });
  });

  describe('screenToWorld', () => {
    it('конвертирует экранные координаты в мировые (без трансформаций)', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      
      // Центр экрана должен быть в центре мира
      const center = camera.screenToWorld(400, 300);
      expect(center.x).toBeCloseTo(0, 10);
      expect(center.y).toBeCloseTo(0, 10);
    });

    it('учитывает zoom при обратной конвертации', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      camera.zoom = 2;
      
      // Точка на 2 пикселя правее центра = 1 единица мира
      const point = camera.screenToWorld(402, 300);
      expect(point.x).toBeCloseTo(1, 10);
    });

    it('обратима с worldToScreen', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      camera.zoom = 1.5;
      camera.panX = 10;
      camera.panY = -5;
      camera.rotation = 0.3;
      
      const world = { x: 25, y: -15 };
      const screen = camera.worldToScreen(world.x, world.y);
      const back = camera.screenToWorld(screen.x, screen.y);
      
      expect(back.x).toBeCloseTo(world.x, 10);
      expect(back.y).toBeCloseTo(world.y, 10);
    });
  });

  describe('fitToExtents', () => {
    it('подгоняет вид под bounding box', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      
      const bbox: BoundingBox = {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 100, y: 50, z: 0 },
      };
      
      camera.fitToExtents(bbox);
      
      // Центр должен быть в центре bbox
      expect(camera.panX).toBe(50);
      expect(camera.panY).toBe(25);
      expect(camera.rotation).toBe(0);
      
      // Zoom должен подогнать bbox под экран
      expect(camera.zoom).toBeGreaterThan(0);
    });

    it('игнорирует нулевой bbox', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      camera.zoom = 2;
      
      const bbox: BoundingBox = {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0, y: 0, z: 0 },
      };
      
      camera.fitToExtents(bbox);
      
      expect(camera.zoom).toBe(2); // Не изменился
    });

    it('применяет padding', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      
      const bbox: BoundingBox = {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 100, y: 100, z: 0 },
      };
      
      camera.fitToExtents(bbox, 0); // Без padding
      const zoomNoPadding = camera.zoom;
      
      camera.fitToExtents(bbox, 0.1); // С padding 10%
      const zoomWithPadding = camera.zoom;
      
      expect(zoomWithPadding).toBeLessThan(zoomNoPadding);
    });
  });

  describe('zoomAt', () => {
    it('увеличивает zoom к точке экрана', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      camera.zoom = 1;
      
      camera.zoomAt(400, 300, 2); // Zoom в 2 раза к центру
      
      expect(camera.zoom).toBe(2);
    });

    it('сохраняет позицию под курсором при zoom', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      camera.zoom = 1;
      
      const worldBefore = camera.screenToWorld(500, 400);
      camera.zoomAt(500, 400, 1.5);
      const worldAfter = camera.screenToWorld(500, 400);
      
      // Точка под курсором должна остаться на месте
      expect(worldAfter.x).toBeCloseTo(worldBefore.x, 10);
      expect(worldAfter.y).toBeCloseTo(worldBefore.y, 10);
    });

    it('ограничивает zoom минимальным и максимальным значением', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      camera.zoom = 1;
      
      camera.zoomAt(400, 300, 1e-10); // Очень маленькое значение
      expect(camera.zoom).toBeGreaterThanOrEqual(1e-6);
      
      camera.zoomAt(400, 300, 1e10); // Очень большое значение
      expect(camera.zoom).toBeLessThanOrEqual(1e8);
    });
  });

  describe('panBy', () => {
    it('смещает камеру на delta пикселей', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      camera.zoom = 1;
      
      camera.panBy(100, 50);
      
      expect(camera.panX).toBe(-100);
      expect(camera.panY).toBe(50); // Y инвертирован
    });

    it('учитывает zoom при pan', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      camera.zoom = 2;
      
      camera.panBy(100, 0);
      
      expect(camera.panX).toBe(-50); // 100 / 2
    });
  });

  describe('getVisibleBounds', () => {
    it('возвращает видимый прямоугольник', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      camera.zoom = 1;
      
      const bounds = camera.getVisibleBounds();
      
      // При zoom=1 и центре (0,0) видим примерно -400..400 по X и -300..300 по Y
      expect(bounds.min.x).toBeLessThan(0);
      expect(bounds.max.x).toBeGreaterThan(0);
      expect(bounds.min.y).toBeLessThan(0);
      expect(bounds.max.y).toBeGreaterThan(0);
    });

    it('учитывает pan при вычислении границ', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      camera.panX = 100;
      camera.panY = 50;
      
      const bounds = camera.getVisibleBounds();
      
      // Центр видимой области должен быть около (100, 50)
      const centerX = (bounds.min.x + bounds.max.x) / 2;
      const centerY = (bounds.min.y + bounds.max.y) / 2;
      expect(centerX).toBeCloseTo(100, 0);
      expect(centerY).toBeCloseTo(50, 0);
    });
  });
});

// ─── Тесты RTree ────────────────────────────────────────────────────

describe('RTree', () => {
  describe('constructor & load', () => {
    it('создаёт пустой RTree', () => {
      const rtree = new RTree<number>();
      rtree.load([]);
      // Не должно выбрасывать ошибок
    });

    it('загружает элементы через bulk-load', () => {
      const rtree = new RTree<number>(4);
      
      const items = [
        { bbox: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 0 } }, data: 1 },
        { bbox: { min: { x: 20, y: 20, z: 0 }, max: { x: 30, y: 30, z: 0 } }, data: 2 },
        { bbox: { min: { x: 40, y: 40, z: 0 }, max: { x: 50, y: 50, z: 0 } }, data: 3 },
      ];
      
      rtree.load(items);
      // Не должно выбрасывать ошибок
    });
  });

  describe('search', () => {
    it('находит элементы в прямоугольнике', () => {
      const rtree = new RTree<number>(4);
      
      const items = [
        { bbox: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 0 } }, data: 1 },
        { bbox: { min: { x: 20, y: 20, z: 0 }, max: { x: 30, y: 30, z: 0 } }, data: 2 },
        { bbox: { min: { x: 40, y: 40, z: 0 }, max: { x: 50, y: 50, z: 0 } }, data: 3 },
      ];
      
      rtree.load(items);
      
      const searchBbox: BoundingBox = {
        min: { x: 15, y: 15, z: 0 },
        max: { x: 35, y: 35, z: 0 },
      };
      
      const results = rtree.search(searchBbox);
      
      expect(results).toHaveLength(1);
      expect(results[0]).toBe(2);
    });

    it('находит несколько элементов в пересекающемся прямоугольнике', () => {
      const rtree = new RTree<number>(4);
      
      const items = [
        { bbox: { min: { x: 0, y: 0, z: 0 }, max: { x: 20, y: 20, z: 0 } }, data: 1 },
        { bbox: { min: { x: 10, y: 10, z: 0 }, max: { x: 30, y: 30, z: 0 } }, data: 2 },
        { bbox: { min: { x: 25, y: 25, z: 0 }, max: { x: 45, y: 45, z: 0 } }, data: 3 },
      ];
      
      rtree.load(items);
      
      // Прямоугольник, пересекающий все три элемента
      const searchBbox: BoundingBox = {
        min: { x: 5, y: 5, z: 0 },
        max: { x: 35, y: 35, z: 0 },
      };
      
      const results = rtree.search(searchBbox);
      
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results).toContain(1);
      expect(results).toContain(2);
    });

    it('возвращает пустой массив при отсутствии пересечений', () => {
      const rtree = new RTree<number>(4);
      
      const items = [
        { bbox: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 0 } }, data: 1 },
      ];
      
      rtree.load(items);
      
      const searchBbox: BoundingBox = {
        min: { x: 100, y: 100, z: 0 },
        max: { x: 110, y: 110, z: 0 },
      };
      
      const results = rtree.search(searchBbox);
      
      expect(results).toHaveLength(0);
    });

    it('возвращает пустой массив для пустого дерева', () => {
      const rtree = new RTree<number>();
      rtree.load([]);
      
      const searchBbox: BoundingBox = {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 10, y: 10, z: 0 },
      };
      
      const results = rtree.search(searchBbox);
      
      expect(results).toHaveLength(0);
    });
  });

  describe('bulk-load производительность', () => {
    it('загружает большое количество элементов', () => {
      const rtree = new RTree<number>(16);

      const items: { bbox: BoundingBox; data: number }[] = [];
      for (let i = 0; i < 1000; i++) {
        items.push({
          bbox: {
            min: { x: i, y: i, z: 0 },
            max: { x: i + 1, y: i + 1, z: 0 },
          },
          data: i,
        });
      }

      const startTime = Date.now();
      rtree.load(items);
      const endTime = Date.now();

      // Загрузка должна быть быстрой (< 1 секунды для 1000 элементов)
      expect(endTime - startTime).toBeLessThan(1000);

      // Проверка поиска
      const searchBbox: BoundingBox = {
        min: { x: 500, y: 500, z: 0 },
        max: { x: 510, y: 510, z: 0 },
      };

      const results = rtree.search(searchBbox);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('hitTest', () => {
    it('находит элементы в точке с допуском', () => {
      const rtree = new RTree<number>(4);

      const items = [
        { bbox: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 0 } }, data: 1 },
        { bbox: { min: { x: 20, y: 20, z: 0 }, max: { x: 30, y: 30, z: 0 } }, data: 2 },
      ];

      rtree.load(items);

      // Точка внутри первого элемента
      const results = rtree.hitTest(5, 5, 1);

      expect(results).toContain(1);
    });

    it('возвращает пустой массив при отсутствии попаданий', () => {
      const rtree = new RTree<number>(4);

      const items = [
        { bbox: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 0 } }, data: 1 },
      ];

      rtree.load(items);

      const results = rtree.hitTest(100, 100, 1);

      expect(results).toHaveLength(0);
    });
  });

  describe('size & clear', () => {
    it('возвращает правильное количество элементов', () => {
      const rtree = new RTree<number>(4);

      expect(rtree.size).toBe(0);

      const items = [
        { bbox: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 0 } }, data: 1 },
        { bbox: { min: { x: 20, y: 20, z: 0 }, max: { x: 30, y: 30, z: 0 } }, data: 2 },
      ];

      rtree.load(items);

      expect(rtree.size).toBe(2);
    });

    it('очищает дерево', () => {
      const rtree = new RTree<number>(4);

      const items = [
        { bbox: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 0 } }, data: 1 },
      ];

      rtree.load(items);
      expect(rtree.size).toBe(1);

      rtree.clear();
      expect(rtree.size).toBe(0);
    });
  });
});

