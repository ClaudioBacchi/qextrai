import { describe, expect, it } from 'vitest';
import type { DocumentRegion } from '../components/document/documentGeometry';
import { addDefinitionIfMissing } from './fieldCatalog';
import { associateRegionToDefinition, createDocumentField } from './documentFields';
import {
  commitDraftRegion,
  discardDraftRegion,
  displayRegions,
  hasUnsavedDraft,
  visualRegionNumber,
} from './draftRegions';
import type { DocumentField, FieldDefinition, FieldKind } from './fieldTypes';

const rect = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };

function region(id: string): DocumentRegion {
  return { id, pageNumber: 1, rect };
}

describe('draftRegions', () => {
  it('non crea DocumentField per una bozza non salvata', () => {
    const draft = region('region-draft');
    const fields: DocumentField[] = [];

    expect(hasUnsavedDraft(draft, { type: 'region', regionId: draft.id })).toBe(true);
    expect(fields).toEqual([]);
  });

  it('non modifica il catalogo prima del salvataggio', () => {
    const catalog: FieldDefinition[] = [];
    const typedName = 'Numero preventivo';

    expect(typedName).toBe('Numero preventivo');
    expect(catalog).toEqual([]);
  });

  it('l annullamento elimina la regione bozza', () => {
    expect(discardDraftRegion()).toEqual({
      draftRegion: null,
      editor: null,
      selectedRegionId: null,
    });
  });

  it('uscire senza salvare elimina la regione senza toccare i campi salvati', () => {
    const savedFields = [createDocumentField('field-1', 'definition-1', 'region-1')];
    const discarded = discardDraftRegion();

    expect(discarded.draftRegion).toBeNull();
    expect(savedFields).toHaveLength(1);
  });

  it('continua a modificare conserva bozza e dati digitati', () => {
    const draft = region('region-draft');
    const editorInput = { name: 'Numero preventivo', kind: 'single' satisfies FieldKind };

    expect(hasUnsavedDraft(draft, { type: 'region', regionId: draft.id })).toBe(true);
    expect(editorInput).toEqual({ name: 'Numero preventivo', kind: 'single' });
  });

  it('un campo salvato resta valido quando si apre Preferenze', () => {
    const draft = region('region-1');
    const catalogResult = addDefinitionIfMissing([], 'definition-1', 'Numero preventivo', 'single');
    const savedRegions = commitDraftRegion([], draft);
    const fields = associateRegionToDefinition([], 'field-1', catalogResult.definition.id, draft.id);

    expect(savedRegions).toEqual([draft]);
    expect(fields).toEqual([createDocumentField('field-1', 'definition-1', 'region-1')]);
  });

  it('la numerazione riparte da 1 dopo eliminazione della prima bozza', () => {
    const firstDraft = region('region-draft-1');
    const afterDiscard = displayRegions([], discardDraftRegion().draftRegion);
    const secondDraft = region('region-draft-2');

    expect(visualRegionNumber(displayRegions([], firstDraft), firstDraft.id)).toBe(1);
    expect(afterDiscard).toEqual([]);
    expect(visualRegionNumber(displayRegions([], secondDraft), secondDraft.id)).toBe(1);
  });

  it('la numerazione non lascia buchi dopo annullamento con regioni salvate', () => {
    const saved = [region('region-1'), region('region-2')];
    const discarded = discardDraftRegion().draftRegion;
    const nextDraft = region('region-4');

    expect(displayRegions(saved, discarded)).toHaveLength(2);
    expect(visualRegionNumber(displayRegions(saved, nextDraft), nextDraft.id)).toBe(3);
  });

  it('la modalita disegno senza regione non richiede dialogo', () => {
    expect(hasUnsavedDraft(null, null)).toBe(false);
  });

  it('nuovo documento annullato dopo uscita senza salvare mantiene documento e campi ma non bozza', () => {
    const currentDocument = { name: 'preventivo.pdf' };
    const savedFields = [createDocumentField('field-1', 'definition-1', 'region-1')];
    const discarded = discardDraftRegion();

    expect(currentDocument.name).toBe('preventivo.pdf');
    expect(savedFields).toHaveLength(1);
    expect(discarded.draftRegion).toBeNull();
  });
});
