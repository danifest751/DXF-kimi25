# DXF Viewer API

Краткая документация по `api-service`.

## Базовый URL

- Локально: `http://localhost:3000`

## Endpoints

### 1) Health

`GET /health`

Проверка, что сервис запущен.

**Ответ**

```json
{
  "status": "ok",
  "timestamp": "2026-02-22T10:00:00.000Z"
}
```

---

### 2) Parse DXF

`POST /api/parse`

Парсинг DXF и краткая сводка.

Поддержка входа:
1. `multipart/form-data` с полем `file`
2. JSON `{ "base64": "..." }`
3. JSON `{ "text": "..." }` для ASCII DXF

**Пример (multipart)**

```bash
curl -X POST "http://localhost:3000/api/parse" \
  -F "file=@part.dxf"
```

---

### 3) Normalize DXF

`POST /api/normalize`

Нормализация документа (flatten INSERT, bbox, слои).

**Пример**

```bash
curl -X POST "http://localhost:3000/api/normalize" \
  -F "file=@part.dxf"
```

---

### 4) Cutting stats

`POST /api/cutting-stats`

Расчёт статистики резки.

Опционально:
- `layerFilter: string[]`
- `tolerance: number`

**Пример**

```bash
curl -X POST "http://localhost:3000/api/cutting-stats" \
  -F "file=@part.dxf"
```

---

### 5) Nesting

`POST /api/nest`

Раскладка деталей.

**Body**

```json
{
  "items": [
    { "id": 1, "name": "A", "width": 100, "height": 80, "quantity": 3 },
    { "id": 2, "name": "B", "width": 120, "height": 50, "quantity": 2 }
  ],
  "sheet": { "width": 1500, "height": 3000 },
  "gap": 5,
  "rotationEnabled": true,
  "rotationAngleStepDeg": 2,
  "strategy": "maxrects_bbox",
  "multiStart": true,
  "seed": 0,
  "commonLine": {
    "enabled": true,
    "maxMergeDistanceMm": 0.2,
    "minSharedLenMm": 20
  }
}
```

Ключевые опции:
- `rotationAngleStepDeg`: `1 | 2 | 5`
- `strategy`: `blf_bbox | maxrects_bbox`
- `commonLine.enabled`: включает расчёт общего реза и метрик экономии
- при `commonLine.enabled = true` фактический зазор в раскладке принудительно `0` (в ответе `data.gap` возвращается уже эффективное значение)

В ответе `data` (NestingResult) дополнительно присутствуют метрики:
- `cutLengthEstimate` (мм)
- `sharedCutLength` (мм)
- `cutLengthAfterMerge` (мм)
- `pierceEstimate`
- `pierceDelta`

Примечание по UI: в web-интерфейсе метрика экономии реза может отображаться в метрах для удобства чтения, но API возвращает длины в миллиметрах.

**Пример**

```bash
curl -X POST "http://localhost:3000/api/nest" \
  -H "Content-Type: application/json" \
  -d "{\"items\":[{\"id\":1,\"name\":\"A\",\"width\":100,\"height\":80,\"quantity\":3}],\"sheet\":{\"width\":1500,\"height\":3000}}"
```

---

### 6) Export DXF

`POST /api/export/dxf`

Экспорт результата раскладки в DXF.

**Body**

```json
{
  "nestingResult": { "...": "результат из /api/nest" }
}
```

---

### 7) Export CSV

`POST /api/export/csv`

Экспорт в CSV:
- либо `nestingResult`
- либо `cuttingStats`

**Body**

```json
{
  "nestingResult": { "...": "результат из /api/nest" },
  "fileName": "nesting_report"
}
```

---

### 8) Pricing

`POST /api/price`

Расчёт стоимости.

**Body**

```json
{
  "cutLength": 12345,
  "pierces": 40,
  "sheets": 2,
  "material": "steel",
  "thickness": 2,
  "complexity": 1.1
}
```

---

### 9) Bot helper endpoint

`POST /api/bot/message`

Вспомогательный endpoint для внутренней проверки bot-service.
Полноценный Telegram workflow работает через отдельный `packages/bot-service` (polling), а не через этот endpoint.

**Body**

```json
{
  "chatId": "123",
  "text": "/price"
}
```

---

## Запуск API

Из корня проекта:

```bash
npm run dev:api
```

---

## Telegram bot-service (отдельный сервис)

Бот запускается отдельно от API и использует Telegram polling.

Запуск из корня:

```bash
# обязательно задать токен
# TELEGRAM_BOT_TOKEN=<token>

npm run dev:bot
```

Ключевые возможности бота:
- загрузка одного или нескольких DXF в набор
- статистика резки по набору (врезки/длина)
- интерактивный выбор количества, размера листа (пресеты и custom)
- выбор режима раскладки: `Быстро / Точно / Точно+общий рез`
- запуск раскладки и сохранение вариантов (`V1`, `V2`, ...)
- выбор активного варианта
- экспорт активного варианта в DXF/CSV
- сброс набора через кнопку

## Важно: текущий статус интеграции UI

На текущий момент UI (web-интерфейс) **вызывает HTTP API** (эндпоинты `/api/cutting-stats`, `/api/nest`, `/api/export/*`).

Это реализовано в `packages/ui-app/src/main.ts` через `fetch`-запросы (helper-функции `apiPostJSON`/`apiPostBlob`).

При ошибке API в ряде сценариев включается fallback на локальные вычисления через `core-engine`.
