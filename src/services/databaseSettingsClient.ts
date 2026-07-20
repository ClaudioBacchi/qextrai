import type {
  ConnectionTestResult,
  DatabaseSettings,
  DatabaseSettingsPublic,
} from '../domain/databaseSettings';
import { isTauriRuntime } from './tauriRuntime';

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

async function getInvoke(): Promise<InvokeFn> {
  if (!isTauriRuntime()) {
    throw new Error("La configurazione PostgreSQL è disponibile nell'app desktop.");
  }
  const api = await import('@tauri-apps/api/core');
  return api.invoke as InvokeFn;
}

export async function getDatabaseSettings(): Promise<DatabaseSettingsPublic> {
  const invoke = await getInvoke();
  return invoke<DatabaseSettingsPublic>('get_database_settings');
}

export async function saveDatabaseSettings(settings: DatabaseSettings): Promise<DatabaseSettingsPublic> {
  const invoke = await getInvoke();
  return invoke<DatabaseSettingsPublic>('save_database_settings', { settings });
}

export async function testDatabaseConnection(settings: DatabaseSettings): Promise<ConnectionTestResult> {
  const invoke = await getInvoke();
  return invoke<ConnectionTestResult>('test_database_connection', { settings });
}
