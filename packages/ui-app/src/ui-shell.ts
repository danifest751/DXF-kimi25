/**
 * @module ui-shell
 * Минимальные DOM-ссылки нужные set-builder и file pipeline.
 * Заменяет legacy dom.ts после удаления старого UI.
 */

export const fileInput      = document.getElementById('file-input') as HTMLInputElement;
export const setBuilderRoot = document.getElementById('set-builder-root') as HTMLDivElement;
export const btnSetBuilder  = document.getElementById('btn-set-builder') as HTMLButtonElement;
export const dropOverlay    = document.getElementById('drop-overlay') as HTMLDivElement;
export const progressBar    = document.getElementById('progress-bar') as HTMLDivElement;
export const progressFill   = document.getElementById('progress-fill') as HTMLDivElement;
export const progressLabel  = document.getElementById('progress-label') as HTMLSpanElement;
