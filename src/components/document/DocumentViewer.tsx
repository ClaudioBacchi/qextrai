import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LocalDocument } from '../../app/documentTypes';
import { ImageViewer } from './ImageViewer';
import { ViewerToolbar } from './ViewerToolbar';
import type { DocumentRegion, NormalizedRect } from './documentGeometry';

type DocumentViewerProps = {
  document: LocalDocument | null;
  regions: DocumentRegion[];
  selectedRegionId: string | null;
  drawingMode: boolean;
  onCreateRegion: (pageNumber: number, rect: NormalizedRect) => void;
  onSelectRegion: (id: string | null) => void;
  onChangeRegion: (id: string, rect: NormalizedRect) => void;
  onFinishDrawing: () => void;
};

const minScale = 0.4;
const maxScale = 2.5;
const zoomStep = 0.1;
const PdfViewer = lazy(() => import('./PdfViewer').then((module) => ({ default: module.PdfViewer })));

export function DocumentViewer({
  document,
  regions,
  selectedRegionId,
  drawingMode,
  onCreateRegion,
  onSelectRegion,
  onChangeRegion,
  onFinishDrawing,
}: DocumentViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState(true);
  const [baseWidth, setBaseWidth] = useState<number | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);

  const fitScale = useMemo(() => {
    if (!baseWidth || !availableWidth) return 1;
    return clamp((availableWidth - 52) / baseWidth, minScale, maxScale);
  }, [availableWidth, baseWidth]);

  useEffect(() => {
    setFitMode(true);
    setScale(1);
    setBaseWidth(null);
  }, [document]);

  useEffect(() => {
    if (fitMode) {
      setScale(fitScale);
    }
  }, [fitMode, fitScale]);

  useEffect(() => {
    if (!selectedRegionId) return;
    const selected = scrollRef.current?.querySelector(`[data-region-id="${selectedRegionId}"]`);
    selected?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [selectedRegionId]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const updateWidth = () => {
      setAvailableWidth(element.clientWidth);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleBaseWidthChange = useCallback((width: number | null) => {
    setBaseWidth(width);
  }, []);

  const zoomOut = () => {
    setFitMode(false);
    setScale((current) => clamp(roundScale(current - zoomStep), minScale, maxScale));
  };

  const zoomIn = () => {
    setFitMode(false);
    setScale((current) => clamp(roundScale(current + zoomStep), minScale, maxScale));
  };

  const fitWidth = () => {
    setFitMode(true);
    setScale(fitScale);
  };

  return (
    <section className="document-pane" aria-label="Anteprima documento">
      <ViewerToolbar
        scale={scale}
        canZoomOut={scale > minScale}
        canZoomIn={scale < maxScale}
        isFitMode={fitMode}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onFitWidth={fitWidth}
      />
      <div className="document-scroll" ref={scrollRef}>
        {!document ? (
          <div className="viewer-state">Apri un documento per visualizzarlo.</div>
        ) : document.viewType === 'pdf' ? (
          <Suspense fallback={<div className="viewer-state" role="status">Preparazione del visualizzatore PDF...</div>}>
            <PdfViewer
              file={document.file}
              scale={scale}
              onBaseWidthChange={handleBaseWidthChange}
              regions={regions}
              selectedRegionId={selectedRegionId}
              drawingMode={drawingMode}
              onCreateRegion={onCreateRegion}
              onSelectRegion={onSelectRegion}
              onChangeRegion={onChangeRegion}
              onFinishDrawing={onFinishDrawing}
            />
          </Suspense>
        ) : document.viewType === 'image' ? (
          <ImageViewer
            file={document.file}
            scale={scale}
            onBaseWidthChange={handleBaseWidthChange}
            regions={regions}
            selectedRegionId={selectedRegionId}
            drawingMode={drawingMode}
            onCreateRegion={onCreateRegion}
            onSelectRegion={onSelectRegion}
            onChangeRegion={onChangeRegion}
            onFinishDrawing={onFinishDrawing}
          />
        ) : (
          <div className="viewer-state viewer-state--error">
            Tipo di file non supportato. Apri un PDF, JPG o PNG.
          </div>
        )}
      </div>
    </section>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundScale(value: number) {
  return Math.round(value * 10) / 10;
}
