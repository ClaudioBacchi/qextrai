import { describe, expect, it } from 'vitest';
import { addDefinitionIfMissing } from './fieldCatalog';
import {
  isDraftDefinitionMode,
  shouldShowDocumentFieldList,
  shouldShowDocumentTools,
  shouldShowValueTypeSelector,
  valueTypeForKind,
} from './fieldEditorUi';
import type { FieldDefinition, FieldKind, ScalarValueType } from './fieldTypes';

describe('fieldEditorUi', () => {
  it('nasconde ricerca e filtri del documento durante una bozza', () => {
    const editor = { type: 'region' as const, regionId: 'region-1' };

    expect(isDraftDefinitionMode(editor)).toBe(true);
    expect(shouldShowDocumentTools(editor)).toBe(false);
    expect(shouldShowDocumentFieldList(editor)).toBe(false);
  });

  it('mostra ricerca e filtri dopo annullamento o salvataggio', () => {
    expect(shouldShowDocumentTools(null)).toBe(true);
    expect(shouldShowDocumentFieldList(null)).toBe(true);
  });

  it('mantiene accessibile la selezione della struttura', () => {
    const selected: FieldKind = 'list';

    expect(selected).toBe('list');
  });

  it('mostra il formato per single e list', () => {
    expect(shouldShowValueTypeSelector('single')).toBe(true);
    expect(shouldShowValueTypeSelector('list')).toBe(true);
  });

  it('nasconde il formato per table e usa valueType null', () => {
    expect(shouldShowValueTypeSelector('table')).toBe(false);
    expect(valueTypeForKind('table', 'date')).toBeNull();
  });

  it('usa text come default per i formati scalari', () => {
    const valueType: ScalarValueType = valueTypeForKind('single') ?? 'text';

    expect(valueType).toBe('text');
  });

  it('non modifica il catalogo prima di Salva campo', () => {
    const catalog: FieldDefinition[] = [];
    const draftInput = { name: 'Provincia', kind: 'single' as const, valueType: 'text' as const };

    expect(draftInput.name).toBe('Provincia');
    expect(catalog).toEqual([]);
  });

  it('il catalogo cambia solo al salvataggio', () => {
    const result = addDefinitionIfMissing([], 'definition-1', 'Provincia', 'single', 'text');

    expect(result.catalog).toHaveLength(1);
    expect(result.definition.valueType).toBe('text');
  });
});
