# План усовершенствования DXF Viewer & Analyzer

**На основе аудита от 18 февраля 2026 г.**

---

## Приоритеты

| Уровень | Цвет | Описание |
|---------|------|----------|
| **P0** | 🔴 | Критично — блокирует дальнейшую разработку |
| **P1** | 🟠 | Высокий — важно для стабильности |
| **P2** | 🟡 | Средний — улучшает качество |
| **P3** | 🟢 | Низкий — оптимизации и улучшения |

---

## Этап 1: Исправление критических проблем (P0)

### 1.1. Исправление запуска тестов ⏱️ 1-2 часа

**Проблема**: Vitest не обнаруживает тесты

**Задачи**:
- [ ] **1.1.1** Добавить явные импорты в тестовые файлы:
  ```typescript
  import { describe, it, expect, beforeEach, afterEach } from 'vitest';
  ```
  Файлы для обновления:
  - `tests/geometry/math.test.ts`
  - `tests/geometry/bbox.test.ts`
  - `tests/geometry/curves.test.ts`
  - `tests/cutting/cutting.test.ts`

- [ ] **1.1.2** Альтернативно: обновить `vitest.config.ts`:
  ```typescript
  export default defineConfig({
    test: {
      globals: true,
      setupFiles: ['./tests/setup.ts'],
    },
  });
  ```
  И создать `tests/setup.ts`:
  ```typescript
  import { beforeAll, afterAll, vi } from 'vitest';
  // Глобальная настройка для всех тестов
  ```

- [ ] **1.1.3** Запустить тесты и убедиться, что все проходят:
  ```bash
  npm run test -- --run
  ```

**Критерий приёмки**: Все 4 тестовых файла запускаются, тесты проходят

---

### 1.2. Настройка CI/CD ⏱️ 2-3 часа

**Проблема**: Нет автоматической проверки при коммитах

**Задачи**:
- [ ] **1.2.1** Создать `.github/workflows/ci.yml`:
  ```yaml
  name: CI
  
  on: [push, pull_request]
  
  jobs:
    test:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: '20'
        - run: npm ci
        - run: npm run typecheck
        - run: npm run build
        - run: npm run test -- --run
        - run: npm run lint
  ```

- [ ] **1.2.2** Добавить pre-commit хук (опционально):
  ```bash
  npm install -D husky lint-staged
  npx husky install
  ```

**Критерий приёмки**: При push в репозиторий запускается CI, все проверки проходят

---

## Этап 2: Покрытие тестами (P1)

### 2.1. Тесты для модуля Normalize ⏱️ 4-6 часов

**Файл**: `tests/normalize/normalize.test.ts`

**Задачи**:
- [ ] **2.1.1** Тесты на разрешение стилей:
  ```typescript
  describe('resolveColor', () => {
    it('возвращает ACI цвет по индексу', () => {...});
    it('возвращает true color из entity', () => {...});
    it('использует слой цвет при отсутствии entity цвета', () => {...});
  });
  ```

- [ ] **2.1.2** Тесты на разворачивание блоков:
  ```typescript
  describe('flattenEntities', () => {
    it('разворачивает INSERT с трансформациями', () => {...});
    it('обрабатывает вложенные блоки', () => {...});
    it('сохраняет атрибуты при разворачивании', () => {...});
  });
  ```

- [ ] **2.1.3** Тесты на нормализацию документа:
  ```typescript
  describe('normalizeDocument', () => {
    it('разрешает все стили документа', () => {...});
    it('создаёт totalBBox для документа', () => {...});
  });
  ```

**Критерий приёмки**: Покрытие `normalize/index.ts` ≥ 70%

---

### 2.2. Тесты для модуля Rendering ⏱️ 6-8 часов

**Файлы**: 
- `tests/render/camera.test.ts`
- `tests/render/rtree.test.ts`
- `tests/render/renderer.test.ts`

**Задачи**:
- [ ] **2.2.1** Тесты камеры:
  ```typescript
  describe('Camera', () => {
    it('zoomAt увеличивает масштаб в точке', () => {...});
    it('panBy смещает вид', () => {...});
    it('screenToWorld конвертирует координаты', () => {...});
  });
  ```

- [ ] **2.2.2** Тесты R-tree:
  ```typescript
  describe('RTree', () => {
    it('вставляет элементы', () => {...});
    it('находит элементы в прямоугольнике', () => {...});
    it('удаляет элементы', () => {...});
  });
  ```

- [ ] **2.2.3** Интеграционные тесты рендерера (jsdom):
  ```typescript
  describe('DXFRenderer', () => {
    it('отрисовывает LINE сущности', () => {...});
    it('отрисовывает CIRCLE сущности', () => {...});
    it('hitTest находит сущности по координатам', () => {...});
  });
  ```

**Критерий приёмки**: Покрытие `render/` ≥ 60%

---

### 2.3. Тесты для модуля Nesting ⏱️ 4-6 часов

**Файл**: `tests/nesting/nesting.test.ts`

**Задачи**:
- [ ] **2.3.1** Тесты алгоритма раскладки:
  ```typescript
  describe('nestItems', () => {
    it('размещает детали на листе', () => {...});
    it('учитывает зазор между деталями', () => {...});
    it('поворачивает детали для лучшего заполнения', () => {...});
    it('возвращает несколько листов при необходимости', () => {...});
  });
  ```

- [ ] **2.3.2** Тесты на граничные случаи:
  ```typescript
  it('возвращает пустой результат при отсутствии деталей', () => {...});
  it('обрабатывает детали больше размера листа', () => {...});
  ```

**Критерий приёмки**: Покрытие `nesting/index.ts` ≥ 70%

---

### 2.4. Тесты для DXF Reader ⏱️ 6-8 часов

**Файлы**:
- `tests/dxf/ascii-reader.test.ts`
- `tests/dxf/binary-reader.test.ts`
- `tests/dxf/entity-parser.test.ts`

**Задачи**:
- [ ] **2.4.1** Тесты парсинга ASCII DXF:
  ```typescript
  describe('parseAsciiDXF', () => {
    it('парсит HEADER секцию', () => {...});
    it('парсит ENTITIES секцию с LINE', () => {...});
    it('парсит BLOCKS секцию', () => {...});
  });
  ```

- [ ] **2.4.2** Тесты парсинга Binary DXF:
  ```typescript
  describe('parseBinaryDXF', () => {
    it('определяет binary формат', () => {...});
    it('парсит binary файл', () => {...});
  });
  ```

- [ ] **2.4.3** Тесты парсера сущностей:
  ```typescript
  describe('parseEntity', () => {
    it('парсит LINE сущность', () => {...});
    it('парсит CIRCLE сущность', () => {...});
    it('парсит SPLINE сущность', () => {...});
    it('парсит LWPOLYLINE сущность', () => {...});
  });
  ```

**Критерий приёмки**: Покрытие `dxf/reader/` ≥ 60%

---

### 2.5. Интеграционные тесты ⏱️ 4-6 часов

**Файл**: `tests/integration/pipeline.test.ts`

**Задачи**:
- [ ] **2.5.1** Тест полного пайплайна:
  ```typescript
  describe('Full Pipeline', () => {
    it('Import → Normalize → Geometry → Cutting', () => {...});
    it('Import → Normalize → Nesting', () => {...});
  });
  ```

- [ ] **2.5.2** Тесты на реальных DXF файлах (fixtures):
  ```typescript
  it('обрабатывает сложный чертёж с блоками', () => {...});
  it('обрабатывает файл с сплайнами', () => {...});
  ```

**Критерий приёмки**: Критические пути работают корректно

---

## Этап 3: Новый функционал (P1)

### 3.1. Модуль экспорта результатов ⏱️ 8-12 часов

**Файлы**: `src/core/export/`

**Задачи**:
- [ ] **3.1.1** Создать структуру модуля:
  ```
  src/core/export/
  ├── index.ts         # Главный экспорт
  ├── dxf-exporter.ts  # Экспорт в DXF
  ├── csv-exporter.ts  # Экспорт статистики
  └── pdf-exporter.ts  # Экспорт в PDF (опционально)
  ```

- [ ] **3.1.2** Реализовать экспорт в DXF:
  ```typescript
  export interface ExportOptions {
    readonly format: 'DXF' | 'CSV';
    readonly entities: readonly FlattenedEntity[];
    readonly nestingResult?: NestingResult;
  }
  
  export function exportToDXF(options: ExportOptions): ArrayBuffer;
  ```

- [ ] **3.1.3** Реализовать экспорт статистики в CSV:
  ```typescript
  export function exportCuttingStatsToCSV(
    stats: CuttingStats,
    fileName: string
  ): string;
  ```

- [ ] **3.1.4** Добавить UI кнопки экспорта:
  - Экспорт раскладки (DXF)
  - Экспорт статистики (CSV)

**Критерий приёмки**: Пользователь может экспортировать результаты

---

### 3.2. Модуль Time & Cost ⏱️ 6-8 часов

**Файлы**: `src/core/cutting/time-cost.ts`

**Задачи**:
- [ ] **3.2.1** Создать интерфейс расчёта:
  ```typescript
  export interface CuttingTimeOptions {
    readonly cutLength: number;      // мм
    readonly pierces: number;        // количество
    readonly cutSpeed: number;       // мм/мин (по умолчанию 5000)
    readonly pierceTime: number;     // сек на врезку (по умолчанию 2)
    readonly materialThickness: number; // мм
  }
  
  export interface CuttingTimeResult {
    readonly cutTime: number;        // секунды
    readonly pierceTime: number;     // секунды
    readonly totalTime: number;      // секунды
    readonly totalTimeFormatted: string; // "12 мин 34 сек"
  }
  ```

- [ ] **3.2.2** Реализовать расчёт времени:
  ```typescript
  export function calculateCuttingTime(
    options: CuttingTimeOptions
  ): CuttingTimeResult;
  ```

- [ ] **3.2.3** Добавить расчёт стоимости:
  ```typescript
  export interface CuttingCostOptions {
    readonly totalTime: number;      // секунды
    readonly materialArea: number;   // м²
    readonly hourlyRate: number;     // руб/час
    readonly materialPrice: number;  // руб/м²
  }
  
  export interface CuttingCostResult {
    readonly laborCost: number;
    readonly materialCost: number;
    readonly totalCost: number;
  }
  ```

- [ ] **3.2.4** Добавить настройки в UI:
  - Скорость резки
  - Время врезки
  - Стоимость часа работы
  - Стоимость материала

**Критерий приёмки**: Пользователь видит время и стоимость резки

---

### 3.3. Расширение анализа резки ⏱️ 4-6 часов

**Файл**: `src/core/cutting/chain-finder.ts`

**Задачи**:
- [ ] **3.3.1** Улучшить алгоритм объединения цепочек:
  - Поддержка tolerance из config
  - Визуализация порядка реза

- [ ] **3.3.2** Добавить расчёт оптимального порядка реза:
  ```typescript
  export function optimizeCuttingOrder(
    chains: readonly ChainInfo[]
  ): readonly ChainInfo[];
  ```

- [ ] **3.3.3** Визуализация траектории реза:
  - Нумерация цепочек
  - Анимация пути реза

**Критерий приёмки**: Умный порядок реза, экономия времени

---

## Этап 4: Оптимизации производительности (P2)

### 4.1. Web Workers для тяжёлых операций ⏱️ 8-12 часов

**Задачи**:
- [ ] **4.1.1** Вынести nesting в воркер:
  ```
  src/core/workers/
  ├── nesting-worker.ts
  └── geometry-worker.ts
  ```

- [ ] **4.1.2** Создать менеджер воркеров:
  ```typescript
  export class WorkerManager {
    parseDXF(buffer: ArrayBuffer): Promise<ParseResult>;
    nestItems(items: NestingItem[]): Promise<NestingResult>;
    computeGeometry(ops: GeometryOp[]): Promise<GeometryResult>;
  }
  ```

- [ ] **4.1.3** Добавить прогресс-бар для nesting:
  - Обновление прогресса при размещении деталей

**Критерий приёмки**: Nesting больших наборов не блокирует UI

---

### 4.2. Оптимизация рендеринга ⏱️ 6-8 часов

**Задачи**:
- [ ] **4.2.1** Добавить Level of Detail (LOD):
  ```typescript
  export interface RenderOptions {
    readonly lodThreshold: number;   // дистанция для упрощения
    readonly simplifyArcs: boolean;  // упрощать дуги при zoom out
  }
  ```

- [ ] **4.2.2** Кэширование отрисовки:
  - OffscreenCanvas для статичных элементов
  - Инвалидация только изменённых областей

- [ ] **4.2.3** Оптимизация R-tree запросов:
  - Пакетная обработка запросов
  - Кэширование результатов hit-test

**Критерий приёмки**: 60 FPS при 10,000+ сущностей

---

### 4.3. Lazy loading модулей ⏱️ 3-4 часа

**Задачи**:
- [ ] **4.3.1** Динамический импорт nesting:
  ```typescript
  const { nestItems } = await import('./core/nesting');
  ```

- [ ] **4.3.2** Динамический импорт экспорта:
  ```typescript
  const { exportToDXF } = await import('./core/export');
  ```

**Критерий приёмки**: Начальная загрузка быстрее на 20-30%

---

## Этап 5: Улучшение UX (P2)

### 5.1. Управление слоями ⏱️ 6-8 часов

**Задачи**:
- [ ] **5.1.1** Панель слоёв:
  - Список всех слоёв
  - Включение/выключение видимости
  - Цвет слоя

- [ ] **5.1.2** Фильтрация по слоям:
  ```typescript
  export interface LayerFilter {
    readonly visibleLayers: Set<string>;
    readonly hiddenLayers: Set<string>;
  }
  ```

**Критерий приёмки**: Пользователь управляет видимостью слоёв

---

### 5.2. Измерения на чертеже ⏱️ 8-10 часов

**Задачи**:
- [ ] **5.2.1** Инструмент измерения расстояний:
  - Клик-клик для замера
  - Отображение размера

- [ ] **5.2.2** Инструмент измерения углов:
  - Замер угла между линиями

- [ ] **5.2.3** Инструмент измерения радиусов:
  - Автоматическое определение дуг/кругов

**Критерий приёмки**: Пользователь может делать замеры

---

### 5.3. Поиск и выделение сущностей ⏱️ 4-6 часов

**Задачи**:
- [ ] **5.3.1** Поиск по типу сущности:
  ```typescript
  export interface EntitySearch {
    readonly type?: DXFEntityType;
    readonly layer?: string;
    readonly handle?: string;
  }
  ```

- [ ] **5.3.2** Панель результатов поиска:
  - Список найденных
  - Переход к сущности (zoom to)

**Критерий приёмки**: Быстрый поиск сущностей

---

## Этап 6: Документация и примеры (P3)

### 6.1. API документация ⏱️ 4-6 часов

**Задачи**:
- [ ] **6.1.1** Настроить TypeDoc:
  ```bash
  npm install -D typedoc
  ```

- [ ] **6.1.2** Создать `typedoc.json`:
  ```json
  {
    "entryPoints": ["src/core/index.ts"],
    "out": "docs/api",
    "plugin": ["typedoc-plugin-markdown"]
  }
  ```

- [ ] **6.1.3** Сгенерировать документацию:
  ```bash
  npm run docs
  ```

**Критерий приёмки**: API документация доступна онлайн

---

### 6.2. Примеры использования ⏱️ 4-6 часов

**Задачи**:
- [ ] **6.2.1** Создать директорию examples:
  ```
  examples/
  ├── basic-viewer/      # Минимальный вьювер
  ├── nesting-demo/      # Демо раскладки
  └── cutting-analysis/  # Анализ резки
  ```

- [ ] **6.2.2** Добавить README с примерами кода:
  ```typescript
  import { parseDXFInWorker, normalizeDocument } from 'dxf-kimi25';
  
  const result = await parseDXFInWorker(buffer);
  const normalized = normalizeDocument(result.document);
  ```

**Критерий приёмки**: Пользователи могут быстро начать работу

---

## Этап 7: Подготовка к релизу (P3)

### 7.1. Версионирование и changelog ⏱️ 2-3 часа

**Задачи**:
- [ ] **7.1.1** Настроить semantic versioning:
  - MAJOR.MINOR.PATCH

- [ ] **7.1.2** Создать CHANGELOG.md:
  ```markdown
  ## [0.2.0] - 2026-02-18
  ### Added
  - Модуль экспорта результатов
  - Расчёт времени и стоимости резки
  
  ### Fixed
  - Запуск тестов Vitest
  ```

**Критерий приёмки**: Понятная история изменений

---

### 7.2. Публикация npm пакета ⏱️ 3-4 часа

**Задачи**:
- [ ] **7.2.1** Обновить package.json:
  ```json
  {
    "name": "dxf-kimi25",
    "version": "0.2.0",
    "main": "dist/index.js",
    "types": "dist/index.d.ts",
    "exports": {
      ".": {
        "import": "./dist/index.js",
        "types": "./dist/index.d.ts"
      }
    }
  }
  ```

- [ ] **7.2.2** Добавить export модулей:
  ```typescript
  export * from './core/index.js';
  ```

- [ ] **7.2.3** Опубликовать в npm:
  ```bash
  npm publish
  ```

**Критерий приёмки**: Пакет доступен в npm registry

---

## Сводная таблица задач

| Этап | Задача | Приоритет | Время | Статус |
|------|--------|-----------|-------|--------|
| 1 | Исправление тестов | P0 | 2ч | ⏳ |
| 1 | Настройка CI/CD | P0 | 3ч | ⏳ |
| 2 | Тесты Normalize | P1 | 5ч | ⏳ |
| 2 | Тесты Rendering | P1 | 7ч | ⏳ |
| 2 | Тесты Nesting | P1 | 5ч | ⏳ |
| 2 | Тесты DXF Reader | P1 | 7ч | ⏳ |
| 2 | Интеграционные тесты | P1 | 5ч | ⏳ |
| 3 | Модуль экспорта | P1 | 10ч | ⏳ |
| 3 | Time & Cost | P1 | 7ч | ⏳ |
| 3 | Анализ резки | P1 | 5ч | ⏳ |
| 4 | Web Workers | P2 | 10ч | ⏳ |
| 4 | Оптимизация рендеринга | P2 | 7ч | ⏳ |
| 4 | Lazy loading | P2 | 4ч | ⏳ |
| 5 | Управление слоями | P2 | 7ч | ⏳ |
| 5 | Измерения | P2 | 9ч | ⏳ |
| 5 | Поиск сущностей | P2 | 5ч | ⏳ |
| 6 | API документация | P3 | 5ч | ⏳ |
| 6 | Примеры | P3 | 5ч | ⏳ |
| 7 | Changelog | P3 | 3ч | ⏳ |
| 7 | npm публикация | P3 | 4ч | ⏳ |

**Итого**: ~134 часов (~17 рабочих дней)

---

## Дорожная карта

### Спринт 1 (Неделя 1-2): Стабилизация
- ✅ Исправление тестов
- ✅ Настройка CI/CD
- ✅ Тесты Normalize
- ✅ Тесты Geometry

### Спринт 2 (Неделя 3-4): Покрытие тестами
- ✅ Тесты Rendering
- ✅ Тесты Nesting
- ✅ Тесты DXF Reader
- ✅ Интеграционные тесты

### Спринт 3 (Неделя 5-6): Новый функционал
- ✅ Модуль экспорта
- ✅ Time & Cost расчёт
- ✅ Улучшение анализа резки

### Спринт 4 (Неделя 7-8): Производительность
- ✅ Web Workers
- ✅ Оптимизация рендеринга
- ✅ Lazy loading

### Спринт 5 (Неделя 9-10): UX улучшения
- ✅ Управление слоями
- ✅ Измерения
- ✅ Поиск сущностей

### Спринт 6 (Неделя 11-12): Подготовка к релизу
- ✅ Документация
- ✅ Примеры
- ✅ npm публикация

---

## Метрики успеха

| Метрика | Текущее | Цель |
|---------|---------|------|
| Покрытие тестами | ~25% | ≥ 75% |
| Время сборки | 514ms | < 400ms |
| Время загрузки | ~30KB | < 25KB (gzip) |
| FPS (10K сущностей) | ~30 | ≥ 60 |
| Размер DXF (макс) | 1M сущностей | 5M сущностей |

---

*План составлен 18 февраля 2026 г.*
