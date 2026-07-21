import { ChevronDown } from 'lucide-react';
import {
  fieldKindLabels,
  formatFieldDefinitionMeta,
  scalarValueTypeLabels,
  type DocumentField,
  type FieldDefinition,
} from '../../domain/fieldTypes';
import { formatPages } from '../../domain/documentFieldList';
import type { DocumentFieldValue } from '../../domain/documentFieldValues';
import type { DocumentRegion } from '../document/documentGeometry';

type DocumentFieldCardProps = {
  field: DocumentField;
  definition: FieldDefinition;
  value: DocumentFieldValue | undefined;
  regions: DocumentRegion[];
  selectedRegionId: string | null;
  expanded: boolean;
  onToggleExpanded: (fieldId: string) => void;
  onSelectRegion: (id: string) => void;
  onAddArea: (fieldId: string) => void;
  onChangeField: (fieldId: string) => void;
  onEditFormat: (fieldId: string) => void;
  onEditValue: (fieldId: string, value: string) => void;
  onDeleteRegion: (regionId: string) => void;
  onDeleteField: (fieldId: string) => void;
};

export function DocumentFieldCard({
  field,
  definition,
  value,
  regions,
  selectedRegionId,
  expanded,
  onToggleExpanded,
  onSelectRegion,
  onAddArea,
  onChangeField,
  onEditFormat,
  onEditValue,
  onDeleteRegion,
  onDeleteField,
}: DocumentFieldCardProps) {
  const panelId = `field-row-panel-${field.id}`;
  const areaText = regions.length === 1 ? '1 area' : `${regions.length} aree`;
  const valueStatus = valueStatusLabel(value);
  const persistenceStatus = value && (value.status === 'ready' || value.status === 'empty')
    ? value.saved ? 'Salvato' : 'Da salvare'
    : 'Non salvato';
  const valueText = value?.editedValue || valueStatus;
  const selectedRegionBelongsToField = Boolean(selectedRegionId && field.regionIds.includes(selectedRegionId));
  const sortedRegions = [...regions].sort(
    (first, second) =>
      first.pageNumber - second.pageNumber ||
      first.rect.y - second.rect.y ||
      first.rect.x - second.rect.x,
  );

  return (
    <article className={`document-field-row${expanded ? ' document-field-row--expanded' : ''}`}>
      <button
        className="document-field-row__summary"
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => onToggleExpanded(field.id)}
      >
        <span className="field-status-dot" aria-label="Da acquisire" />
        <span className="field-row-name" title={definition.name}>{definition.name}</span>
        <span className="field-row-value" title={valueText}>{valueText}</span>
        <span className="field-row-meta">{formatFieldDefinitionMeta(definition)}</span>
        <span className="field-row-pages">{formatPages(regions)}</span>
        <span className="field-row-areas">{areaText}</span>
        <ChevronDown className="field-row-chevron" aria-hidden="true" size={18} />
      </button>
      {expanded ? (
        <div className="document-field-row__details" id={panelId}>
          <div className="field-detail-grid">
            <div>
              <span>Nome</span>
              <strong>{definition.name}</strong>
            </div>
            <div>
              <span>Struttura</span>
              <strong>{fieldKindLabels[definition.kind]}</strong>
            </div>
            <div>
              <span>Formato</span>
              <strong>{definition.valueType ? scalarValueTypeLabels[definition.valueType] : 'Definizione colonne successiva'}</strong>
            </div>
            <div>
              <span>Stato</span>
              <strong>{valueStatus}</strong>
            </div>
            <div>
              <span>Dati</span>
              <strong>{persistenceStatus}</strong>
            </div>
          </div>
          {definition.kind === 'single' ? (
            <label className="field-value-editor">
              <span>Valore</span>
              <input
                value={value?.editedValue ?? ''}
                onChange={(event) => onEditValue(field.id, event.target.value)}
                placeholder={value?.status === 'empty' ? 'Nessun testo trovato' : 'Valore da leggere'}
              />
            </label>
          ) : (
            <p className="field-editor-note field-editor-note--compact">
              Estrazione non ancora disponibile per questo tipo di campo.
            </p>
          )}
          <div className="field-area-list field-area-list--compact" aria-label={`Aree di ${definition.name}`}>
            {sortedRegions.map((region, index) => (
              <button
                className={`field-area-chip${region.id === selectedRegionId ? ' field-area-chip--selected' : ''}`}
                key={region.id}
                type="button"
                onClick={() => onSelectRegion(region.id)}
              >
                Seleziona area {index + 1} · P.{region.pageNumber}
              </button>
            ))}
          </div>
          <div className="document-field-actions">
            <button className="link-action" type="button" onClick={() => sortedRegions[0] && onSelectRegion(sortedRegions[0].id)}>
              Seleziona area
            </button>
            <button className="link-action" type="button" onClick={() => onAddArea(field.id)}>
              Aggiungi area
            </button>
            <button className="link-action" type="button" onClick={() => onChangeField(field.id)}>
              Cambia campo
            </button>
            <button className="link-action" type="button" onClick={() => onEditFormat(field.id)}>
              Modifica formato
            </button>
            {selectedRegionBelongsToField ? (
              <button className="link-action link-action--danger" type="button" onClick={() => onDeleteRegion(selectedRegionId!)}>
                Elimina area
              </button>
            ) : null}
            <button className="link-action link-action--danger" type="button" onClick={() => onDeleteField(field.id)}>
              Elimina campo
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function valueStatusLabel(value: DocumentFieldValue | undefined) {
  if (!value || value.status === 'idle') return 'Da leggere';
  if (value.status === 'reading') return 'Lettura campi...';
  if (value.status === 'empty') return 'Nessun testo trovato';
  if (value.status === 'error') return 'Errore di lettura';
  return value.source === 'manual' ? 'Corretto manualmente' : 'Letto dal PDF';
}
