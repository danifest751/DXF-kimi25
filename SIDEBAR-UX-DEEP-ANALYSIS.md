# Глубокий анализ UX левой панели — на основе кода

> Этот документ отличается от двух предыдущих (`SIDEBAR-UX-IMPROVEMENTS.md`, `SIDEBAR-UX-CASCADE-PROPOSALS.md`) тем, что каждое наблюдение привязано к конкретным строкам кода и реальным поведенческим сценариям, а не к абстрактным wireframe'ам.

---

## Часть 1. Аудит текущей реализации

### 1.1. Архитектура состояния (State)

Файл: `packages/ui-app/src/main.ts`

| Переменная | Тип | Назначение |
|---|---|---|
| `loadedFiles` | `LoadedFile[]` | Все загруженные файлы (и гостевые, и серверные) |
| `workspaceCatalogs` | `WorkspaceCatalog[]` | Массив каталогов из Supabase |
| `selectedCatalogIds` | `Set<string>` | Множество ID каталогов, отображаемых в списке |
| `activeFileId` | `number` | ID файла, отрисованного на канвасе |
| `authSessionToken` | `string` | Токен сессии (пусто = гость) |

**Проблема двойной модели фильтрации.** `selectedCatalogIds` используется одновременно для:
1. Визуального фильтра в `renderCatalogFilter()` (строка ~295) — какие чипсы подсвечены
2. Логики включения файлов в расчёт `recalcTotals()` (строка ~741) — `isFileInSelectedCatalogs(f)`
3. Логики формирования nesting-деталей `updateNestItems()` (строка ~1229) — `isFileInSelectedCatalogs(f)`

Это значит: если пользователь просто кликнул на каталог «Проект А» чтобы посмотреть его файлы, он **одновременно отфильтровал статистику и nesting** — что может быть неожиданным. Фильтрация «что я вижу» и «что участвует в расчёте» — это разные задачи, но сейчас они слиты в один Set.

### 1.2. Двойной рендер каталогов

Каталоги рендерятся **дважды** в разных местах:

1. **Чипсы** — `renderCatalogFilter()` (строки 295–348): кнопки-пилюли в `#catalog-filter`. Клик по чипсу toggle'ит каталог в `selectedCatalogIds`.
2. **Строки в списке** — `renderFileList()` (строки 782–860): каждый каталог — это `.catalog-row` с чекбоксом, кнопками «Переим.» и «Удалить», и кликом по всей строке.

**Конфликт модели взаимодействия:**
- Клик по **чипсу** → toggle (добавить/убрать каталог из видимых)
- Клик по **строке каталога** → exclusive focus (показать только этот, повторный клик → показать все)
- Клик по **чекбоксу строки** → toggle (как чипс)

Пользователь видит два одинаковых элемента управления (чипсы сверху и строки в списке), которые делают *почти одно и то же*, но с разной семантикой клика. Это главный источник путаницы.

### 1.3. Скрытая связь Upload → Каталог

Строка ~624: `catalogId: getPreferredUploadCatalogId()` — при загрузке файла он автоматически попадает в первый выбранный каталог из `selectedCatalogIds`. Пользователь **не знает** об этом. Нет UI-индикации «Файл будет добавлен в каталог X».

### 1.4. Действия с каталогами — `prompt()` и `confirm()`

Строки 826 и 844:
```typescript
const nextName = prompt('Новое имя каталога:', catalog.name)?.trim() ?? '';
const approved = confirm(`Удалить каталог "${catalog.name}"?`);
const deleteFiles = confirm('OK — удалить каталог вместе с файлами.\nCancel — ...');
```

Три браузерных диалога подряд для удаления каталога. Это:
- Блокирует весь UI
- Непривычно для современного web-приложения
- Текст «OK» и «Cancel» в `confirm()` не дает понять, что значит каждая кнопка

### 1.5. Гостевой режим — слепое пятно

При `!authSessionToken`:
- `btnAddCatalog` виден, но при клике показывает `showAuthHint('Нужен вход для каталогов')` и **автоматически запускает** `runTelegramLoginFlow()` (строки 998–1001). Это агрессивное поведение: пользователь нажал «+ Каталог», а ему показали prompt с просьбой ввести код.
- `workspaceCatalogs` пустой → чипсы не рендерятся → секция `#catalog-filter` пуста, но **всё равно занимает место** (padding 8px, border-bottom).
- Все файлы попадают в «Без каталога» → в списке файлов всегда будет `.catalog-row` с текстом «Без каталога» и меткой «Системный» — бесполезный шум для гостя.

### 1.6. «Выделить все» в шапке

Строки 981–996: `btnSelectAllFiles` переключает `checked` у **всех** `loadedFiles`, независимо от текущего фильтра каталогов. Если я вижу только «Проект А» (3 файла), а нажимаю «Выделить все» — снимается/ставится галочка у всех 15 файлов, включая невидимые. Это нарушение принципа WYSIWYG.

### 1.7. Полная перезагрузка при любом действии с каталогом

Строки 832 и 852: и rename, и delete вызывают `reloadWorkspaceLibraryFromServer()`, который:
1. Делает `GET /api/library-tree` — получает все каталоги и мета всех файлов
2. Для **каждого файла** делает `GET /api/library-files-download` — скачивает base64, парсит DXF, считает статистику
3. Перерисовывает всё

Переименование каталога → скачивание всех файлов заново. Это O(n) HTTP запросов + O(n) парсинг. При 20 файлах это ~20 секунд ожидания.

### 1.8. Статистика в футере

`sidebarFooter` (строка ~754) показывает суммарные врезки и длину реза, но:
- Показывается только когда `loadedFiles.length > 0`
- Считается только по файлам с `checked && isFileInSelectedCatalogs(f)` (строка 741)
- Toggle «Врезки» (`chkPierces`) управляет отображением pierce-точек на **канвасе**, а не в статистике — но расположен рядом со статистикой, что сбивает с толку

---

## Часть 2. Конкретные проблемы и решения

### П1. Разделить «фильтр вида» и «участие в расчёте»

**Суть:** Ввести два независимых понятия:
- `viewCatalogId: string | '__all__'` — какой каталог сейчас «открыт» (навигация)
- `file.checked: boolean` — участвует ли файл в nesting/статистике (уже есть)

**Удалить** `selectedCatalogIds` как концепцию. Вместо этого:
- Навигация по каталогам (клик по строке/чипсу) меняет `viewCatalogId` → фильтрует список файлов
- Чекбокс файла по-прежнему управляет `file.checked`
- `recalcTotals()` и `updateNestItems()` считают по **всем** checked-файлам, не зависят от навигации

**Профит:** Пользователь может переключать каталоги, не ломая состояние nesting-панели.

### П2. Убрать дублирование: чипсы → вкладки каталогов

Заменить `#catalog-filter` (чипсы) + `.catalog-row` в списке на **единый компонент**:

```
┌────────────────────────────────────┐
│ [Все (15)] [Проект А (8)] [Б (5)] │  ← вкладки (tabs), не toggle
│   [+ Каталог]                      │  ← только для авторизованных
├────────────────────────────────────┤
│ ☑ деталь_1.dxf    12p · 3.2м  [×] │  ← файлы текущей вкладки
│ ☐ деталь_2.dxf     8p · 1.1м  [×] │
│ ☑ деталь_3.dxf    22p · 5.4м  [×] │
└────────────────────────────────────┘
```

Логика:
- Вкладка — обычный клик, exclusive (не multi-select)
- При наведении на вкладку каталога — появляется [⋮] для rename/delete
- Внутри списка файлов **нет** строк каталогов — только файлы

### П3. Инкрементальные обновления вместо полной перезагрузки

Текущий `reloadWorkspaceLibraryFromServer()` — самое узкое место. Заменить на:

```typescript
// Переименование каталога — обновить только локально
async function renameCatalogLocal(catalogId: string, newName: string): Promise<void> {
  await apiPatchJSON('/api/library-catalogs-update', { catalogId, name: newName }, getAuthHeaders());
  const cat = workspaceCatalogs.find(c => c.id === catalogId);
  if (cat) (cat as { name: string }).name = newName;
  renderCatalogFilter();
  renderFileList();
}

// Удаление каталога — удалить из массива, переназначить файлы
async function deleteCatalogLocal(catalogId: string, mode: string): Promise<void> {
  await apiPostJSON('/api/library-catalogs-delete', { catalogId, mode }, getAuthHeaders());
  const idx = workspaceCatalogs.findIndex(c => c.id === catalogId);
  if (idx >= 0) workspaceCatalogs.splice(idx, 1);
  if (mode === 'move_to_uncategorized') {
    for (const f of loadedFiles) {
      if (f.catalogId === catalogId) f.catalogId = null;
    }
  } else {
    // delete_files
    for (let i = loadedFiles.length - 1; i >= 0; i--) {
      if (loadedFiles[i].catalogId === catalogId) loadedFiles.splice(i, 1);
    }
  }
  renderCatalogFilter();
  renderFileList();
  recalcTotals();
  updateNestItems();
}
```

**Профит:** Мгновенный UI-отклик без перезагрузки файлов. API-вызов происходит параллельно.

### П4. Контекстное меню каталога вместо постоянных кнопок

Текущий код (строка 793):
```html
<button class="catalog-btn">Переим.</button>
<button class="catalog-btn danger">Удалить</button>
```

Это занимает ~120px в строке шириной 200–240px. Заменить на:

```typescript
// Создать один floating-popover, переиспользовать
const catalogPopover = document.createElement('div');
catalogPopover.className = 'catalog-popover';
catalogPopover.innerHTML = `
  <button data-action="rename">Переименовать</button>
  <button data-action="delete" class="danger">Удалить</button>
`;
document.body.appendChild(catalogPopover);
```

Показывать по клику на [⋮] или по right-click на вкладке каталога. Позиционировать через `getBoundingClientRect()`.

### П5. Inline-переименование вместо `prompt()`

```typescript
function startInlineRename(tabEl: HTMLElement, catalog: WorkspaceCatalog): void {
  const nameSpan = tabEl.querySelector('.catalog-tab-name') as HTMLSpanElement;
  const input = document.createElement('input');
  input.className = 'catalog-inline-input';
  input.value = catalog.name;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const newName = input.value.trim();
    if (newName && newName !== catalog.name) {
      void renameCatalogLocal(catalog.id, newName);
    }
    // Перерисовка восстановит span
    renderCatalogFilter();
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') renderCatalogFilter(); // отмена
  });
}
```

### П6. Кастомный диалог удаления вместо двойного `confirm()`

Создать один переиспользуемый modal:

```html
<div class="modal-overlay hidden" id="delete-catalog-modal">
  <div class="modal-card">
    <h3>Удалить каталог «<span id="dcm-name"></span>»?</h3>
    <p>Выберите, что сделать с файлами:</p>
    <button id="dcm-move" class="modal-btn">Перенести в «Без каталога»</button>
    <button id="dcm-delete" class="modal-btn danger">Удалить вместе с файлами</button>
    <button id="dcm-cancel" class="modal-btn ghost">Отмена</button>
  </div>
</div>
```

### П7. Гостевой режим — чистый интерфейс

Для `!authSessionToken`:
1. **Скрыть** `#catalog-filter` полностью (`display: none`) — нет каталогов, нет фильтра
2. **Скрыть** `btnAddCatalog`
3. **Не рендерить** строку «Без каталога / Системный» — просто показать flat-список файлов
4. **Добавить** в шапку sidebar маленький текст: «Гость • [Войти]» со ссылкой на `runTelegramLoginFlow`
5. **Не вызывать** `runTelegramLoginFlow()` автоматически при любом клике

### П8. «Выделить все» = только видимые файлы

Изменить строки 981–996:
```typescript
btnSelectAllFiles.addEventListener('click', () => {
  const visibleFiles = loadedFiles.filter(f => isFileInSelectedCatalogs(f));
  const hasUnchecked = visibleFiles.some(f => !f.checked);
  for (const file of visibleFiles) file.checked = hasUnchecked;
  // ...sync to server, re-render
});
```

Или, при переходе на `viewCatalogId`:
```typescript
const visibleFiles = viewCatalogId === '__all__'
  ? loadedFiles
  : loadedFiles.filter(f => (f.catalogId ?? '__uncategorized__') === viewCatalogId);
```

### П9. Индикация целевого каталога при Upload

Добавить tooltip или badge к кнопке «+ DXF»:
```
[ + DXF → Проект А ]   или   [ + DXF ]  (если «Все»)
```

Или маленький dropdown-selект каталога рядом с кнопкой загрузки.

### П10. Перенос файла между каталогами (Drag & Drop)

API уже поддерживает `PATCH /api/library-files-update` с `catalogId` (строка 321 в index.ts). Осталось:

```typescript
item.draggable = true;
item.addEventListener('dragstart', (e) => {
  e.dataTransfer!.setData('text/plain', String(f.id));
  e.dataTransfer!.effectAllowed = 'move';
});

// На вкладке каталога:
tab.addEventListener('dragover', (e) => { e.preventDefault(); tab.classList.add('drag-over'); });
tab.addEventListener('dragleave', () => tab.classList.remove('drag-over'));
tab.addEventListener('drop', (e) => {
  e.preventDefault();
  tab.classList.remove('drag-over');
  const fileId = Number(e.dataTransfer!.getData('text/plain'));
  void moveFileToCatalog(fileId, catalog.id);
});
```

---

## Часть 3. Критика предыдущих документов

### SIDEBAR-UX-IMPROVEMENTS.md
- Хорошие ASCII-wireframes, но **не учитывает проблему слияния фильтрации и расчёта** (П1)
- Предлагает «Фаза 3: Drag & Drop» как отдаленную фичу, хотя **API уже готов** — осталось только UI
- Раздел «Метрики успеха» — правильный по форме, но невозможно измерить без analytics SDK
- Не упоминает проблему полной перезагрузки (П3) — главный bottleneck UX

### SIDEBAR-UX-CASCADE-PROPOSALS.md
- Правильно определяет проблему дублирования чипсов и строк каталогов (П2)
- Предлагает «Navigation Tree + File View», но **не детализирует** как именно переписать `renderFileList()` — а это ~110 строк сложной логики
- Предложение по D&D правильное, но нет кода
- Не затрагивает проблему «Выделить все» (П8) и неявного назначения каталога при Upload (П9)
- Не упоминает O(n) запросы при rename/delete (П3)

---

## Часть 4. Рекомендуемый порядок реализации

### Итерация 1: Минимальные правки, максимальный эффект (1–2 часа)
1. **П3** — Инкрементальные rename/delete без полной перезагрузки
2. **П7** — Скрыть каталоги и «Без каталога» для гостей, убрать автоматический вызов `runTelegramLoginFlow`
3. **П8** — «Выделить все» только для видимых файлов

### Итерация 2: Рефакторинг навигации (2–3 часа)
4. **П1** — Ввести `viewCatalogId` вместо `selectedCatalogIds`
5. **П2** — Заменить чипсы + catalog-rows на вкладки каталогов
6. **П9** — Показать целевой каталог при Upload

### Итерация 3: Полировка (1–2 часа)
7. **П4** — Popover-меню для каталога вместо кнопок
8. **П5** — Inline-переименование
9. **П6** — Кастомный модальный диалог удаления

### Итерация 4: Расширение (1 час)
10. **П10** — Drag & Drop файлов между каталогами

---

## Часть 5. Резюме ключевых находок

| # | Проблема | Серьёзность | Сложность фикса |
|---|---|---|---|
| П1 | Фильтр вида = фильтр расчёта | Высокая | Средняя |
| П2 | Чипсы и строки дублируют друг друга | Средняя | Средняя |
| П3 | O(n) перезагрузка при rename/delete | **Критическая** | Низкая |
| П4 | Кнопки «Переим./Удалить» загромождают строку | Низкая | Низкая |
| П5 | `prompt()` для переименования | Низкая | Низкая |
| П6 | Двойной `confirm()` при удалении | Средняя | Низкая |
| П7 | Каталоги видны гостю (бесполезны) | Средняя | Низкая |
| П8 | «Выделить все» игнорирует фильтр | Средняя | Низкая |
| П9 | Upload → каталог неочевиден | Низкая | Низкая |
| П10 | Нет D&D (API готов) | Низкая | Средняя |

**Самый большой выигрыш при минимальных усилиях:** П3 + П7 + П8. Три правки, каждая <30 строк кода, которые устранят наиболее раздражающие моменты.

---

*Документ создан: 2025-02-25*
*Основа: построчный анализ `main.ts` (2094 строк), `index.html`, `sidebar.css`, `toolbar.css`, `responsive.css`, `api-service/src/index.ts`*
