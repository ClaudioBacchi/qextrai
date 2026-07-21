import type { DocumentTemplate } from './documentTemplates';
import type { DocumentValueSet } from './documentValuesRepository';
import {
  loadPersistedFieldValues,
  markPersistedFieldValuesSaved,
  type DocumentFieldValues,
} from './documentFieldValues';
import type { DocumentField } from './fieldTypes';

export type DocumentValuesLoadKey = {
  documentInstanceId: number;
  fingerprint: string;
  templateId: string;
  templateRevision: number;
};

export type LoadedDocumentValuesState = {
  values: DocumentFieldValues;
  valueSetRevision: number | null;
  dirty: boolean;
  message: string;
};

export function buildDocumentValuesLoadKey({
  documentInstanceId,
  fingerprint,
  template,
  fields,
}: {
  documentInstanceId: number;
  fingerprint: string | null;
  template: DocumentTemplate | null;
  fields: DocumentField[];
}): DocumentValuesLoadKey | null {
  if (!fingerprint || !template || template.revision < 1) return null;
  if (template.fields.length === 0) return null;
  const appliedTemplateFieldIds = new Set(fields.map((field) => field.templateFieldId).filter(Boolean));
  const allTemplateFieldsApplied = template.fields.every((field) => appliedTemplateFieldIds.has(field.id));
  if (!allTemplateFieldsApplied) return null;
  return {
    documentInstanceId,
    fingerprint,
    templateId: template.id,
    templateRevision: template.revision,
  };
}

export function documentValuesLoadKeyId(key: DocumentValuesLoadKey) {
  return `${key.documentInstanceId}:${key.fingerprint}:${key.templateId}:${key.templateRevision}`;
}

export function loadKeyMatches(first: DocumentValuesLoadKey, second: DocumentValuesLoadKey) {
  return documentValuesLoadKeyId(first) === documentValuesLoadKeyId(second);
}

export function applyLoadedDocumentValuesSnapshot({
  fields,
  template,
  valueSet,
}: {
  fields: DocumentField[];
  template: DocumentTemplate;
  valueSet: DocumentValueSet | null;
}): LoadedDocumentValuesState {
  if (!valueSet) {
    return {
      values: {},
      valueSetRevision: null,
      dirty: false,
      message: '',
    };
  }

  if (valueSet.templateRevision !== template.revision) {
    return {
      values: {},
      valueSetRevision: valueSet.revision,
      dirty: false,
      message: 'Il template è stato modificato dopo il salvataggio dei dati. Riesegui l’estrazione prima di salvarli nuovamente.',
    };
  }

  return {
    values: loadPersistedFieldValues(fields, valueSet.values),
    valueSetRevision: valueSet.revision,
    dirty: false,
    message: valueSet.values.length > 0 ? 'Dati documento caricati.' : '',
  };
}

export function applySavedDocumentValuesSnapshot({
  currentValues,
  saved,
}: {
  currentValues: DocumentFieldValues;
  saved: DocumentValueSet;
}): LoadedDocumentValuesState {
  return {
    values: markPersistedFieldValuesSaved(currentValues),
    valueSetRevision: saved.revision,
    dirty: false,
    message: 'Dati salvati.',
  };
}
