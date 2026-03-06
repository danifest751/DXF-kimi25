/**
 * @module main
 * Точка входа приложения DXF Viewer.
 * Set-builder — основной интерфейс. Legacy UI удалён.
 */

import './styles/base.css';
import './styles/set-builder.css';
import './styles/animations.css';

import { restoreAuthSession } from './auth.js';
import { initSetBuilder } from './set-builder/index.js';
import { setBuilderRoot, btnSetBuilder } from './ui-shell.js';

// ─── Boot ─────────────────────────────────────────────────────────────

void restoreAuthSession();
initSetBuilder(setBuilderRoot, btnSetBuilder);
