import type { DocumentRegion } from '../components/document/documentGeometry';

export type DraftEditorState =
  | { type: 'region'; regionId: string }
  | { type: 'change'; fieldId: string }
  | null;

export type DraftDiscardResult = {
  draftRegion: DocumentRegion | null;
  editor: DraftEditorState;
  selectedRegionId: string | null;
};

export function hasUnsavedDraft(
  draftRegion: DocumentRegion | null,
  editor: DraftEditorState,
) {
  return Boolean(draftRegion && editor?.type === 'region' && editor.regionId === draftRegion.id);
}

export function displayRegions(
  savedRegions: DocumentRegion[],
  draftRegion: DocumentRegion | null,
) {
  return draftRegion ? [...savedRegions, draftRegion] : savedRegions;
}

export function commitDraftRegion(
  savedRegions: DocumentRegion[],
  draftRegion: DocumentRegion | null,
) {
  return draftRegion ? [...savedRegions, draftRegion] : savedRegions;
}

export function discardDraftRegion(): DraftDiscardResult {
  return {
    draftRegion: null,
    editor: null,
    selectedRegionId: null,
  };
}

export function visualRegionNumber(regions: DocumentRegion[], regionId: string) {
  const index = regions.findIndex((region) => region.id === regionId);
  return index === -1 ? null : index + 1;
}
