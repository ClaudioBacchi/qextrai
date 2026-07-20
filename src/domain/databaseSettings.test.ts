import { describe, expect, it } from 'vitest';
import {
  databaseButtonsDisabled,
  emptyDatabaseSettings,
  passwordHelpText,
  toEditableSettings,
  type ConnectionTestResult,
} from './databaseSettings';

describe('databaseSettings', () => {
  it('non include il selettore driver nel modello PostgreSQL nativo', () => {
    expect('driver' in emptyDatabaseSettings).toBe(false);
  });

  it('espone i campi PostgreSQL richiesti', () => {
    expect(emptyDatabaseSettings).toMatchObject({
      server: '',
      port: 5432,
      database: '',
      username: '',
      sslMode: 'prefer',
      password: '',
    });
  });

  it('non mostra la password salvata nel form', () => {
    const editable = toEditableSettings({
      ...emptyDatabaseSettings,
      passwordConfigured: true,
    });
    expect(editable.password).toBe('');
    expect(passwordHelpText(true)).toContain('Password configurata');
  });

  it('rappresenta una verifica riuscita', () => {
    const result: ConnectionTestResult = {
      success: true,
      status: 'success',
      message: 'Connessione riuscita.',
    };
    expect(result.success).toBe(true);
  });

  it('rappresenta una verifica fallita', () => {
    const result: ConnectionTestResult = {
      success: false,
      status: 'serverUnreachable',
      message: 'Connessione non riuscita.',
    };
    expect(result.success).toBe(false);
  });

  it('disabilita i pulsanti in modalita browser senza invoke', () => {
    expect(databaseButtonsDisabled('notConfigured', false)).toEqual({ testDisabled: true, saveDisabled: true });
  });

  it('non espone comandi di elenco driver', () => {
    expect(Object.keys(emptyDatabaseSettings)).not.toContain('driver');
  });

  it('disabilita i pulsanti durante la verifica', () => {
    expect(databaseButtonsDisabled('checking', true)).toEqual({ testDisabled: true, saveDisabled: true });
  });
});
