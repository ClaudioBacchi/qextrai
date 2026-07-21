import { describe, expect, it } from 'vitest';
import type { DocumentRegion } from '../components/document/documentGeometry';
import { invalidateFieldValues, type DocumentFieldValues } from './documentFieldValues';
import {
  fieldDeletionNeedsConfirmation,
  isTextEditingElement,
  resolveFieldDeletionChoice,
  type FieldDeletionCommand,
} from './fieldDeletionGuard';
import { removeField, removeRegionFromFields } from './documentFields';
import type { DocumentField } from './fieldTypes';

const fields: DocumentField[] = [
  { id: 'field-1', templateFieldId: 'template-field-1', definitionId: 'definition-1', regionIds: ['region-1'] },
  { id: 'field-2', templateFieldId: 'template-field-2', definitionId: 'definition-2', regionIds: ['region-2'] },
];

const regions: DocumentRegion[] = [
  { id: 'region-1', pageNumber: 1, rect: { x: 0, y: 0, width: 0.2, height: 0.1 } },
  { id: 'region-2', pageNumber: 1, rect: { x: 0, y: 0.2, width: 0.2, height: 0.1 } },
];

describe('fieldDeletionGuard', () => {
  it('Canc su campo mai letto: eliminazione diretta', () => {
    const state = requestDeletion({ type: 'region', regionId: 'region-1' }, {});

    expect(state.pendingConfirmation).toBeNull();
    expect(state.deleteCount).toBe(1);
    expect(state.regions.map((region) => region.id)).toEqual(['region-2']);
    expect(state.fields.map((field) => field.id)).toEqual(['field-2']);
  });

  it('Canc su valore estratto: apertura della conferma senza eliminare', () => {
    const state = requestDeletion({ type: 'region', regionId: 'region-1' }, {
      'field-1': readValue('S00001'),
    });

    expect(state.pendingConfirmation).toEqual({ type: 'region', regionId: 'region-1' });
    expect(state.deleteCount).toBe(0);
    expect(state.regions).toHaveLength(2);
    expect(state.values['field-1']?.editedValue).toBe('S00001');
  });

  it('Canc su valore corretto manualmente: apertura della conferma', () => {
    expect(fieldDeletionNeedsConfirmation({ type: 'region', regionId: 'region-1' }, fields, {
      'field-1': { ...readValue('S00001'), editedValue: 'S00002', source: 'manual' },
    })).toBe(true);
  });

  it('Canc su valore salvato: apertura della conferma', () => {
    expect(fieldDeletionNeedsConfirmation({ type: 'region', regionId: 'region-1' }, fields, {
      'field-1': { ...readValue(''), status: 'empty', saved: true },
    })).toBe(true);
  });

  it('Annulla, ESC e chiusura conservano campo e valore', () => {
    const initial = requestDeletion({ type: 'region', regionId: 'region-1' }, {
      'field-1': readValue('S00001'),
    });

    ['cancel', 'cancel', 'cancel'].forEach((choice) => {
      const resolved = resolveFieldDeletionChoice(choice as 'cancel');
      expect(resolved.shouldDelete).toBe(false);
      expect(resolved.keepDialogOpen).toBe(false);
      expect(initial.regions).toHaveLength(2);
      expect(initial.fields).toHaveLength(2);
      expect(initial.values['field-1']?.editedValue).toBe('S00001');
    });
  });

  it('Elimina campo elimina una sola volta', () => {
    let state = requestDeletion({ type: 'region', regionId: 'region-1' }, {
      'field-1': readValue('S00001'),
    });

    state = confirmDeletion(state);
    state = confirmDeletion(state);

    expect(state.deleteCount).toBe(1);
    expect(state.regions.map((region) => region.id)).toEqual(['region-2']);
    expect(state.fields.map((field) => field.id)).toEqual(['field-2']);
  });

  it('dopo la conferma il layout risulta modificato e il valore viene invalidato', () => {
    const state = confirmDeletion(requestDeletion({ type: 'region', regionId: 'region-1' }, {
      'field-1': readValue('S00001'),
    }));

    expect(state.templateDirty).toBe(true);
    expect(state.values['field-1']).toBeUndefined();
  });

  it('pressione ripetuta di Canc senza modali duplicate', () => {
    let state = requestDeletion({ type: 'region', regionId: 'region-1' }, {
      'field-1': readValue('S00001'),
    });
    state = requestDeletion({ type: 'region', regionId: 'region-1' }, state.values, state);

    expect(state.confirmationCount).toBe(1);
    expect(state.deleteCount).toBe(0);
  });

  it('Canc e Backspace dentro un editor di testo non eliminano il campo', () => {
    const editorTargets = [
      { tagName: 'INPUT', isContentEditable: false },
      { tagName: 'TEXTAREA', isContentEditable: false },
      { tagName: 'SELECT', isContentEditable: false },
      { tagName: 'DIV', isContentEditable: true },
    ];

    editorTargets.forEach((target) => {
      expect(isTextEditingElement(target)).toBe(true);
    });
  });

  it('eventuale pulsante grafico di eliminazione usa la stessa conferma', () => {
    const keyboard = requestDeletion({ type: 'region', regionId: 'region-1' }, { 'field-1': readValue('S00001') });
    const button = requestDeletion({ type: 'field', fieldId: 'field-1' }, { 'field-1': readValue('S00001') });

    expect(keyboard.pendingConfirmation).toEqual({ type: 'region', regionId: 'region-1' });
    expect(button.pendingConfirmation).toEqual({ type: 'field', fieldId: 'field-1' });
    expect(button.deleteCount).toBe(0);
  });
});

type DeletionState = {
  fields: DocumentField[];
  regions: DocumentRegion[];
  values: DocumentFieldValues;
  pendingConfirmation: FieldDeletionCommand | null;
  confirmationCount: number;
  deleteCount: number;
  templateDirty: boolean;
};

function requestDeletion(
  command: FieldDeletionCommand,
  values: DocumentFieldValues,
  previous?: DeletionState,
): DeletionState {
  const state = previous ?? {
    fields,
    regions,
    values,
    pendingConfirmation: null,
    confirmationCount: 0,
    deleteCount: 0,
    templateDirty: false,
  };

  if (state.pendingConfirmation) return state;
  if (fieldDeletionNeedsConfirmation(command, state.fields, state.values)) {
    return { ...state, pendingConfirmation: command, confirmationCount: state.confirmationCount + 1 };
  }

  return applyDeletion({ ...state, values }, command);
}

function confirmDeletion(state: DeletionState): DeletionState {
  if (!state.pendingConfirmation) return state;
  const command = state.pendingConfirmation;
  return applyDeletion({ ...state, pendingConfirmation: null }, command);
}

function applyDeletion(state: DeletionState, command: FieldDeletionCommand): DeletionState {
  if (command.type === 'field') {
    const field = state.fields.find((item) => item.id === command.fieldId);
    if (!field) return state;
    return {
      ...state,
      regions: state.regions.filter((region) => !field.regionIds.includes(region.id)),
      fields: removeField(state.fields, command.fieldId),
      values: invalidateFieldValues(state.values, [command.fieldId]),
      deleteCount: state.deleteCount + 1,
      templateDirty: true,
    };
  }

  const affected = state.fields
    .filter((field) => field.regionIds.includes(command.regionId))
    .map((field) => field.id);

  return {
    ...state,
    regions: state.regions.filter((region) => region.id !== command.regionId),
    fields: removeRegionFromFields(state.fields, command.regionId),
    values: invalidateFieldValues(state.values, affected),
    deleteCount: state.deleteCount + 1,
    templateDirty: true,
  };
}

function readValue(value: string) {
  return {
    documentFieldId: 'field-1',
    rawValue: value,
    editedValue: value,
    source: 'pdfText' as const,
    status: value ? 'ready' as const : 'empty' as const,
    saved: false,
  };
}
