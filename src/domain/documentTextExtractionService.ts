import { isTauriRuntime } from '../services/tauriRuntime';

export type StagedPdfDocument = {
  token: string;
  fingerprint: string;
  pageCount: number;
};

export type ExtractPdfRegionRequest = {
  regionId: string;
  documentFieldId: string;
  fieldDefinitionId: string;
  pageNumber: number;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type ExtractPdfRegionResponse = {
  regionId: string;
  documentFieldId: string;
  pageNumber: number;
  rawText: string;
  status: 'read' | 'empty';
};

export class DocumentTextExtractionError extends Error {}

export type DocumentTextExtractionService = {
  stagePdfDocument: (file: File) => Promise<StagedPdfDocument>;
  releaseStagedDocument: (documentToken: string) => Promise<void>;
  extractPdfRegions: (documentToken: string, regions: ExtractPdfRegionRequest[]) => Promise<ExtractPdfRegionResponse[]>;
};

type InvokeFn = <T>(command: string, payload?: unknown, options?: { headers?: Record<string, string> }) => Promise<T>;

export class TauriDocumentTextExtractionService implements DocumentTextExtractionService {
  constructor(private readonly invokeLoader: () => Promise<InvokeFn> = loadInvoke) {}

  async stagePdfDocument(file: File) {
    const invoke = await this.invokeLoader();
    const bytes = new Uint8Array(await file.arrayBuffer());
    return invoke<StagedPdfDocument>('stage_pdf_document', bytes).catch(mapTauriExtractionError);
  }

  async releaseStagedDocument(documentToken: string) {
    const invoke = await this.invokeLoader();
    await invoke<boolean>('release_staged_document', { documentToken }).catch(mapTauriExtractionError);
  }

  async extractPdfRegions(documentToken: string, regions: ExtractPdfRegionRequest[]) {
    const invoke = await this.invokeLoader();
    return invoke<ExtractPdfRegionResponse[]>('extract_pdf_regions', {
      input: { documentToken, regions },
    }).catch(mapTauriExtractionError);
  }
}

export class UnavailableBrowserTextExtractionService implements DocumentTextExtractionService {
  async stagePdfDocument(file?: File): Promise<StagedPdfDocument> {
    void file;
    throw new DocumentTextExtractionError('L’estrazione dei dati è disponibile nell’app desktop.');
  }

  async releaseStagedDocument(documentToken?: string) {
    void documentToken;
  }

  async extractPdfRegions(
    documentToken?: string,
    regions?: ExtractPdfRegionRequest[],
  ): Promise<ExtractPdfRegionResponse[]> {
    void documentToken;
    void regions;
    throw new DocumentTextExtractionError('L’estrazione dei dati è disponibile nell’app desktop.');
  }
}

export function createDocumentTextExtractionService(): DocumentTextExtractionService {
  return isTauriRuntime()
    ? new TauriDocumentTextExtractionService()
    : new UnavailableBrowserTextExtractionService();
}

async function loadInvoke(): Promise<InvokeFn> {
  if (!isTauriRuntime()) throw new DocumentTextExtractionError('L’estrazione dei dati è disponibile nell’app desktop.');
  const api = await import('@tauri-apps/api/core');
  return api.invoke as InvokeFn;
}

function mapTauriExtractionError(error: unknown): never {
  if (typeof error === 'string') throw new DocumentTextExtractionError(error);
  if (typeof error === 'object' && error && 'message' in error) {
    throw new DocumentTextExtractionError(String((error as { message?: unknown }).message));
  }
  throw new DocumentTextExtractionError('Errore di lettura del documento.');
}
