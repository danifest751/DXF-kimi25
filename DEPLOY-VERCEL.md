# Deploy: local + Vercel

## 1) Local development

Run UI and API together from repo root:

```bash
npm install
npm run dev:all
```

Services:
- UI: `http://localhost:5173` (or next free port)
- API: `http://localhost:3000`

`ui-app` uses Vite proxy in dev:
- `/api/*` -> `http://localhost:3000`
- `/health` -> `http://localhost:3000`

So in local dev `VITE_API_BASE` can stay empty.

---

## 2) Production topology

Default (single deploy):
- Deploy **UI + API** in one Vercel project.
- API работает как Vercel Function: `api/[...all].ts`.

Optional alternative:
- Вынести API на отдельный хост (Render/Railway/VPS), если упрётесь в serverless лимиты.

---

## 3) Deploy to Vercel (UI + API)

### Vercel project settings

- Repository: this repo
- Root directory: repo root (`c:/DXF-kimi25`), using `vercel.json`
- Build command: from `vercel.json`
- Output directory: from `vercel.json`

### Environment variable (Vercel)

Set in Vercel Dashboard:

- `VITE_API_BASE` (optional)
- `SUPABASE_URL` (required for persistent shared sheet hashes)
- `SUPABASE_SERVICE_ROLE_KEY` (required for persistent shared sheet hashes)
- `SUPABASE_SHARED_SHEETS_TABLE=shared_sheets` (optional)

For single-project Vercel deploy (same domain for UI/API):
- leave `VITE_API_BASE` empty.

If API is external:
- `VITE_API_BASE=https://<your-api-domain>`

Для hash-кодов листов (share by hash) нужна таблица Supabase:

```sql
create table if not exists public.shared_sheets (
  hash text primary key,
  sheet_index integer not null,
  single_result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists shared_sheets_created_at_idx
  on public.shared_sheets (created_at);
```

---

## 4) External API host (optional)

Run API package on host:

```bash
npm install
npm run build -w @dxf-viewer/api-service
npm run start -w @dxf-viewer/api-service
```

Required env on API host:

- `PORT=3000` (or host-provided)
- `ALLOWED_ORIGINS=https://<your-vercel-domain>,https://<custom-domain-if-any>`

Example:

```env
ALLOWED_ORIGINS=https://my-dxf-viewer.vercel.app
```

---

## 5) Post-deploy checklist

1. Open UI on Vercel
2. Upload DXF file
3. Verify cutting stats works
4. Verify nesting works
5. Verify export DXF/CSV works
6. Verify API `/health` (or `/api/health`) is reachable

---

## 6) Notes

- If API domain changes, update `VITE_API_BASE` and redeploy UI.
- If CORS errors appear, check `ALLOWED_ORIGINS` in API env.
- Telegram long polling (`startTelegramBotPolling`) не подходит для Vercel serverless.
  Для Telegram-бота используйте отдельный long-running хост (Render/Railway/VPS) или webhook-архитектуру.

---

## 7) Troubleshooting: 500 on `/api/cutting-stats` or `/api/nest`

1. First check API bootstrap:
   - Open `https://<your-domain>/api/health`
   - If this endpoint returns 500, problem is in function bootstrap (not DXF payload).

2. Ensure API functions run as ESM on Vercel:
   - `api/package.json` must contain:

```json
{
  "private": true,
  "type": "module"
}
```

3. Verify serverless entrypoint is catch-all function:
   - `api/[...all].ts` exists and forwards requests to api-service app.

4. If UI shows `Mode: cutting LOCAL | nesting LOCAL`:
   - UI fallback is active because API requests failed.
   - Open browser Network tab and inspect response body for `/api/cutting-stats` or `/api/nest`.
   - Use `details` field from response to locate exact crash reason.
