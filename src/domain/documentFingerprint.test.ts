import { describe, expect, it } from 'vitest';
import { bytesToHex, calculateDocumentFingerprint } from './documentFingerprint';

describe('documentFingerprint', () => {
  it('converte byte in esadecimale con padding', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff');
  });

  it('calcola SHA-256 del documento', async () => {
    const file = new File(['abc'], 'documento.txt');
    await expect(calculateDocumentFingerprint(file)).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
