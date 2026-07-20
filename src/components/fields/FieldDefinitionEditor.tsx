import { useMemo, useState } from 'react';
import type { FieldDefinition, FieldKind, ScalarValueType } from '../../domain/fieldTypes';
import { fieldKindLabels, scalarValueTypeLabels } from '../../domain/fieldTypes';
import { cleanFieldName, findDefinitionByName, normalizeValueType, validateFieldName } from '../../domain/fieldCatalog';
import { FieldKindSelector } from './FieldKindSelector';
import { FieldNamePicker } from './FieldNamePicker';
import { ScalarValueTypeSelector } from './ScalarValueTypeSelector';

export type FieldEditorSave = {
  name: string;
  kind: FieldKind;
  valueType: ScalarValueType | null;
  definitionId?: string;
};

type FieldDefinitionEditorProps = {
  catalog: FieldDefinition[];
  usedDefinitionIds?: string[];
  submitLabel?: string;
  errorMessage?: string;
  onSave: (data: FieldEditorSave) => void;
  onCancel: () => void;
};

export function FieldDefinitionEditor({
  catalog,
  usedDefinitionIds = [],
  submitLabel,
  errorMessage,
  onSave,
  onCancel,
}: FieldDefinitionEditorProps) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FieldKind>('single');
  const [valueType, setValueType] = useState<ScalarValueType>('text');
  const [selectedDefinition, setSelectedDefinition] = useState<FieldDefinition | null>(null);

  const cleaned = cleanFieldName(name);
  const existing = useMemo(() => findDefinitionByName(catalog, cleaned), [catalog, cleaned]);
  const chosen = selectedDefinition ?? existing;
  const existingInDocument = Boolean(chosen && usedDefinitionIds.includes(chosen.id));
  const validation = chosen ? '' : validateFieldName(name);
  const canSave = Boolean(chosen || (!validation && cleaned));
  const effectiveValueType = normalizeValueType(kind, valueType);

  const changeKind = (nextKind: FieldKind) => {
    setKind(nextKind);
    if (nextKind !== 'table') {
      setValueType((current) => current ?? 'text');
    }
  };

  return (
    <aside className="field-editor" aria-label="Definisci il campo">
      <h2>Definisci il campo</h2>
      <p>Indica quale informazione è contenuta nel box selezionato.</p>
      <FieldNamePicker
        catalog={catalog}
        value={name}
        selectedDefinitionId={chosen?.id ?? null}
        onChange={(nextName) => {
          setName(nextName);
          setSelectedDefinition(null);
        }}
        onSelectDefinition={(definition) => {
          setSelectedDefinition(definition);
          setName(definition.name);
          setKind(definition.kind);
          setValueType(definition.valueType ?? 'text');
        }}
      />
      {chosen ? (
        <div className="field-editor-note">
          Campo selezionato: <strong>{chosen.name}</strong> ({fieldKindLabels[chosen.kind]}
          {chosen.valueType ? ` · ${scalarValueTypeLabels[chosen.valueType]}` : ''}).
        </div>
      ) : (
        <>
          <div className="field-editor-section-title">Struttura</div>
          <FieldKindSelector value={kind} onChange={changeKind} />
          {kind === 'table' ? (
            <div className="field-editor-note field-editor-note--compact">Il formato verrà definito per ciascuna colonna della tabella.</div>
          ) : (
            <ScalarValueTypeSelector
              label={kind === 'list' ? 'Formato di ogni elemento' : 'Formato del valore'}
              value={effectiveValueType ?? 'text'}
              onChange={setValueType}
            />
          )}
        </>
      )}
      {existingInDocument ? (
        <div className="field-editor-note">
          <strong>Questo campo è già presente nel documento.</strong>
          <span> La nuova area verrà aggiunta al campo esistente.</span>
        </div>
      ) : null}
      {validation ? <p className="field-editor-error">{validation}</p> : null}
      {errorMessage ? <p className="field-editor-error">{errorMessage}</p> : null}
      <div className="field-editor-actions">
        <button className="button button--ghost" type="button" onClick={onCancel}>
          Annulla
        </button>
        <button
          className="button button--primary"
          type="button"
          disabled={!canSave}
          onClick={() =>
            onSave({
              name: chosen?.name ?? cleaned,
              kind: chosen?.kind ?? kind,
              valueType: chosen ? chosen.valueType : effectiveValueType,
              definitionId: chosen?.id,
            })
          }
        >
          {submitLabel ?? (existingInDocument ? 'Aggiungi area' : 'Salva campo')}
        </button>
      </div>
    </aside>
  );
}
