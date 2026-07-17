import { FileText, UploadCloud } from 'lucide-react';
import { DragEvent, useRef, useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { StatusBadge } from '../components/StatusBadge';

type HomePageProps = {
  onOpenDocument: (file: File) => void;
  onOpenPreferences: () => void;
};

const acceptedTypes = '.pdf,.jpg,.jpeg,.png';

export function HomePage({ onOpenDocument, onOpenPreferences }: HomePageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file?: File) => {
    if (file) {
      onOpenDocument(file);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files[0]);
  };

  return (
    <>
      <AppHeader onOpenPreferences={onOpenPreferences} />
      <main className="home-page">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero__copy">
            <p className="eyebrow">Dal documento al dato, con evidenza</p>
            <h1 id="home-title">
              Estrai ciò che serve.
              <span>Controlla da dove arriva.</span>
            </h1>
            <p className="home-hero__text">
              Apri un documento, lascia che Qextrai suggerisca i campi e conferma soltanto
              quelli utili. Ogni valore resta collegato alla sua origine.
            </p>
            <div className="flow-steps" aria-label="Percorso principale">
              <span>1 Apri</span>
              <b aria-hidden="true">→</b>
              <span>2 Suggerisci</span>
              <b aria-hidden="true">→</b>
              <span>3 Verifica</span>
            </div>
          </div>

          <aside className="open-card" aria-labelledby="open-document-title">
            <div className="card-heading">
              <p className="eyebrow">Nuovo documento</p>
              <StatusBadge tone="neutral">Controllo locale</StatusBadge>
            </div>
            <h2 id="open-document-title">Apri un documento</h2>
            <div
              className={`dropzone${isDragging ? ' dropzone--active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              aria-label="Seleziona o trascina un documento"
            >
              <FileText aria-hidden="true" size={42} />
              <strong>Trascina qui il documento</strong>
              <span>oppure fai clic per selezionarlo</span>
              <small>PDF, JPG e PNG</small>
            </div>
            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              accept={acceptedTypes}
              onChange={(event) => handleFile(event.target.files?.[0])}
              aria-label="Scegli documento"
            />
            <button className="button button--primary button--wide" type="button" onClick={() => inputRef.current?.click()}>
              <UploadCloud aria-hidden="true" size={20} />
              Apri il documento
            </button>
          </aside>
        </section>
      </main>
    </>
  );
}
