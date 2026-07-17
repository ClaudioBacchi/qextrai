import { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfPageCanvas } from './PdfPageCanvas';
import type { DocumentRegion, NormalizedRect } from './documentGeometry';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

type PdfViewerProps = {
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
};

export function PdfViewer({
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
}: PdfViewerProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('Caricamento del PDF...');

  useEffect(() => {
    let cancelled = false;
    let task: pdfjsLib.PDFDocumentLoadingTask | null = null;

    const loadPdf = async () => {
      setPdf(null);
      setStatus('loading');
      setMessage('Caricamento del PDF...');
      onBaseWidthChange(null);

      try {
        const buffer = await file.arrayBuffer();
        if (cancelled) return;

        task = pdfjsLib.getDocument({
          data: new Uint8Array(buffer),
          useWorkerFetch: false,
          isEvalSupported: false,
        });

        const loadedPdf = await task.promise;
        if (cancelled) {
          await loadedPdf.destroy();
          return;
        }

        const firstPage = await loadedPdf.getPage(1);
        const firstViewport = firstPage.getViewport({ scale: 1 });
        firstPage.cleanup();
        onBaseWidthChange(firstViewport.width);

        setPdf(loadedPdf);
        setStatus('ready');
      } catch (error) {
        if (!cancelled) {
          console.error('Errore apertura PDF', error);
          setStatus('error');
          setMessage(messageForPdfError(error));
          onBaseWidthChange(null);
        }
      }
    };

    void loadPdf();

    return () => {
      cancelled = true;
      void task?.destroy();
      setPdf((currentPdf) => {
        void currentPdf?.destroy();
        return null;
      });
    };
  }, [file, onBaseWidthChange]);

  if (status === 'loading') {
    return <div className="viewer-state" role="status">{message}</div>;
  }

  if (status === 'error' || !pdf) {
    return <div className="viewer-state viewer-state--error">{message}</div>;
  }

  return (
    <div className="real-pages">
      {Array.from({ length: pdf.numPages }, (_, index) => (
        <PdfPageCanvas
          key={`${file.name}-${file.lastModified}-${index + 1}`}
          pdf={pdf}
          pageNumber={index + 1}
          pageCount={pdf.numPages}
          scale={scale}
          regions={regions.filter((region) => region.pageNumber === index + 1)}
          selectedRegionId={selectedRegionId}
          drawingMode={drawingMode}
          onCreateRegion={onCreateRegion}
          onSelectRegion={onSelectRegion}
          onChangeRegion={onChangeRegion}
          onFinishDrawing={onFinishDrawing}
        />
      ))}
    </div>
  );
}

function messageForPdfError(error: unknown) {
  if (error instanceof Error && error.name === 'PasswordException') {
    return 'Questo PDF è protetto da password e non è supportato in questa fase.';
  }
  return 'Non è stato possibile aprire questo PDF.';
}
