/**
 * @module dom
 * Централизованные ссылки на DOM-элементы приложения.
 * Любой модуль импортирует нужные элементы отсюда, а не через document.getElementById.
 */

// ─── Toolbar ─────────────────────────────────────────────────────────

export const canvas         = document.getElementById('dxf-canvas') as HTMLCanvasElement;
export const container      = document.getElementById('canvas-container') as HTMLDivElement;
export const fileInput      = document.getElementById('file-input') as HTMLInputElement;
export const btnOpen        = document.getElementById('btn-open') as HTMLButtonElement;
export const btnWelcomeOpen = document.getElementById('btn-welcome-open') as HTMLButtonElement;
export const btnFit         = document.getElementById('btn-fit') as HTMLButtonElement;
export const btnInspector   = document.getElementById('btn-inspector') as HTMLButtonElement;
export const btnGrid        = document.getElementById('btn-grid') as HTMLButtonElement;
export const btnAuthLogin   = document.getElementById('btn-auth-login') as HTMLButtonElement;
export const btnAuthLogout  = document.getElementById('btn-auth-logout') as HTMLButtonElement;
export const authWorkspace  = document.getElementById('auth-workspace') as HTMLSpanElement;

// ─── Sidebar / file list ─────────────────────────────────────────────

export const welcome         = document.getElementById('welcome') as HTMLDivElement;
export const dropOverlay     = document.getElementById('drop-overlay') as HTMLDivElement;
export const progressBar     = document.getElementById('progress-bar') as HTMLDivElement;
export const progressFill    = document.getElementById('progress-fill') as HTMLDivElement;
export const progressLabel   = document.getElementById('progress-label') as HTMLSpanElement;
export const statsEl         = document.getElementById('stats') as HTMLSpanElement;
export const fileListEl      = document.getElementById('file-list') as HTMLDivElement;
export const fileListEmpty   = document.getElementById('file-list-empty') as HTMLDivElement;
export const catalogFilter   = document.getElementById('catalog-filter') as HTMLDivElement;
export const btnSelectAllFiles = document.getElementById('btn-select-all-files') as HTMLButtonElement;
export const btnAddCatalog   = document.getElementById('btn-add-catalog') as HTMLButtonElement;
export const btnAddFiles     = document.getElementById('btn-add-files') as HTMLButtonElement;
export const sidebarFiles    = document.getElementById('sidebar-files') as HTMLDivElement;
export const sidebarFooter   = document.getElementById('sidebar-footer') as HTMLDivElement;
export const ciPierces       = document.getElementById('ci-pierces') as HTMLElement;
export const ciLength        = document.getElementById('ci-length') as HTMLElement;
export const chkPierces      = document.getElementById('chk-pierces') as HTMLInputElement;
export const pierceToggle    = document.getElementById('pierce-toggle') as HTMLLabelElement;
export const chkDimensions   = document.getElementById('chk-dimensions') as HTMLInputElement;
export const dimToggle       = document.getElementById('dim-toggle') as HTMLLabelElement;

// ─── Inspector ───────────────────────────────────────────────────────

export const sidebarInspector = document.getElementById('sidebar-inspector') as HTMLDivElement;
export const inspectorContent = document.getElementById('inspector-content') as HTMLDivElement;

// ─── Status bar ──────────────────────────────────────────────────────

export const statusCoords    = document.getElementById('status-coords') as HTMLSpanElement;
export const statusZoom      = document.getElementById('status-zoom') as HTMLSpanElement;
export const statusEntities  = document.getElementById('status-entities') as HTMLSpanElement;
export const statusVersion   = document.getElementById('status-version') as HTMLSpanElement;
export const statusPierces   = document.getElementById('status-pierces') as HTMLSpanElement;
export const statusCutLength = document.getElementById('status-cutlength') as HTMLSpanElement;

// ─── Nesting panel ───────────────────────────────────────────────────

export const btnNesting          = document.getElementById('btn-nesting') as HTMLButtonElement;
export const nestingPanel        = document.getElementById('nesting-panel') as HTMLDivElement;
export const nestPreset          = document.getElementById('nest-preset') as HTMLSelectElement;
export const nestCustomRow       = document.getElementById('nest-custom-row') as HTMLDivElement;
export const nestW               = document.getElementById('nest-w') as HTMLInputElement;
export const nestH               = document.getElementById('nest-h') as HTMLInputElement;
export const nestGap             = document.getElementById('nest-gap') as HTMLInputElement;
export const nestRotateEnabled   = document.getElementById('nest-rotate-enabled') as HTMLInputElement;
export const nestRotateStep      = document.getElementById('nest-rotate-step') as HTMLSelectElement;
export const nestModeGroup       = document.getElementById('nest-mode-group') as HTMLDivElement;
export const nestModeRadios      = document.querySelectorAll<HTMLInputElement>('input[name="nest-mode"]');
export const btnAdvancedToggle   = document.getElementById('btn-advanced-toggle') as HTMLButtonElement;
export const nestAdvanced        = document.getElementById('nest-advanced') as HTMLDivElement;
export const nestSeed            = document.getElementById('nest-seed') as HTMLInputElement;
export const nestCommonLineEnabled  = document.getElementById('nest-commonline-enabled') as HTMLInputElement;
export const nestCommonLineStatus   = document.getElementById('nest-commonline-status') as HTMLDivElement;
export const nestCommonLineDist     = document.getElementById('nest-commonline-dist') as HTMLInputElement;
export const nestCommonLineMinLen   = document.getElementById('nest-commonline-minlen') as HTMLInputElement;
export const nestItemsEl         = document.getElementById('nest-items') as HTMLDivElement;
export const nestItemsEmpty      = document.getElementById('nest-items-empty') as HTMLDivElement;
export const btnNestRun          = document.getElementById('btn-nest-run') as HTMLButtonElement;
export const nestResults         = document.getElementById('nest-results') as HTMLDivElement;
export const nestResultCards     = document.getElementById('nest-result-cards') as HTMLDivElement;
export const nestResultSummary   = document.getElementById('nest-result-summary') as HTMLDivElement;
export const btnExportDXF        = document.getElementById('btn-export-dxf') as HTMLButtonElement;
export const btnExportCSV        = document.getElementById('btn-export-csv') as HTMLButtonElement;
export const nestingScroll       = document.getElementById('nesting-scroll') as HTMLDivElement;
export const nestingCanvas       = document.getElementById('nesting-canvas') as HTMLCanvasElement;
export const nestClose           = document.getElementById('nest-close') as HTMLButtonElement;
export const nestSheetBtns       = document.getElementById('nest-sheet-btns') as HTMLDivElement;
export const btnExportAllSheets  = document.getElementById('btn-export-all-sheets') as HTMLButtonElement;
export const btnCopyAllHashes    = document.getElementById('btn-copy-all-hashes') as HTMLButtonElement;
export const btnCopyAllHashesTop = document.getElementById('btn-copy-all-hashes-top') as HTMLButtonElement;
export const nestZoomPopup       = document.getElementById('nest-zoom-popup') as HTMLDivElement;
export const nestZoomCanvas      = document.getElementById('nest-zoom-canvas') as HTMLCanvasElement;
export const nestZoomLabel       = document.getElementById('nest-zoom-label') as HTMLDivElement;

// ─── Mobile ──────────────────────────────────────────────────────────

export const mobileBackdrop = document.getElementById('mobile-backdrop') as HTMLDivElement;

// ─── Delete catalog modal ────────────────────────────────────────────

export const deleteCatalogModal = document.getElementById('delete-catalog-modal') as HTMLDivElement;
export const dcmName            = document.getElementById('dcm-name') as HTMLSpanElement;
export const dcmMove            = document.getElementById('dcm-move') as HTMLButtonElement;
export const dcmDelete          = document.getElementById('dcm-delete') as HTMLButtonElement;
export const dcmCancel          = document.getElementById('dcm-cancel') as HTMLButtonElement;

// ─── Shortcuts overlay ───────────────────────────────────────────────

export const shortcutsOverlay = document.getElementById('shortcuts-overlay') as HTMLDivElement;
export const shortcutsClose   = document.getElementById('shortcuts-close') as HTMLButtonElement;
