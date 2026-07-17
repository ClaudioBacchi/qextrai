import { ArrowLeft, Settings } from 'lucide-react';
import { Brand } from './Brand';
import { StatusBadge } from './StatusBadge';

type AppHeaderProps = {
  mode?: 'home' | 'workspace' | 'preferences';
  documentName?: string | null;
  onBack?: () => void;
  onNewDocument?: () => void;
  onOpenPreferences?: () => void;
};

export function AppHeader({
  mode = 'home',
  documentName,
  onBack,
  onNewDocument,
  onOpenPreferences,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="app-header__left">
          <Brand />
          {mode !== 'home' && onBack ? (
            <button className="button button--ghost" type="button" onClick={onBack}>
              <ArrowLeft aria-hidden="true" size={18} />
              Indietro
            </button>
          ) : null}
          {mode === 'workspace' ? (
            <div className="document-chip" title={documentName ?? 'Nessun documento'}>
              <span>{documentName ?? 'Nessun documento'}</span>
            </div>
          ) : null}
        </div>
        <div className="app-header__actions">
          {mode === 'workspace' && onNewDocument ? (
            <button className="button button--soft" type="button" onClick={onNewDocument}>
              Nuovo documento
            </button>
          ) : null}
          <StatusBadge tone="ready">Motore di analisi pronto</StatusBadge>
          {onOpenPreferences ? (
            <button className="button button--soft" type="button" onClick={onOpenPreferences}>
              <Settings aria-hidden="true" size={18} />
              Preferenze
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
