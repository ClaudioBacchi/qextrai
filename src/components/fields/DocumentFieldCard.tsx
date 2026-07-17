import { fieldKindLabels, type DocumentField, type FieldDefinition } from '../../domain/fieldTypes';
import type { DocumentRegion } from '../document/documentGeometry';

type DocumentFieldCardProps = {
  field: DocumentField;
  definition: FieldDefinition;
  regions: DocumentRegion[];
  selectedRegionId: string | null;
  onSelectRegion: (id: string) => void;
  onAddArea: (fieldId: string) => void;
  onChangeField: (fieldId: string) => void;
  onDeleteRegion: (regionId: string) => void;
  onDeleteField: (fieldId: string) => void;
};

export function DocumentFieldCard({
  field,
  definition,
  regions,
  selectedRegionId,
  onSelectRegion,
  onAddArea,
  onChangeField,
  onDeleteRegion,
  onDeleteField,
}: DocumentFieldCardProps) {
  const pages = [...new Set(regions.map((region) => region.pageNumber))].sort((a, b) => a - b);
  const areaText = regions.length === 1 ? '1 area' : `${regions.length} aree`;

  return (
    <article className="document-field-card">
      <header>
        <div>
          <h2>{definition.name}</h2>
          <span className="field-kind-badge">{fieldKindLabels[definition.kind]}</span>
        </div>
        <span className="field-value-missing">Valore non ancora acquisito</span>
      </header>
      <p>
        {areaText} - Pagine {pages.join(', ')}
      </p>
      <div className="field-area-list" aria-label={`Aree di ${definition.name}`}>
        {regions.map((region, index) => (
          <button
            className={`field-area-chip${region.id === selectedRegionId ? ' field-area-chip--selected' : ''}`}
            key={region.id}
            type="button"
            onClick={() => onSelectRegion(region.id)}
          >
            Area {index + 1} - Pagina {region.pageNumber}
          </button>
        ))}
      </div>
      <div className="document-field-actions">
        <button className="button button--soft button--compact" type="button" onClick={() => onAddArea(field.id)}>
          Aggiungi area
        </button>
        <button className="button button--soft button--compact" type="button" onClick={() => onChangeField(field.id)}>
          Cambia campo
        </button>
        {selectedRegionId && field.regionIds.includes(selectedRegionId) ? (
          <button className="button button--secondary button--compact" type="button" onClick={() => onDeleteRegion(selectedRegionId)}>
            Elimina area
          </button>
        ) : null}
        <button className="button button--danger button--compact" type="button" onClick={() => onDeleteField(field.id)}>
          Elimina campo
        </button>
      </div>
    </article>
  );
}
