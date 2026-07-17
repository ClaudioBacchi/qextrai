import type { FieldKind, ScalarValueType } from './fieldTypes';
import type { DraftEditorState } from './draftRegions';

export function isDraftDefinitionMode(editor: DraftEditorState) {
  return editor?.type === 'region';
}

export function shouldShowDocumentTools(editor: DraftEditorState) {
  return !isDraftDefinitionMode(editor);
}

export function shouldShowDocumentFieldList(editor: DraftEditorState) {
  return !isDraftDefinitionMode(editor);
}

export function shouldShowValueTypeSelector(kind: FieldKind) {
  return kind !== 'table';
}

export function valueTypeForKind(kind: FieldKind, valueType: ScalarValueType = 'text') {
  return kind === 'table' ? null : valueType;
}
