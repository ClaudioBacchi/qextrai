import { describe, expect, it, vi } from 'vitest';
import {
  TauriDocumentTextExtractionService,
  UnavailableBrowserTextExtractionService,
} from './documentTextExtractionService';

describe('documentTextExtractionService', () => {
  it('invia il PDF al comando Tauri come Uint8Array raw', async () => {
    const invoke = vi.fn().mockResolvedValue({ token: 'token', fingerprint: 'abc', pageCount: 1 });
    const service = new TauriDocumentTextExtractionService(async () => invoke);
    const file = new File([new Uint8Array([37, 80, 68, 70, 45])], 'test.pdf', { type: 'application/pdf' });

    await expect(service.stagePdfDocument(file)).resolves.toEqual({ token: 'token', fingerprint: 'abc', pageCount: 1 });
    expect(invoke).toHaveBeenCalledWith('stage_pdf_document', expect.any(Uint8Array));
    expect(invoke.mock.calls[0][1]).toEqual(new Uint8Array([37, 80, 68, 70, 45]));
  });

  it('invoca extract_pdf_regions con payload JSON esplicito', async () => {
    const invoke = vi.fn().mockResolvedValue([]);
    const service = new TauriDocumentTextExtractionService(async () => invoke);
    const regions = [{
      regionId: 'region-1',
      documentFieldId: 'field-1',
      fieldDefinitionId: 'definition-1',
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 0.2, height: 0.1 },
    }];

    await service.extractPdfRegions('token', regions);

    expect(invoke).toHaveBeenCalledWith('extract_pdf_regions', {
      input: { documentToken: 'token', regions },
    });
  });

  it('in browser dichiara il servizio non disponibile', async () => {
    const service = new UnavailableBrowserTextExtractionService();
    await expect(service.stagePdfDocument(new File([], 'test.pdf'))).rejects.toThrow(
      'L’estrazione dei dati è disponibile nell’app desktop.',
    );
  });
});
