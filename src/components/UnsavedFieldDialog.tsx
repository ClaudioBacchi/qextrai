import { useEffect, useRef } from 'react';

type UnsavedFieldDialogProps = {
  onContinue: () => void;
  onDiscard: () => void;
};

export function UnsavedFieldDialog({ onContinue, onDiscard }: UnsavedFieldDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const continueButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    continueButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onContinue();
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
  }, [onContinue]);

  return (
    <div className="modal-backdrop" aria-hidden={false}>
      <section
        ref={dialogRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-field-title"
        aria-describedby="unsaved-field-description"
      >
        <h2 id="unsaved-field-title">Campo non salvato</h2>
        <p id="unsaved-field-description">
          Hai disegnato un box ma non hai ancora salvato il campo. Se esci, il box verr&agrave; eliminato.
        </p>
        <div className="confirm-dialog__actions">
          <button ref={continueButtonRef} className="button button--primary" type="button" onClick={onContinue}>
            Continua a modificare
          </button>
          <button className="button button--danger" type="button" onClick={onDiscard}>
            Esci senza salvare
          </button>
        </div>
      </section>
    </div>
  );
}
