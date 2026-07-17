import type { ScalarValueType } from '../../domain/fieldTypes';
import { scalarValueTypeDescriptions, scalarValueTypeLabels } from '../../domain/fieldTypes';

type ScalarValueTypeSelectorProps = {
  value: ScalarValueType;
  label: string;
  onChange: (valueType: ScalarValueType) => void;
};

const valueTypes: ScalarValueType[] = ['text', 'number', 'date', 'datetime', 'money', 'boolean'];
const compactLabels: Record<ScalarValueType, string> = {
  text: 'Testo o codice',
  number: 'Numero',
  date: 'Data',
  datetime: 'Data e ora',
  money: 'Valuta',
  boolean: 'Sì/No',
};

export function ScalarValueTypeSelector({ value, label, onChange }: ScalarValueTypeSelectorProps) {
  return (
    <div className="value-type-selector">
      <div className="field-editor-section-title">{label}</div>
      <div className="value-type-grid" role="radiogroup" aria-label={label}>
        {valueTypes.map((valueType) => (
          <button
            className={`value-type-option${value === valueType ? ' value-type-option--active' : ''}`}
            key={valueType}
            type="button"
            role="radio"
            aria-checked={value === valueType}
            aria-pressed={value === valueType}
            onClick={() => onChange(valueType)}
          >
            {compactLabels[valueType] ?? scalarValueTypeLabels[valueType]}
          </button>
        ))}
      </div>
      <p className="field-option-description">{scalarValueTypeDescriptions[value]}</p>
    </div>
  );
}
