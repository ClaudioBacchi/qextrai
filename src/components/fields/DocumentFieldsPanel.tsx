import type { ReactNode } from 'react';
import { Crosshair, FilePlus2, Search, ScanSearch, TextSearch } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DocumentRegion } from '../document/documentGeometry';
import type { DocumentField, FieldDefinition } from '../../domain/fieldTypes';
import {
  countFieldsByKind,
  filterFieldItems,
  firstRegionInDocument,
  sortFieldItemsByDocumentPosition,
  type FieldFilter,
} from '../../domain/documentFieldList';
import { isDraftDefinitionMode, shouldShowDocumentFieldList, shouldShowDocumentTools } from '../../domain/fieldEditorUi';
import { DocumentFieldCard } from './DocumentFieldCard';
import { FieldDefinitionEditor, type FieldEditorSave } from './FieldDefinitionEditor';
import { FieldFormatEditor, type FieldFormatSave } from './FieldFormatEditor';
import type { FieldCatalogStatus } from '../../domain/fieldCatalogRepository';
import type { DocumentFieldValues } from '../../domain/documentFieldValues';

type EditorState =
  | { type: 'region'; regionId: string }
  | { type: 'change'; fieldId: string }
  | { type: 'format'; fieldId: string }
  | null;

type DocumentFieldsPanelProps = {
  catalog: FieldDefinition[];
  fields: DocumentField[];
  regions: DocumentRegion[];
  selectedRegionId: string | null;
  drawingMode: boolean;
  drawingMessage: string;
  canAddRegion: boolean;
  catalogStatus: FieldCatalogStatus;
  catalogMessage: string;
  editorError: string;
  templateBar: ReactNode;
  fieldValues: DocumentFieldValues;
  extractionMessage: string;
  extractionBusy: boolean;
  canExtractData: boolean;
  onExtractData: () => void;
  onEditFieldValue: (fieldId: string, value: string) => void;
  editor: EditorState;
  onToggleDrawing: () => void;
  onSelectRegion: (id: string) => void;
  onAddArea: (fieldId: string) => void;
  onChangeField: (fieldId: string) => void;
  onEditFormat: (fieldId: string) => void;
  onDeleteRegion: (regionId: string) => void;
  onDeleteField: (fieldId: string) => void;
  onCancelEditor: () => void;
  onSaveEditor: (data: FieldEditorSave) => void;
  onSaveFormat: (fieldId: string, data: FieldFormatSave) => void;
};

const unavailableTitle = 'Funzione non ancora disponibile';
const filters: Array<{ id: FieldFilter; label: string }> = [
  { id: 'all', label: 'Tutti' },
  { id: 'single', label: 'Singoli' },
  { id: 'list', label: 'Elenchi' },
  { id: 'table', label: 'Tabelle' },
];

export function DocumentFieldsPanel({
  catalog,
  fields,
  regions,
  selectedRegionId,
  drawingMode,
  drawingMessage,
  canAddRegion,
  catalogStatus,
  catalogMessage,
  editorError,
  templateBar,
  fieldValues,
  extractionMessage,
  extractionBusy,
  canExtractData,
  onExtractData,
  onEditFieldValue,
  editor,
  onToggleDrawing,
  onSelectRegion,
  onAddArea,
  onChangeField,
  onEditFormat,
  onDeleteRegion,
  onDeleteField,
  onCancelEditor,
  onSaveEditor,
  onSaveFormat,
}: DocumentFieldsPanelProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FieldFilter>('all');
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  const fieldCountText = fields.length === 0 ? '0 campi' : fields.length === 1 ? '1 campo' : `${fields.length} campi`;
  const areaCount = fields.reduce((total, field) => total + field.regionIds.length, 0);
  const footerText = areaCount > fields.length && fields.length > 0 ? `${fieldCountText} - ${areaCount} aree` : fieldCountText;
  const listItems = useMemo(
    () =>
      sortFieldItemsByDocumentPosition(
        fields.flatMap((field) => {
          const definition = catalog.find((item) => item.id === field.definitionId);
          if (!definition) return [];
          return [{ field, definition, regions: regions.filter((region) => field.regionIds.includes(region.id)) }];
        }),
      ),
    [catalog, fields, regions],
  );
  const filteredItems = useMemo(() => filterFieldItems(listItems, query, filter), [filter, listItems, query]);
  const counts = countFieldsByKind(listItems.map((item) => item.definition));
  const formatEditorField = editor?.type === 'format' ? fields.find((field) => field.id === editor.fieldId) : null;
  const formatEditorDefinition = formatEditorField
    ? catalog.find((definition) => definition.id === formatEditorField.definitionId)
    : null;
  const isDefiningDraft = isDraftDefinitionMode(editor);
  const showDocumentTools = shouldShowDocumentTools(editor);
  const showDocumentFieldList = shouldShowDocumentFieldList(editor);
  const catalogAllowsEditing = catalogStatus === 'ready' || catalogStatus === 'temporary';
  const addFieldTitle = !canAddRegion
    ? 'Apri un documento prima di aggiungere un campo'
    : !catalogAllowsEditing
      ? 'Catalogo condiviso non disponibile'
      : undefined;

  const toggleExpanded = (fieldId: string) => {
    const item = listItems.find((current) => current.field.id === fieldId);
    setExpandedFieldId((current) => (current === fieldId ? null : fieldId));
    if (!item) return;
    const hasSelectedRegion = Boolean(selectedRegionId && item.field.regionIds.includes(selectedRegionId));
    if (!hasSelectedRegion) {
      const first = firstRegionInDocument(item.regions);
      if (first) onSelectRegion(first.id);
    }
  };

  const selectRegion = (regionId: string) => {
    onSelectRegion(regionId);
  };

  return (
    <section className="fields-pane" aria-label="Campi del documento">
      <div className="fields-pane__header">
        <div className="fields-pane__topline">
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
              className="button button--secondary button--compact"
              type="button"
              disabled={!canExtractData || extractionBusy}
              onClick={onExtractData}
            >
              <TextSearch aria-hidden="true" size={16} />
              {extractionBusy ? 'Lettura campi...' : 'Estrai dati'}
            </button>
            <button
              className={`button button--secondary${drawingMode ? ' button--active' : ''}`}
              type="button"
              disabled={!canAddRegion || isDefiningDraft || !catalogAllowsEditing}
              title={addFieldTitle}
              aria-pressed={drawingMode}
              onClick={onToggleDrawing}
            >
              <FilePlus2 aria-hidden="true" size={18} />
              {drawingMode ? 'Annulla disegno' : 'Aggiungi campo'}
            </button>
          </div>
        </div>
        {showDocumentTools ? (
          <div className="fields-tools">
            <label className="field-search">
              <span>Cerca campo</span>
              <div className="input-like">
                <Search aria-hidden="true" size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca campo" />
              </div>
            </label>
            <div className="field-filters" aria-label="Filtra campi">
              {filters.map((item) => {
                const count = counts[item.id as keyof typeof counts];
                return (
                  <button
                    key={item.id}
                    className={`field-filter${filter === item.id ? ' field-filter--active' : ''}`}
                    type="button"
                    aria-pressed={filter === item.id}
                    onClick={() => setFilter(item.id)}
                  >
                    {item.label} {count}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      <div className="fields-list">
        {drawingMode && !isDefiningDraft ? (
          <div className="drawing-callout" role="status">
            <Crosshair aria-hidden="true" size={22} />
            <strong>{drawingMessage}</strong>
            <span>Premi Esc per annullare. Tieni premuto e trascina sulla pagina.</span>
          </div>
        ) : null}
        {catalogStatus !== 'ready' && catalogStatus !== 'temporary' ? (
          <div className="field-editor-note" role="status">
            {catalogStatus === 'loading' || catalogStatus === 'refreshing'
              ? 'Caricamento catalogo...'
              : catalogMessage || 'Catalogo non disponibile.'}
          </div>
        ) : null}
        {extractionMessage ? (
          <div className="field-editor-note" role="status">
            {extractionMessage}
          </div>
        ) : null}
        {editor && editor.type !== 'format' ? (
          <FieldDefinitionEditor
            catalog={catalog}
            usedDefinitionIds={fields
              .filter((field) => editor.type !== 'change' || field.id !== editor.fieldId)
              .map((field) => field.definitionId)}
            submitLabel={editor.type === 'change' ? 'Salva associazione' : undefined}
            errorMessage={editorError}
            onCancel={onCancelEditor}
            onSave={onSaveEditor}
          />
        ) : null}
        {editor?.type === 'format' && formatEditorField && formatEditorDefinition ? (
          <FieldFormatEditor
            definition={formatEditorDefinition}
            onCancel={onCancelEditor}
            onSave={(data) => onSaveFormat(formatEditorField.id, data)}
          />
        ) : null}
        {fields.length === 0 && !editor ? (
          <div className="empty-state">
            <Crosshair aria-hidden="true" size={44} />
            <h2>Nessun campo definito</h2>
            <p>Premi Aggiungi campo e disegna un box sopra il dato che vuoi acquisire.</p>
          </div>
        ) : null}
        {showDocumentFieldList && fields.length > 0 && filteredItems.length === 0 ? (
          <div className="empty-state empty-state--compact">
            <Crosshair aria-hidden="true" size={34} />
            <h2>Nessun campo corrisponde alla ricerca.</h2>
          </div>
        ) : null}
        {showDocumentFieldList ? (
          <div className="document-fields-list" aria-label="Campi presenti nel documento">
            {filteredItems.map(({ field, definition, regions }) => {
            return (
              <DocumentFieldCard
                key={field.id}
                field={field}
                definition={definition}
                value={fieldValues[field.id]}
                regions={regions}
                selectedRegionId={selectedRegionId}
                expanded={expandedFieldId === field.id}
                onToggleExpanded={toggleExpanded}
                onSelectRegion={selectRegion}
                onAddArea={onAddArea}
                onChangeField={onChangeField}
                onEditFormat={(fieldId) => {
                  setExpandedFieldId(fieldId);
                  onEditFormat(fieldId);
                }}
                onEditValue={onEditFieldValue}
                onDeleteRegion={onDeleteRegion}
                onDeleteField={onDeleteField}
              />
            );
            })}
          </div>
        ) : null}
      </div>
      <footer className="fields-footer">
        <span>{footerText}</span>
        {templateBar}
      </footer>
    </section>
  );
}

export type { EditorState };
