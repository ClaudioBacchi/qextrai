import { describe, expect, it } from 'vitest';

const sourceModules = import.meta.glob<string>('../**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
});

describe('workspace source restrictions', () => {
  it('non usa getTextContent di PDF.js per estrarre testo', () => {
    const offenders = Object.entries(sourceModules)
      .flatMap(([file, source]) => {
        if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) return [];
        return source.includes('getTextContent') ? [file] : [];
      });

    expect(offenders).toEqual([]);
  });

  it('non usa window.confirm, window.alert o window.prompt nel workspace', () => {
    const forbidden = ['confirm', 'alert', 'prompt'].map((name) => new RegExp(`\\bwindow\\.${name}\\b|\\b${name}\\s*\\(`));
    const offenders = Object.entries(sourceModules)
      .flatMap(([file, source]) => {
        if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) return [];
        return forbidden.some((pattern) => pattern.test(source)) ? [file] : [];
      });

    expect(offenders).toEqual([]);
  });
});
