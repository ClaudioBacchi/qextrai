import type { DocumentRegion } from '../components/document/documentGeometry';
import type { DocumentField, FieldDefinition } from './fieldTypes';

export type DocumentTemplateSummary = {
  id: string;
  name: string;
  revision: number;
  sourcePageCount: number;
  fieldCount: number;
  regionCount: number;
};

export type DocumentTemplate = {
  id: string;
  name: string;
  normalizedName: string;
  revision: number;
  sourcePageCount: number;
  fields: DocumentTemplateField[];
};

export type DocumentTemplateField = {
  id: string;
  fieldDefinitionId: string;
  sortOrder: number;
  regions: DocumentTemplateRegion[];
};

export type DocumentTemplateRegion = {
  id: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CreateDocumentTemplateInput = {
  id: string;
  name: string;
  sourcePageCount: number;
  documentFingerprint: string;
  documentSize: number;
  pageCount: number;
  fields: DocumentTemplateField[];
};

export type UpdateDocumentTemplateInput = {
  id: string;
  expectedRevision: number;
  sourcePageCount: number;
  fields: DocumentTemplateField[];
};

export type BindDocumentTemplateInput = {
  documentFingerprint: string;
  templateId: string;
  documentSize: number;
  pageCount: number;
};

export type AppliedTemplateLayout = {
  fields: DocumentField[];
  regions: DocumentRegion[];
  hiddenRegionCount: number;
};

export function templateFromLayout({
  templateId,
  catalog,
  fields,
  regions,
}: {
  templateId: string;
  catalog: FieldDefinition[];
  fields: DocumentField[];
  regions: DocumentRegion[];
}): DocumentTemplateField[] {
  return fields
    .map((field, index) => {
      const definition = catalog.find((item) => item.id === field.definitionId);
      if (!definition) return null;
      return {
        id: `${templateId}-field-${index}`,
        fieldDefinitionId: definition.id,
        sortOrder: index,
        regions: field.regionIds
          .map((regionId, regionIndex) => {
            const region = regions.find((item) => item.id === regionId);
            if (!region) return null;
            return {
              id: `${templateId}-field-${index}-region-${regionIndex}`,
              pageNumber: region.pageNumber,
              x: region.rect.x,
              y: region.rect.y,
              width: region.rect.width,
              height: region.rect.height,
            };
          })
          .filter((region): region is DocumentTemplateRegion => Boolean(region)),
      };
    })
    .filter((field): field is DocumentTemplateField => field !== null && field.regions.length > 0);
}

export function applyTemplateToDocument(template: DocumentTemplate, availablePageCount: number): AppliedTemplateLayout {
  const regions: DocumentRegion[] = [];
  const fields: DocumentField[] = [];
  let hiddenRegionCount = 0;

  template.fields.forEach((templateField, fieldIndex) => {
    const regionIds: string[] = [];
    templateField.regions.forEach((region, regionIndex) => {
      const id = `${template.id}-region-${fieldIndex}-${regionIndex}`;
      if (region.pageNumber > availablePageCount) hiddenRegionCount += 1;
      regions.push({
        id,
        pageNumber: region.pageNumber,
        rect: {
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height,
        },
      });
      regionIds.push(id);
    });
    fields.push({
      id: `${template.id}-field-${fieldIndex}`,
      definitionId: templateField.fieldDefinitionId,
      regionIds,
    });
  });

  return { fields, regions, hiddenRegionCount };
}

export function hasUnsavedTemplateChanges(activeRevision: number | null, dirty: boolean): boolean {
  return activeRevision !== null && dirty;
}
