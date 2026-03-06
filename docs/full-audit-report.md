# DXF-kimi25 — полный аудит программы

## Краткое резюме

Это **актуальный инженерный аудит** монорепозитория `DXF-kimi25` по состоянию кода на текущий момент.

Проверка проводилась по следующим направлениям:

- архитектура монорепозитория и границы пакетов
- безопасность auth/session и API
- устойчивость хранения и multi-instance поведения
- производительность UI, DXF потоков и тяжёлых render paths
- поддерживаемость фронтенда и set-builder подсистемы
- тестируемость, эксплуатационная готовность и приоритет улучшений

## Итоговая оценка

Проект находится в **хорошем рабочем состоянии** и уже выглядит как полноценная развиваемая система, а не экспериментальный прототип.

Сильные стороны сейчас особенно заметны в следующих зонах:

- сильное `core-engine` ядро
- осмысленное package-разделение
- рабочий API слой с базовой защитой и интеграцией с Supabase
- зрелый `ui-app`, который уже прошёл заметную безопасную декомпозицию orchestration-слоя
- наличие regression-тестов на API, UI, nesting, render и security-кейсы

При этом в проекте всё ещё есть несколько важных рисков, которые желательно закрыть до серьёзного роста нагрузки и данных.

### Общая инженерная оценка

- **Архитектура**: 8/10
- **Безопасность**: 7/10
- **Надёжность**: 7/10
- **Производительность**: 7/10
- **Поддерживаемость**: 7/10
- **Тестируемость**: 7/10

---

# 1. Что было просмотрено

## Основные модули и файлы

- `package.json`
- `packages/ui-app/src/main.ts`
- `packages/ui-app/src/main-app-shell.ts`
- `packages/ui-app/src/auth.ts`
- `packages/ui-app/src/auth-session-flow.ts`
- `packages/ui-app/src/workspace-remote-files.ts`
- `packages/ui-app/src/set-builder/index.ts`
- `packages/ui-app/src/set-builder/render.ts`
- `packages/ui-app/src/set-builder/persist.ts`
- `packages/ui-app/src/set-builder/state.ts`
- `packages/api-service/src/index.ts`
- `packages/api-service/src/telegram-auth.ts`
- `packages/api-service/src/shared-sheets.ts`
- `packages/api-service/src/workspace-library.ts`
- `tests/api/security.test.ts`
- `tests/api/telegram-auth.test.ts`
- `tests/api/workspace-library.test.ts`
- `tests/ui/set-builder-state.test.ts`
- `tests/ui/sidebar-xss.test.ts`
- `tests/ui/api-helpers.test.ts`

## Структура проекта

Монорепозиторий организован логично:

- `packages/core-engine` — доменное вычислительное ядро
- `packages/ui-app` — веб-интерфейс
- `packages/api-service` — HTTP API и серверная оркестрация
- `packages/bot-service` — Telegram bot
- `packages/pricing` — pricing logic
- `tests/*` — тесты по подсистемам
- `docs/*` — документация и планы
- `supabase/*` — SQL/schema-инфраструктура

Это по-прежнему сильная сторона проекта: доменная логика не размазана по UI, а ключевые потоки разделены по ответственностям.

---

# 2. Текущее состояние архитектуры

## 2.1. Монорепо построено правильно для данного домена

С точки зрения общей архитектуры проект выглядит зрелее, чем типичный internal-tool такого объёма.

Плюсы:

- вычислительная часть вынесена в `core-engine`
- API не зависит от рендеринга UI
- бот выделен отдельно, а не вшит в API-роуты хаотично
- pricing вынесен из rendering/nesting логики
- тесты организованы по доменным областям

Это снижает цену изменений и позволяет развивать продукт не только как фронтенд, но и как платформу.

## 2.2. `ui-app` уже не выглядит как god-file-driven фронтенд

Раньше основной риск во фронтенде был в том, что orchestration концентрировался в нескольких перегруженных entry/controller файлах.

Сейчас ситуация заметно лучше:

- `main.ts` стал более тонким composition root
- появились отдельные shell/helper модули для runtime/ui/viewer/toolbar/nesting bootstrap
- `auth.ts` и `workspace.ts` стали тоньше благодаря выносу flow/controller логики
- orchestration UI теперь лучше сегментирован по зонам ответственности

Это **не означает, что фронтенд полностью “завершён” архитектурно**, но означает, что предыдущий риск деградации `ui-app` уже существенно снижен.

## 2.3. Наиболее тяжёлая фронтенд-подсистема сейчас — `set-builder`

После cleanup `main.ts` главным hotspot стал именно `set-builder`:

- `packages/ui-app/src/set-builder/index.ts` остаётся очень крупным orchestration/state/UI файлом
- `packages/ui-app/src/set-builder/render.ts` содержит большие string-template render blocks
- внутри `set-builder` есть заметное количество локального mutable state, DOM-driven логики и связанных сценариев
- persistence/material sync flows завязаны на комбинацию `localStorage`, auth-event и серверных API

Это уже не выглядит как критическая авария, но это явный следующий кандидат на архитектурное упорядочивание.

## 2.4. API стал более зрелым в части практической эксплуатации

Серверный слой сейчас уже содержит несколько хороших признаков инженерной зрелости:

- CORS whitelist
- body size limits
- rate limiting для тяжёлых операций
- auth cookie helpers
- explicit auth/session endpoints
- Supabase-backed persistence для ключевых серверных сущностей
- отдельный shared-sheet storage модуль

Это уже не “тонкий express-скрипт”, а полноценный application layer.

---

# 3. Сильные стороны проекта

## 3.1. Сильное доменное ядро

Главная сила проекта — DXF/nesting домен вынесен в отдельное ядро, а не размазан между UI и API.

Практический эффект:

- доменные алгоритмы проще тестировать отдельно
- UI можно рефакторить без разрушения core-логики
- сервер и бот могут использовать те же вычислительные возможности
- появляется пространство для будущих batch/background сценариев

## 3.2. Переход к cookie-based auth уже начат корректно

По текущему состоянию видно, что сервер уже умеет работать с `HttpOnly` cookie:

- в `packages/api-service/src/index.ts` есть установка и очистка auth-cookie
- клиентский `api.ts` использует `credentials: 'include'`
- `auth.ts` и `auth-session-flow.ts` уже ориентированы на cookie-сессию как основной путь
- legacy token adoption сохранён как переходная совместимость, а не как единственный механизм

Это важный плюс: риск по auth всё ещё не нулевой, но проект уже находится **в процессе правильной миграции**, а не в полностью небезопасной исходной точке.

## 3.3. Загрузка файлов улучшена по сравнению с исходной base64-схемой

Для authenticated workspace upload сейчас используется более здоровый поток:

- direct upload init
- signed URL upload бинарных данных
- finalize metadata call
- fallback на multipart/form-data

Это значительно лучше, чем полный упор на большие JSON base64 payload.

## 3.4. Тестовая дисциплина выше среднего для проекта такого размера

В проекте есть тесты по нескольким уровням:

- API security и validation
- auth/session ограничения
- workspace-library validations
- UI helpers
- set-builder state selectors
- nesting / geometry / render / export

Отдельно важно, что уже есть security-oriented regression tests, а не только happy-path unit tests.

## 3.5. Серверные in-memory механизмы больше не являются единственной линией защиты

Для rate limit, shared sheets и auth sessions сейчас используется гибридная схема:

- локальный in-memory cache/store
- Supabase-backed persistence / shared state, если backend включён

Это не идеальная финальная архитектура, но заметно лучше чисто локальных `Map` как единственного source of truth.

---

# 4. Критичные и важные риски

## 4.1. High: legacy auth token path через `localStorage` всё ещё существует

### Где

- `packages/ui-app/src/state.ts`
- `packages/ui-app/src/auth-session-flow.ts`
- косвенно `packages/ui-app/src/auth.ts`

### Проблема

Хотя основной auth flow уже переведён на cookie-based сессию, в коде всё ещё сохраняется legacy-compatible путь через `AUTH_TOKEN_STORAGE_KEY` и `localStorage`.

Это означает:

- часть логики остаётся совместимой с token-in-storage подходом
- XSS по-прежнему может иметь более тяжёлые последствия, если legacy token присутствует
- auth-модель пока ещё переходная, а не окончательно очищенная

### Риск

- угон legacy-сессии
- избыточная сложность auth-потока
- повышенная цена сопровождения и миграции

### Рекомендация

Довести миграцию до конца:

- убрать зависимость от `AUTH_TOKEN_STORAGE_KEY` как от рабочего пути
- оставить только cookie-session + server revoke/logout
- явно описать migration cutoff и стратегию очистки legacy токенов

### Приоритет

- **Высокий**

---

## 4.2. Medium/High: download/processing path всё ещё использует большие base64 payload для некоторых сценариев

### Где

- `packages/api-service/src/index.ts`
- `packages/ui-app/src/workspace-remote-files.ts`
- DXF parse / cutting endpoints

### Проблема

Upload-путь для workspace улучшен, но часть read/processing сценариев всё ещё опирается на передачу DXF как base64 внутри JSON.

Особенно это видно в:

- `/api/library-files-download`
- некоторых compute endpoints, где base64 попадает в JSON body
- локальных преобразованиях `atob` → `Uint8Array` → `ArrayBuffer`

### Риск

- memory amplification на больших файлах
- лишние копии данных на клиенте и сервере
- слабое масштабирование при тяжёлых DXF
- плохая совместимость с жёсткими лимитами serverless/runtime

### Рекомендация

Следующий шаг здесь — уже не “исправить всё срочно”, а убрать остаточные base64-heavy места:

- где возможно, отдавать бинарный download
- для тяжёлых compute flows не гонять большой base64 через JSON без крайней необходимости
- явнее разделить preview/metadata/processing paths

### Приоритет

- **Средний–высокий**

---

## 4.3. Medium/High: shared state всё ещё partly hybrid и требует архитектурного закрепления

### Где

- `packages/api-service/src/index.ts`
- `packages/api-service/src/telegram-auth.ts`
- `packages/api-service/src/shared-sheets.ts`

### Проблема

Проект уже ушёл от полностью локальных ephemeral-only механизмов, но архитектура всё ещё гибридная:

- локальные `Map` используются как рабочий cache/store
- Supabase выступает как shared backing store, если включён
- поведение в режимах “есть shared storage / нет shared storage” различается

### Риск

- разные свойства системы в dev/single-instance и production
- сложнее reasoning про source of truth
- больше эксплуатационных угловых случаев

### Рекомендация

Формализовать режимы работы:

- явно описать supported deployment modes
- документировать, что является authoritative store для auth/rate-limit/shared-sheets
- при необходимости выделить shared-state abstraction вместо ad-hoc гибрида

### Приоритет

- **Средний–высокий**

---

## 4.4. Medium: `set-builder` остаётся главной архитектурной зоной риска во фронтенде

### Где

- `packages/ui-app/src/set-builder/index.ts`
- `packages/ui-app/src/set-builder/render.ts`
- `packages/ui-app/src/set-builder/persist.ts`

### Проблема

Именно `set-builder`, а не `main.ts`, сейчас является самым тяжёлым фронтенд-узлом.

Основные признаки:

- крупный orchestration файл
- большой string-based render
- высокий объём mutable UI-state
- смешение view wiring, state transitions, persistence и operational flows
- repeated linear lookups через `find`/`findIndex` в чувствительных местах

### Риск

- рост цены изменений
- трудности с локальным reasoning
- регрессии при расширении UI
- слабая адресная тестируемость render/fragments

### Рекомендация

Следующий архитектурный refactor целесообразно сосредоточить именно здесь:

- дробить render на smaller view builders
- выделять typed view-model слой
- изолировать persistence/material sync flows
- снижать число ad-hoc DOM/render side effects
- использовать `Map`/индексы там, где есть повторяющиеся lookups по id и stable keys

### Приоритет

- **Средний**

---

## 4.5. Medium: localStorage всё ещё используется как рабочий storage для guest/material flows

### Где

- `packages/ui-app/src/auth.ts`
- `packages/ui-app/src/set-builder/persist.ts`
- guest draft / material persistence paths

### Проблема

Даже после улучшений проект всё ещё опирается на client-side storage для части guest и transitional сценариев.

Это нормально для UX, но создаёт ограничения:

- сложная миграция guest → authenticated
- риск несогласованности локального и серверного состояния
- зависимость от браузерного storage и его ограничений

### Риск

- edge-case баги при логине/логауте
- неочевидные конфликты данных
- рост сложности поддержки

### Рекомендация

Не убирать guest storage полностью, но формализовать его:

- чётко описать invariants guest draft / guest materials
- сократить число transitional branches
- добавить больше integration-тестов на login/logout migration сценарии

### Приоритет

- **Средний**

---

# 5. Производительность и масштабирование

## 5.1. Основные улучшения уже сделаны в upload-потоке

Переход на direct upload через signed URL — это серьёзное улучшение для workspace upload.

Это уменьшает:

- давление на API память
- размер JSON payload
- риск падения на крупных файлах

Это стоит сохранить как основной шаблон для тяжёлых файловых сценариев.

## 5.2. Главный performance hotspot во фронтенде — крупный state/render слой set-builder

По текущему состоянию риски производительности сильнее связаны не с `main.ts`, а с:

- большими `innerHTML` render blocks
- repeated recomputation/filtering/grouping
- repeated lookups по массивам
- большим числом сценариев, связанных в один render cycle

Если количество library items и сложность UI продолжат расти, именно это место будет дорожать первым.

## 5.3. Hybrid caching/state на сервере требует явной эксплуатационной модели

`Map`-кеши и локальные лимитеры теперь не являются единственным state layer, но всё ещё остаются частью рабочего поведения.

Это означает, что проект надо оценивать не только как код, но и как систему развёртывания:

- как работает dev-mode без Supabase backing
- как работает production с Supabase backing
- что произойдёт при частичной деградации внешнего storage

---

# 6. Поддерживаемость кода

## 6.1. `ui-app` стал заметно поддерживаемее

Последние refactor-волны улучшили ситуацию в самых чувствительных orchestration-файлах.

Позитивные признаки:

- тоньше composition root
- больше локальных helper/controller границ
- меньше inline orchestration logic
- проще понимать, где auth/workspace/toolbar/nesting wiring

Это реальное улучшение, а не косметика.

## 6.2. Главная поддерживаемостная проблема сместилась в `set-builder`

Сейчас основной долг по поддерживаемости сосредоточен именно там.

Особенно заметны:

- большой `index.ts`
- большой `render.ts`
- смешение UX, state, persistence, optimizer и nested flows

## 6.3. Документации по архитектурным boundaries всё ещё не хватает

Код уже стал лучше структурирован, но знания о системе всё ещё частично живут “в голове” и в локальном контексте изменений.

Нужны отдельные документы:

- краткая архитектурная схема модулей
- data flow по `auth`, `workspace`, `set-builder`, `nesting`
- deployment assumptions для shared state

---

# 7. Безопасность

## Что уже хорошо

- сессионные токены на сервере хэшируются
- cookie-based auth уже реализован на серверной стороне
- есть revoke/logout path
- есть body size limits
- есть security regression tests
- есть internal-secret проверка для чувствительных служебных эндпоинтов
- есть валидация ряда входных данных и ограничение тяжёлых запросов

## Что остаётся главным риском

- legacy auth token path через `localStorage`
- остаточные большие base64 JSON paths
- гибридная модель shared state без явной формализации как архитектурного инварианта

## Итог по security

Безопасность проекта уже **лучше, чем в предыдущем состоянии**, но до полностью вычищенного production-grade auth/data-path слоя ещё есть работа.

---

# 8. Тестируемость

## Что уже хорошо

Тестовое покрытие выглядит лучше, чем у типичного проекта такого размера.

Есть тесты по следующим зонам:

- `tests/api/security.test.ts`
- `tests/api/telegram-auth.test.ts`
- `tests/api/workspace-library.test.ts`
- `tests/api/shared-sheets.test.ts`
- `tests/ui/set-builder-state.test.ts`
- `tests/ui/set-builder-mock-nesting.test.ts`
- `tests/ui/sidebar-xss.test.ts`
- доменные тесты по geometry/render/nesting/export

Это особенно важно, потому что уже покрываются не только happy-path сценарии, но и regression/security направления.

## Чего не хватает в первую очередь

### UI / auth-workspace migration

- guest draft restore/migrate
- login/logout migration сценарии
- material sync after auth change
- file library + set-builder cross-flow integration

### Set Builder

- render correctness для крупных UI-сценариев
- catalog/group actions
- optimizer modal / batch optimizer flows
- persistence restore edge cases

### API / storage behavior

- partial failure paths при Supabase degradation
- shared-state fallback consistency
- large-file binary/download behavior

### Наблюдение

Текущий уровень тестируемости уже хороший, но следующий прирост качества лучше получать не за счёт массы мелких unit tests, а за счёт **точечных integration/regression сценариев** в наиболее stateful зонах.

---

# 9. Приоритетный план улучшений

## Sprint 1 — обязательный

- завершить отказ от legacy auth token в `localStorage`
- формализовать cookie-only web auth flow
- расширить integration coverage для guest/auth migration сценариев
- сократить остаточные большие base64 JSON paths там, где это ещё возможно

## Sprint 2 — высокий приоритет

- заняться архитектурным упрощением `set-builder`
- вынести/описать stable view-model и persistence boundaries
- оптимизировать repeated lookups через `Map`/индексы в чувствительных местах
- описать supported deployment modes и authoritative storage model

## Sprint 3 — улучшение качества платформы

- добавить structured logging и request ids
- усилить integration test coverage по storage/auth/shared-state paths
- подготовить краткую архитектурную документацию проекта
- формализовать data flow для `workspace`, `auth`, `set-builder`, `nesting`

---

# 10. Финальный вывод

Проект можно считать **перспективным, функционально зрелым и пригодным для дальнейшего развития**.

Если сравнивать с предыдущим состоянием, то сейчас особенно важно отметить два факта:

- `ui-app` больше не является главным архитектурным источником тревоги в зоне entrypoint orchestration
- наиболее интересные и реальные следующие задачи сместились в сторону `set-builder`, остаточных data-path рисков и архитектурной формализации

### Ключевые плюсы

- сильное domain ядро
- хорошее package-разделение
- зрелее серверный auth/session слой
- улучшенный upload path
- неплохое regression/security покрытие
- заметная безопасная декомпозиция фронтенд orchestration-слоя

### Ключевые риски, которые нельзя надолго откладывать

- legacy `localStorage` path для auth
- остаточные base64-heavy DXF/data paths
- hybrid shared-state модель без явной формализации
- большой `set-builder` как следующий архитектурный hotspot

## Рекомендуемые следующие артефакты

Если делать следующий шаг после этого отчёта, логично подготовить два документа:

- `docs/remediation-plan.md` — пошаговый план исправлений по приоритетам
- `docs/architecture-overview.md` — краткая схема модулей, data flow и deployment assumptions