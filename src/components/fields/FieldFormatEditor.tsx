import { useState } from 'react';
import type { FieldDefinition, FieldKind, ScalarValueType } from '../../domain/fieldTypes';
import { fieldKindLabels, scalarValueTypeLabels } from '../../domain/fieldTypes';
import { normalizeValueType } from '../../domain/fieldCatalog';
import { FieldKindSelector } from './FieldKindSelector';
import { ScalarValueTypeSelector } from './ScalarValueTypeSelector';

export type FieldFormatSave = {
  kind: FieldKind;
  valueType: ScalarValueType | null;
};

type FieldFormatEditorProps = {
  definition: FieldDefinition;
  onSave: (data: FieldFormatSave) => void;
  onCancel: () => void;
};

export function FieldFormatEditor({ definition, onSave, onCancel }: FieldFormatEditorProps) {
  const [kind, setKind] = useState<FieldKind>(definition.kind);
  const [valueType, setValueType] = useState<ScalarValueType>(definition.valueType ?? 'text');
  const effectiveValueType = normalizeValueType(kind, valueType);

  const changeKind = (nextKind: FieldKind) => {
    setKind(nextKind);
    if (nextKind !== 'table') {
      setValueType((current) => current ?? 'text');
    }
  };

  return (
    <aside className="field-editor" aria-label={`Modifica formato di ${definition.name}`}>
      <h2>Modifica formato</h2>
      <p>
        <strong>{definition.name}</strong>
      </p>
      <div className="field-editor-section-title">Struttura</div>
      <FieldKindSelector value={kind} onChange={changeKind} />
      {kind === 'table' ? (
        <div className="field-editor-note field-editor-note--compact">Il formato verra definito per ciascuna colonna della tabella.</div>
      ) : (
        <ScalarValueTypeSelector
          label={kind === 'list' ? 'Formato di ogni elemento' : 'Formato del valore'}
          value={effectiveValueType ?? 'text'}
          onChange={setValueType}
        />
      )}
      <div className="field-editor-note">
        Impostazione corrente: <strong>{fieldKindLabels[kind]}</strong>
        {effectiveValueType ? <span> · {scalarValueTypeLabels[effectiveValueType]}</span> : null}
      </div>
      <div className="field-editor-actions">
        <button className="button button--ghost" type="button" onClick={onCancel}>
          Annulla
        </button>
        <button
          className="button button--primary"
          type="button"
          onClick={() => onSave({ kind, valueType: effectiveValueType })}
        >
          Salva formato
        </button>
      </div>
    </aside>
  );
}
