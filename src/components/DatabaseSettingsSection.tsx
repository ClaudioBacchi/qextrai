import { CheckCircle2, Database, Save, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  databaseButtonsDisabled,
  emptyDatabaseSettings,
  passwordHelpText,
  toEditableSettings,
  type ConnectionTestResult,
  type DatabaseFormStatus,
  type DatabaseSettings,
  type SslMode,
} from '../domain/databaseSettings';
import {
  getDatabaseSettings,
  saveDatabaseSettings,
  testDatabaseConnection,
} from '../services/databaseSettingsClient';
import { isTauriRuntime } from '../services/tauriRuntime';
import type { FieldCatalogStatus } from '../domain/fieldCatalogRepository';

const sslModes: SslMode[] = ['prefer', 'require', 'verify-ca', 'verify-full'];

export function DatabaseSettingsSection({
  catalogStatus,
  catalogCount,
}: {
  catalogStatus: FieldCatalogStatus;
  catalogCount: number;
}) {
  const isDesktop = isTauriRuntime();
  const [settings, setSettings] = useState<DatabaseSettings>(emptyDatabaseSettings);
  const [passwordConfigured, setPasswordConfigured] = useState(false);
  const [status, setStatus] = useState<DatabaseFormStatus>('notConfigured');
  const [message, setMessage] = useState('Non configurato');
  const [detailMessage, setDetailMessage] = useState('');

  useEffect(() => {
    if (!isDesktop) {
      setMessage("La configurazione PostgreSQL è disponibile nell'app desktop.");
      return;
    }

    let cancelled = false;
    getDatabaseSettings()
      .then((savedSettings) => {
        if (cancelled) return;
        const editable = toEditableSettings(savedSettings);
        setSettings(editable);
        setPasswordConfigured(savedSettings.passwordConfigured);
        setMessage(savedSettings.server ? 'Impostazioni caricate.' : 'Non configurato');
      })
      .catch(() => {
        if (!cancelled) {
          setMessage('Impostazioni database non disponibili.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isDesktop]);

  const disabled = databaseButtonsDisabled(status, isDesktop);

  const updateSetting = <Key extends keyof DatabaseSettings>(key: Key, value: DatabaseSettings[Key]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const handleTest = async () => {
    setStatus('checking');
    setMessage('Verifica in corso...');
    setDetailMessage('');
    try {
      const result: ConnectionTestResult = await testDatabaseConnection(settings);
      setStatus(result.success ? 'success' : 'failed');
      setMessage(result.success ? 'Connessione riuscita' : 'Connessione non riuscita');
      setDetailMessage(result.message);
    } catch {
      setStatus('failed');
      setMessage('Connessione non riuscita');
      setDetailMessage('Controllare i parametri e riprovare.');
    }
  };

  const handleSave = async () => {
    setDetailMessage('');
    try {
      const saved = await saveDatabaseSettings(settings);
      setPasswordConfigured(saved.passwordConfigured);
      setSettings(toEditableSettings(saved));
      setStatus('saved');
      setMessage('Impostazioni salvate');
      setDetailMessage('Impostazioni salvate, connessione non verificata.');
    } catch {
      setStatus('failed');
      setMessage('Connessione non riuscita');
      setDetailMessage('Impossibile salvare le impostazioni database.');
    }
  };

  return (
    <section className="preference-section preference-section--wide" aria-labelledby="database-settings-title">
      <h2 id="database-settings-title">
        <Database aria-hidden="true" size={21} />
        Database condiviso
      </h2>
      <p className="preference-section__description">
        Connessione PostgreSQL condivisa da tutte le postazioni qExtrai.
      </p>

      <div className={`database-status database-status--${status}`} role="status">
        {status === 'failed' ? <ShieldAlert aria-hidden="true" size={18} /> : <CheckCircle2 aria-hidden="true" size={18} />}
        <span>{message}</span>
      </div>
      {detailMessage ? <p className="database-detail">{detailMessage}</p> : null}

      <div className={`catalog-status catalog-status--${catalogStatus}`} role="status">
        <span>{catalogStatusText(catalogStatus)}</span>
        <strong>Campi disponibili: {catalogCount}</strong>
      </div>

      {!isDesktop ? (
        <p className="database-warning">La configurazione PostgreSQL è disponibile nell'app desktop.</p>
      ) : null}

      <div className="database-form-grid">
        <TextField label="Server" value={settings.server} disabled={!isDesktop} onChange={(value) => updateSetting('server', value)} />
        <TextField
          label="Porta"
          type="number"
          value={String(settings.port)}
          disabled={!isDesktop}
          onChange={(value) => updateSetting('port', Number(value) || 0)}
        />
        <TextField label="Database" value={settings.database} disabled={!isDesktop} onChange={(value) => updateSetting('database', value)} />
        <TextField label="Utente" value={settings.username} disabled={!isDesktop} onChange={(value) => updateSetting('username', value)} />
        <TextField
          label="Password"
          type="password"
          value={settings.password}
          disabled={!isDesktop}
          help={passwordHelpText(passwordConfigured)}
          onChange={(value) => updateSetting('password', value)}
        />
      </div>

      <details className="advanced-options">
        <summary>Opzioni avanzate</summary>
        <label className="form-field">
          <span>SSL mode</span>
          <div className="input-like">
            <select
              value={settings.sslMode}
              disabled={!isDesktop}
              onChange={(event) => updateSetting('sslMode', event.target.value as SslMode)}
            >
              {sslModes.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </div>
        </label>
      </details>

      <div className="database-actions">
        <button className="button button--secondary" type="button" disabled={disabled.testDisabled} onClick={handleTest}>
          <CheckCircle2 aria-hidden="true" size={18} />
          Verifica connessione
        </button>
        <button className="button button--primary" type="button" disabled={disabled.saveDisabled} onClick={handleSave}>
          <Save aria-hidden="true" size={18} />
          Salva impostazioni
        </button>
      </div>
    </section>
  );
}

function catalogStatusText(status: FieldCatalogStatus) {
  switch (status) {
    case 'loading':
      return 'Caricamento catalogo...';
    case 'ready':
      return 'Catalogo condiviso pronto';
    case 'refreshing':
      return 'Caricamento catalogo...';
    case 'stale':
      return 'Catalogo non aggiornato';
    case 'temporary':
      return 'Modalità browser - catalogo temporaneo';
    case 'unavailable':
    default:
      return 'Catalogo non disponibile';
  }
}

function TextField({
  label,
  value,
  disabled,
  type = 'text',
  help,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  type?: 'text' | 'number' | 'password';
  help?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <div className="input-like">
        <input type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      </div>
      {help ? <small>{help}</small> : null}
    </label>
  );
}
