import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { DocumentOverlay } from './overlays/DocumentOverlay';
import type { DocumentRegion, NormalizedRect } from './documentGeometry';

type PdfPageCanvasProps = {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  pageCount: number;
  scale: number;
  regions: DocumentRegion[];
  selectedRegionId: string | null;
  drawingMode: boolean;
  onCreateRegion: (pageNumber: number, rect: NormalizedRect) => void;
  onSelectRegion: (id: string | null) => void;
  onChangeRegion: (id: string, rect: NormalizedRect) => void;
  onFinishDrawing: () => void;
};

export function PdfPageCanvas({
  pdf,
  pageNumber,
  pageCount,
  scale,
  regions,
  selectedRegionId,
  drawingMode,
  onCreateRegion,
  onSelectRegion,
  onChangeRegion,
  onFinishDrawing,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [renderError, setRenderError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let page: PDFPageProxy | null = null;

    const render = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        setRenderError('');
        renderTaskRef.current?.cancel();
        page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error('Canvas 2D non disponibile');
        }

        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        const task = page.render({
          canvasContext: context,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        renderTaskRef.current = task;
        await task.promise;
      } catch (error) {
        if (!cancelled && !isRenderCancelled(error)) {
          console.error('Errore rendering pagina PDF', error);
          setRenderError('Non è stato possibile renderizzare questa pagina.');
        }
      } finally {
        if (!cancelled) {
          renderTaskRef.current = null;
        }
        page?.cleanup();
      }
    };

    void render();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [pdf, pageNumber, scale]);

  return (
    <article className="real-page" aria-label={`Pagina ${pageNumber} di ${pageCount}`}>
      <div className="real-page__label">Pagina {pageNumber} di {pageCount}</div>
      <div className="page-surface">
        <canvas ref={canvasRef} />
        <DocumentOverlay
          pageNumber={pageNumber}
          regions={regions}
          selectedRegionId={selectedRegionId}
          drawingMode={drawingMode}
          onCreateRegion={onCreateRegion}
          onSelectRegion={onSelectRegion}
          onChangeRegion={onChangeRegion}
          onFinishDrawing={onFinishDrawing}
        />
      </div>
      {renderError ? <p className="viewer-error viewer-error--page">{renderError}</p> : null}
    </article>
  );
}

function isRenderCancelled(error: unknown) {
  return error instanceof Error && error.name === 'RenderingCancelledException';
}
