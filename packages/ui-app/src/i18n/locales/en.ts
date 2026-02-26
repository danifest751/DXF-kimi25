import type { TranslationKey } from './ru.js';

export const en: Record<TranslationKey, string> = {
  // Toolbar
  'toolbar.open': 'Open',
  'toolbar.open.title': 'Open file (Ctrl+O)',
  'toolbar.fit': 'Fit',
  'toolbar.fit.title': 'Fit to screen (F)',
  'toolbar.inspector': 'Properties',
  'toolbar.inspector.title': 'Property inspector',
  'toolbar.nesting': 'Nesting',
  'toolbar.nesting.title': 'Nesting on sheet',
  'toolbar.login': 'Telegram Login',
  'toolbar.login.title': 'Sign in via Telegram code',
  'toolbar.logout': 'Sign out',
  'toolbar.logout.title': 'Sign out of workspace',
  'toolbar.guest': 'Guest',

  // Sidebar
  'sidebar.title': 'Files & Catalogs',
  'sidebar.selectAll': 'Select all',
  'sidebar.addCatalog': '+ Catalog',
  'sidebar.addFiles': '+ DXF',
  'sidebar.noFiles': 'No files',
  'sidebar.pierces': 'pierces',
  'sidebar.togglePierces': 'Pierces',
  'sidebar.togglePierces.title': 'Show pierce points',
  'sidebar.toggleDimensions': 'Dimensions',
  'sidebar.toggleDimensions.title': 'Show bounding dimensions',

  // Welcome screen
  'welcome.subtitle': 'DXF viewer with laser cutting analysis',
  'welcome.open': 'Open file',
  'welcome.hint': 'or drag & drop a .dxf file here',

  // Drop overlay
  'drop.hint': 'Drop DXF file here',

  // Inspector
  'inspector.title': 'Properties',
  'inspector.hint': 'Click on an object',

  // Nesting panel
  'nesting.title': 'Nesting',
  'nesting.mode': 'Mode',
  'nesting.mode.precise': 'Precise',
  'nesting.mode.common': 'Common cut',
  'nesting.sheet': 'Sheet',
  'nesting.sheet.custom': 'Custom size...',
  'nesting.width': 'Width',
  'nesting.height': 'Height',
  'nesting.gap': 'Gap',
  'nesting.parts': 'Parts & quantity',
  'nesting.partsEmpty': 'Check files in the list',
  'nesting.run': 'Run nesting',
  'nesting.result': 'Result',
  'nesting.export.dxf': 'DXF',
  'nesting.export.csv': 'CSV',
  'nesting.export.allSheets': 'Download all sheets (DXF)',
  'nesting.copyHashes': 'Copy all codes',
  'nesting.advanced': 'Advanced settings',
  'nesting.rotation': 'Rotation',
  'nesting.rotation.allow': 'Allow',
  'nesting.algorithm': 'Algorithm',
  'nesting.commonLine': 'Common line cut',
  'nesting.commonLine.enable': 'Enable',
  'nesting.mm': 'mm',

  // Result cards
  'result.sheets': 'sheets',
  'result.fill': 'fill',
  'result.pierces': 'pierces',
  'result.cutLength': 'cut length',
  'result.saved': 'saved',

  // Shortcuts dialog
  'shortcuts.title': 'Keyboard shortcuts',
  'shortcuts.open': 'Open file',
  'shortcuts.fit': 'Fit to screen',
  'shortcuts.grid': 'Toggle grid',
  'shortcuts.escape': 'Close / Reset',
  'shortcuts.help': 'This dialog',
  'shortcuts.zoom': 'Zoom',
  'shortcuts.pan': 'Pan',
  'shortcuts.select': 'Select object',
  'shortcuts.wheel': 'Scroll wheel',
  'shortcuts.drag': 'Hold LMB',
  'shortcuts.click': 'Click',

  // Delete catalog modal
  'modal.deleteCatalog.title': 'Delete catalog',
  'modal.deleteCatalog.question': 'What to do with the files?',
  'modal.deleteCatalog.move': 'Move to "Uncategorized"',
  'modal.deleteCatalog.delete': 'Delete along with files',
  'modal.deleteCatalog.cancel': 'Cancel',

  // File loading / errors
  'file.loading': '…',
  'file.error': '⚠ error',

  // Progress / status
  'progress.loading': 'Loading',
  'status.computing': 'Computing…',

  // Auth / workspace
  'auth.uploadHint.guest': 'Sign in to save files to the cloud',
  'auth.uploadHint.user': 'Files are saved to your library',
  'auth.login.prompt': 'Enter the code from the Telegram bot (/login):',
  'auth.codeInvalid': 'Code is invalid or expired',
  'auth.changeAccount': 'Switch Telegram',
  'auth.changeAccount.title': 'Switch Telegram session',

  // Sidebar dynamic
  'sidebar.addFiles.title': 'Add DXF files',
  'sidebar.addFiles.toCatalog': 'Add DXF → {name}',
  'sidebar.addFiles.uncategorized': 'Add DXF → Uncategorized',
  'sidebar.selectAll.select': 'Select all',
  'sidebar.selectAll.deselect': 'Deselect all',
  'sidebar.selectAll.selectTitle': 'Select all files',
  'sidebar.selectAll.deselectTitle': 'Deselect all files',
  'sidebar.allCatalogs': 'All catalogs',
  'sidebar.uncategorized': 'Uncategorized',

  // Workspace progress/errors
  'workspace.loading': 'Loading: {name}',
  'workspace.loadError': 'Failed to load {name}: {msg}',

  // Nesting result cards
  'result.sheets.label': 'Sheets',
  'result.fill.label': 'Fill',
  'result.pierces.label': 'Pierces',
  'result.cutLength.label': 'Cut length',
  'result.saveCut.label': 'Cut saved',
  'result.savePierces.label': 'Pierces saved',
  'result.placed': 'Placed {placed} of {required} parts',
  'result.commonLine.on': 'Common line: ON',
  'result.commonLine.noMatch': 'Common line: ON (no matches found)',

  // Nesting sheet buttons
  'nesting.sheet.download': 'Download sheet #{n} (DXF)',
  'nesting.sheet.copyHash': 'Copy code: {hash}',
  'nesting.sheet.hashCopied': '✓ Copied',
  'nesting.copyHashes.title': 'Copy all codes',
  'nesting.zoomLabel': 'Sheet {n} — {parts} parts — {fill}%',
  'nesting.resetQty': 'Reset to 1',
  'nesting.footer': '{w}×{h} mm  |  {sheets} sheets  |  {fill}% fill',
};
