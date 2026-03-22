# Анализ разделения UI от бизнес-логики и поддержка тем

## Краткий вывод

**UI хорошо отделен от бизнес-логики** — все стили вынесены в CSS custom properties (variables), которые можно переключать. Однако **система тем не реализована**: настройка `theme: 'dark'` хранится в IndexedDB, но **не применяется к интерфейсу**.

Внедрение тем технически возможно и **потребует минимальных изменений** (2-3 файла, ~50-80 строк кода).

---

## 1. Текущая архитектура разделения

### 1.1 UI-слой (стили)

| Файл | Назначение | Строк |
|------|------------|-------|
| [`styles/base.css`](packages/ui-app/src/styles/base.css) | CSS variables, reset, scrollbar | 94 |
| [`styles/set-builder.css`](packages/ui-app/src/styles/set-builder.css) | Компоненты Set Builder | 2783 |
| [`styles/animations.css`](packages/ui-app/src/styles/animations.css) | Анимации | ~200 |
| [`styles/responsive.css`](packages/ui-app/src/styles/responsive.css) | Медиа-запросы | ~400 |
| [`styles/canvas.css`](packages/ui-app/src/styles/canvas.css) | Canvas стили | ~300 |
| [`styles/nesting.css`](packages/ui-app/src/styles/nesting.css) | Nesting UI | ~400 |
| [`styles/toolbar.css`](packages/ui-app/src/styles/toolbar.css) | Toolbar | ~300 |
| [`styles/sidebar.css`](packages/ui-app/src/styles/sidebar.css) | Sidebar | ~500 |
| [`styles/statusbar.css`](packages/ui-app/src/styles/statusbar.css) | Status bar | ~100 |

**Итого: ~5000+ строк CSS**

### 1.2 Бизнес-логика (TypeScript)

| Директория | Назначение |
|------------|------------|
| [`set-builder/`](packages/ui-app/src/set-builder/) | UI компоненты (частично смешано с логикой) |
| [`set-builder/optimizer/`](packages/ui-app/src/set-builder/optimizer/) | DXF оптимизация |
| [`store/`](packages/ui-app/src/store/) | IndexedDB хранилище |
| [`i18n/`](packages/ui-app/src/i18n/) | Интернационализация |

### 1.3 Rendering движок (отделен)

[`core-engine/src/render/`](packages/core-engine/src/render/) — полностью отделен от UI:
- [`renderer.ts`](packages/core-engine/src/render/renderer.ts) — Canvas 2D рендерер
- [`entity-renderer.ts`](packages/core-engine/src/render/entity-renderer.ts) — отрисовка сущностей
- [`batch-renderer.ts`](packages/core-engine/src/render/batch-renderer.ts) — батч рендеринг

---

## 2. Система CSS Variables

### 2.1 Структура в [`base.css`](packages/ui-app/src/styles/base.css:6)

```css
:root {
  /* Фон */
  --bg-primary: #0a0e1a;
  --bg-secondary: #121826;
  --bg-tertiary: #1a2236;
  --bg-hover: #232d45;
  --bg-active: #2d3a5a;
  
  /* Акценты */
  --accent-primary: #00d4ff;
  --accent-secondary: #7b2cbf;
  --accent-success: #00ff9d;
  --accent-warning: #ffaa00;
  --accent-danger: #ff4757;
  
  /* Текст */
  --text-primary: #ffffff;
  --text-secondary: #a0aec0;
  --text-dim: #718096;
  
  /* Границы */
  --border: rgba(255, 255, 255, 0.08);
  --border-light: rgba(255, 255, 255, 0.12);
  
  /* ... еще ~50 переменных */
}
```

**Все компоненты используют только переменные:**
```css
.sb-lib-row {
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  color: var(--text-primary);
}
```

### 2.2 Преимущества текущей архитектуры

| Плюс | Описание |
|------|----------|
| ✅ Centralized | Все цвета в одном месте |
| ✅ Easy theming | Достаточно переопределить `:root` |
| ✅ No inline styles | Компоненты чистые |
| ✅ Semantic naming | `--bg-primary` vs `#0a0e1a` |

---

## 3. Проблема: Theme setting не применяется

### 3.1 Что есть

В [`store/index.ts`](packages/ui-app/src/store/index.ts:34):
```typescript
const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',  // ← Сохраняется, но не используется!
  defaultZoom: 1,
  showGrid: false,
  // ...
};
```

### 3.2 Чего нет

1. **Нет CSS классов тем** — `.theme-light`, `.theme-dark`
2. **Нет переключения** — `document.documentElement.classList.add('theme-light')`
3. **Нет слушателя** — при загрузке не читается `settings.theme`
4. **Нет UI переключателя** — кнопка смены темы в интерфейсе

---

## 4. Внедрение тем: План

### 4.1 Минимальные изменения (~50 строк)

#### A. Добавить CSS классы тем

**Файл:** [`styles/themes.css`](packages/ui-app/src/styles/themes.css) (новый)

```css
/* Light theme overrides */
.theme-light {
  --bg-primary: #ffffff;
  --bg-secondary: #f7fafc;
  --bg-tertiary: #edf2f7;
  --bg-hover: #e2e8f0;
  --bg-active: #cbd5e0;
  
  --text-primary: #1a202c;
  --text-secondary: #4a5568;
  --text-dim: #718096;
  
  --border: rgba(0, 0, 0, 0.08);
  --border-light: rgba(0, 0, 0, 0.12);
  
  --accent-primary: #0066cc;
  --accent-success: #00a854;
  --accent-warning: #faad14;
  --accent-danger: #f5222d;
}

/* Optional: Auto theme via media query */
@media (prefers-color-scheme: light) {
  :root:not(.theme-dark) {
    /* Same as .theme-light */
  }
}
```

#### B. Применить тему при загрузке

**Файл:** [`main.ts`](packages/ui-app/src/main.ts) (изменить)

```typescript
import './styles/themes.css';  // Добавить

import { getSettings } from './store/index.js';

const settings = await getSettings();
if (settings.theme === 'light') {
  document.documentElement.classList.add('theme-light');
} else {
  document.documentElement.classList.add('theme-dark');
}
```

#### C. Переключатель темы (опционально)

**Файл:** [`ui-shell.ts`](packages/ui-app/src/ui-shell.ts) (добавить кнопку)

```typescript
async function toggleTheme() {
  const settings = await getSettings();
  const newTheme = settings.theme === 'dark' ? 'light' : 'dark';
  await saveSettings({ theme: newTheme });
  
  document.documentElement.classList.remove('theme-dark', 'theme-light');
  document.documentElement.classList.add(`theme-${newTheme}`);
}
```

### 4.2 Файлы для изменения

| Файл | Действие | Объем |
|------|----------|-------|
| `styles/themes.css` | Создать | ~40 строк |
| `main.ts` | Добавить применение темы | ~5 строк |
| `ui-shell.ts` | Добавить кнопку переключения | ~15 строк |

**Итого: ~60 строк кода**

---

## 5. Уровни разделения UI/Logic

### 5.1 Хорошо разделено

| Компонент | UI | Logic | Примечание |
|-----------|----|-------|------------|
| CSS Variables | ✅ | — | Все стили через var() |
| Canvas Rendering | ✅ | ✅ | Отделен в core-engine |
| i18n | ✅ | ✅ | Локали в JSON |
| Store (IndexedDB) | — | ✅ | Только данные |
| API layer | — | ✅ | api.ts |

### 5.2 Частично смешано

| Компонент | Проблема | Решение |
|-----------|----------|---------|
| `set-builder/index.ts` | Генерирует HTML строки | Вынести в отдельные .css/.html |
| `set-builder/render.ts` | DOM + canvas в одном | Уже OK, canvas отделен |
| `set-builder/split-modal.ts` | Много inline styles | Перенести в CSS |

### 5.3 Рекомендации по улучшению

1. **Вынести inline styles** — в `split-modal.ts` встречается `style="background:${color}"`, лучше использовать CSS classes
2. **Использовать Shadow DOM** — для изоляции компонентов (опционально)
3. **Web Components** — для инкапсуляции (долгосрочное)

---

## 6. Выводы

### 6.1 Можно ли менять внешний вид?

**Да, без ограничений:**
- CSS Variables позволяют менять всю цветовую схему
- Компоненты используют семантические переменные
- Не требуется менять JavaScript код

### 6.2 Можно ли внедрить темы?

**Да, легко:**
- Архитектура уже поддерживает
- Нужно добавить: CSS overrides + применение класса
- ~60 строк кода для базовой реализации

### 6.3 Что мешает полному разделению?

1. Inline styles в некоторых компонентах
2. Генерация HTML в JavaScript (Template literals)
3. Нет явного разделения "UI components" vs "Business logic"

---

## 7. Decision Log

1. **CSS Variables — правильный выбор** ✅ Архитектор проекта заложил хорошую основу
2. **Theme setting существует, но не работает** ⚠️ Баг/недоработка — настройка есть, но не применяется
3. **Минимум work для тем** ✅ Не требуется рефакторинг, только добавить CSS и 2-3 строки JS
4. **UI/Logic разделение среднее** ⚠️ Хорошо для текущего проекта, но можно улучшить
5. **Рекомендация** — добавить `themes.css` и применить тему из настроек при загрузке

---

## 8. Appendix: Быстрая проверка

```bash
# Проверить использование CSS variables
grep -r "var(--" packages/ui-app/src/styles/ | wc -l
# Ожидаемо: 500+ использований

# Проверить inline styles
grep -r "style=" packages/ui-app/src/set-builder/ | wc -l  
# Ожидаемо: <50 (можно улучшить)
```
