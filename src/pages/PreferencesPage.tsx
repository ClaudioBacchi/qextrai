import { ArrowLeft, CheckCircle2, FolderOpen, KeyRound, Languages, PlugZap, Save, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppHeader } from '../components/AppHeader';

type PreferencesPageProps = {
  onBack: () => void;
};

export function PreferencesPage({ onBack }: PreferencesPageProps) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(''), 2400);
    return () => window.clearTimeout(timeout);
  }, [message]);

  return (
    <>
      <AppHeader mode="preferences" onBack={onBack} />
      <main className="preferences-page">
        <section className="preferences-panel" aria-labelledby="preferences-title">
          <div className="preferences-panel__intro">
            <button className="button button--ghost" type="button" onClick={onBack}>
              <ArrowLeft aria-hidden="true" size={18} />
              Torna indietro
            </button>
            <p className="eyebrow">Preferenze</p>
            <h1 id="preferences-title">Impostazioni di Qextrai</h1>
            <p>Queste impostazioni vengono configurate una volta e non sono richieste durante il lavoro quotidiano.</p>
          </div>

          <div className="preferences-grid">
            <PreferenceSection title="Generali" icon={<SlidersHorizontal aria-hidden="true" size={21} />}>
              <Field label="Cartella iniziale" icon={<FolderOpen aria-hidden="true" size={17} />} value="C:\\Documenti\\Da elaborare" />
              <Field label="Lingua interfaccia" icon={<Languages aria-hidden="true" size={17} />} value="Italiano" />
              <label className="toggle-row">
                <input type="checkbox" defaultChecked />
                <span>Apertura automatica dell'ultimo percorso</span>
              </label>
            </PreferenceSection>

            <PreferenceSection title="Analisi documenti" icon={<PlugZap aria-hidden="true" size={21} />}>
              <Field label="Servizio di analisi" value="Configurazione locale" />
              <Field label="Modello" value="Profilo predefinito" />
              <Field label="Chiave API" icon={<KeyRound aria-hidden="true" size={17} />} value="•••• •••• •••• 4821" />
              <button className="button button--primary" type="button" onClick={() => setMessage('Configurazione verificata nella simulazione')}>
                <CheckCircle2 aria-hidden="true" size={18} />
                Verifica configurazione
              </button>
            </PreferenceSection>

            <PreferenceSection title="Esportazione" icon={<Save aria-hidden="true" size={21} />}>
              <Field label="Formato predefinito" value="Excel" />
              <Field label="Cartella di destinazione" value="C:\\Documenti\\Estratti" />
              <div className="segmented" aria-label="Tipo destinazione">
                <button type="button" className="segmented__item segmented__item--active">File</button>
                <button type="button" className="segmented__item">API</button>
                <button type="button" className="segmented__item">SQL</button>
              </div>
            </PreferenceSection>
          </div>
        </section>
        {message ? <div className="toast" role="status">{message}</div> : null}
      </main>
    </>
  );
}

function PreferenceSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="preference-section">
      <h2>
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <div className="input-like">
        {icon}
        <input value={value} readOnly />
      </div>
    </label>
  );
}
