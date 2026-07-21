import { describe, expect, it } from 'vitest';
import type { DocumentTemplate } from './documentTemplates';
import { getUnsavedLayoutWarning, resolveUnsavedLayoutChoice } from './unsavedLayoutGuard';

const sourceModules = import.meta.glob<string>('../**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const template: DocumentTemplate = {
  id: 'template-1',
  name: 'Contratto affitto',
  normalizedName: 'contratto affitto',
  revision: 7,
  sourcePageCount: 2,
  fields: [],
};

describe('unsavedLayoutGuard', () => {
  it('resta nella pagina conservando le modifiche locali', () => {
    expect(resolveUnsavedLayoutChoice('stay')).toEqual({
      shouldContinue: false,
      keepLocalChanges: true,
      keepDialogOpen: false,
    });
  });

  it('continua senza salvare scartando le modifiche locali', () => {
    expect(resolveUnsavedLayoutChoice('discard')).toEqual({
      shouldContinue: true,
      keepLocalChanges: false,
      keepDialogOpen: false,
    });
  });

  it('salva e continua dopo un salvataggio riuscito', () => {
    expect(resolveUnsavedLayoutChoice('save', true)).toEqual({
      shouldContinue: true,
      keepLocalChanges: false,
      keepDialogOpen: false,
    });
  });

  it('resta nella pagina e conserva le modifiche se il salvataggio fallisce', () => {
    expect(resolveUnsavedLayoutChoice('save', false)).toEqual({
      shouldContinue: false,
      keepLocalChanges: true,
      keepDialogOpen: true,
    });
  });

  it('mostra il messaggio per layout senza template', () => {
    expect(getUnsavedLayoutWarning({ activeTemplate: null, templateDirty: false, fieldCount: 1 })).toEqual({
      kind: 'layout',
      title: 'Layout non salvato',
      description: 'Le aree definite nel documento non sono ancora state salvate come template. Se continui, andranno perse.',
      saveActionLabel: 'Salva come template',
    });
  });

  it('mostra il messaggio per un template salvato con modifiche locali', () => {
    expect(getUnsavedLayoutWarning({ activeTemplate: template, templateDirty: true, fieldCount: 1 })).toEqual({
      kind: 'template',
      title: 'Modifiche non salvate',
      description: 'Hai modificato il template «Contratto affitto». Se continui, queste modifiche andranno perse.',
      saveActionLabel: 'Salva e continua',
    });
  });

  it('la chiusura con ESC equivale a restare nella pagina', () => {
    expect(resolveUnsavedLayoutChoice('stay')).toMatchObject({
      shouldContinue: false,
      keepLocalChanges: true,
    });
  });

  it('non usa dialoghi nativi nel workspace', () => {
    const forbidden = ['confirm', 'alert', 'prompt'].map((name) => new RegExp(`\\bwindow\\.${name}\\b|\\b${name}\\s*\\(`));
    const offenders = Object.entries(sourceModules)
      .flatMap(([file, source]) => {
        if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) return [];
        return forbidden.some((pattern) => pattern.test(source)) ? [file] : [];
      });

    expect(offenders).toEqual([]);
  });
});
