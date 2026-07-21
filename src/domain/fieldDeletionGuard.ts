import type { DocumentFieldValues } from './documentFieldValues';
import type { DocumentField } from './fieldTypes';

export type FieldDeletionCommand =
  | { type: 'region'; regionId: string }
  | { type: 'field'; fieldId: string };

export type FieldDeletionChoice = 'cancel' | 'confirm';

export type FieldDeletionChoiceResult = {
  shouldDelete: boolean;
  keepDialogOpen: boolean;
};

export function fieldIdsForDeletion(command: FieldDeletionCommand, fields: DocumentField[]) {
  if (command.type === 'field') {
    return fields.some((field) => field.id === command.fieldId) ? [command.fieldId] : [];
  }

  return fields
    .filter((field) => field.regionIds.includes(command.regionId))
    .map((field) => field.id);
}

export function fieldDeletionNeedsConfirmation(
  command: FieldDeletionCommand,
  fields: DocumentField[],
  values: DocumentFieldValues,
) {
  return fieldIdsForDeletion(command, fields).some((fieldId) => {
    const value = values[fieldId];
    if (!value) return false;
    if (value.saved) return true;
    if (value.source === 'manual') return true;
    if (value.status === 'ready' || value.status === 'empty') return true;
    return Boolean(value.rawValue.trim() || value.editedValue.trim());
  });
}

export function resolveFieldDeletionChoice(choice: FieldDeletionChoice): FieldDeletionChoiceResult {
  return {
    shouldDelete: choice === 'confirm',
    keepDialogOpen: false,
  };
}

export function isTextEditingElement(target: Pick<HTMLElement, 'tagName' | 'isContentEditable'> | null) {
  if (!target) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
}
