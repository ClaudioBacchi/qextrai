import { CheckCircle2, Crosshair, FilePlus2, ScanSearch, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LocalDocument } from '../app/documentTypes';
import { AppHeader } from '../components/AppHeader';
import { DocumentViewer } from '../components/document/DocumentViewer';
import type { DocumentRegion, NormalizedRect } from '../components/document/documentGeometry';

type WorkspacePageProps = {
  document: LocalDocument | null;
  regions: DocumentRegion[];
  selectedRegionId: string | null;
  onRegionsChange: (regions: DocumentRegion[]) => void;
  onSelectRegion: (id: string | null) => void;
  onReplaceDocument: (file: File) => void;
  onBack: () => void;
  onOpenPreferences: () => void;
};

const acceptedTypes = '.pdf,.jpg,.jpeg,.png';
const unavailableTitle = 'Funzione non ancora disponibile';

export function WorkspacePage({
  document,
  regions,
  selectedRegionId,
  onRegionsChange,
  onSelectRegion,
  onReplaceDocument,
  onBack,
  onOpenPreferences,
}: WorkspacePageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const canAddRegion = document?.viewType === 'pdf' || document?.viewType === 'image';
  const selectedRegion = regions.find((region) => region.id === selectedRegionId) ?? null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && drawingMode) {
        event.preventDefault();
        setDrawingMode(false);
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedRegionId) {
        if (event.key === 'Backspace' && isEditingText(event.target)) return;
        event.preventDefault();
        deleteSelectedRegion();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawingMode, selectedRegionId, regions]);

  const replaceDocument = (file?: File) => {
    if (file) {
      onReplaceDocument(file);
      setDrawingMode(false);
    }
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const createRegion = (pageNumber: number, rect: NormalizedRect) => {
    const id = makeRegionId();
    onRegionsChange([...regions, { id, pageNumber, rect }]);
    onSelectRegion(id);
  };

  const changeRegion = (id: string, rect: NormalizedRect) => {
    onRegionsChange(regions.map((region) => (region.id === id ? { ...region, rect } : region)));
  };

  const deleteSelectedRegion = () => {
    if (!selectedRegionId) return;
    onRegionsChange(regions.filter((region) => region.id !== selectedRegionId));
    onSelectRegion(null);
  };

  const fieldCountText =
    regions.length === 0 ? '0 campi' : regions.length === 1 ? '1 campo' : `${regions.length} campi`;

  return (
    <>
      <AppHeader
        mode="workspace"
        documentName={document?.name ?? null}
        onBack={onBack}
        onNewDocument={() => inputRef.current?.click()}
        onOpenPreferences={onOpenPreferences}
      />
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept={acceptedTypes}
        onChange={(event) => replaceDocument(event.target.files?.[0])}
        aria-label="Scegli un nuovo documento"
      />
      <main className="workspace" aria-label="Area di lavoro documento">
        <DocumentViewer
          document={document}
          regions={regions}
          selectedRegionId={selectedRegionId}
          drawingMode={drawingMode}
          onCreateRegion={createRegion}
          onSelectRegion={onSelectRegion}
          onChangeRegion={changeRegion}
          onFinishDrawing={() => setDrawingMode(false)}
        />

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
                onClick={() => setDrawingMode((current) => !current)}
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
                <strong>Disegna un box sul documento</strong>
                <span>Tieni premuto il tasto sinistro e trascina intorno al dato. Un click singolo non crea il box. Premi Esc per annullare.</span>
              </div>
            ) : null}

            {regions.length === 0 ? (
              <div className="empty-state">
                <Crosshair aria-hidden="true" size={44} />
                <h2>Nessun campo ancora definito</h2>
                <p>Usa Aggiungi campo, poi tieni premuto e trascina sul documento per disegnare il box.</p>
              </div>
            ) : (
              <div className="region-list" aria-label="Campi da definire">
                {regions.map((region, index) => (
                  <button
                    className={`region-list-item${region.id === selectedRegionId ? ' region-list-item--selected' : ''}`}
                    type="button"
                    key={region.id}
                    onClick={() => onSelectRegion(region.id)}
                  >
                    <span className="region-list-item__number">{index + 1}</span>
                    <span>
                      <strong>Campo {index + 1} da definire</strong>
                      <small>Pagina {region.pageNumber} - Da definire</small>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {selectedRegion ? (
              <aside className="selected-region-panel" aria-label="Campo selezionato">
                <h2>Campo {regions.findIndex((region) => region.id === selectedRegion.id) + 1} da definire</h2>
                <p>Pagina {selectedRegion.pageNumber}</p>
                <p>Nel prossimo passaggio assocerai a questa zona il nome e il tipo del campo.</p>
                <button className="button button--danger" type="button" onClick={deleteSelectedRegion}>
                  <Trash2 aria-hidden="true" size={18} />
                  Elimina selezione
                </button>
              </aside>
            ) : null}
          </div>

          <footer className="fields-footer">
            <span>{fieldCountText}</span>
            <button className="button button--primary" type="button" disabled title={unavailableTitle}>
              <CheckCircle2 aria-hidden="true" size={18} />
              Conferma documento
            </button>
          </footer>
        </section>
      </main>
    </>
  );
}

function makeRegionId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `region-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isEditingText(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || target.isContentEditable;
}
