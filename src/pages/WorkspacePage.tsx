import { useEffect, useMemo, useRef, useState } from 'react';
import type { LocalDocument } from '../app/documentTypes';
import { AppHeader } from '../components/AppHeader';
import { UnsavedFieldDialog } from '../components/UnsavedFieldDialog';
import { DocumentViewer } from '../components/document/DocumentViewer';
import type { DocumentRegion, NormalizedRect } from '../components/document/documentGeometry';
import { DocumentFieldsPanel, type EditorState } from '../components/fields/DocumentFieldsPanel';
import { addDefinitionIfMissing, updateDefinitionFormat } from '../domain/fieldCatalog';
import {
  commitDraftRegion,
  discardDraftRegion,
  displayRegions,
  hasUnsavedDraft,
} from '../domain/draftRegions';
import {
  addRegionToField,
  associateRegionToDefinition,
  changeFieldDefinition,
  removeField,
  removeRegionFromFields,
} from '../domain/documentFields';
import type { DocumentField, FieldDefinition } from '../domain/fieldTypes';
import type { FieldEditorSave } from '../components/fields/FieldDefinitionEditor';
import type { FieldFormatSave } from '../components/fields/FieldFormatEditor';

type WorkspacePageProps = {
  document: LocalDocument | null;
  catalog: FieldDefinition[];
  documentFields: DocumentField[];
  regions: DocumentRegion[];
  selectedRegionId: string | null;
  onCatalogChange: (catalog: FieldDefinition[]) => void;
  onDocumentFieldsChange: (fields: DocumentField[]) => void;
  onRegionsChange: (regions: DocumentRegion[]) => void;
  onSelectRegion: (id: string | null) => void;
  onReplaceDocument: (file: File) => void;
  onBack: () => void;
  onOpenPreferences: () => void;
};

type DrawingMode = { type: 'new' } | { type: 'append'; fieldId: string } | null;
type PendingNavigation = 'preferences' | 'back' | 'new-document';

const acceptedTypes = '.pdf,.jpg,.jpeg,.png';

export function WorkspacePage({
  document,
  catalog,
  documentFields,
  regions,
  selectedRegionId,
  onCatalogChange,
  onDocumentFieldsChange,
  onRegionsChange,
  onSelectRegion,
  onReplaceDocument,
  onBack,
  onOpenPreferences,
}: WorkspacePageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [draftRegion, setDraftRegion] = useState<DocumentRegion | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const canAddRegion = document?.viewType === 'pdf' || document?.viewType === 'image';
  const visibleRegions = useMemo(() => displayRegions(regions, draftRegion), [regions, draftRegion]);
  const hasDraft = hasUnsavedDraft(draftRegion, editor);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (pendingNavigation) {
          event.preventDefault();
          continueEditingDraft();
          return;
        }
        if (editor?.type === 'region') {
          event.preventDefault();
          cancelEditor();
          return;
        }
        if (drawingMode) {
          event.preventDefault();
          setDrawingMode(null);
          return;
        }
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedRegionId) {
        if (event.key === 'Backspace' && isEditingText(event.target)) return;
        event.preventDefault();
        deleteRegion(selectedRegionId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawingMode, editor, pendingNavigation, selectedRegionId, regions, documentFields, draftRegion]);

  const replaceDocument = (file?: File) => {
    if (file) {
      onReplaceDocument(file);
      setDrawingMode(null);
      setEditor(null);
      setDraftRegion(null);
    }
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const requestNavigation = (target: PendingNavigation) => {
    if (hasDraft) {
      setPendingNavigation(target);
      return;
    }

    if (drawingMode?.type === 'new') {
      setDrawingMode(null);
    }

    completeNavigation(target);
  };

  const completeNavigation = (target: PendingNavigation) => {
    if (target === 'preferences') {
      onOpenPreferences();
      return;
    }

    if (target === 'back') {
      onBack();
      return;
    }

    inputRef.current?.click();
  };

  const continueEditingDraft = () => {
    setPendingNavigation(null);
  };

  const discardDraftAndContinue = () => {
    const discarded = discardDraftRegion();
    setDraftRegion(discarded.draftRegion);
    setEditor(discarded.editor);
    onSelectRegion(discarded.selectedRegionId);
    setDrawingMode(null);

    const target = pendingNavigation;
    setPendingNavigation(null);
    if (target) {
      completeNavigation(target);
    }
  };

  const focusDraftEditor = () => {
    if (!hasDraft || !draftRegion) return false;
    setDrawingMode(null);
    setEditor({ type: 'region', regionId: draftRegion.id });
    onSelectRegion(draftRegion.id);
    return true;
  };

  const createRegion = (pageNumber: number, rect: NormalizedRect) => {
    const id = makeId('region');
    const region = { id, pageNumber, rect };

    if (drawingMode?.type === 'append') {
      onRegionsChange([...regions, region]);
      onDocumentFieldsChange(addRegionToField(documentFields, drawingMode.fieldId, id));
      onSelectRegion(id);
      setDrawingMode(null);
      return;
    }

    setDraftRegion(region);
    onSelectRegion(id);
    setDrawingMode(null);
    setEditor({ type: 'region', regionId: id });
  };

  const changeRegion = (id: string, rect: NormalizedRect) => {
    if (draftRegion?.id === id) {
      setDraftRegion({ ...draftRegion, rect });
      return;
    }
    onRegionsChange(regions.map((region) => (region.id === id ? { ...region, rect } : region)));
  };

  const saveEditor = (data: FieldEditorSave) => {
    const definitionResult = data.definitionId
      ? { catalog, definition: catalog.find((definition) => definition.id === data.definitionId)! }
      : addDefinitionIfMissing(catalog, makeId('definition'), data.name, data.kind, data.valueType);

    if (!data.definitionId) {
      onCatalogChange(definitionResult.catalog);
    }

    if (editor?.type === 'region') {
      const committedRegions = commitDraftRegion(regions, draftRegion);
      onRegionsChange(committedRegions);
      onDocumentFieldsChange(
        associateRegionToDefinition(
          documentFields,
          makeId('field'),
          definitionResult.definition.id,
          editor.regionId,
        ),
      );
      onSelectRegion(editor.regionId);
      setDraftRegion(null);
    }

    if (editor?.type === 'change') {
      onDocumentFieldsChange(changeFieldDefinition(documentFields, editor.fieldId, definitionResult.definition.id));
    }

    setEditor(null);
  };

  const cancelEditor = () => {
    if (editor?.type === 'region') {
      onDocumentFieldsChange(removeRegionFromFields(documentFields, editor.regionId));
      setDraftRegion(null);
      onSelectRegion(null);
    }
    setEditor(null);
  };

  const saveFormat = (fieldId: string, data: FieldFormatSave) => {
    const field = documentFields.find((item) => item.id === fieldId);
    if (!field) return;
    onCatalogChange(updateDefinitionFormat(catalog, field.definitionId, data.kind, data.valueType));
    setEditor(null);
  };

  const deleteRegion = (regionId: string) => {
    if (draftRegion?.id === regionId) {
      setDraftRegion(null);
      if (selectedRegionId === regionId) onSelectRegion(null);
      if (editor?.type === 'region' && editor.regionId === regionId) setEditor(null);
      return;
    }

    onRegionsChange(regions.filter((region) => region.id !== regionId));
    onDocumentFieldsChange(removeRegionFromFields(documentFields, regionId));
    if (selectedRegionId === regionId) onSelectRegion(null);
    if (editor?.type === 'region' && editor.regionId === regionId) setEditor(null);
  };

  const deleteField = (fieldId: string) => {
    const field = documentFields.find((item) => item.id === fieldId);
    if (!field) return;
    onRegionsChange(regions.filter((region) => !field.regionIds.includes(region.id)));
    onDocumentFieldsChange(removeField(documentFields, fieldId));
    if (selectedRegionId && field.regionIds.includes(selectedRegionId)) onSelectRegion(null);
    if (editor?.type === 'change' && editor.fieldId === fieldId) setEditor(null);
  };

  const drawingMessage =
    drawingMode?.type === 'append'
      ? `Trascina sul documento per aggiungere un'altra area a «${labelForField(drawingMode.fieldId, documentFields, catalog)}»`
      : 'Trascina sul documento per delimitare il campo';

  return (
    <>
      <AppHeader
        mode="workspace"
        documentName={document?.name ?? null}
        onBack={() => requestNavigation('back')}
        onNewDocument={() => requestNavigation('new-document')}
        onOpenPreferences={() => requestNavigation('preferences')}
      />
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept={acceptedTypes}
        onChange={(event) => replaceDocument(event.target.files?.[0])}
        aria-label="Scegli un nuovo documento"
      />
      <main className="workspace" aria-label="Area di lavoro documento">
        <DocumentViewer
          document={document}
          regions={visibleRegions}
          selectedRegionId={selectedRegionId}
          drawingMode={Boolean(drawingMode)}
          onCreateRegion={createRegion}
          onSelectRegion={onSelectRegion}
          onChangeRegion={changeRegion}
          onFinishDrawing={() => setDrawingMode(null)}
        />
        <DocumentFieldsPanel
          catalog={catalog}
          fields={documentFields}
          regions={regions}
          selectedRegionId={selectedRegionId}
          drawingMode={Boolean(drawingMode)}
          drawingMessage={drawingMessage}
          canAddRegion={canAddRegion}
          editor={editor}
          onToggleDrawing={() => {
            if (focusDraftEditor()) return;
            setEditor(null);
            setDrawingMode((current) => (current ? null : { type: 'new' }));
          }}
          onSelectRegion={onSelectRegion}
          onAddArea={(fieldId) => {
            if (focusDraftEditor()) return;
            setEditor(null);
            setDrawingMode({ type: 'append', fieldId });
          }}
          onChangeField={(fieldId) => {
            if (focusDraftEditor()) return;
            setDrawingMode(null);
            setEditor({ type: 'change', fieldId });
          }}
          onEditFormat={(fieldId) => {
            if (focusDraftEditor()) return;
            setDrawingMode(null);
            setEditor({ type: 'format', fieldId });
          }}
          onDeleteRegion={deleteRegion}
          onDeleteField={deleteField}
          onCancelEditor={cancelEditor}
          onSaveEditor={saveEditor}
          onSaveFormat={saveFormat}
        />
      </main>
      {pendingNavigation ? (
        <UnsavedFieldDialog
          onContinue={continueEditingDraft}
          onDiscard={discardDraftAndContinue}
        />
      ) : null}
    </>
  );
}

function makeId(prefix: string) {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function labelForField(fieldId: string, fields: DocumentField[], catalog: FieldDefinition[]) {
  const field = fields.find((item) => item.id === fieldId);
  const definition = catalog.find((item) => item.id === field?.definitionId);
  return definition?.name ?? 'campo';
}

function isEditingText(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || target.isContentEditable;
}
