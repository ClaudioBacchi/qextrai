import type { DocumentRegion, NormalizedRect } from '../components/document/documentGeometry';
import type { DocumentField, FieldDefinition } from './fieldTypes';

export type DocumentFieldValueSource = 'pdfText' | 'manual';
export type DocumentFieldValueStatus = 'idle' | 'reading' | 'ready' | 'empty' | 'error';

export type DocumentFieldValue = {
  documentFieldId: string;
  rawValue: string;
  editedValue: string;
  source: DocumentFieldValueSource;
  status: DocumentFieldValueStatus;
};

export type DocumentFieldValues = Record<string, DocumentFieldValue>;

export type RegionExtractionResult = {
  regionId: string;
  documentFieldId: string;
  pageNumber: number;
  rawText: string;
  status: 'read' | 'empty';
};

export function readableSingleFields(
  fields: DocumentField[],
  catalog: FieldDefinition[],
  regions: DocumentRegion[],
) {
  return fields.filter((field) => {
    const definition = catalog.find((item) => item.id === field.definitionId);
    return definition?.kind === 'single' && field.regionIds.some((regionId) => regions.some((region) => region.id === regionId));
  });
}

export function hasManualCorrections(values: DocumentFieldValues) {
  return Object.values(values).some((value) => value.source === 'manual');
}

export function markFieldsReading(values: DocumentFieldValues, fieldIds: string[]): DocumentFieldValues {
  const next = { ...values };
  fieldIds.forEach((fieldId) => {
    const previous = next[fieldId];
    next[fieldId] = {
      documentFieldId: fieldId,
      rawValue: previous?.rawValue ?? '',
      editedValue: previous?.editedValue ?? '',
      source: previous?.source ?? 'pdfText',
      status: 'reading',
    };
  });
  return next;
}

export function applyRegionExtractionResults(
  values: DocumentFieldValues,
  fieldIds: string[],
  results: RegionExtractionResult[],
): DocumentFieldValues {
  const next = { ...values };
  fieldIds.forEach((fieldId) => {
    const fieldResults = results.filter((result) => result.documentFieldId === fieldId);
    const rawValue = fieldResults
      .map((result) => result.rawText.trim())
      .filter(Boolean)
      .join('\n');
    next[fieldId] = {
      documentFieldId: fieldId,
      rawValue,
      editedValue: rawValue,
      source: 'pdfText',
      status: rawValue ? 'ready' : 'empty',
    };
  });
  return next;
}

export function markFieldsExtractionError(values: DocumentFieldValues, fieldIds: string[]): DocumentFieldValues {
  const next = { ...values };
  fieldIds.forEach((fieldId) => {
    const previous = next[fieldId];
    next[fieldId] = {
      documentFieldId: fieldId,
      rawValue: previous?.rawValue ?? '',
      editedValue: previous?.editedValue ?? '',
      source: previous?.source ?? 'pdfText',
      status: 'error',
    };
  });
  return next;
}

export function editFieldValue(values: DocumentFieldValues, fieldId: string, editedValue: string): DocumentFieldValues {
  const previous = values[fieldId] ?? {
    documentFieldId: fieldId,
    rawValue: '',
    editedValue: '',
    source: 'pdfText' as const,
    status: 'idle' as const,
  };
  return {
    ...values,
    [fieldId]: {
      ...previous,
      editedValue,
      source: 'manual',
      status: 'ready',
    },
  };
}

export function invalidateFieldValues(values: DocumentFieldValues, fieldIds: string[]): DocumentFieldValues {
  if (fieldIds.length === 0) return values;
  const next = { ...values };
  fieldIds.forEach((fieldId) => {
    delete next[fieldId];
  });
  return next;
}

export function rectEquals(first: NormalizedRect, second: NormalizedRect) {
  return first.x === second.x && first.y === second.y && first.width === second.width && first.height === second.height;
}
