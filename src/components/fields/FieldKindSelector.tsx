import type { FieldKind } from '../../domain/fieldTypes';
import { fieldKindDescriptions, fieldKindLabels } from '../../domain/fieldTypes';

type FieldKindSelectorProps = {
  value: FieldKind;
  onChange: (kind: FieldKind) => void;
  disabled?: boolean;
};

const kinds: FieldKind[] = ['single', 'list', 'table'];

export function FieldKindSelector({ value, onChange, disabled = false }: FieldKindSelectorProps) {
  return (
    <div className="field-kind-selector">
      <div className="field-kind-options" role="radiogroup" aria-label="Struttura">
        {kinds.map((kind) => (
          <button
            className={`field-kind-option${value === kind ? ' field-kind-option--active' : ''}`}
            key={kind}
            type="button"
            role="radio"
            aria-checked={value === kind}
            aria-pressed={value === kind}
            disabled={disabled}
            onClick={() => onChange(kind)}
          >
            {fieldKindLabels[kind]}
          </button>
        ))}
      </div>
      <p className="field-option-description">{fieldKindDescriptions[value]}</p>
    </div>
  );
}
