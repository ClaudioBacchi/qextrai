import { isTauriRuntime } from '../services/tauriRuntime';
import type { CatalogErrorCode } from './fieldCatalogRepository';

export type PersistedDocumentValueSource = 'pdfText' | 'manual';
export type PersistedDocumentValueStatus = 'ready' | 'empty';

export type PersistedDocumentFieldValue = {
  templateFieldId: string;
  fieldDefinitionId: string;
  rawValue: string;
  editedValue: string;
  source: PersistedDocumentValueSource;
  status: PersistedDocumentValueStatus;
};

export type DocumentValueSet = {
  id: string;
  revision: number;
  templateRevision: number;
  values: PersistedDocumentFieldValue[];
};

export type LoadDocumentValuesInput = {
  fingerprint: string;
  templateId: string;
};

export type SaveDocumentValuesInput = {
  fingerprint: string;
  templateId: string;
  templateRevision: number;
  expectedRevision: number | null;
  values: PersistedDocumentFieldValue[];
};

export type DocumentValuesRepository = {
  load: (input: LoadDocumentValuesInput) => Promise<DocumentValueSet | null>;
  save: (input: SaveDocumentValuesInput) => Promise<DocumentValueSet>;
  isAvailable: () => boolean;
};

export class DocumentValuesError extends Error {
  constructor(
    message: string,
    public readonly code: CatalogErrorCode = 'generic',
  ) {
    super(message);
  }
}

export class BrowserDocumentValuesRepository implements DocumentValuesRepository {
  load() {
    return Promise.resolve(null);
  }

  save(input: SaveDocumentValuesInput): Promise<DocumentValueSet> {
    void input;
    return Promise.reject(
      new DocumentValuesError('Il salvataggio dei dati è disponibile nell’app desktop.', 'databaseUnavailable'),
    );
  }

  isAvailable() {
    return false;
  }
}

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export class TauriDocumentValuesRepository implements DocumentValuesRepository {
  constructor(private readonly invokeLoader: () => Promise<InvokeFn> = loadInvoke) {}

  async load(input: LoadDocumentValuesInput) {
    const invoke = await this.invokeLoader();
    return invoke<DocumentValueSet | null>('load_document_values', { input }).catch(mapTauriError);
  }

  async save(input: SaveDocumentValuesInput) {
    const invoke = await this.invokeLoader();
    return invoke<DocumentValueSet>('save_document_values', { input }).catch(mapTauriError);
  }

  isAvailable() {
    return true;
  }
}

export function createDocumentValuesRepository(): DocumentValuesRepository {
  return isTauriRuntime() ? new TauriDocumentValuesRepository() : new BrowserDocumentValuesRepository();
}

async function loadInvoke(): Promise<InvokeFn> {
  if (!isTauriRuntime()) {
    throw new DocumentValuesError('Il salvataggio dei dati è disponibile nell’app desktop.', 'databaseUnavailable');
  }
  const api = await import('@tauri-apps/api/core');
  return api.invoke as InvokeFn;
}

function mapTauriError(error: unknown): never {
  if (typeof error === 'object' && error && 'message' in error) {
    const typed = error as { message?: string; detail?: string; code?: CatalogErrorCode };
    const message =
      typed.code === 'revisionConflict'
        ? 'I dati di questo documento sono stati modificati da un altro operatore. Ricarica i dati prima di salvare.'
        : typed.message ?? 'Dati documento non disponibili.';
    throw new DocumentValuesError(message, typed.code ?? 'generic');
  }
  throw new DocumentValuesError('Dati documento non disponibili.', 'generic');
}
