import { isTauriRuntime } from '../services/tauriRuntime';
import type {
  BindDocumentTemplateInput,
  CreateDocumentTemplateInput,
  DocumentTemplate,
  DocumentTemplateSummary,
  UpdateDocumentTemplateInput,
} from './documentTemplates';
import type { CatalogErrorCode } from './fieldCatalogRepository';

export class DocumentTemplateError extends Error {
  constructor(
    message: string,
    public readonly code: CatalogErrorCode = 'generic',
  ) {
    super(message);
  }
}

export type DocumentTemplateRepository = {
  list: () => Promise<DocumentTemplateSummary[]>;
  get: (id: string) => Promise<DocumentTemplate | null>;
  findByFingerprint: (fingerprint: string) => Promise<DocumentTemplate | null>;
  create: (input: CreateDocumentTemplateInput) => Promise<DocumentTemplate>;
  update: (input: UpdateDocumentTemplateInput) => Promise<DocumentTemplate>;
  bind: (input: BindDocumentTemplateInput) => Promise<DocumentTemplate>;
};

export class MemoryDocumentTemplateRepository implements DocumentTemplateRepository {
  private templates = new Map<string, DocumentTemplate>();
  private bindings = new Map<string, string>();

  async list() {
    return Array.from(this.templates.values()).map(summaryFromTemplate);
  }

  async get(id: string) {
    return this.templates.get(id) ?? null;
  }

  async findByFingerprint(fingerprint: string) {
    const templateId = this.bindings.get(fingerprint);
    return templateId ? this.templates.get(templateId) ?? null : null;
  }

  async create(input: CreateDocumentTemplateInput) {
    const normalizedName = input.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    if (Array.from(this.templates.values()).some((template) => template.normalizedName === normalizedName)) {
      throw new DocumentTemplateError('Esiste già un template con questo nome.', 'duplicate');
    }
    const template: DocumentTemplate = {
      id: input.id,
      name: input.name.trim().replace(/\s+/g, ' '),
      normalizedName,
      revision: 1,
      sourcePageCount: input.sourcePageCount,
      fields: input.fields,
    };
    this.templates.set(template.id, template);
    this.bindings.set(input.documentFingerprint, template.id);
    return template;
  }

  async update(input: UpdateDocumentTemplateInput) {
    const template = this.templates.get(input.id);
    if (!template) throw new DocumentTemplateError('Template non trovato.', 'postgresError');
    if (template.revision !== input.expectedRevision) {
      throw new DocumentTemplateError('Il template è stato modificato da un altro operatore.', 'revisionConflict');
    }
    const updated = {
      ...template,
      revision: template.revision + 1,
      sourcePageCount: input.sourcePageCount,
      fields: input.fields,
    };
    this.templates.set(updated.id, updated);
    return updated;
  }

  async bind(input: BindDocumentTemplateInput) {
    const template = this.templates.get(input.templateId);
    if (!template) throw new DocumentTemplateError('Template non trovato.', 'postgresError');
    this.bindings.set(input.documentFingerprint, input.templateId);
    return template;
  }
}

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export class TauriDocumentTemplateRepository implements DocumentTemplateRepository {
  constructor(private readonly invokeLoader: () => Promise<InvokeFn> = loadInvoke) {}

  async list() {
    const invoke = await this.invokeLoader();
    return invoke<DocumentTemplateSummary[]>('list_document_templates');
  }

  async get(id: string) {
    const invoke = await this.invokeLoader();
    return invoke<DocumentTemplate | null>('get_document_template', { id }).catch(mapTauriError);
  }

  async findByFingerprint(fingerprint: string) {
    const invoke = await this.invokeLoader();
    return invoke<DocumentTemplate | null>('find_document_template_by_fingerprint', { fingerprint }).catch(mapTauriError);
  }

  async create(input: CreateDocumentTemplateInput) {
    const invoke = await this.invokeLoader();
    return invoke<DocumentTemplate>('create_document_template', { input }).catch(mapTauriError);
  }

  async update(input: UpdateDocumentTemplateInput) {
    const invoke = await this.invokeLoader();
    return invoke<DocumentTemplate>('update_document_template', { input }).catch(mapTauriError);
  }

  async bind(input: BindDocumentTemplateInput) {
    const invoke = await this.invokeLoader();
    return invoke<DocumentTemplate>('bind_document_template', { input }).catch(mapTauriError);
  }
}

export function createDocumentTemplateRepository(): DocumentTemplateRepository {
  return isTauriRuntime() ? new TauriDocumentTemplateRepository() : new MemoryDocumentTemplateRepository();
}

function summaryFromTemplate(template: DocumentTemplate): DocumentTemplateSummary {
  return {
    id: template.id,
    name: template.name,
    revision: template.revision,
    sourcePageCount: template.sourcePageCount,
    fieldCount: template.fields.length,
    regionCount: template.fields.reduce((total, field) => total + field.regions.length, 0),
  };
}

async function loadInvoke(): Promise<InvokeFn> {
  if (!isTauriRuntime()) throw new DocumentTemplateError('Modalità browser - template temporanei.', 'databaseUnavailable');
  const api = await import('@tauri-apps/api/core');
  return api.invoke as InvokeFn;
}

function mapTauriError(error: unknown): never {
  if (typeof error === 'object' && error && 'message' in error) {
    const typed = error as { message?: string; code?: CatalogErrorCode };
    throw new DocumentTemplateError(typed.message ?? 'Template non disponibili.', typed.code ?? 'generic');
  }
  throw new DocumentTemplateError('Template non disponibili.', 'generic');
}
