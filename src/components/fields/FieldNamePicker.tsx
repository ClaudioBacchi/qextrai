import type { KeyboardEvent } from 'react';
import type { FieldDefinition } from '../../domain/fieldTypes';
import { cleanFieldName, findDefinitionByName, normalizeFieldName, sortDefinitions } from '../../domain/fieldCatalog';

type FieldNamePickerProps = {
  catalog: FieldDefinition[];
  value: string;
  selectedDefinitionId: string | null;
  onChange: (value: string) => void;
  onSelectDefinition: (definition: FieldDefinition) => void;
};

export function FieldNamePicker({
  catalog,
  value,
  selectedDefinitionId,
  onChange,
  onSelectDefinition,
}: FieldNamePickerProps) {
  const cleaned = cleanFieldName(value);
  const normalized = normalizeFieldName(cleaned);
  const exact = findDefinitionByName(catalog, cleaned);
  const filtered = sortDefinitions(catalog).filter((definition) =>
    definition.normalizedName.includes(normalized),
  );

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const first = document.querySelector<HTMLButtonElement>('[data-field-picker-option]');
      first?.focus();
    }
  };

  return (
    <div className="field-name-picker">
      <label className="form-field">
        <span>Di cosa si tratta?</span>
        <div className="input-like">
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onInputKeyDown}
            autoFocus
            placeholder="Es. Numero preventivo"
          />
        </div>
      </label>
      <div className="field-picker-results" aria-label="Campi disponibili">
        {filtered.map((definition) => (
          <button
            key={definition.id}
            data-field-picker-option
            className={`field-picker-option${selectedDefinitionId === definition.id ? ' field-picker-option--selected' : ''}`}
            type="button"
            onClick={() => onSelectDefinition(definition)}
          >
            <strong>{definition.name}</strong>
            <small>{definition.kind === 'single' ? 'Valore singolo' : definition.kind === 'list' ? 'Elenco' : 'Tabella'}</small>
          </button>
        ))}
        {filtered.length === 0 ? <p className="field-picker-empty">Nessun campo esistente trovato.</p> : null}
        {cleaned && !exact ? (
          <p className="field-picker-create">Crea nuovo campo: «{cleaned}»</p>
        ) : null}
        {cleaned && exact ? (
          <p className="field-picker-create">Campo già presente nel catalogo: «{exact.name}»</p>
        ) : null}
      </div>
    </div>
  );
}
