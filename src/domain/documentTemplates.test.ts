import { describe, expect, it } from 'vitest';
import { applyTemplateToDocument, hasUnsavedTemplateChanges, templateFromLayout } from './documentTemplates';
import type { DocumentRegion } from '../components/document/documentGeometry';
import type { DocumentField, FieldDefinition } from './fieldTypes';

const catalog: FieldDefinition[] = [
  {
    id: 'definition-1',
    name: 'Numero documento',
    normalizedName: 'numero documento',
    kind: 'single',
    valueType: 'text',
    revision: 1,
  },
  {
    id: 'definition-2',
    name: 'Righe',
    normalizedName: 'righe',
    kind: 'list',
    valueType: 'text',
    revision: 1,
  },
];

const regions: DocumentRegion[] = [
  { id: 'region-1', pageNumber: 1, rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 } },
  { id: 'region-2', pageNumber: 2, rect: { x: 0.4, y: 0.5, width: 0.2, height: 0.2 } },
];

const fields: DocumentField[] = [
  { id: 'field-1', definitionId: 'definition-1', regionIds: ['region-1'] },
  { id: 'field-2', definitionId: 'definition-2', regionIds: ['region-2'] },
];

describe('documentTemplates', () => {
  it('crea un layout template dal documento corrente', () => {
    expect(templateFromLayout({ templateId: 'template-1', catalog, fields, regions })).toEqual([
      {
        id: 'template-1-field-0',
        fieldDefinitionId: 'definition-1',
        sortOrder: 0,
        regions: [
          {
            id: 'template-1-field-0-region-0',
            pageNumber: 1,
            x: 0.1,
            y: 0.2,
            width: 0.3,
            height: 0.1,
          },
        ],
      },
      {
        id: 'template-1-field-1',
        fieldDefinitionId: 'definition-2',
        sortOrder: 1,
        regions: [
          {
            id: 'template-1-field-1-region-0',
            pageNumber: 2,
            x: 0.4,
            y: 0.5,
            width: 0.2,
            height: 0.2,
          },
        ],
      },
    ]);
  });

  it('applica template preservando aree oltre le pagine disponibili', () => {
    const layout = applyTemplateToDocument(
      {
        id: 'template-1',
        name: 'Template',
        normalizedName: 'template',
        revision: 3,
        sourcePageCount: 2,
        fields: templateFromLayout({ templateId: 'template-1', catalog, fields, regions }),
      },
      1,
    );

    expect(layout.hiddenRegionCount).toBe(1);
    expect(layout.regions).toHaveLength(2);
    expect(layout.fields[1].regionIds).toEqual(['template-1-region-1-0']);
  });

  it('segnala modifiche non salvate solo per un template attivo', () => {
    expect(hasUnsavedTemplateChanges(null, true)).toBe(false);
    expect(hasUnsavedTemplateChanges(1, false)).toBe(false);
    expect(hasUnsavedTemplateChanges(1, true)).toBe(true);
  });
});
