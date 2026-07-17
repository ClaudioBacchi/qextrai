import type { PointerEvent } from 'react';
import { useRef, useState } from 'react';
import { DocumentRegionBox } from './DocumentRegionBox';
import {
  cssPointToNormalized,
  moveRect,
  normalizedRectToCss,
  rectFromCssPoints,
  resizeRect,
  type CssPoint,
  type DocumentRegion,
  type NormalizedRect,
  type ResizeHandlePosition,
} from '../documentGeometry';

type DocumentOverlayProps = {
  pageNumber: number;
  regions: DocumentRegion[];
  selectedRegionId: string | null;
  drawingMode: boolean;
  onCreateRegion: (pageNumber: number, rect: NormalizedRect) => void;
  onSelectRegion: (id: string | null) => void;
  onChangeRegion: (id: string, rect: NormalizedRect) => void;
  onFinishDrawing: () => void;
};

type DragState =
  | {
      type: 'draw';
      pointerId: number;
      start: CssPoint;
      current: CssPoint;
    }
  | {
      type: 'move';
      pointerId: number;
      region: DocumentRegion;
      start: CssPoint;
    }
  | {
      type: 'resize';
      pointerId: number;
      region: DocumentRegion;
      handle: ResizeHandlePosition;
    };

export function DocumentOverlay({
  pageNumber,
  regions,
  selectedRegionId,
  drawingMode,
  onCreateRegion,
  onSelectRegion,
  onChangeRegion,
  onFinishDrawing,
}: DocumentOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const pointFromEvent = (event: PointerEvent<HTMLElement>) => {
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  };

  const pageSize = () => {
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return { width: bounds.width, height: bounds.height };
  };

  const startDraw = (event: PointerEvent<HTMLDivElement>) => {
    if (!drawingMode) return;
    const start = pointFromEvent(event);
    if (!start) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ type: 'draw', pointerId: event.pointerId, start, current: start });
  };

  const startMove = (region: DocumentRegion, event: PointerEvent<HTMLDivElement>) => {
    if (drawingMode) return;
    const start = pointFromEvent(event);
    if (!start) return;
    event.preventDefault();
    event.stopPropagation();
    overlayRef.current?.setPointerCapture(event.pointerId);
    onSelectRegion(region.id);
    setDragState({ type: 'move', pointerId: event.pointerId, region, start });
  };

  const startResize = (
    region: DocumentRegion,
    handle: ResizeHandlePosition,
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    if (drawingMode) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    overlayRef.current?.setPointerCapture(event.pointerId);
    onSelectRegion(region.id);
    setDragState({ type: 'resize', pointerId: event.pointerId, region, handle });
  };

  const movePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const point = pointFromEvent(event);
    const size = pageSize();
    if (!point || !size) return;

    if (dragState.type === 'draw') {
      setDragState({ ...dragState, current: point });
      return;
    }

    const current = cssPointToNormalized(point, size);
    if (dragState.type === 'move') {
      const start = cssPointToNormalized(dragState.start, size);
      onChangeRegion(
        dragState.region.id,
        moveRect(dragState.region.rect, {
          x: current.x - start.x,
          y: current.y - start.y,
        }),
      );
      return;
    }

    onChangeRegion(
      dragState.region.id,
      resizeRect(dragState.region.rect, dragState.handle, current, size),
    );
  };

  const endPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const size = pageSize();

    if (dragState.type === 'draw' && size) {
      const rect = rectFromCssPoints(dragState.start, dragState.current, size);
      if (rect) {
        onCreateRegion(pageNumber, rect);
      }
      onFinishDrawing();
    }

    setDragState(null);
  };

  const previewRect =
    dragState?.type === 'draw' && pageSize()
      ? rectFromCssPoints(dragState.start, dragState.current, pageSize()!, 1)
      : null;

  return (
    <div
      ref={overlayRef}
      className={`document-overlay${drawingMode ? ' document-overlay--drawing' : ''}`}
      onPointerDown={startDraw}
      onPointerMove={movePointer}
      onPointerUp={endPointer}
      onPointerCancel={() => setDragState(null)}
      onClick={(event) => {
        if (!drawingMode && event.target === event.currentTarget) {
          onSelectRegion(null);
        }
      }}
    >
      {regions.map((region, index) => (
        <DocumentRegionBox
          key={region.id}
          region={region}
          index={index}
          selected={selectedRegionId === region.id}
          onSelect={onSelectRegion}
          onMoveStart={startMove}
          onResizeStart={startResize}
        />
      ))}
      {previewRect ? <PreviewBox rect={previewRect} /> : null}
    </div>
  );
}

function PreviewBox({ rect }: { rect: NormalizedRect }) {
  const cssRect = normalizedRectToCss(rect, { width: 100, height: 100 });
  return (
    <div
      className="document-region-preview"
      style={{
        left: `${cssRect.x}%`,
        top: `${cssRect.y}%`,
        width: `${cssRect.width}%`,
        height: `${cssRect.height}%`,
      }}
    />
  );
}
