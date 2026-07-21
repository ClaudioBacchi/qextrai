import { describe, expect, it } from 'vitest';
import type { DocumentRegion } from '../components/document/documentGeometry';
import type { DocumentField, FieldDefinition } from './fieldTypes';
import {
  applyRegionExtractionResults,
  editFieldValue,
  hasManualCorrections,
  invalidateFieldValues,
  markFieldsExtractionError,
  markFieldsReading,
  readableSingleFields,
} from './documentFieldValues';

const catalog: FieldDefinition[] = [
  { id: 'single', name: 'Numero', normalizedName: 'numero', kind: 'single', valueType: 'text', revision: 1 },
  { id: 'list', name: 'Righe', normalizedName: 'righe', kind: 'list', valueType: null, revision: 1 },
  { id: 'table', name: 'Tabella', normalizedName: 'tabella', kind: 'table', valueType: null, revision: 1 },
];

const fields: DocumentField[] = [
  { id: 'field-single', definitionId: 'single', regionIds: ['region-1'] },
  { id: 'field-list', definitionId: 'list', regionIds: ['region-2'] },
  { id: 'field-table', definitionId: 'table', regionIds: ['region-3'] },
];

const regions: DocumentRegion[] = [
  { id: 'region-1', pageNumber: 1, rect: { x: 0, y: 0, width: 0.1, height: 0.1 } },
  { id: 'region-2', pageNumber: 1, rect: { x: 0, y: 0.2, width: 0.1, height: 0.1 } },
  { id: 'region-3', pageNumber: 1, rect: { x: 0, y: 0.4, width: 0.1, height: 0.1 } },
];

describe('documentFieldValues', () => {
  it('invia al backend solo campi single con regioni valide', () => {
    expect(readableSingleFields(fields, catalog, regions).map((field) => field.id)).toEqual(['field-single']);
  });

  it('mappa risultati regione su valore campo', () => {
    const values = applyRegionExtractionResults({}, ['field-single'], [{
      regionId: 'region-1',
      documentFieldId: 'field-single',
      pageNumber: 1,
      rawText: ' S00001 ',
      status: 'read',
    }]);
    expect(values['field-single']).toMatchObject({
      rawValue: 'S00001',
      editedValue: 'S00001',
      source: 'pdfText',
      status: 'ready',
    });
  });

  it('gestisce valore vuoto', () => {
    const values = applyRegionExtractionResults({}, ['field-single'], [{
      regionId: 'region-1',
      documentFieldId: 'field-single',
      pageNumber: 1,
      rawText: '',
      status: 'empty',
    }]);
    expect(values['field-single'].status).toBe('empty');
  });

  it('conserva rawValue alla modifica manuale', () => {
    const read = applyRegionExtractionResults({}, ['field-single'], [{
      regionId: 'region-1',
      documentFieldId: 'field-single',
      pageNumber: 1,
      rawText: 'S00001',
      status: 'read',
    }]);
    const edited = editFieldValue(read, 'field-single', 'S00002');
    expect(edited['field-single']).toMatchObject({
      rawValue: 'S00001',
      editedValue: 'S00002',
      source: 'manual',
      status: 'ready',
    });
    expect(hasManualCorrections(edited)).toBe(true);
  });

  it('invalida il valore dopo spostamento box o cambio associazione', () => {
    const read = applyRegionExtractionResults({}, ['field-single'], [{
      regionId: 'region-1',
      documentFieldId: 'field-single',
      pageNumber: 1,
      rawText: 'S00001',
      status: 'read',
    }]);
    expect(invalidateFieldValues(read, ['field-single'])).toEqual({});
  });

  it('errore di lettura conserva i valori precedenti', () => {
    const read = editFieldValue({}, 'field-single', 'corretto');
    const errored = markFieldsExtractionError(read, ['field-single']);
    expect(errored['field-single']).toMatchObject({
      editedValue: 'corretto',
      source: 'manual',
      status: 'error',
    });
  });

  it('imposta lo stato reading senza perdere il valore precedente', () => {
    const read = editFieldValue({}, 'field-single', 'corretto');
    expect(markFieldsReading(read, ['field-single'])['field-single']).toMatchObject({
      editedValue: 'corretto',
      status: 'reading',
    });
  });
});
