import { describe, expect, it } from 'vitest';
import type { DocumentRegion } from '../components/document/documentGeometry';
import { createDocumentField } from './documentFields';
import { createFieldDefinition } from './fieldCatalog';
import {
  filterFieldItems,
  sortFieldItemsByDocumentPosition,
  type DocumentFieldListItem,
} from './documentFieldList';

function region(id: string, pageNumber: number, y: number, x = 0.1): DocumentRegion {
  return { id, pageNumber, rect: { x, y, width: 0.1, height: 0.1 } };
}

function item(name: string, kind: 'single' | 'list' | 'table', regions: DocumentRegion[]): DocumentFieldListItem {
  const definition = createFieldDefinition(`definition-${name}`, name, kind);
  return {
    definition,
    field: createDocumentField(`field-${name}`, definition.id, regions[0]?.id ?? 'region-missing'),
    regions,
  };
}

describe('documentFieldList', () => {
  it('ricerca campi ignorando maiuscole e spazi superflui', () => {
    const items = [
      item('Numero preventivo', 'single', [region('region-1', 1, 0.1)]),
      item('Mansioni', 'list', [region('region-2', 1, 0.2)]),
    ];

    expect(filterFieldItems(items, '  NUMERO   preventivo ', 'all').map((entry) => entry.definition.name)).toEqual([
      'Numero preventivo',
    ]);
  });

  it('filtra per struttura', () => {
    const items = [
      item('Numero preventivo', 'single', [region('region-1', 1, 0.1)]),
      item('Mansioni', 'list', [region('region-2', 1, 0.2)]),
      item('Righe articolo', 'table', [region('region-3', 1, 0.3)]),
    ];

    expect(filterFieldItems(items, '', 'list').map((entry) => entry.definition.name)).toEqual(['Mansioni']);
  });

  it('ordina per pagina y x e poi nome', () => {
    const items = [
      item('Terzo', 'single', [region('region-3', 2, 0.1)]),
      item('Secondo', 'single', [region('region-2', 1, 0.5)]),
      item('Primo', 'single', [region('region-1', 1, 0.2)]),
    ];

    expect(sortFieldItemsByDocumentPosition(items).map((entry) => entry.definition.name)).toEqual([
      'Primo',
      'Secondo',
      'Terzo',
    ]);
  });

  it('ordina un campo con piu aree dalla prima area documentale', () => {
    const items = [
      item('Campo B', 'single', [region('region-b1', 1, 0.6), region('region-b2', 1, 0.1)]),
      item('Campo A', 'single', [region('region-a1', 1, 0.4)]),
    ];

    expect(sortFieldItemsByDocumentPosition(items).map((entry) => entry.definition.name)).toEqual([
      'Campo B',
      'Campo A',
    ]);
  });
});
