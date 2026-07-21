import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { UnsavedLayoutWarning } from '../domain/unsavedLayoutGuard';

type UnsavedLayoutDialogProps = {
  warning: UnsavedLayoutWarning;
  onStay: () => void;
  onDiscard: () => void;
  onSaveAndContinue: () => Promise<boolean> | boolean;
};

export function UnsavedLayoutDialog({
  warning,
  onStay,
  onDiscard,
  onSaveAndContinue,
}: UnsavedLayoutDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const stayButtonRef = useRef<HTMLButtonElement>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stayButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onStay();
        return;
      }

      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previousActiveElement?.focus();
    };
  }, [onStay]);

  const saveAndContinue = async () => {
    setSaving(true);
    const success = await onSaveAndContinue();
    if (!success) setSaving(false);
  };

  return (
    <div
      className="modal-backdrop"
      aria-hidden={false}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onStay();
      }}
    >
      <section
        ref={dialogRef}
        className="confirm-dialog unsaved-layout-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-layout-title"
        aria-describedby="unsaved-layout-description"
      >
        <button className="modal-close" type="button" aria-label="Chiudi" onClick={onStay}>
          <X aria-hidden="true" size={18} />
        </button>
        <h2 id="unsaved-layout-title">{warning.title}</h2>
        <p id="unsaved-layout-description">{warning.description}</p>
        <div className="confirm-dialog__actions">
          <button ref={stayButtonRef} className="button button--secondary" type="button" onClick={onStay} disabled={saving}>
            Resta qui
          </button>
          <button className="button button--danger" type="button" onClick={onDiscard} disabled={saving}>
            Continua senza salvare
          </button>
          <button className="button button--primary" type="button" onClick={saveAndContinue} disabled={saving}>
            {saving ? 'Salvataggio...' : warning.saveActionLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
