-- ============================================================
-- DXF-kimi25 — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL editor)
-- ============================================================

-- ─── Extensions ─────────────────────────────────────────────
-- uuid_generate_v4() used as default PK generator
create extension if not exists "uuid-ossp";

-- ─── 1. workspace_catalogs ──────────────────────────────────
create table if not exists workspace_catalogs (
  id          uuid primary key default uuid_generate_v4(),
  workspace_id text not null,
  name        text not null check (char_length(name) between 1 and 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists workspace_catalogs_workspace_id_idx
  on workspace_catalogs (workspace_id);

-- ─── 2. workspace_files ─────────────────────────────────────
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

-- ─── 3. shared_sheets ───────────────────────────────────────
create table if not exists shared_sheets (
  hash          text primary key,                    -- 8-char hex, e.g. "a1b2c3d4"
  sheet_index   integer not null default 0,
  single_result jsonb not null,                      -- serialised NestingResult
  created_at    timestamptz not null default now()
);

create index if not exists shared_sheets_created_at_idx
  on shared_sheets (created_at);

-- ─── 4. Row-Level Security ──────────────────────────────────
-- All access goes through the service-role key (server-side only).
-- Enable RLS but deny all anonymous/authenticated access — only
-- the service-role key (bypasses RLS) may read/write.

alter table workspace_catalogs enable row level security;
alter table workspace_files     enable row level security;
alter table shared_sheets       enable row level security;

-- No policies needed: service-role bypasses RLS entirely.
-- If you ever add anon/user policies, add them here.

-- ─── 5. Storage bucket: dxf-files ──────────────────────────
-- Create via Dashboard → Storage → New bucket, OR with this SQL:
--
-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values (
--   'dxf-files',
--   'dxf-files',
--   false,                              -- private bucket
--   209715200,                          -- 200 MB per file
--   array['application/dxf', 'application/octet-stream', 'text/plain']
-- )
-- on conflict (id) do nothing;
--
-- Storage RLS policy (service-role key bypasses, so no extra policy needed
-- for server-side access). If you want direct-browser access, add a policy.

-- ─── 6. Auto-delete expired shared_sheets (optional cron) ───
-- Supabase pg_cron extension (Dashboard → Database → Extensions → pg_cron):
--
-- select cron.schedule(
--   'prune-shared-sheets',
--   '0 3 * * *',   -- every day at 03:00 UTC
--   $$
--     delete from shared_sheets
--     where created_at < now() - interval '7 days';
--   $$
-- );
