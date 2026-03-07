/**
 * @module main
 * Точка входа приложения DXF Viewer.
 * Set-builder — основной интерфейс. Legacy UI удалён.
 */

import './styles/base.css';
import './styles/set-builder.css';
import './styles/animations.css';
import './styles/responsive.css';

import { restoreAuthSession, runTMAAutoLogin } from './auth.js';
import { initSetBuilder } from './set-builder/index.js';
import { setBuilderRoot, btnSetBuilder } from './ui-shell.js';

// ─── Boot ─────────────────────────────────────────────────────────────

initSetBuilder(setBuilderRoot, btnSetBuilder);

// If opened as Telegram Mini App — auto-login via initData, else restore stored session
void runTMAAutoLogin().then((isTMA) => {
  if (!isTMA) void restoreAuthSession();
});
