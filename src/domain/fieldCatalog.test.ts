import { describe, expect, it } from 'vitest';
import { addDefinitionIfMissing, createFieldDefinition, normalizeFieldName } from './fieldCatalog';

describe('fieldCatalog', () => {
  it('normalizza nome ignorando maiuscole e spazi multipli', () => {
    expect(normalizeFieldName('  MANSIONI   operative ')).toBe('mansioni operative');
  });

  it('previene duplicati equivalenti', () => {
    const first = createFieldDefinition('definition-1', 'Mansioni', 'list');
    const result = addDefinitionIfMissing([first], 'definition-2', '  mansioni  ', 'single');
    expect(result.created).toBe(false);
    expect(result.catalog).toHaveLength(1);
    expect(result.definition.id).toBe('definition-1');
  });

  it('crea una nuova FieldDefinition', () => {
    const result = addDefinitionIfMissing([], 'definition-1', 'Numero preventivo', 'single');
    expect(result.created).toBe(true);
    expect(result.definition).toMatchObject({
      id: 'definition-1',
      name: 'Numero preventivo',
      normalizedName: 'numero preventivo',
      kind: 'single',
    });
  });
});
