import type { KeyboardEvent, PointerEvent } from 'react';
import { ResizeHandle } from './ResizeHandle';
import type { DocumentRegion, ResizeHandlePosition } from '../documentGeometry';

type DocumentRegionBoxProps = {
  region: DocumentRegion;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onMoveStart: (region: DocumentRegion, event: PointerEvent<HTMLDivElement>) => void;
  onResizeStart: (
    region: DocumentRegion,
    handle: ResizeHandlePosition,
    event: PointerEvent<HTMLButtonElement>,
  ) => void;
};

const handles: ResizeHandlePosition[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function DocumentRegionBox({
  region,
  index,
  selected,
  onSelect,
  onMoveStart,
  onResizeStart,
}: DocumentRegionBoxProps) {
  return (
    <div
      className={`document-region-box${selected ? ' document-region-box--selected' : ''}`}
      role="button"
      tabIndex={0}
      data-region-id={region.id}
      style={{
        left: `${region.rect.x * 100}%`,
        top: `${region.rect.y * 100}%`,
        width: `${region.rect.width * 100}%`,
        height: `${region.rect.height * 100}%`,
      }}
      aria-label={`Campo ${index + 1} da definire, pagina ${region.pageNumber}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(region.id);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(region.id);
        }
      }}
      onPointerDown={(event) => onMoveStart(region, event)}
    >
      <span className="document-region-box__label">{index + 1}</span>
      {selected
        ? handles.map((handle) => (
            <ResizeHandle
              key={handle}
              position={handle}
              onPointerDown={(position, event) => onResizeStart(region, position, event)}
            />
          ))
        : null}
    </div>
  );
}
