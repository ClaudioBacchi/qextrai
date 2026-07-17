import { useMemo, useState } from 'react';
import type { FieldDefinition, FieldKind } from '../../domain/fieldTypes';
import { fieldKindLabels } from '../../domain/fieldTypes';
import { cleanFieldName, findDefinitionByName, validateFieldName } from '../../domain/fieldCatalog';
import { FieldKindSelector } from './FieldKindSelector';
import { FieldNamePicker } from './FieldNamePicker';

export type FieldEditorSave = {
  name: string;
  kind: FieldKind;
  definitionId?: string;
};

type FieldDefinitionEditorProps = {
  catalog: FieldDefinition[];
  usedDefinitionIds?: string[];
  submitLabel?: string;
  onSave: (data: FieldEditorSave) => void;
  onCancel: () => void;
};

export function FieldDefinitionEditor({
  catalog,
  usedDefinitionIds = [],
  submitLabel,
  onSave,
  onCancel,
}: FieldDefinitionEditorProps) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FieldKind>('single');
  const [selectedDefinition, setSelectedDefinition] = useState<FieldDefinition | null>(null);

  const cleaned = cleanFieldName(name);
  const existing = useMemo(() => findDefinitionByName(catalog, cleaned), [catalog, cleaned]);
  const chosen = selectedDefinition ?? existing;
  const existingInDocument = Boolean(chosen && usedDefinitionIds.includes(chosen.id));
  const validation = chosen ? '' : validateFieldName(name);
  const canSave = Boolean(chosen || (!validation && cleaned));

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
        }}
      />
      {chosen ? (
        <div className="field-editor-note">
          Campo selezionato: <strong>{chosen.name}</strong> ({fieldKindLabels[chosen.kind]}).
        </div>
      ) : (
        <FieldKindSelector value={kind} onChange={setKind} />
      )}
      {existingInDocument ? (
        <div className="field-editor-note">
          <strong>Questo campo è già presente nel documento.</strong>
          <span> La nuova area verrà aggiunta al campo esistente.</span>
        </div>
      ) : null}
      {validation ? <p className="field-editor-error">{validation}</p> : null}
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
