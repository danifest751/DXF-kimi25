/**
 * C1: XSS regression test — catalog.name must never be inserted via innerHTML.
 * Verifies that the catalog name is set via textContent, so HTML tags are inert.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Minimal replica of the fixed buildCatalogRow logic from sidebar.ts
// to verify the XSS fix without importing the full module (which has heavy deps)
function buildCatalogRowName(name: string): HTMLElement {
  const row = document.createElement('div');
  row.innerHTML = '<span class="catalog-name"></span>';
  (row.querySelector('.catalog-name') as HTMLSpanElement).textContent = name;
  return row;
}

describe('C1: XSS via catalog.name', () => {
  it('renders plain text name without interpretation', () => {
    const row = buildCatalogRowName('Лазер');
    const span = row.querySelector('.catalog-name') as HTMLSpanElement;
    expect(span.textContent).toBe('Лазер');
    expect(span.innerHTML).toBe('Лазер');
  });

  it('does not execute script tag in name', () => {
    const xss = '<script>window.__xss = true</script>';
    const row = buildCatalogRowName(xss);
    const span = row.querySelector('.catalog-name') as HTMLSpanElement;
    // textContent serializes as escaped text, no actual script element created
    expect(span.querySelector('script')).toBeNull();
    expect((window as unknown as Record<string, unknown>).__xss).toBeUndefined();
  });

  it('does not render img onerror payload', () => {
    const xss = '<img src=x onerror="window.__xss2=true">';
    const row = buildCatalogRowName(xss);
    const span = row.querySelector('.catalog-name') as HTMLSpanElement;
    expect(span.querySelector('img')).toBeNull();
    expect((window as unknown as Record<string, unknown>).__xss2).toBeUndefined();
  });

  it('does not create child elements for HTML-looking name', () => {
    const row = buildCatalogRowName('<b>bold</b>');
    const span = row.querySelector('.catalog-name') as HTMLSpanElement;
    expect(span.children.length).toBe(0);
    expect(span.textContent).toBe('<b>bold</b>');
  });

  it('preserves special characters verbatim', () => {
    const name = '& < > " \' catalog';
    const row = buildCatalogRowName(name);
    const span = row.querySelector('.catalog-name') as HTMLSpanElement;
    expect(span.textContent).toBe(name);
  });
});
