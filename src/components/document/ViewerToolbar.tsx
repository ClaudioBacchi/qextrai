import { Minus, Plus } from 'lucide-react';

type ViewerToolbarProps = {
  scale: number;
  canZoomOut: boolean;
  canZoomIn: boolean;
  isFitMode: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFitWidth: () => void;
};

export function ViewerToolbar({
  scale,
  canZoomOut,
  canZoomIn,
  isFitMode,
  onZoomOut,
  onZoomIn,
  onFitWidth,
}: ViewerToolbarProps) {
  return (
    <div className="viewer-toolbar">
      <button className="icon-text-button" type="button" onClick={onZoomOut} disabled={!canZoomOut} title="Riduci zoom">
        <Minus aria-hidden="true" size={16} />
        Zoom -
      </button>
      <span className="zoom-level" aria-label="Percentuale zoom">
        {Math.round(scale * 100)}%
      </span>
      <button className="icon-text-button" type="button" onClick={onZoomIn} disabled={!canZoomIn} title="Aumenta zoom">
        <Plus aria-hidden="true" size={16} />
        Zoom +
      </button>
      <button
        className={`button button--soft button--compact${isFitMode ? ' button--active' : ''}`}
        type="button"
        onClick={onFitWidth}
        aria-pressed={isFitMode}
      >
        Adatta alla larghezza
      </button>
    </div>
  );
}
