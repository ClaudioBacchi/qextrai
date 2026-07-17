import { describe, expect, it } from 'vitest';
import { addDefinitionIfMissing, createFieldDefinition, normalizeFieldName } from './fieldCatalog';

describe('fieldCatalog', () => {
  it('normalizza nome ignorando maiuscole e spazi multipli', () => {
    expect(normalizeFieldName('  MANSIONI   operative ')).toBe('mansioni operative');
  });

  it('previene duplicati equivalenti', () => {
    const first = createFieldDefinition('definition-1', 'Mansioni', 'list', 'text');
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
      valueType: 'text',
    });
  });

  it('crea FieldDefinition single con formato text', () => {
    expect(createFieldDefinition('definition-1', 'Numero preventivo', 'single')).toMatchObject({
      kind: 'single',
      valueType: 'text',
    });
  });

  it('crea FieldDefinition list con formato date', () => {
    expect(createFieldDefinition('definition-1', 'Scadenze', 'list', 'date')).toMatchObject({
      kind: 'list',
      valueType: 'date',
    });
  });

  it('crea FieldDefinition table con valueType null', () => {
    expect(createFieldDefinition('definition-1', 'Righe articolo', 'table', 'money')).toMatchObject({
      kind: 'table',
      valueType: null,
    });
  });
});
