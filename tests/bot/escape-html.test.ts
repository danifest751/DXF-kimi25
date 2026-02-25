/** @vitest-environment node */

/**
 * N3/N11: Tests for escapeHtml helper used in Telegram bot captions.
 * The function is not exported, so we test it via an inline replica
 * that mirrors the exact implementation in bot-service/src/index.ts.
 */

import { describe, it, expect } from 'vitest';

// Exact replica of escapeHtml from bot-service/src/index.ts
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

describe('N3/N11: escapeHtml in bot captions', () => {
  it('passes through plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
    expect(escapeHtml('деталь 123')).toBe('деталь 123');
  });

  it('escapes ampersand', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it('escapes less-than', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes greater-than', () => {
    expect(escapeHtml('x > y')).toBe('x &gt; y');
  });

  it('escapes double quote', () => {
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
  });

  it('escapes all dangerous chars in one string', () => {
    const input = '<img src="x" onerror="alert(1)">&';
    const out = escapeHtml(input);
    expect(out).not.toContain('<img');
    expect(out).not.toContain('>');
    expect(out).toContain('&lt;img');
    expect(out).toContain('&gt;');
    expect(out).toContain('&amp;');
    expect(out).toContain('&quot;');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('handles string with no special chars', () => {
    const s = 'part_001.dxf';
    expect(escapeHtml(s)).toBe(s);
  });

  it('fileName with HTML tags is neutralised in caption (N3)', () => {
    const fileName = '<b>evil</b>.dxf';
    const caption = `Файл: ${escapeHtml(fileName)}`;
    expect(caption).toBe('Файл: &lt;b&gt;evil&lt;/b&gt;.dxf');
    expect(caption).not.toContain('<b>');
  });

  it('fileName with script injection is neutralised (N11)', () => {
    const fileName = '"><script>alert(1)</script>.dxf';
    const caption = `Файл: ${escapeHtml(fileName)}`;
    expect(caption).not.toContain('<script>');
    expect(caption).toContain('&lt;script&gt;');
  });
});

// Also verify toSafeBaseName — replica from bot-service/src/index.ts
function toSafeBaseName(fileName: string): string {
  const base = fileName.replace(/\.dxf$/i, '');
  const safe = base.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '');
  return safe.length > 0 ? safe : 'result';
}

describe('toSafeBaseName — bot export filename safety', () => {
  it('strips .dxf extension', () => {
    expect(toSafeBaseName('part.dxf')).toBe('part');
  });

  it('replaces unsafe chars with underscores', () => {
    expect(toSafeBaseName('../../../etc/passwd.dxf')).toBe('etc_passwd');
  });

  it('handles path traversal attempt', () => {
    const result = toSafeBaseName('../../secret.dxf');
    expect(result).not.toContain('/');
    expect(result).not.toContain('.');
    expect(result).not.toContain('..');
  });

  it('returns "result" for empty or all-special name', () => {
    expect(toSafeBaseName('...')).toBe('result');
    expect(toSafeBaseName('.dxf')).toBe('result');
  });

  it('preserves letters, digits, hyphens, underscores', () => {
    expect(toSafeBaseName('my-part_01.dxf')).toBe('my-part_01');
  });
});
