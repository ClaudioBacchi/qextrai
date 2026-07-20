import { createFieldDefinition, normalizeValueType, sortDefinitions } from './fieldCatalog';
import type { FieldDefinition, FieldKind, ScalarValueType } from './fieldTypes';
import { isTauriRuntime } from '../services/tauriRuntime';

export type CatalogErrorCode =
  | 'generic'
  | 'databaseUnavailable'
  | 'migrationFailed'
  | 'permissionDenied'
  | 'duplicate'
  | 'revisionConflict'
  | 'invalidData'
  | 'postgresError';

export class FieldCatalogError extends Error {
  constructor(
    message: string,
    public readonly code: CatalogErrorCode = 'generic',
  ) {
    super(message);
  }
}

export type FieldCatalogRepository = {
  list: () => Promise<FieldDefinition[]>;
  create: (input: { id: string; name: string; kind: FieldKind; valueType: ScalarValueType | null }) => Promise<FieldDefinition>;
  updateFormat: (input: {
    id: string;
    expectedRevision: number;
    kind: FieldKind;
    valueType: ScalarValueType | null;
  }) => Promise<FieldDefinition>;
};

export type FieldCatalogStatus = 'loading' | 'ready' | 'unavailable' | 'refreshing' | 'stale' | 'temporary';

export class MemoryFieldCatalogRepository implements FieldCatalogRepository {
  private catalog: FieldDefinition[];

  constructor(initialCatalog: FieldDefinition[] = []) {
    this.catalog = sortDefinitions(initialCatalog);
  }

  async list() {
    return this.catalog;
  }

  async create(input: { id: string; name: string; kind: FieldKind; valueType: ScalarValueType | null }) {
    const definition = createFieldDefinition(input.id, input.name, input.kind, input.valueType);
    if (this.catalog.some((item) => item.normalizedName === definition.normalizedName)) {
      throw new FieldCatalogError('Campo duplicato.', 'duplicate');
    }
    this.catalog = sortDefinitions([...this.catalog, definition]);
    return definition;
  }

  async updateFormat(input: { id: string; expectedRevision: number; kind: FieldKind; valueType: ScalarValueType | null }) {
    const definition = this.catalog.find((item) => item.id === input.id);
    if (!definition) throw new FieldCatalogError('Campo non trovato.', 'postgresError');
    if (definition.revision !== input.expectedRevision) {
      throw new FieldCatalogError('Conflitto revisione.', 'revisionConflict');
    }
    const updated = {
      ...definition,
      kind: input.kind,
      valueType: normalizeValueType(input.kind, input.valueType),
      revision: definition.revision + 1,
    };
    this.catalog = sortDefinitions(this.catalog.map((item) => (item.id === input.id ? updated : item)));
    return updated;
  }
}

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export class TauriFieldCatalogRepository implements FieldCatalogRepository {
  constructor(private readonly invokeLoader: () => Promise<InvokeFn> = loadInvoke) {}

  async list() {
    const invoke = await this.invokeLoader();
    return invoke<FieldDefinition[]>('list_field_definitions');
  }

  async create(input: { id: string; name: string; kind: FieldKind; valueType: ScalarValueType | null }) {
    const invoke = await this.invokeLoader();
    return invoke<FieldDefinition>('create_field_definition', { input }).catch(mapTauriError);
  }

  async updateFormat(input: { id: string; expectedRevision: number; kind: FieldKind; valueType: ScalarValueType | null }) {
    const invoke = await this.invokeLoader();
    return invoke<FieldDefinition>('update_field_definition_format', { input }).catch(mapTauriError);
  }
}

export function createFieldCatalogRepository(): FieldCatalogRepository {
  return isTauriRuntime() ? new TauriFieldCatalogRepository() : new MemoryFieldCatalogRepository();
}

async function loadInvoke(): Promise<InvokeFn> {
  if (!isTauriRuntime()) throw new FieldCatalogError('Modalità browser - catalogo temporaneo.', 'databaseUnavailable');
  const api = await import('@tauri-apps/api/core');
  return api.invoke as InvokeFn;
}

function mapTauriError(error: unknown): never {
  if (typeof error === 'object' && error && 'message' in error) {
    const typed = error as { message?: string; code?: CatalogErrorCode };
    throw new FieldCatalogError(typed.message ?? 'Catalogo non disponibile.', typed.code ?? 'generic');
  }
  throw new FieldCatalogError('Catalogo non disponibile.', 'generic');
}
