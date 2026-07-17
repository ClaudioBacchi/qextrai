import { describe, expect, it } from 'vitest';
import {
  addRegionToField,
  associateRegionToDefinition,
  changeFieldDefinition,
  createDocumentField,
  removeField,
  removeRegionFromFields,
  resetDocumentFields,
} from './documentFields';

describe('documentFields', () => {
  it('crea DocumentField', () => {
    expect(createDocumentField('field-1', 'definition-1', 'region-1')).toEqual({
      id: 'field-1',
      definitionId: 'definition-1',
      regionIds: ['region-1'],
    });
  });

  it('aggiunge una seconda regione', () => {
    const fields = [createDocumentField('field-1', 'definition-1', 'region-1')];
    expect(addRegionToField(fields, 'field-1', 'region-2')[0].regionIds).toEqual(['region-1', 'region-2']);
  });

  it('associa a campo già presente', () => {
    const fields = [createDocumentField('field-1', 'definition-1', 'region-1')];
    const next = associateRegionToDefinition(fields, 'field-2', 'definition-1', 'region-2');
    expect(next).toHaveLength(1);
    expect(next[0].regionIds).toEqual(['region-1', 'region-2']);
  });

  it('cambia definizione', () => {
    const fields = [createDocumentField('field-1', 'definition-1', 'region-1')];
    expect(changeFieldDefinition(fields, 'field-1', 'definition-2')[0].definitionId).toBe('definition-2');
  });

  it('unisce due DocumentField se si cambia verso una definizione già usata', () => {
    const fields = [
      createDocumentField('field-1', 'definition-1', 'region-1'),
      createDocumentField('field-2', 'definition-2', 'region-2'),
    ];
    const next = changeFieldDefinition(fields, 'field-1', 'definition-2');
    expect(next).toHaveLength(1);
    expect(next[0].regionIds).toEqual(['region-2', 'region-1']);
  });

  it('elimina una regione', () => {
    const fields = [{ ...createDocumentField('field-1', 'definition-1', 'region-1'), regionIds: ['region-1', 'region-2'] }];
    expect(removeRegionFromFields(fields, 'region-1')[0].regionIds).toEqual(['region-2']);
  });

  it('elimina ultima regione e quindi il campo', () => {
    const fields = [createDocumentField('field-1', 'definition-1', 'region-1')];
    expect(removeRegionFromFields(fields, 'region-1')).toEqual([]);
  });

  it('resetta campi documento lasciando il catalogo gestibile altrove', () => {
    expect(resetDocumentFields()).toEqual([]);
  });

  it('elimina un campo intero', () => {
    const fields = [createDocumentField('field-1', 'definition-1', 'region-1')];
    expect(removeField(fields, 'field-1')).toEqual([]);
  });
});
