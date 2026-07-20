import { describe, expect, it, vi } from 'vitest';
import {
  FieldCatalogError,
  MemoryFieldCatalogRepository,
  TauriFieldCatalogRepository,
} from './fieldCatalogRepository';

describe('fieldCatalogRepository', () => {
  it('gestisce il repository in memoria', async () => {
    const repository = new MemoryFieldCatalogRepository();
    const created = await repository.create({
      id: 'definition-1',
      name: 'Numero preventivo',
      kind: 'single',
      valueType: 'text',
    });
    expect(created).toMatchObject({ normalizedName: 'numero preventivo', revision: 1 });
    expect(await repository.list()).toHaveLength(1);
  });

  it('mantiene il catalogo in caso di duplicato memoria', async () => {
    const repository = new MemoryFieldCatalogRepository();
    await repository.create({ id: 'definition-1', name: 'Mansioni', kind: 'list', valueType: 'text' });
    await expect(
      repository.create({ id: 'definition-2', name: '  mansioni ', kind: 'list', valueType: 'text' }),
    ).rejects.toMatchObject({ code: 'duplicate' });
    expect(await repository.list()).toHaveLength(1);
  });

  it('aggiorna formato e revision in memoria', async () => {
    const repository = new MemoryFieldCatalogRepository();
    const created = await repository.create({ id: 'definition-1', name: 'Data preventivo', kind: 'single', valueType: 'text' });
    const updated = await repository.updateFormat({
      id: created.id,
      expectedRevision: created.revision,
      kind: 'single',
      valueType: 'date',
    });
    expect(updated).toMatchObject({ valueType: 'date', revision: 2 });
  });

  it('segnala conflitto revision in memoria', async () => {
    const repository = new MemoryFieldCatalogRepository();
    const created = await repository.create({ id: 'definition-1', name: 'Data preventivo', kind: 'single', valueType: 'text' });
    await repository.updateFormat({ id: created.id, expectedRevision: 1, kind: 'single', valueType: 'date' });
    await expect(
      repository.updateFormat({ id: created.id, expectedRevision: 1, kind: 'single', valueType: 'datetime' }),
    ).rejects.toMatchObject({ code: 'revisionConflict' });
  });

  it('usa invoke nel repository Tauri', async () => {
    const invoke = vi.fn().mockResolvedValue([]);
    const repository = new TauriFieldCatalogRepository(async () => invoke);
    await repository.list();
    expect(invoke).toHaveBeenCalledWith('list_field_definitions');
  });

  it('mappa errori Tauri tipizzati', async () => {
    const invoke = vi.fn().mockRejectedValue({ message: 'Catalogo non disponibile.', code: 'databaseUnavailable' });
    const repository = new TauriFieldCatalogRepository(async () => invoke);
    await expect(
      repository.create({ id: 'definition-1', name: 'Numero', kind: 'single', valueType: 'text' }),
    ).rejects.toBeInstanceOf(FieldCatalogError);
    await expect(
      repository.create({ id: 'definition-1', name: 'Numero', kind: 'single', valueType: 'text' }),
    ).rejects.toMatchObject({ code: 'databaseUnavailable' });
  });
});
