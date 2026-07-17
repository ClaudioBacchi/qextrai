import type { DocumentField } from './fieldTypes';

export function createDocumentField(id: string, definitionId: string, regionId: string): DocumentField {
  return { id, definitionId, regionIds: [regionId] };
}

export function findFieldByDefinition(fields: DocumentField[], definitionId: string) {
  return fields.find((field) => field.definitionId === definitionId) ?? null;
}

export function findFieldByRegion(fields: DocumentField[], regionId: string) {
  return fields.find((field) => field.regionIds.includes(regionId)) ?? null;
}

export function associateRegionToDefinition(
  fields: DocumentField[],
  fieldId: string,
  definitionId: string,
  regionId: string,
) {
  const existing = findFieldByDefinition(fields, definitionId);
  if (existing) {
    return fields.map((field) =>
      field.id === existing.id && !field.regionIds.includes(regionId)
        ? { ...field, regionIds: [...field.regionIds, regionId] }
        : field,
    );
  }
  return [...fields, createDocumentField(fieldId, definitionId, regionId)];
}

export function addRegionToField(fields: DocumentField[], fieldId: string, regionId: string) {
  return fields.map((field) =>
    field.id === fieldId && !field.regionIds.includes(regionId)
      ? { ...field, regionIds: [...field.regionIds, regionId] }
      : field,
  );
}

export function changeFieldDefinition(fields: DocumentField[], fieldId: string, definitionId: string) {
  const source = fields.find((field) => field.id === fieldId);
  if (!source) return fields;
  const target = fields.find((field) => field.definitionId === definitionId && field.id !== fieldId);
  if (!target) {
    return fields.map((field) => (field.id === fieldId ? { ...field, definitionId } : field));
  }
  return fields
    .filter((field) => field.id !== fieldId)
    .map((field) =>
      field.id === target.id
        ? { ...field, regionIds: unique([...field.regionIds, ...source.regionIds]) }
        : field,
    );
}

export function removeRegionFromFields(fields: DocumentField[], regionId: string) {
  return fields
    .map((field) => ({ ...field, regionIds: field.regionIds.filter((id) => id !== regionId) }))
    .filter((field) => field.regionIds.length > 0);
}

export function removeField(fields: DocumentField[], fieldId: string) {
  return fields.filter((field) => field.id !== fieldId);
}

export function resetDocumentFields() {
  return [];
}

function unique(values: string[]) {
  return [...new Set(values)];
}
