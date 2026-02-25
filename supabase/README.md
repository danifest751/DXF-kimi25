# Supabase Setup

## 1. Создать проект

[app.supabase.com](https://app.supabase.com) → New project.

## 2. Применить схему

Dashboard → **SQL editor** → вставить содержимое [`schema.sql`](./schema.sql) → Run.

Создаёт:
| Таблица | Назначение |
|---|---|
| `workspace_catalogs` | Каталоги DXF-файлов пользователя |
| `workspace_files` | Метаданные загруженных DXF-файлов |
| `shared_sheets` | Расшаренные листы нестинга (TTL 7 дней) |

## 3. Создать Storage bucket

Dashboard → **Storage** → New bucket:
- **Name**: `dxf-files`
- **Public**: OFF
- **File size limit**: 200 MB

Или раскомментировать соответствующий блок в `schema.sql` и выполнить.

## 4. Переменные окружения

Скопировать `.env.example` → `.env` и заполнить:

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Остальные переменные (`SUPABASE_WORKSPACE_CATALOGS_TABLE` и др.) опциональны — дефолтные значения совпадают с именами таблиц из `schema.sql`.

## 5. Включить pg_cron (опционально)

Для автоматической очистки устаревших `shared_sheets`:

Dashboard → **Database** → **Extensions** → включить `pg_cron` → выполнить блок cron из `schema.sql`.

## Как это работает

```
Browser / Bot
     │
     ▼
api-service (Express)
     │  uses service-role key (server-side only)
     ▼
Supabase REST API  ──►  PostgreSQL tables
Supabase Storage   ──►  dxf-files bucket
```

- **workspace_files** хранит только метаданные; сами DXF хранятся в bucket по пути `workspace/{workspaceId}/{uuid}.dxf`
- **shared_sheets** — in-memory кэш + персистентность в Supabase; при рестарте сервиса данные восстанавливаются из БД
- Если `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` не заданы — сервис работает без персистентности (только in-memory)
