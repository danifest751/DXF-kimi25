# Supabase — инструкция по настройке

---

## Шаг 1 — Создать проект Supabase

1. Открыть [app.supabase.com](https://app.supabase.com)
2. Нажать **New project**
3. Заполнить название, пароль БД, выбрать регион
4. Дождаться запуска (1–2 минуты)

---

## Шаг 2 — Создать таблицы (SQL Editor)

1. В левом меню открыть **SQL Editor**
2. Нажать **New query**
3. Вставить весь код ниже и нажать **Run** (▶)

```sql
-- Extensions
create extension if not exists "uuid-ossp";

-- Таблица каталогов
create table if not exists workspace_catalogs (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id text not null,
  name         text not null check (char_length(name) between 1 and 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists workspace_catalogs_workspace_id_idx
  on workspace_catalogs (workspace_id);

-- Таблица файлов
create table if not exists workspace_files (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id text not null,
  catalog_id   uuid references workspace_catalogs (id) on delete set null,
  name         text not null check (char_length(name) between 1 and 500),
  storage_path text not null,
  size_bytes   bigint not null default 0,
  checked      boolean not null default true,
  quantity     integer not null default 1 check (quantity >= 1),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists workspace_files_workspace_id_idx
  on workspace_files (workspace_id);
create index if not exists workspace_files_catalog_id_idx
  on workspace_files (catalog_id);

-- Таблица расшаренных листов нестинга
create table if not exists shared_sheets (
  hash          text primary key,
  sheet_index   integer not null default 0,
  single_result jsonb not null,
  created_at    timestamptz not null default now()
);
create index if not exists shared_sheets_created_at_idx
  on shared_sheets (created_at);

-- Включаем RLS (доступ только через service-role key на сервере)
alter table workspace_catalogs enable row level security;
alter table workspace_files     enable row level security;
alter table shared_sheets       enable row level security;
```

4. Должно появиться **Success. No rows returned** — это нормально, таблицы созданы пустыми.

> **Что создаётся:**
> | Таблица | Что хранит |
> |---|---|
> | `workspace_catalogs` | Папки/каталоги DXF-файлов |
> | `workspace_files` | Метаданные файлов (имя, размер, путь к файлу в bucket) |
> | `shared_sheets` | Расшаренные листы нестинга (хранятся 7 дней) |

---

## Шаг 3 — Создать Storage bucket для DXF-файлов

1. В левом меню открыть **Storage**
2. Нажать **New bucket**
3. Заполнить:
   - **Name**: `dxf-files` ← именно так, строчными буквами с дефисом
   - **Public bucket**: **выключить** (файлы приватные)
   - **File size limit**: поставить галочку, ввести `209715200` (это 200 МБ в байтах)
   - **Allowed MIME types**: оставить пустым (или добавить `application/octet-stream`)
4. Нажать **Save**

> Bucket будет пустым — файлы появятся в нём автоматически когда пользователи начнут загружать DXF через приложение.

---

## Шаг 4 — Получить ключи и прописать в окружение

1. В левом меню открыть **Settings** → **API**
2. Скопировать:
   - **Project URL** → это `SUPABASE_URL`
   - **service_role** (secret) → это `SUPABASE_SERVICE_ROLE_KEY`

3. Добавить в переменные окружения деплоя (Vercel / Railway / `.env`):

```env
SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` — секретный ключ, никогда не передавать на фронтенд и не коммитить в git.

---

## Шаг 5 — Автоочистка устаревших shared_sheets (опционально)

Расшаренные листы хранятся 7 дней. Сервис очищает их сам при каждом запросе, но можно добавить фоновую задачу в БД:

1. **Settings** → **Database** → **Extensions** → найти `pg_cron` → включить
2. В **SQL Editor** выполнить:

```sql
select cron.schedule(
  'prune-shared-sheets',
  '0 3 * * *',
  $$
    delete from shared_sheets
    where created_at < now() - interval '7 days';
  $$
);
```

---

## Как это работает в целом

```
Пользователь загружает .dxf
         │
         ▼
   api-service (сервер)
         │  использует SUPABASE_SERVICE_ROLE_KEY
         │
         ├──► Storage bucket "dxf-files"
         │    сохраняет сам файл по пути:
         │    workspace/{workspaceId}/{uuid}.dxf
         │
         └──► Таблица workspace_files
              сохраняет метаданные:
              имя, размер, путь, checked, quantity
```

- Если `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` **не заданы** — приложение работает без персистентности (данные только в памяти, теряются при рестарте)
- Если ключи **заданы** — все данные сохраняются в Supabase и переживают рестарты сервера
