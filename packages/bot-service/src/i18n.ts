/**
 * @module bot-service/i18n
 * Minimal i18n for the Telegram bot — RU (default) and EN.
 */

export type BotLocale = 'ru' | 'en';

/** Detect locale from Telegram user's language_code (e.g. "ru", "en", "en-US"). */
export function detectBotLocale(languageCode?: string): BotLocale {
  if (!languageCode) return 'ru';
  return languageCode.slice(0, 2).toLowerCase() === 'ru' ? 'ru' : 'en';
}

const strings = {
  ru: {
    // DXF document handling
    notDxf: 'Пришлите DXF файл (.dxf).',
    fileReceived: 'Файл получен, обрабатываю...',
    fileTooBig: (mb: string) => `Файл слишком большой (${mb} MB). Максимум: 20 MB.`,
    dxfError: (details: string) => `Ошибка обработки DXF: ${details}`,
    fileCaption: (name: string, pierces: number, cutLen: string, isFirst: boolean, totalFiles: number) =>
      [`Файл: ${name}`, `Врезок: ${pierces}`, `Длина реза: ${cutLen}`,
        isFirst ? 'Открываю рабочее меню ниже.' : `Добавлен в набор. Теперь файлов в наборе: ${totalFiles}`].join('\n'),

    // Login
    loginCode: (code: string, ttl: number) =>
      `Код входа: ${code}\n\nВведите его в программе DXF Viewer (кнопка «Вход Telegram»).\nКод действует ~${ttl} мин.`,
    loginError: (details: string) => `Не удалось выдать код входа: ${details}`,

    // Start / help
    startWithContext: 'Используйте /menu для панели действий, отправьте DXF файл или код листа (8 символов).',
    startNoContext: 'Отправьте DXF файл (.dxf). После загрузки откроется полное меню: статистика, параметры, раскладка и экспорт.\n\nТакже можно отправить код листа (8 символов) для получения DXF раскладки.\nДля входа в программу по Telegram используйте /login.',
    unknownText: 'Отправьте DXF файл (.dxf) или код листа (8 символов) для получения раскладки.',

    // Nesting context errors
    sendDxfFirst: 'Сначала отправьте DXF файл.',
    variantNotFound: 'Вариант не найден.',
    invalidQuantity: 'Некорректное количество.',
    noVariants: 'Нет вариантов. Запустите раскладку.',
    invalidGap: 'Некорректный зазор.',
    unknownCommand: 'Команда не распознана.',
    needQuantityFirst: 'Сначала задайте количество (⚙️ Настройки → Количество).',
    runNestingFirst: 'Сначала запустите раскладку.',
    noContextForMenu: 'Отправьте DXF файл (.dxf), чтобы открыть рабочее меню.',
    hintAddFile: 'Отправьте ещё один DXF файл — он добавится в текущий набор.',

    // Sheet / quantity prompts
    selectQuantity: 'Количество копий каждой детали:',
    selectSheet: 'Выберите размер листа или введите свой (напр. 1500x3000):',
    enterCustomSheet: 'Введите размер листа, например: 1500x3000',
    gapPrompt: (current: number) => `Зазор между деталями (сейчас ${current} мм):`,
    invalidSheetSize: 'Не понял размер листа. Выберите пресет кнопкой ниже.',
    selectSheetPrompt: 'Выберите размер листа:',
    invalidSheetFormat: 'Неверный формат. Введите так: 1500x3000',
    invalidQuantityFormat: 'Введите целое число больше 0. Например: 5',

    // Reset
    resetConfirm: (files: number, variants: number) =>
      `Сбросить набор (${files} файл., ${variants} вар.)?`,
    resetDone: 'Набор сброшен. Отправьте DXF файл.',
    resetYes: '✅ Да',
    resetCancel: '❌ Отмена',

    // What next
    whatNext: 'Что дальше?',
    selectVariant: 'Выберите вариант:',

    // Hash retrieval
    hashNotFound: (multi: boolean) =>
      `Код${multi ? 'ы' : ''} не найден${multi ? 'ы' : ''} или истёк срок действия.`,
    hashPartial: (found: number, total: number) =>
      `${found} из ${total} листов отправлено. Остальные коды не найдены.`,
    hashCaption: (idx: number, hash: string, w: number, h: number, placed: number, fill: number) =>
      `📋 Лист #${idx} [${hash}]\n${w}×${h} мм · ${placed} дет. · ${fill}%`,

    // Home screen
    homeStats: (pierces: number, cutLen: string, parts: number) =>
      `✂️ ${pierces} врезок · ${cutLen} · ${parts} дет.`,
    homeParams: (qty: number | null, w: number, h: number, mode: string) =>
      `🔢 <b>${qty ?? '—'}</b> шт  ·  📐 ${w}×${h}  ·  ${mode}`,
    homeVariant: (name: string, sheets: number, fill: number, placed: number, required: number) =>
      `✅ <b>${name}</b>: ${sheets} лист. · ${fill}% · ${placed}/${required} разм.`,

    // Settings screen
    settingsTitle: '⚙️ <b>Параметры раскладки</b>',
    settingsQty: (v: number | null) => `🔢 Количество: <b>${v ?? '—'}</b>`,
    settingsSheet: (w: number, h: number) => `📐 Лист: <b>${w}×${h}</b> мм`,
    settingsGap: (g: number) => `📏 Зазор: <b>${g}</b> мм`,
    settingsMode: (m: string) => `🎯 Режим: <b>${m}</b>`,

    // Result caption
    resultTitle: (name: string, file: string) => `✅ <b>Раскладка ${name}</b> — ${file}`,
    resultStats: (sheets: number, fill: number, placed: number, required: number) =>
      `📝 ${sheets} лист. · ${fill}% заполн. · ${placed}/${required} разм.`,
    resultCommonLine: (sharedMm: number, pierceDelta: number) =>
      `✂️ Совм. рез: ${sharedMm.toFixed(1)} мм · Экономия: −${pierceDelta} врезок`,
    resultParams: (qty: number | null, w: number, h: number, mode: string, gap: number) =>
      `⚙️ ${qty} шт · ${w}×${h} · ${mode} · зазор ${gap}`,

    // Mode labels
    modeFast: 'Быстрый',
    modePrecise: 'Точный',
    modeCommon: 'Общий рез',
    modeContour: 'Контурная',
    btnModeContour: 'Контурная',
    nestingModeContour: '▶️ Контурная раскладка',
    nestingModeContourWarning: '⚠️ Медленно при >30 деталей',


    // Buttons
    btnNesting: '▶️ Раскладка',
    btnSettings: '⚙️ Настройки',
    btnPreview: '🖼 Превью',
    btnAddFile: '📎 Добавить файл',
    btnDXF: '📄 DXF',
    btnCSV: '📋 CSV',
    btnVariants: (n: number) => `📂 Варианты (${n})`,
    btnReset: '🗑 Сброс',
    btnQty: '🔢 Количество',
    btnSheet: '📐 Лист',
    btnRun: '▶️ Запустить',
    btnBack: '← Назад',
    btnHome: '← Главная',
    btnBackSettings: '← Назад',
    btnOtherParams: '🔄 Другие параметры',
    btnCustomSheet: 'Свой размер (ввести)',
    btnBackMenu: 'Назад в меню',
    btnGap: (g: number) => `Зазор: ${g}`,
    btnGapMm: (g: number, current: boolean) => current ? `✔ ${g} мм` : `${g} мм`,
    btnModeLabel: (label: string, active: boolean) => active ? `✔ ${label}` : label,
    previewCaption: (name: string) => `Превью: ${name}`,
    fileLabel: (first: string, rest: number) => rest > 0 ? `${first} +${rest}` : first,
    variantLabel: (active: boolean, name: string, sheets: number, fill: number) =>
      `${active ? '● ' : ''}${name} — ${sheets}л. ${fill}%`,
  },

  en: {
    notDxf: 'Please send a DXF file (.dxf).',
    fileReceived: 'File received, processing...',
    fileTooBig: (mb: string) => `File too large (${mb} MB). Maximum: 20 MB.`,
    dxfError: (details: string) => `DXF processing error: ${details}`,
    fileCaption: (name: string, pierces: number, cutLen: string, isFirst: boolean, totalFiles: number) =>
      [`File: ${name}`, `Pierces: ${pierces}`, `Cut length: ${cutLen}`,
        isFirst ? 'Opening the menu below.' : `Added to set. Files in set: ${totalFiles}`].join('\n'),

    loginCode: (code: string, ttl: number) =>
      `Login code: ${code}\n\nEnter it in DXF Viewer (button «Telegram Login»).\nCode valid for ~${ttl} min.`,
    loginError: (details: string) => `Failed to generate login code: ${details}`,

    startWithContext: 'Use /menu for the action panel, or send a DXF file or sheet code (8 chars).',
    startNoContext: 'Send a DXF file (.dxf). After loading, a full menu will open: stats, settings, nesting and export.\n\nYou can also send a sheet code (8 chars) to get a nesting DXF.\nTo sign in via Telegram use /login.',
    unknownText: 'Send a DXF file (.dxf) or a sheet code (8 chars) to get nesting.',

    sendDxfFirst: 'Please send a DXF file first.',
    variantNotFound: 'Variant not found.',
    invalidQuantity: 'Invalid quantity.',
    noVariants: 'No variants. Run nesting first.',
    invalidGap: 'Invalid gap value.',
    unknownCommand: 'Unknown command.',
    needQuantityFirst: 'Set quantity first (⚙️ Settings → Quantity).',
    runNestingFirst: 'Run nesting first.',
    noContextForMenu: 'Send a DXF file (.dxf) to open the menu.',
    hintAddFile: 'Send another DXF file — it will be added to the current set.',

    selectQuantity: 'Number of copies per part:',
    selectSheet: 'Choose sheet size or enter custom (e.g. 1500x3000):',
    enterCustomSheet: 'Enter sheet size, e.g.: 1500x3000',
    gapPrompt: (current: number) => `Gap between parts (current: ${current} mm):`,
    invalidSheetSize: 'Could not parse sheet size. Choose a preset below.',
    selectSheetPrompt: 'Select sheet size:',
    invalidSheetFormat: 'Invalid format. Enter like: 1500x3000',
    invalidQuantityFormat: 'Enter a positive integer. Example: 5',

    resetConfirm: (files: number, variants: number) =>
      `Reset set (${files} file(s), ${variants} variant(s))?`,
    resetDone: 'Set reset. Send a DXF file.',
    resetYes: '✅ Yes',
    resetCancel: '❌ Cancel',

    whatNext: 'What next?',
    selectVariant: 'Select variant:',

    hashNotFound: (multi: boolean) =>
      `Code${multi ? 's' : ''} not found or expired.`,
    hashPartial: (found: number, total: number) =>
      `${found} of ${total} sheets sent. Other codes not found.`,
    hashCaption: (idx: number, hash: string, w: number, h: number, placed: number, fill: number) =>
      `📋 Sheet #${idx} [${hash}]\n${w}×${h} mm · ${placed} parts · ${fill}%`,

    homeStats: (pierces: number, cutLen: string, parts: number) =>
      `✂️ ${pierces} pierces · ${cutLen} · ${parts} parts`,
    homeParams: (qty: number | null, w: number, h: number, mode: string) =>
      `🔢 <b>${qty ?? '—'}</b> pcs  ·  📐 ${w}×${h}  ·  ${mode}`,
    homeVariant: (name: string, sheets: number, fill: number, placed: number, required: number) =>
      `✅ <b>${name}</b>: ${sheets} sheet(s) · ${fill}% · ${placed}/${required} placed`,

    settingsTitle: '⚙️ <b>Nesting settings</b>',
    settingsQty: (v: number | null) => `🔢 Quantity: <b>${v ?? '—'}</b>`,
    settingsSheet: (w: number, h: number) => `📐 Sheet: <b>${w}×${h}</b> mm`,
    settingsGap: (g: number) => `📏 Gap: <b>${g}</b> mm`,
    settingsMode: (m: string) => `🎯 Mode: <b>${m}</b>`,

    resultTitle: (name: string, file: string) => `✅ <b>Nesting ${name}</b> — ${file}`,
    resultStats: (sheets: number, fill: number, placed: number, required: number) =>
      `📝 ${sheets} sheet(s) · ${fill}% fill · ${placed}/${required} placed`,
    resultCommonLine: (sharedMm: number, pierceDelta: number) =>
      `✂️ Common line: ${sharedMm.toFixed(1)} mm saved · −${pierceDelta} pierces`,
    resultParams: (qty: number | null, w: number, h: number, mode: string, gap: number) =>
      `⚙️ ${qty} pcs · ${w}×${h} · ${mode} · gap ${gap}`,

    modeFast: 'Fast',
    modePrecise: 'Precise',
    modeCommon: 'Common cut',
    modeContour: 'True shape',
    btnModeContour: 'True shape',
    nestingModeContour: '▶️ True shape nesting',
    nestingModeContourWarning: '⚠️ Slow with >30 parts',


    btnNesting: '▶️ Nesting',
    btnSettings: '⚙️ Settings',
    btnPreview: '🖼 Preview',
    btnAddFile: '📎 Add file',
    btnDXF: '📄 DXF',
    btnCSV: '📋 CSV',
    btnVariants: (n: number) => `📂 Variants (${n})`,
    btnReset: '🗑 Reset',
    btnQty: '🔢 Quantity',
    btnSheet: '📐 Sheet',
    btnRun: '▶️ Run',
    btnBack: '← Back',
    btnHome: '← Home',
    btnBackSettings: '← Back',
    btnOtherParams: '🔄 Other settings',
    btnCustomSheet: 'Custom size (enter)',
    btnBackMenu: 'Back to menu',
    btnGap: (g: number) => `Gap: ${g}`,
    btnGapMm: (g: number, current: boolean) => current ? `✔ ${g} mm` : `${g} mm`,
    btnModeLabel: (label: string, active: boolean) => active ? `✔ ${label}` : label,
    previewCaption: (name: string) => `Preview: ${name}`,
    fileLabel: (first: string, rest: number) => rest > 0 ? `${first} +${rest}` : first,
    variantLabel: (active: boolean, name: string, sheets: number, fill: number) =>
      `${active ? '● ' : ''}${name} — ${sheets}sh. ${fill}%`,
  },
} as const;

export type BotStrings = typeof strings.ru;

export function getBotStrings(locale: BotLocale): BotStrings {
  return strings[locale];
}
