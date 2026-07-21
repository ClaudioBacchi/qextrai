import { describe, expect, it, vi } from 'vitest';
import type { DocumentTemplate } from './documentTemplates';
import type { DocumentValuesRepository, DocumentValueSet, SaveDocumentValuesInput } from './documentValuesRepository';
import { buildPersistedFieldValues, editFieldValue } from './documentFieldValues';
import {
  applyLoadedDocumentValuesSnapshot,
  applySavedDocumentValuesSnapshot,
  buildDocumentValuesLoadKey,
  loadKeyMatches,
} from './documentValuesWorkflow';
import type { DocumentField } from './fieldTypes';

const fingerprint = 'a'.repeat(64);
const template: DocumentTemplate = {
  id: 'template-1',
  name: 'Preventivo',
  normalizedName: 'preventivo',
  revision: 3,
  sourcePageCount: 1,
  fields: [{
    id: 'template-field-company',
    fieldDefinitionId: 'definition-company',
    sortOrder: 0,
    regions: [{ id: 'region-template', pageNumber: 1, x: 0.1, y: 0.1, width: 0.2, height: 0.1 }],
  }],
};

const appliedFields: DocumentField[] = [{
  id: 'document-field-company',
  templateFieldId: 'template-field-company',
  definitionId: 'definition-company',
  regionIds: ['region-1'],
}];

class MemoryValuesRepository implements DocumentValuesRepository {
  private set: DocumentValueSet | null = null;
  readonly saveSpy = vi.fn();
  readonly loadSpy = vi.fn();

  async load(input: { fingerprint: string; templateId: string }) {
    void input;
    this.loadSpy();
    return this.set;
  }

  async save(input: SaveDocumentValuesInput) {
    this.saveSpy(input);
    if (this.set && input.expectedRevision !== this.set.revision) {
      throw new Error('revisionConflict');
    }
    if (!this.set && input.expectedRevision !== null) {
      throw new Error('revisionConflict');
    }
    this.set = {
      id: 'value-set-1',
      revision: this.set ? this.set.revision + 1 : 1,
      templateRevision: input.templateRevision,
      values: input.values,
    };
    return this.set;
  }

  isAvailable() {
    return true;
  }
}

describe('documentValuesWorkflow', () => {
  it('attende campi con templateFieldId prima del caricamento', () => {
    expect(buildDocumentValuesLoadKey({
      documentInstanceId: 1,
      fingerprint,
      template,
      fields: [],
    })).toBeNull();

    expect(buildDocumentValuesLoadKey({
      documentInstanceId: 1,
      fingerprint,
      template,
      fields: [{ id: 'local', definitionId: 'definition-company', regionIds: ['region-1'] }],
    })).toBeNull();

    expect(buildDocumentValuesLoadKey({
      documentInstanceId: 1,
      fingerprint,
      template,
      fields: appliedFields,
    })).toMatchObject({
      documentInstanceId: 1,
      fingerprint,
      templateId: template.id,
      templateRevision: template.revision,
    });
  });

  it('salva, riapre lo stesso fingerprint e ripristina correzione manuale come Salvato', async () => {
    const repository = new MemoryValuesRepository();
    const edited = editFieldValue({}, 'document-field-company', 'Briccolani SRL corretta');
    const saved = await repository.save({
      fingerprint,
      templateId: template.id,
      templateRevision: template.revision,
      expectedRevision: null,
      values: buildPersistedFieldValues(appliedFields, edited),
    });
    const savedState = applySavedDocumentValuesSnapshot({ currentValues: edited, saved });
    expect(saved.revision).toBe(1);
    expect(savedState.valueSetRevision).toBe(1);
    expect(savedState.values['document-field-company'].saved).toBe(true);

    const reopenedKey = buildDocumentValuesLoadKey({
      documentInstanceId: 2,
      fingerprint,
      template,
      fields: appliedFields,
    });
    expect(reopenedKey).not.toBeNull();
    const loaded = await repository.load({ fingerprint, templateId: template.id });
    const loadedState = applyLoadedDocumentValuesSnapshot({ fields: appliedFields, template, valueSet: loaded });

    expect(repository.loadSpy).toHaveBeenCalledTimes(1);
    expect(loadedState).toMatchObject({
      valueSetRevision: 1,
      dirty: false,
      message: 'Dati documento caricati.',
    });
    expect(loadedState.values['document-field-company']).toMatchObject({
      rawValue: '',
      editedValue: 'Briccolani SRL corretta',
      source: 'manual',
      status: 'ready',
      saved: true,
    });
  });

  it('non richiede estrazione automatica e non resetta valori caricati', () => {
    const loadedState = applyLoadedDocumentValuesSnapshot({
      fields: appliedFields,
      template,
      valueSet: {
        id: 'value-set-1',
        revision: 4,
        templateRevision: template.revision,
        values: [{
          templateFieldId: 'template-field-company',
          fieldDefinitionId: 'definition-company',
          rawValue: 'Briccolani SRL',
          editedValue: 'Briccolani SRL corretta',
          source: 'manual',
          status: 'ready',
        }],
      },
    });

    expect(loadedState.values['document-field-company'].editedValue).toBe('Briccolani SRL corretta');
    expect(loadedState.values['document-field-company'].saved).toBe(true);
    expect(loadedState.dirty).toBe(false);
  });

  it('usa expectedRevision corretto nel secondo salvataggio', async () => {
    const repository = new MemoryValuesRepository();
    const firstValues = editFieldValue({}, 'document-field-company', 'uno');
    const first = await repository.save({
      fingerprint,
      templateId: template.id,
      templateRevision: template.revision,
      expectedRevision: null,
      values: buildPersistedFieldValues(appliedFields, firstValues),
    });
    const secondValues = editFieldValue(firstValues, 'document-field-company', 'due');
    const second = await repository.save({
      fingerprint,
      templateId: template.id,
      templateRevision: template.revision,
      expectedRevision: first.revision,
      values: buildPersistedFieldValues(appliedFields, secondValues),
    });

    expect(second.revision).toBe(2);
    expect(repository.saveSpy.mock.calls[1][0].expectedRevision).toBe(1);
  });

  it('conflitto conserva modifiche locali finché si sceglie Resta qui', async () => {
    const repository = new MemoryValuesRepository();
    await repository.save({
      fingerprint,
      templateId: template.id,
      templateRevision: template.revision,
      expectedRevision: null,
      values: [],
    });
    const localValues = editFieldValue({}, 'document-field-company', 'locale');

    await expect(repository.save({
      fingerprint,
      templateId: template.id,
      templateRevision: template.revision,
      expectedRevision: null,
      values: buildPersistedFieldValues(appliedFields, localValues),
    })).rejects.toThrow('revisionConflict');

    expect(localValues['document-field-company'].editedValue).toBe('locale');
  });

  it('ricarica dopo conflitto senza tentare un altro salvataggio e sostituisce snapshot/revisione', async () => {
    const repository = new MemoryValuesRepository();
    await repository.save({
      fingerprint,
      templateId: template.id,
      templateRevision: template.revision,
      expectedRevision: null,
      values: [{
        templateFieldId: 'template-field-company',
        fieldDefinitionId: 'definition-company',
        rawValue: 'remoto',
        editedValue: 'remoto corretto',
        source: 'manual',
        status: 'ready',
      }],
    });
    repository.saveSpy.mockClear();

    const loaded = await repository.load({ fingerprint, templateId: template.id });
    const state = applyLoadedDocumentValuesSnapshot({ fields: appliedFields, template, valueSet: loaded });

    expect(repository.saveSpy).not.toHaveBeenCalled();
    expect(repository.loadSpy).toHaveBeenCalledTimes(1);
    expect(state.valueSetRevision).toBe(1);
    expect(state.dirty).toBe(false);
    expect(state.values['document-field-company'].editedValue).toBe('remoto corretto');
  });

  it('ignora risposta asincrona di un documento precedente', () => {
    const oldKey = buildDocumentValuesLoadKey({
      documentInstanceId: 1,
      fingerprint,
      template,
      fields: appliedFields,
    })!;
    const newKey = buildDocumentValuesLoadKey({
      documentInstanceId: 2,
      fingerprint,
      template,
      fields: appliedFields,
    })!;

    expect(loadKeyMatches(oldKey, newKey)).toBe(false);
  });

  it('scarta valori se la revisione template non è compatibile', () => {
    const state = applyLoadedDocumentValuesSnapshot({
      fields: appliedFields,
      template,
      valueSet: {
        id: 'value-set-1',
        revision: 7,
        templateRevision: template.revision - 1,
        values: [],
      },
    });

    expect(state.values).toEqual({});
    expect(state.valueSetRevision).toBe(7);
    expect(state.message).toBe('Il template è stato modificato dopo il salvataggio dei dati. Riesegui l’estrazione prima di salvarli nuovamente.');
  });
});
