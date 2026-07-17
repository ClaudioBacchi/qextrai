import { CheckCircle2, Crosshair, FilePlus2, ScanSearch } from 'lucide-react';
import type { DocumentRegion } from '../document/documentGeometry';
import type { DocumentField, FieldDefinition } from '../../domain/fieldTypes';
import { DocumentFieldCard } from './DocumentFieldCard';
import { FieldDefinitionEditor, type FieldEditorSave } from './FieldDefinitionEditor';

type EditorState =
  | { type: 'region'; regionId: string }
  | { type: 'change'; fieldId: string }
  | null;

type DocumentFieldsPanelProps = {
  catalog: FieldDefinition[];
  fields: DocumentField[];
  regions: DocumentRegion[];
  selectedRegionId: string | null;
  drawingMode: boolean;
  drawingMessage: string;
  canAddRegion: boolean;
  editor: EditorState;
  onToggleDrawing: () => void;
  onSelectRegion: (id: string) => void;
  onAddArea: (fieldId: string) => void;
  onChangeField: (fieldId: string) => void;
  onDeleteRegion: (regionId: string) => void;
  onDeleteField: (fieldId: string) => void;
  onCancelEditor: () => void;
  onSaveEditor: (data: FieldEditorSave) => void;
};

const unavailableTitle = 'Funzione non ancora disponibile';

export function DocumentFieldsPanel({
  catalog,
  fields,
  regions,
  selectedRegionId,
  drawingMode,
  drawingMessage,
  canAddRegion,
  editor,
  onToggleDrawing,
  onSelectRegion,
  onAddArea,
  onChangeField,
  onDeleteRegion,
  onDeleteField,
  onCancelEditor,
  onSaveEditor,
}: DocumentFieldsPanelProps) {
  const fieldCountText = fields.length === 0 ? '0 campi' : fields.length === 1 ? '1 campo' : `${fields.length} campi`;
  const areaCount = fields.reduce((total, field) => total + field.regionIds.length, 0);
  const footerText = areaCount > fields.length && fields.length > 0 ? `${fieldCountText} - ${areaCount} aree` : fieldCountText;
  return (
    <section className="fields-pane" aria-label="Campi del documento">
      <div className="fields-pane__header">
        <div>
          <h1>Campi del documento</h1>
          <p>Controlla i valori proposti e verifica la loro origine.</p>
        </div>
        <div className="fields-actions">
          <button className="button button--primary" type="button" disabled title={unavailableTitle}>
            <ScanSearch aria-hidden="true" size={18} />
            Suggerisci campi
          </button>
          <button
            className={`button button--secondary${drawingMode ? ' button--active' : ''}`}
            type="button"
            disabled={!canAddRegion}
            title={canAddRegion ? undefined : 'Apri un documento prima di aggiungere un campo'}
            aria-pressed={drawingMode}
            onClick={onToggleDrawing}
          >
            <FilePlus2 aria-hidden="true" size={18} />
            {drawingMode ? 'Annulla disegno' : 'Aggiungi campo'}
          </button>
        </div>
      </div>
      <div className="fields-list">
        {drawingMode ? (
          <div className="drawing-callout" role="status">
            <Crosshair aria-hidden="true" size={22} />
            <strong>{drawingMessage}</strong>
            <span>Premi Esc per annullare. Tieni premuto e trascina sulla pagina.</span>
          </div>
        ) : null}
        {editor ? (
          <FieldDefinitionEditor
            catalog={catalog}
            usedDefinitionIds={fields
              .filter((field) => editor.type !== 'change' || field.id !== editor.fieldId)
              .map((field) => field.definitionId)}
            submitLabel={editor.type === 'change' ? 'Salva associazione' : undefined}
            onCancel={onCancelEditor}
            onSave={onSaveEditor}
          />
        ) : null}
        {fields.length === 0 && !editor ? (
          <div className="empty-state">
            <Crosshair aria-hidden="true" size={44} />
            <h2>Nessun campo definito</h2>
            <p>Premi Aggiungi campo e disegna un box sopra il dato che vuoi acquisire.</p>
          </div>
        ) : null}
        <div className="document-fields-list">
          {fields.map((field) => {
            const definition = catalog.find((item) => item.id === field.definitionId);
            if (!definition) return null;
            return (
              <DocumentFieldCard
                key={field.id}
                field={field}
                definition={definition}
                regions={regions.filter((region) => field.regionIds.includes(region.id))}
                selectedRegionId={selectedRegionId}
                onSelectRegion={onSelectRegion}
                onAddArea={onAddArea}
                onChangeField={onChangeField}
                onDeleteRegion={onDeleteRegion}
                onDeleteField={onDeleteField}
              />
            );
          })}
        </div>
      </div>
      <footer className="fields-footer">
        <span>{footerText}</span>
        <button className="button button--primary" type="button" disabled title={unavailableTitle}>
          <CheckCircle2 aria-hidden="true" size={18} />
          Conferma documento
        </button>
      </footer>
    </section>
  );
}

export type { EditorState };
