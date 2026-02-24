# Deploy to Coolify (UI + API + Telegram bot in one service)

Этот проект можно деплоить в Coolify одним Docker-сервисом:
- UI (статический `packages/ui-app/dist`) раздаётся через `api-service`;
- API работает на `PORT`;
- Telegram polling запускается внутри того же процесса при наличии `TELEGRAM_BOT_TOKEN`.

## 1) Source

- Repository: этот репозиторий
- Branch: `master` (или нужная)
- Build pack: **Dockerfile**
- Dockerfile path: `./Dockerfile`

## 2) Порт и healthcheck

- Exposed port: `3000`
- Health check path: `/health`

## 3) Environment variables (Coolify)

Обязательные:

- `PORT=3000`

Рекомендуемые:

- `ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com`

Для Telegram-бота (включить polling):

- `TELEGRAM_BOT_TOKEN=<token-from-botfather>`
- `TELEGRAM_POLL_TIMEOUT_SEC=30` (опционально)

Если `TELEGRAM_BOT_TOKEN` не задан, API работает, но бот-поллинг отключён.

## 4) Что будет доступно после деплоя

- UI: `https://<your-domain>/`
- API Health: `https://<your-domain>/health`
- API endpoints: `https://<your-domain>/api/*`

## 5) Проверка после деплоя

1. Открыть `/health` — должен быть JSON `{ status: "ok" ... }`.
2. Открыть UI и загрузить DXF.
3. Проверить `/api/cutting-stats` и `/api/nest` через UI.
4. Если включён бот: отправить `/start` в Telegram и проверить ответ.
5. Проверить hash-flow:
   - сделать nesting в UI,
   - скопировать hash листа,
   - отправить hash в бота,
   - получить DXF листа в ответ.

## 6) Важно про хранение hash-кодов

`sharedSheetStore` — in-memory хранилище. Hash живут, пока жив контейнер (и до TTL). После перезапуска контейнера старые hash недоступны.

Для постоянного хранения в будущем используйте Redis/KV.
