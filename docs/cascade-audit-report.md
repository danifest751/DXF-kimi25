# DXF-kimi25 — аудит от Cascade

## Контекст

Этот отчёт написан после нескольких сессий активной работы с кодом: исправления производительности UI, аудита pipeline загрузки файлов, рефакторинга thumbnail-очереди, починки click violations и dxf-writer violations. Это не взгляд со стороны — это взгляд изнутри, после того как я трогал каждый узел pipeline руками.

Структура намеренно повторяет `full-audit-report.md` для удобства сравнения, но оценки и акценты — мои собственные.

---

## Итоговая оценка

| Направление | Оценка | Комментарий |
|---|---|---|
| Архитектура | 7/10 | Хорошее разделение пакетов, но `api-service/index.ts` 1601 строка |
| Производительность UI | 6/10 | После фиксов стало заметно лучше, но полный DOM rebuild остаётся |
| Надёжность render pipeline | 6/10 | Много синхронных путей, которые легко пропустить |
| Тестируемость | 7/10 | Хорошее доменное покрытие, слабо по UI integration |
| Поддерживаемость | 6/10 | `set-builder/index.ts` 972 строки + `render.ts` 922 строки |
| Безопасность | 7/10 | Основные векторы закрыты, legacy localStorage path остаётся |

---

# 1. Что я смотрел (фактически)

Перечислены только файлы, которые я реально читал и редактировал:

**Активно редактировал:**
- `packages/ui-app/src/set-builder/index.ts` — 972 строки
- `packages/ui-app/src/set-builder/render.ts` — 922 строки
- `packages/ui-app/src/set-builder/nesting.ts` — 270 строк
- `packages/ui-app/src/set-builder/optimizer/dxf-writer.ts` — 178 строк
- `packages/ui-app/src/set-builder/optimizer/index.ts`
- `packages/ui-app/src/set-builder/optimizer/batch-index.ts`
- `packages/ui-app/src/workspace-tree-reload.ts` — 195 строк
- `packages/ui-app/src/main-runtime-ui.ts` — 107 строк

**Читал для анализа:**
- `packages/ui-app/src/set-builder/library.ts`, `state.ts`, `persist.ts`, `types.ts`
- `packages/ui-app/src/workspace-remote-files.ts`, `workspace-ui-bridge.ts`
- `packages/ui-app/src/api.ts`, `state.ts`, `main.ts`, `main-app-shell.ts`
- `packages/ui-app/src/sidebar-filelist.ts`, `sidebar.ts`
- `packages/core-engine/src/export/index.ts`

**Не смотрел глубоко:**
- `packages/api-service/src/index.ts` (1601 строка) — видел структуру, не ревьюил детально
- `packages/api-service/src/workspace-library.ts` (721 строка)
- `packages/core-engine/src/nesting/`, `geometry/`, `dxf/reader/`
- `packages/bot-service/`, `packages/pricing/`

---

# 2. Архитектура — что работает хорошо

## 2.1. Разделение пакетов по ответственностям

`core-engine` не знает об UI. `ui-app` не знает о деталях HTTP. Это нетривиальное достижение для инструмента такого масштаба — обычно всё сваливается в кашу к 3-му месяцу разработки.

Практический эффект, который я наблюдал лично: когда чинил thumbnail pipeline, не пришлось трогать ни одной строки в `core-engine`. Когда делал async export — `exportNestingToDXF` оказался чистой функцией без сайдэффектов, легко обернулся в async wrapper.

## 2.2. Event-driven файловый pipeline

`dxf-files-updated` / `dxf-file-ready` как кастомные события — правильный подход для развязки workspace-reload и UI-рендера. После того как я перешёл с per-file dispatch на батчинг, весь pipeline стал ощутимо чище. Архитектура событий позволила сделать это без переписывания логики загрузки.

## 2.3. `set-builder` как отдельная подсистема

Выделение `set-builder/` в отдельную директорию с собственными `state.ts`, `persist.ts`, `library.ts`, `types.ts`, `nesting.ts` — это правильная граница. Там есть внутренняя структура, которая позволяет работать с подсистемой относительно изолированно.

## 2.4. Lazy thumbnail queue

После рефакторинга thumbnail pipeline работает в фоне: placeholder → `setTimeout(0)` → canvas render → DOM patch. Это правильная модель — не блокировать render-кадр тяжёлой работой.

---

# 3. Проблемы, которые я вижу изнутри

## 3.1. КРИТИЧНО: `api-service/src/index.ts` — 1601 строка

Это главный скрытый риск проекта, который я не трогал, но вижу по размеру.

Для сравнения: весь `set-builder/index.ts` — 972 строки, и это уже проблема. `api-service/index.ts` в 1.6 раза больше и является **единственной точкой входа** для всего серверного слоя.

**Что это значит:**
- все роуты, middleware, error handling, auth проверки, rate limiting — скорее всего в одном файле
- добавление нового endpoint требует навигации по 1600 строкам
- тестирование отдельного endpoint изолированно — сложно
- при PR review — невозможно понять что изменилось в конкретном роуте

**Что нужно:** декомпозиция по роутам/доменам аналогично тому, как `workspace-library.ts` уже выделен отдельно.

---

## 3.2. ВЫСОКИЙ: полный `root.innerHTML` rebuild в каждом рендере

### Где
`packages/ui-app/src/set-builder/render.ts:636`

```ts
root.innerHTML = `<div class="sb-shell">...`;
```

### Что я наблюдал

Это и есть источник 130–165ms `requestAnimationFrame` violations. Даже после добавления snapshot-сравнения (которое я сделал) — при **любом структурном изменении** состояния весь DOM пересоздаётся: ~800 строк HTML, все event listeners перепривязываются браузером, layout recalculation по всему дереву.

### Почему это проблема сейчас

При 10–20 файлах в библиотеке `buildLibraryRow` вызывается 10–20 раз для каждого rebuild. При добавлении нового файла в workspace весь список перестраивается заново.

### Путь решения

Разбить `renderMain` на независимые секции с отдельными DOM-контейнерами:
- `#sb-library-list` — список файлов
- `#sb-set-panel` — правая панель
- `#sb-topbar` — топбар (меняется только при auth change)

Каждая секция обновляется независимо. `innerHTML` остаётся, но только для своей секции, а не всего дерева.

---

## 3.3. ВЫСОКИЙ: `exportNestingToDXF` — тяжёлая синхронная функция без chunking

### Где
`packages/core-engine/src/export/index.ts:34`

### Что я наблюдал

`exportSheetByIndex` вызывал `exportNestingToDXF` синхронно в click handler → 385–397ms violation. Я обернул вызов в `await yieldFrame()` чтобы отпустить стек, но сама функция по-прежнему выполняется синхронно после yield.

Для небольших листов это работает. Для листа с сотнями деталей и тысячами entities — всё равно заблокирует тред после первого `setTimeout(0)`.

### Путь решения

`exportNestingToDXF` нужен chunked async вариант аналогичный `serializeEntitiesToDxfAsync` — с `await yieldToBrowser()` каждые N entities внутри основного цикла трансформации.

---

## 3.4. СРЕДНИЙ: `set-builder/index.ts` — 972 строки смешанной ответственности

### Что внутри

Я проходил этот файл многократно. В нём одновременно живут:
- state variables (20+ переменных)
- функции render/scheduleRender/patchToast
- thumb queue (stopThumbQueue, scheduleThumbQueue, processThumbQueue)
- drag & drop обработчики
- change listener (~50 строк)
- click listener (~500 строк с 40+ ветками action handling)
- глобальные event listeners (dxf-files-updated, dxf-file-ready, AUTH_SESSION_EVENT, keydown)
- init логика

### Практическая проблема

Когда я добавлял `fileReadyDebounceTimer` и `pendingReadyFileIds` — мне пришлось искать нужное место среди 5 других блоков state-переменных. Когда менял `scheduleFilesUpdatedRender` — рядом уже было 4 похожих "schedule*" функции.

### Что нужно

Выделить минимум три сущности:
- `thumb-queue.ts` — изолированная очередь миниатюр
- `click-handler.ts` или разбивка по action-группам
- Render scheduling отделить от state mutation

---

## 3.5. СРЕДНИЙ: `renderDxfThumbDataUrl` — canvas render в main thread

### Где
`packages/ui-app/src/set-builder/render.ts:127`

### Что я наблюдал

`renderEntity` для каждой flat entity вызывается синхронно на canvas. Я снизил сегменты с 64 до 16 и переключил на JPEG — это дало заметный прирост. Но для сложных DXF (500+ entities) один thumbnail всё равно занимает 20–40ms.

### Путь решения

OffscreenCanvas + Worker. Canvas render полностью выносится в worker — main thread только получает готовый ImageBitmap. Это единственный способ сделать thumbnail generation по-настоящему non-blocking.

Это большой рефакторинг, но архитектура уже готова: `processThumbQueue` последовательно обходит слоты, для каждого вызывает `renderDxfThumbDataUrl`. Замена этого вызова на `await renderInWorker(...)` — минимальное изменение интерфейса.

---

## 3.6. СРЕДНИЙ: `workspace-tree-reload.ts` — нет progress feedback при загрузке

### Что я наблюдал

При загрузке workspace с 10+ файлами concurrency=4 означает что файлы прилетают пачками. До моих фиксов каждый завершённый файл диспатчил событие немедленно → N rerenderов. После фикса — `dxf-file-ready` дебаунсится 150ms, и один полный render в конце по `batchDone`.

Но при этом пользователь видит "всё загружается" без промежуточного прогресса. Legacy sidebar показывал файлы по мере загрузки.

### Путь решения

`dxf-file-ready` события можно использовать для точечного обновления конкретной строки библиотеки (по `fileId`) без full rebuild. Это потребует перехода от `innerHTML` к точечным DOM-операциям для строк библиотеки.

---

## 3.7. НИЗКИЙ: `syncLoadedFilesIntoLibrary` вызывается в каждом `render()`

### Где
`packages/ui-app/src/set-builder/index.ts:256`

### Что я наблюдал

```ts
function render(): void {
  syncLoadedFilesIntoLibrary(state); // ← вызывается ВСЕГДА
  ...
}
```

`syncLoadedFilesIntoLibrary` делает `loadedFiles.map(...)`, `state.library.filter(...)`, несколько `findIndex` итераций. При каждом render — даже при переключении таба или закрытии меню — пересчитывается весь library mapping.

### Путь решения

Вызывать `syncLoadedFilesIntoLibrary` только при `dxf-file-ready` / `dxf-files-updated`, а не при каждом render. Snapshot уже содержит `libIds` для проверки актуальности.

---

# 4. Производительность: что реально изменилось после фиксов

| Проблема | До | После |
|---|---|---|
| `dxf-files-updated` на каждый файл | N rerenderов при загрузке workspace | 1 render в конце (batchDone) |
| `dxfThumbCache.clear()` при каждом событии | N² thumbnail redraws | Инвалидация только изменившихся |
| Full render при неизменном состоянии | Каждый dxf-file-ready = full rebuild | Snapshot diff — полный rebuild только при структурных изменениях |
| Canvas thumbnail segments | 64 arc/spline | 16 arc/spline, JPEG 0.7 |
| `exportSheetByIndex` | Синхронный в click handler, 385ms | `await yieldFrame()` + async, не блокирует click |
| `serializeEntitiesToDxfBytesAsync` chunk | 100 parts/yield | 50 parts/yield |

**Что осталось тяжёлым:** сам `renderMain` при полном rebuild — 100–150ms для большой библиотеки. Это структурная проблема `innerHTML` подхода, которую точечными фиксами не решить.

---

# 5. Тестирование — что покрыто и что нет

## Покрыто хорошо

- `set-builder-state.test.ts` — selector функции, state mutations
- `set-builder-mock-nesting.test.ts` — nesting результаты
- `export.test.ts` — DXF export с реальными entities (LWPOLYLINE)
- `nesting.test.ts`, `geometry/`, `cutting/` — доменные алгоритмы
- `security.test.ts`, `telegram-auth.test.ts` — API security paths

## Не покрыто и реально нужно

**Thumbnail pipeline:**
Нет ни одного теста на `renderDxfThumbDataUrl`, `processThumbQueue`, `replaceThumbSlot`. Это самая активно меняемая часть за последние сессии — без тестов любой рефакторинг рискованный.

**Event batching:**
Нет теста что `dxf-files-updated` с `batchDone=true` правильно очищает debounce timer и сбрасывает `lastRenderSnapshot`. Если кто-то изменит порядок событий — баг будет незаметен до production.

**Snapshot diff:**
Нет теста на `snapshotsEqual` / `snapshotState`. При добавлении нового поля в snapshot легко забыть добавить его в сравнение — рендер перестанет обновляться при изменении этого поля.

**Export async chain:**
`exportSheetByIndex` теперь async — нет теста что он не бросает исключение при пустом `itemDocs` или невалидном `sheetIndex`.

---

# 6. Скрытые долги, которые не видны снаружи

## 6.1. `nesting-panel.ts` — 628 строк, я в него не заходил

Самый большой файл в `ui-app/src` помимо set-builder. Судя по названию — панель управления раскладкой. По размеру — потенциально такая же концентрация ответственностей как в `set-builder/index.ts`.

## 6.2. `sidebar-catalogs.ts` — 387 строк

Второй по размеру. В legacy UI sidebar — источник file list рендеринга. После перехода на `set-builder` как основной UI — возможно, частично дублирует функциональность.

## 6.3. `dom.ts` — 114 строк экспортов legacy DOM-узлов

Этот файл экспортирует ссылки на DOM-элементы legacy UI. Пока `set-builder` и legacy существуют параллельно — это связка, которая мешает изолированному тестированию и удалению устаревшего кода.

## 6.4. `processThumbQueue` не обрабатывает ошибки canvas

```ts
const dataUrl = renderDxfThumbDataUrl(sourceId, width, height, angleDeg, dxfThumbCache, padPx);
if (!dataUrl) continue; // ← просто пропускает
```

Если `canvas.getContext('2d')` вернёт `null` (редкий случай в некоторых браузерах/окружениях) — слот останется в `data-thumb-ready="false"` навсегда, и queue будет бесконечно пытаться его обработать каждый раз при открытии set-builder.

---

# 7. Приоритетный план следующих улучшений

## Немедленно (низкая сложность, высокий эффект)

1. **Добавить тесты на `snapshotsEqual`** — критично после добавления snapshot механизма
2. **Защита от бесконечного цикла в thumb queue** — пометить слот `data-thumb-ready="error"` если render упал
3. **Вынести `syncLoadedFilesIntoLibrary` из render()** — вызывать только при файловых событиях

## Среднесрочно (средняя сложность, высокий эффект)

4. **Разбить `renderMain` на независимые секции** — `#sb-library`, `#sb-set-panel`, `#sb-topbar` с отдельными `innerHTML` обновлениями
5. **Декомпозировать `api-service/index.ts`** — по роутам/доменам, аналогично `workspace-library.ts`
6. **Async chunking в `exportNestingToDXF`** — для тяжёлых листов с сотнями деталей

## Долгосрочно (высокая сложность, стратегический эффект)

7. **OffscreenCanvas + Worker для thumbnail render** — единственный способ полностью убрать canvas blocking из main thread
8. **Выделить `thumb-queue.ts` как изолированный модуль** — с собственными тестами
9. **Точечное обновление строк библиотеки** — DOM patch по `fileId` вместо full rebuild при `dxf-file-ready`

---

# 8. Личные наблюдения о кодовой базе

**Что мне понравилось больше всего:** `core-engine` написан как будто его автор знал, что рядом будет меняться UI — чистые функции, никаких глобальных сайдэффектов, понятные интерфейсы. Когда мне нужно было обернуть `exportNestingToDXF` в async — это заняло 10 строк.

**Что меня больше всего удивило:** `nesting-panel.ts` — 628 строк, и я не имею представления что там происходит. Для проекта, где я активно работал с UI pipeline — это белое пятно на карте.

**Что потребовало больше всего осторожности:** snapshot механизм в `render.ts`/`index.ts`. Любое новое поле состояния нужно добавлять одновременно в `RenderSnapshot`, `snapshotState` и `snapshotsEqual` — иначе рендер молча перестаёт реагировать на это изменение. Это хрупкий инвариант без защиты в виде TypeScript exhaustiveness check.

**Что стоит сделать как можно раньше:** защитить `snapshotsEqual` статически. Если `RenderSnapshot` — это `interface`, то `snapshotsEqual` нужна проверка через mapped type или explicit key enumeration, чтобы компилятор требовал обновить сравнение при добавлении поля.

---

# 9. Итог

Проект живой и развивается в правильном направлении. Основные performance проблемы в UI pipeline устранены или существенно смягчены. Архитектурные границы между пакетами держатся.

Главные риски сейчас — не "код сломается", а "код станет дороже менять":

- `api-service/index.ts` в 1600 строк без декомпозиции
- `set-builder/index.ts` + `render.ts` как два файла по ~950 строк с перемешанными ответственностями  
- Отсутствие тестов на самые активно менявшиеся механизмы (thumbnail queue, snapshot diff, event batching)
- `innerHTML` полный rebuild как структурный потолок производительности

Это не критические аварии — это технический долг, который будет накапливать проценты по мере роста продукта.
