import { describe, expect, it } from 'vitest';
import { createFieldDefinition, normalizeValueType, updateDefinitionFormat } from './fieldCatalog';

describe('fieldFormat', () => {
  it('cambio single -> list conserva formato', () => {
    expect(normalizeValueType('list', 'date')).toBe('date');
  });

  it('cambio table -> single imposta formato text', () => {
    expect(normalizeValueType('single', null)).toBe('text');
  });

  it('cambio a table azzera valueType', () => {
    expect(normalizeValueType('table', 'money')).toBeNull();
  });

  it('aggiorna formato senza cambiare id e nome', () => {
    const catalog = [createFieldDefinition('definition-1', 'Data preventivo', 'single', 'text')];
    const next = updateDefinitionFormat(catalog, 'definition-1', 'single', 'date');

    expect(next[0]).toMatchObject({
      id: 'definition-1',
      name: 'Data preventivo',
      normalizedName: 'data preventivo',
      kind: 'single',
      valueType: 'date',
    });
  });
});
