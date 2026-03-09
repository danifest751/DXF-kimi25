/**
 * @module icons
 * SVG icon library — inline SVG strings for all set-builder UI icons.
 * All icons are 16×16 viewBox, stroke-based, currentColor.
 */

function svg(content: string, extra = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${content}</svg>`;
}

/** ✕ Close / delete preset */
export const iconClose = svg(
  `<line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/>`,
);

/** ‹ Chevron left */
export const iconChevronLeft = svg(
  `<polyline points="10,3 5,8 10,13"/>`,
);

/** › Chevron right */
export const iconChevronRight = svg(
  `<polyline points="6,3 11,8 6,13"/>`,
);

/** ∨ Chevron down */
export const iconChevronDown = svg(
  `<polyline points="3,6 8,11 13,6"/>`,
);

/** ⊹ Split / explode parts */
export const iconSplit = svg(
  `<path d="M8 3v10M3 8h10M5.5 5.5l5 5M10.5 5.5l-5 5" stroke-width="1.5"/>`,
);

/** 👁 Eye / preview */
export const iconEye = svg(
  `<path d="M1 8C2.5 4.5 5 3 8 3s5.5 1.5 7 5c-1.5 3.5-4 5-7 5S2.5 11.5 1 8z"/>
   <circle cx="8" cy="8" r="2"/>`,
);

/** ⋯ More / menu (three dots) */
export const iconDots = svg(
  `<circle cx="3.5" cy="8" r="1.2" fill="currentColor" stroke="none"/>
   <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/>
   <circle cx="12.5" cy="8" r="1.2" fill="currentColor" stroke="none"/>`,
);

/** 🔧 Wrench / optimizer */
export const iconWrench = svg(
  `<path d="M11.5 2a3.5 3.5 0 0 1 .7 5.8L5.8 14.1a1.4 1.4 0 0 1-2-2L10.2 5.7A3.5 3.5 0 0 1 11.5 2z"/>
   <line x1="14" y1="2" x2="11.5" y2="4.5"/>`,
);

/** 🗑 Trash / delete */
export const iconTrash = svg(
  `<polyline points="2,4 14,4"/>
   <path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/>
   <rect x="3" y="4" width="10" height="9" rx="1"/>
   <line x1="6" y1="7" x2="6" y2="11"/>
   <line x1="10" y1="7" x2="10" y2="11"/>`,
);

/** ⬡ Hexagon / material (empty) */
export const iconHexagon = svg(
  `<polygon points="8,1.5 13.7,4.75 13.7,11.25 8,14.5 2.3,11.25 2.3,4.75"/>`,
);

/** ⬡ Hexagon / material (filled — assigned) */
export const iconHexagonFilled = svg(
  `<polygon points="8,1.5 13.7,4.75 13.7,11.25 8,14.5 2.3,11.25 2.3,4.75" fill="currentColor" stroke="none"/>`,
);

/** ✎ Pencil / rename */
export const iconPencil = svg(
  `<path d="M11 2l3 3-8 8H3v-3z"/>
   <line x1="9" y1="4" x2="12" y2="7"/>`,
);

/** ✓ Check / done */
export const iconCheck = svg(
  `<polyline points="2,8 6,12 14,4"/>`,
  `stroke-width="2"`,
);

/** — Skip / dash */
export const iconDash = svg(
  `<line x1="3" y1="8" x2="13" y2="8"/>`,
);

/** 📁 Folder / catalog */
export const iconFolder = svg(
  `<path d="M1 4a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z" fill="currentColor" opacity="0.15"/>
   <path d="M1 4a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z"/>`,
);

/** ⚡ Lightning / batch */
export const iconLightning = svg(
  `<path d="M10 2L4 9h5l-1 5 7-7H10z" fill="currentColor" stroke="none"/>`,
);

/** 🗜 Zip / archive download */
export const iconZip = svg(
  `<rect x="3" y="1" width="10" height="14" rx="1.5"/>
   <line x1="8" y1="5" x2="8" y2="11"/>
   <polyline points="5,8 8,11 11,8"/>
   <line x1="5" y1="13" x2="11" y2="13"/>`,
);

/** ↔ Move / drag parts freely */
export const iconMove = svg(
  `<path d="M8 2v12M2 8h12"/>
   <polyline points="5,5 2,8 5,11"/>
   <polyline points="11,5 14,8 11,11"/>
   <polyline points="5,5 8,2 11,5"/>
   <polyline points="5,11 8,14 11,11"/>`,
);

/** ↑ Resave / overwrite hash */
export const iconResave = svg(
  `<path d="M3 9v3a2 2 0 002 2h6a2 2 0 002-2V9"/>
   <polyline points="5,6 8,3 11,6"/>
   <line x1="8" y1="3" x2="8" y2="11"/>`,
);

/** ⊞ Auto-arrange */
export const iconAutoArrange = svg(
  `<rect x="2" y="2" width="5" height="5" rx="0.8"/>
   <rect x="9" y="2" width="5" height="5" rx="0.8"/>
   <rect x="2" y="9" width="5" height="5" rx="0.8"/>
   <rect x="9" y="9" width="5" height="5" rx="0.8"/>`,
);

/** ⚠ Warning */
export const iconWarning = svg(
  `<path d="M8 2L14.5 13H1.5z"/>
   <line x1="8" y1="7" x2="8" y2="10"/>
   <circle cx="8" cy="12" r="0.5" fill="currentColor" stroke="none"/>`,
);
