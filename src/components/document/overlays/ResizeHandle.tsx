import type { PointerEvent } from 'react';
import type { ResizeHandlePosition } from '../documentGeometry';

type ResizeHandleProps = {
  position: ResizeHandlePosition;
  onPointerDown: (position: ResizeHandlePosition, event: PointerEvent<HTMLButtonElement>) => void;
};

const labels: Record<ResizeHandlePosition, string> = {
  nw: 'Ridimensiona alto sinistra',
  n: 'Ridimensiona alto',
  ne: 'Ridimensiona alto destra',
  e: 'Ridimensiona destra',
  se: 'Ridimensiona basso destra',
  s: 'Ridimensiona basso',
  sw: 'Ridimensiona basso sinistra',
  w: 'Ridimensiona sinistra',
};

export function ResizeHandle({ position, onPointerDown }: ResizeHandleProps) {
  return (
    <button
      className={`resize-handle resize-handle--${position}`}
      type="button"
      aria-label={labels[position]}
      onPointerDown={(event) => onPointerDown(position, event)}
    />
  );
}
