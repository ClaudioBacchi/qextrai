import { describe, expect, it, vi } from 'vitest';
import {
  BrowserDocumentValuesRepository,
  TauriDocumentValuesRepository,
} from './documentValuesRepository';

describe('documentValuesRepository', () => {
  it('in browser rifiuta il salvataggio con messaggio desktop', async () => {
    const repository = new BrowserDocumentValuesRepository();
    await expect(repository.save({
      fingerprint: 'a'.repeat(64),
      templateId: 'template-1',
      templateRevision: 1,
      expectedRevision: null,
      values: [],
    })).rejects.toThrow('Il salvataggio dei dati è disponibile nell’app desktop.');
  });

  it('mappa il conflitto revisionale nel messaggio richiesto', async () => {
    const invoke = vi.fn().mockRejectedValue({
      message: 'I dati di questo documento sono stati modificati da un altro operatore.',
      code: 'revisionConflict',
    });
    const repository = new TauriDocumentValuesRepository(async () => invoke);

    await expect(repository.save({
      fingerprint: 'a'.repeat(64),
      templateId: 'template-1',
      templateRevision: 1,
      expectedRevision: 1,
      values: [],
    })).rejects.toMatchObject({
      message: 'I dati di questo documento sono stati modificati da un altro operatore. Ricarica i dati prima di salvare.',
      code: 'revisionConflict',
    });
  });
});
