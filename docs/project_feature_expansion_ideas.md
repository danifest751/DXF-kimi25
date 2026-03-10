# Предложения По Расширению Функционала Проекта

Ниже — что я бы добавил в проект, если смотреть на него как на продукт, а не на набор фич. Сейчас у тебя уже сильная база: viewer, библиотека, nesting, cutting stats, optimizer, Telegram auth, экспорт и share-flow. Это уже не “просмотрщик”, а зачаток production-инструмента для цеха, менеджера и технолога. fileciteturn0file0

## Главный Диагноз

Сейчас продукт хорошо покрывает:
- просмотр и хранение DXF
- подготовку набора деталей
- раскладку
- базовую оптимизацию
- интеграцию через Telegram

Но у него пока есть очевидный разрыв:

**между “посмотреть/проанализировать” и “реально быстро поправить файл и отдать в резку”.**

То есть у тебя уже есть почти весь pipeline, но отсутствует самый липкий и частый сценарий:

**оперативная правка геометрии без ухода в AutoCAD / Compass / LibreCAD / DraftSight.**

Это первая и самая сильная точка роста.

---

## Что Добавлять В Первую Очередь

### 1. Встроенный DXF Editor / Sketch Editor

Это самый логичный следующий шаг.

#### Что дать в v1
- line / rectangle / circle / polyline
- move / rotate / mirror / scale
- join endpoints
- close contour
- delete duplicates
- remove micro-segments
- snap: endpoint / midpoint / center / intersection
- экспорт обратно в DXF

#### Почему это критично
Потому что у тебя уже есть viewer + optimizer + cutting stats, а юзер всё равно будет упираться в:
- разорванный контур
- лишнюю линию
- немного не тот размер паза
- неправильное отверстие
- мусор после импорта

И если он ради этого уходит в сторонний CAD — ты теряешь ядро ценности продукта.

#### Почему это сильнее большинства других идей
Потому что это не “nice to have”, а прямое снятие боли.

---

### 2. DFM / Manufacturability Check

Сейчас у тебя есть optimizer по нескольким правилам: дубли, нулевые отрезки, микро-сегменты, предупреждения о spline/ellipse. Это полезно, но пока слишком “технически-узко”. fileciteturn0file0

Нужно поднять это на уровень:

**“файл годен / рискован / негоден для конкретного типа резки и материала”.**

#### Что добавить
Проверки:
- слишком маленькие внутренние отверстия
- слишком узкие перемычки
- слишком мелкие элементы для данной толщины
- острые внутренние углы
- слишком близкие контуры
- open contours на cutting layers
- self-intersections
- islands / disconnected inner shapes
- подозрительно большое число коротких сегментов
- оценка “плохой DXF после конвертации”

#### Ещё лучше
Сделать профили производства:
- Fiber laser
- CO2 laser
- Plasma

И под каждый профиль свои пороги:
- минимальная щель
- минимальный диаметр отверстия
- минимальная длина элемента
- tolerances

#### Почему это сильно
Ты перестаёшь быть просто viewer/nester и становишься проверкой технологической пригодности.

---

### 3. Quotations / RFQ Layer

У тебя уже есть `POST /api/price`, материалы, толщина, вес, длина реза, проколы. Это просится в нормальный quote workflow, а не просто “посчитать цену”. fileciteturn0file0

#### Что добавить
- создание коммерческого расчёта из одного файла или набора
- стоимость по:
  - длине реза
  - проколам
  - материалу
  - весу
  - времени резки
  - setup fee
  - minimum order fee
- ручные наценки / скидки
- экспорт в PDF / shareable quote link
- статусы:
  - draft
  - sent
  - approved
  - rejected

#### Почему это важно
Потому что иначе твой продукт зависает между инженерным и коммерческим слоями.

---

### 4. Job Preparation / Production Pack

Сейчас nesting заканчивается результатом раскладки и экспортом DXF листов. Это хорошо, но недостаточно для реального цеха. fileciteturn0file0

#### Нужно добавить “пакет в производство”
Для каждого листа:
- sheet ID
- material / thickness
- parts list
- qty per sheet
- utilization %
- cut length
- pierce count
- estimated machine time
- notes
- thumbnail / preview
- hash/version

#### Экспорт
- PDF traveller / route sheet
- ZIP:
  - DXF листа
  - PNG preview
  - JSON metadata
  - parts manifest

#### Почему это нужно
Потому что раскладка сама по себе — ещё не производственный артефакт.

---

### 5. Versioning / File History / Compare

Сейчас библиотека умеет хранить, переименовывать, удалять, назначать материалы, отмечать checked. Но нет нормальной истории изменений. fileciteturn0file0

#### Что добавить
- version history для каждого файла
- compare v1 vs v2
- визуальный diff:
  - добавленные контуры
  - удалённые элементы
  - изменённые размеры bbox / area / cut length
- rollback на предыдущую версию
- пометка:
  - original
  - optimized
  - edited
  - production-ready

#### Почему это важно
Как только появится встроенный редактор, без versioning ты создашь себе бардак.

---

## Что Добавлять Во Вторую Очередь

### 6. Smart Import Repair

Сейчас у тебя хороший parsing/normalize/optimizer набор, но можно сделать реально полезный repair pipeline. fileciteturn0file0

#### Идея
После загрузки DXF автоматически предлагать:
- объединить контуры
- закрыть малые зазоры
- удалить мусор
- перевести spline/ellipse в polyline
- унифицировать units
- вынести отдельные детали в split
- выделить потенциальные детали и отход

#### Формат UX
Не просто “ошибки”, а:
- Detected issues
- Recommended fixes
- кнопка Apply all safe fixes

#### Почему это сильно
Потому что большинству пользователей не нужен CAD. Им нужен repair button.

---

### 7. Cut Sequence Estimation

Сейчас считаются длина реза, проколы и контуры. Но до “как реально будет резаться” ещё далеко. fileciteturn0file0

#### Что добавить
- примерная последовательность реза:
  - inner before outer
  - reduce travel
  - heat-aware heuristic
- estimate rapid moves / non-cut travel
- rough machine time
- pierce strategy warnings

#### Это не полноценный CAM
И не надо. Но даже rough sequencing даст большую ценность для оценки стоимости и качества раскладки.

---

### 8. Part Detection & Classification

У тебя уже есть split по замкнутым контурам. Это можно поднять выше. fileciteturn0file0

#### Что добавить
- автоопределение: один файл = одна деталь / много деталей
- поиск повторяющихся деталей
- dedup одинаковых контуров
- группировка по shape similarity
- автоназвание по геометрии/материалу/толщине

---

### 9. Rules Engine per Customer / Machine / Material

Очень недооценённая вещь.

#### Идея
Разные клиенты, станки и материалы имеют разные требования:
- свои минимальные диаметры
- свои tolerances
- своё ценообразование
- свои ограничения на common-line
- свои правила брака

#### Что добавить
Профили:
- machine profile
- material profile
- customer profile

И автоматическое применение:
- в optimizer
- в DFM check
- в pricing
- в nesting defaults

---

## Что Может Дать Сильный Продуктовый Эффект

### 10. Collaboration / Review Mode

Сейчас Telegram у тебя в основном для логина и обмена хешами. Это узко. fileciteturn0file0

#### Расширение
- comment pins на файле / листе
- review status:
  - needs fix
  - approved for nesting
  - approved for production
- share link с preview
- Telegram notifications:
  - файл загружен
  - раскладка готова
  - quote готов
  - требуется подтверждение

---

### 11. BOM / Order Context

Сейчас есть set builder с количеством деталей, но это ещё не заказ как сущность. fileciteturn0file0

#### Добавить
- order/project entity
- customer name
- PO / reference
- due date
- priority
- files + quantities + materials
- status pipeline

---

### 12. Analytics Dashboard

Когда появятся quote, jobs, validation, история — можно собрать полезную аналитику:
- сколько файлов пришло грязными
- какие ошибки самые частые
- средний utilization по nesting
- сколько экономит common-line
- средняя цена / время / материал
- какие клиенты шлют худшие DXF

---

## Что Я Бы Не Делал Сейчас

### 1. Не лез бы в полноценный CAM
G-code, lead-ins/lead-outs, pierce tables, machine posts, controller-specific output — это уже другая компания.

### 2. Не строил бы полный CAD
Constraints, dimensions, parametric sketches, blocks editing, splines as first-class editing citizens — это распыление.

### 3. Не вкладывался бы сейчас в Telegram сверх меры
Он полезен как вход, уведомления, быстрый share/review. Но ядро ценности не там.

---

## Жёсткий Приоритетный Порядок

### Tier 1 — делать обязательно
1. Built-in DXF editor
2. DFM / manufacturability checks
3. Version history + compare
4. Smart repair pipeline

### Tier 2 — даст бизнес-ценность
5. Quoting workflow
6. Production pack / job prep
7. Rules engine by machine / material / customer

### Tier 3 — после этого
8. Collaboration / review
9. Part dedup / classification
10. Analytics

---

## Самая Сильная Продуктовая Связка

Если говорить не про отдельные фичи, а про реально мощный сценарий, то он должен выглядеть так:

**Upload DXF → Auto-check → Auto-repair suggestions → Quick edit → Material assignment → Nesting → Quote → Production pack**

Вот это уже цельный продукт.

Сейчас у тебя много кусков этого pipeline уже есть, но не хватает именно:
- оперативной правки
- производственной валидации
- коммерческого слоя
- сборки результата в job artifact

Если смотреть трезво, то именно эти четыре блока и дадут следующий скачок ценности. fileciteturn0file0
