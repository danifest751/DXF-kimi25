export const ru = {
  // Toolbar
  'toolbar.open': 'Открыть',
  'toolbar.open.title': 'Открыть файл (Ctrl+O)',
  'toolbar.fit': 'Вписать',
  'toolbar.fit.title': 'Вписать в экран (F)',
  'toolbar.inspector': 'Свойства',
  'toolbar.inspector.title': 'Инспектор свойств',
  'toolbar.nesting': 'Раскладка',
  'toolbar.nesting.title': 'Раскладка на лист',
  'toolbar.login': 'Вход Telegram',
  'toolbar.login.title': 'Вход через Telegram код',
  'toolbar.logout': 'Выйти',
  'toolbar.logout.title': 'Выйти из воркспейса',
  'toolbar.guest': 'Гость',

  // Sidebar
  'sidebar.title': 'Файлы и каталоги',
  'sidebar.selectAll': 'Выделить все',
  'sidebar.addCatalog': '+ Каталог',
  'sidebar.addFiles': '+ DXF',
  'sidebar.noFiles': 'Нет файлов',
  'sidebar.pierces': 'врезок',
  'sidebar.togglePierces': 'Врезки',
  'sidebar.togglePierces.title': 'Показать точки врезки',
  'sidebar.toggleDimensions': 'Размеры',
  'sidebar.toggleDimensions.title': 'Показать габаритные размеры',

  // Welcome screen
  'welcome.subtitle': 'Просмотр чертежей с анализом лазерной резки',
  'welcome.open': 'Открыть файл',
  'welcome.hint': 'или перетащите .dxf в окно',

  // Drop overlay
  'drop.hint': 'Перетащите DXF файл сюда',

  // Inspector
  'inspector.title': 'Свойства',
  'inspector.hint': 'Кликните на объект',

  // Nesting panel
  'nesting.title': 'Раскладка',
  'nesting.mode': 'Режим',
  'nesting.mode.precise': 'Точно',
  'nesting.mode.common': 'Общий рез',
  'nesting.sheet': 'Лист металла',
  'nesting.sheet.custom': 'Свой размер...',
  'nesting.width': 'Ширина',
  'nesting.height': 'Высота',
  'nesting.gap': 'Зазор',
  'nesting.parts': 'Детали и количество',
  'nesting.partsEmpty': 'Отметьте файлы в списке',
  'nesting.run': 'Разложить',
  'nesting.result': 'Результат',
  'nesting.export.dxf': 'DXF',
  'nesting.export.csv': 'CSV',
  'nesting.export.allSheets': 'Скачать все листы (DXF)',
  'nesting.copyHashes': 'Копировать все коды',
  'nesting.advanced': 'Расширенные настройки',
  'nesting.rotation': 'Поворот',
  'nesting.rotation.allow': 'Разрешить',
  'nesting.algorithm': 'Алгоритм',
  'nesting.commonLine': 'Совместный рез',
  'nesting.commonLine.enable': 'Включить',
  'nesting.mm': 'мм',

  // Result cards
  'result.sheets': 'листов',
  'result.fill': 'заполнение',
  'result.pierces': 'врезок',
  'result.cutLength': 'длина реза',
  'result.saved': 'экономия',

  // Shortcuts dialog
  'shortcuts.title': 'Горячие клавиши',
  'shortcuts.open': 'Открыть файл',
  'shortcuts.fit': 'Вписать в экран',
  'shortcuts.grid': 'Сетка вкл/выкл',
  'shortcuts.escape': 'Закрыть / Сбросить',
  'shortcuts.help': 'Эта подсказка',
  'shortcuts.zoom': 'Масштаб',
  'shortcuts.pan': 'Перемещение',
  'shortcuts.select': 'Выбрать объект',
  'shortcuts.wheel': 'Колёсико',
  'shortcuts.drag': 'Зажать ЛКМ',
  'shortcuts.click': 'Клик',

  // Delete catalog modal
  'modal.deleteCatalog.title': 'Удалить каталог',
  'modal.deleteCatalog.question': 'Выберите, что сделать с файлами:',
  'modal.deleteCatalog.move': 'Перенести в «Без каталога»',
  'modal.deleteCatalog.delete': 'Удалить вместе с файлами',
  'modal.deleteCatalog.cancel': 'Отмена',

  // File loading / errors
  'file.loading': '…',
  'file.error': '⚠ ошибка',

  // Progress / status
  'progress.loading': 'Загрузка',
  'status.computing': 'Считаю…',

  // Auth / workspace
  'auth.uploadHint.guest': 'Войдите чтобы сохранить файлы в облако',
  'auth.uploadHint.user': 'Файлы сохраняются в вашу библиотеку',
} as const;

export type TranslationKey = keyof typeof ru;
