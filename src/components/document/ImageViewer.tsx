import { useEffect, useState } from 'react';
import type { DocumentRegion, NormalizedRect } from './documentGeometry';
import { DocumentOverlay } from './overlays/DocumentOverlay';

type ImageViewerProps = {
  file: File;
  scale: number;
  onBaseWidthChange: (width: number | null) => void;
  regions: DocumentRegion[];
  selectedRegionId: string | null;
  drawingMode: boolean;
  onCreateRegion: (pageNumber: number, rect: NormalizedRect) => void;
  onSelectRegion: (id: string | null) => void;
  onChangeRegion: (id: string, rect: NormalizedRect) => void;
  onFinishDrawing: () => void;
  onPageCountChange: (pageCount: number | null) => void;
};

export function ImageViewer({
  file,
  scale,
  onBaseWidthChange,
  regions,
  selectedRegionId,
  drawingMode,
  onCreateRegion,
  onSelectRegion,
  onChangeRegion,
  onFinishDrawing,
  onPageCountChange,
}: ImageViewerProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    setError('');
    setNaturalWidth(null);
    onBaseWidthChange(null);
    onPageCountChange(1);

    return () => {
      URL.revokeObjectURL(objectUrl);
      onBaseWidthChange(null);
      onPageCountChange(null);
    };
  }, [file, onBaseWidthChange, onPageCountChange]);

  if (error) {
    return <div className="viewer-state viewer-state--error">{error}</div>;
  }

  return (
    <div className="real-pages">
      <article className="real-page" aria-label="Pagina 1 di 1">
        <div className="real-page__label">Pagina 1 di 1</div>
        {url ? (
          <div className="page-surface">
            <img
              className="image-page"
              src={url}
              alt="Documento selezionato"
              style={naturalWidth ? { width: `${naturalWidth * scale}px` } : undefined}
              draggable={false}
              onLoad={(event) => {
                const image = event.currentTarget;
                setNaturalWidth(image.naturalWidth);
                onBaseWidthChange(image.naturalWidth);
              }}
              onError={(event) => {
                console.error('Errore apertura immagine', event);
                setError('Non è stato possibile aprire questa immagine.');
              }}
            />
            <DocumentOverlay
              pageNumber={1}
              regions={regions.filter((region) => region.pageNumber === 1)}
              selectedRegionId={selectedRegionId}
              drawingMode={drawingMode}
              onCreateRegion={onCreateRegion}
              onSelectRegion={onSelectRegion}
              onChangeRegion={onChangeRegion}
              onFinishDrawing={onFinishDrawing}
            />
          </div>
        ) : null}
      </article>
    </div>
  );
}
