import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Save, Upload, X } from 'lucide-react';
import type { LocalDocument } from '../app/documentTypes';
import { AppHeader } from '../components/AppHeader';
import { UnsavedFieldDialog } from '../components/UnsavedFieldDialog';
import { UnsavedLayoutDialog } from '../components/UnsavedLayoutDialog';
import { DocumentViewer } from '../components/document/DocumentViewer';
import type { DocumentRegion, NormalizedRect } from '../components/document/documentGeometry';
import { DocumentFieldsPanel, type EditorState } from '../components/fields/DocumentFieldsPanel';
import { findDefinitionByName } from '../domain/fieldCatalog';
import { calculateDocumentFingerprint } from '../domain/documentFingerprint';
import {
  applyTemplateToDocument,
  hasUnsavedTemplateChanges,
  templateFromLayout,
  type DocumentTemplate,
  type DocumentTemplateSummary,
} from '../domain/documentTemplates';
import {
  DocumentTemplateError,
  type DocumentTemplateRepository,
} from '../domain/documentTemplateRepository';
import type {
  DocumentTextExtractionService,
  ExtractPdfRegionRequest,
  StagedPdfDocument,
} from '../domain/documentTextExtractionService';
import { getUnsavedLayoutWarning } from '../domain/unsavedLayoutGuard';
import {
  applyRegionExtractionResults,
  buildPersistedFieldValues,
  editFieldValue,
  hasManualCorrections,
  invalidateFieldValues,
  markFieldsExtractionError,
  markFieldsReading,
  readableSingleFields,
  rectEquals,
  type DocumentFieldValues,
} from '../domain/documentFieldValues';
import {
  applyLoadedDocumentValuesSnapshot,
  applySavedDocumentValuesSnapshot,
  buildDocumentValuesLoadKey,
  documentValuesLoadKeyId,
  loadKeyMatches,
  type DocumentValuesLoadKey,
} from '../domain/documentValuesWorkflow';
import {
  fieldDeletionNeedsConfirmation,
  isTextEditingElement,
  type FieldDeletionCommand,
} from '../domain/fieldDeletionGuard';
import {
  DocumentValuesError,
  type DocumentValueSet,
  type DocumentValuesRepository,
} from '../domain/documentValuesRepository';
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
import {
  FieldCatalogError,
  type FieldCatalogRepository,
  type FieldCatalogStatus,
} from '../domain/fieldCatalogRepository';
import type { FieldEditorSave } from '../components/fields/FieldDefinitionEditor';
import type { FieldFormatSave } from '../components/fields/FieldFormatEditor';

type WorkspacePageProps = {
  document: LocalDocument | null;
  catalog: FieldDefinition[];
  documentFields: DocumentField[];
  regions: DocumentRegion[];
  selectedRegionId: string | null;
  onCatalogChange: (catalog: FieldDefinition[]) => void;
  catalogStatus: FieldCatalogStatus;
  catalogMessage: string;
  catalogRepository: FieldCatalogRepository;
  onRefreshCatalog: () => Promise<void>;
  templateRepository: DocumentTemplateRepository;
  textExtractionService: DocumentTextExtractionService;
  documentValuesRepository: DocumentValuesRepository;
  templateSummaries: DocumentTemplateSummary[];
  templateStatus: FieldCatalogStatus;
  onRefreshTemplates: () => Promise<void>;
  onDocumentFieldsChange: (fields: DocumentField[]) => void;
  onRegionsChange: (regions: DocumentRegion[]) => void;
  onSelectRegion: (id: string | null) => void;
  onReplaceDocument: (file: File) => void;
  onBack: () => void;
  onOpenPreferences: () => void;
};

type DrawingMode = { type: 'new' } | { type: 'append'; fieldId: string } | null;
type PendingNavigation = 'preferences' | 'back' | 'new-document';
type ExtractionStageStatus = 'idle' | 'staging' | 'ready' | 'unavailable' | 'error';
type ProtectedWorkspaceAction =
  | { type: 'navigation'; target: PendingNavigation }
  | { type: 'replace-document'; file: File }
  | { type: 'reload-template' }
  | { type: 'apply-template'; templateId: string };

const acceptedTypes = '.pdf,.jpg,.jpeg,.png';

export function WorkspacePage({
  document,
  catalog,
  documentFields,
  regions,
  selectedRegionId,
  onCatalogChange,
  catalogStatus,
  catalogMessage,
  catalogRepository,
  onRefreshCatalog,
  templateRepository,
  textExtractionService,
  documentValuesRepository,
  templateSummaries,
  templateStatus,
  onRefreshTemplates,
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
  const [pendingLayoutAction, setPendingLayoutAction] = useState<ProtectedWorkspaceAction | null>(null);
  const [editorError, setEditorError] = useState('');
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [fingerprintStatus, setFingerprintStatus] = useState('');
  const [activeTemplate, setActiveTemplate] = useState<DocumentTemplate | null>(null);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [templateMessage, setTemplateMessage] = useState('Nessun template associato.');
  const [hiddenTemplateRegionCount, setHiddenTemplateRegionCount] = useState(0);
  const [templateDialog, setTemplateDialog] = useState<'save' | 'apply' | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [stagedDocument, setStagedDocument] = useState<StagedPdfDocument | null>(null);
  const [stageStatus, setStageStatus] = useState<ExtractionStageStatus>('idle');
  const [extractionMessage, setExtractionMessage] = useState('');
  const [fieldValues, setFieldValues] = useState<DocumentFieldValues>({});
  const [valueSetRevision, setValueSetRevision] = useState<number | null>(null);
  const [valuesDirty, setValuesDirty] = useState(false);
  const [valuesMessage, setValuesMessage] = useState('');
  const [valuesSaving, setValuesSaving] = useState(false);
  const [valuesConflictOpen, setValuesConflictOpen] = useState(false);
  const [confirmReloadValues, setConfirmReloadValues] = useState(false);
  const [valuesReloading, setValuesReloading] = useState(false);
  const [valuesReloadError, setValuesReloadError] = useState('');
  const [extractionBusy, setExtractionBusy] = useState(false);
  const [confirmReread, setConfirmReread] = useState(false);
  const [pendingFieldDeletion, setPendingFieldDeletion] = useState<FieldDeletionCommand | null>(null);
  const stageRequestRef = useRef(0);
  const documentInstanceRef = useRef(0);
  const valuesLoadRef = useRef<{ sequence: number; keyId: string }>({ sequence: 0, keyId: '' });
  const stagedTokenRef = useRef<string | null>(null);
  const canAddRegion = document?.viewType === 'pdf' || document?.viewType === 'image';
  const visibleRegions = useMemo(() => displayRegions(regions, draftRegion), [regions, draftRegion]);
  const hasDraft = hasUnsavedDraft(draftRegion, editor);
  const hasTemplateChanges = hasUnsavedTemplateChanges(activeTemplate?.revision ?? null, templateDirty);
  const unsavedLayoutWarning = getUnsavedLayoutWarning({
    activeTemplate,
    templateDirty,
    fieldCount: documentFields.length,
  });
  const templateStoreReady = templateStatus === 'ready' || templateStatus === 'temporary';
  const readableFields = readableSingleFields(documentFields, catalog, regions);
  const canExtractData =
    document?.viewType === 'pdf' && stageStatus === 'ready' && Boolean(stagedDocument) && readableFields.length > 0;
  const canSaveData =
    documentValuesRepository.isAvailable() &&
    Boolean(fingerprint && activeTemplate && !templateDirty && valuesDirty && !valuesSaving);
  const hasProtectedValues = valuesDirty && Boolean(activeTemplate);
  const showCombinedUnsavedDialog = Boolean(pendingLayoutAction && !valuesConflictOpen && hasTemplateChanges && hasProtectedValues);
  const showUnsavedValuesDialog = Boolean(pendingLayoutAction && !valuesConflictOpen && !showCombinedUnsavedDialog && hasProtectedValues);
  const hasOpenDialog = Boolean(
    pendingFieldDeletion ||
    pendingNavigation ||
    pendingLayoutAction ||
    confirmReloadValues ||
    valuesConflictOpen ||
    confirmReread ||
    templateDialog,
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (pendingFieldDeletion) {
          event.preventDefault();
          cancelFieldDeletion();
          return;
        }
        if (pendingLayoutAction) {
          event.preventDefault();
          stayOnWorkspace();
          return;
        }
        if (confirmReloadValues) {
          event.preventDefault();
          if (!valuesReloading) setConfirmReloadValues(false);
          return;
        }
        if (valuesConflictOpen) {
          event.preventDefault();
          if (!valuesReloading) setValuesConflictOpen(false);
          return;
        }
        if (confirmReread) {
          event.preventDefault();
          setConfirmReread(false);
          return;
        }
        if (templateDialog) {
          event.preventDefault();
          setTemplateDialog(null);
          return;
        }
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
        if (isEditingText(event.target)) return;
        if (hasOpenDialog) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        requestDeleteRegion(selectedRegionId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    drawingMode,
    editor,
    pendingNavigation,
    selectedRegionId,
    regions,
    documentFields,
    draftRegion,
    templateDialog,
    pendingFieldDeletion,
    pendingLayoutAction,
    confirmReread,
    confirmReloadValues,
    valuesConflictOpen,
    valuesReloading,
    fieldValues,
    hasOpenDialog,
  ]);

  useEffect(() => {
    documentInstanceRef.current += 1;
    setFieldValues({});
    setValueSetRevision(null);
    setValuesDirty(false);
    setValuesMessage('');
    setValuesConflictOpen(false);
    setConfirmReloadValues(false);
    setValuesReloadError('');
    setPendingFieldDeletion(null);
    valuesLoadRef.current = { sequence: valuesLoadRef.current.sequence + 1, keyId: '' };
    setExtractionBusy(false);
    setConfirmReread(false);
    setExtractionMessage('');
  }, [document]);

  useEffect(() => {
    if (templateDirty) return;
    const loadKey = buildDocumentValuesLoadKey({
      documentInstanceId: documentInstanceRef.current,
      fingerprint,
      template: activeTemplate,
      fields: documentFields,
    });
    if (!loadKey || !activeTemplate) return;
    const template = activeTemplate;
    const fieldsSnapshot = documentFields;
    const keyId = documentValuesLoadKeyId(loadKey);
    if (valuesLoadRef.current.keyId === keyId) return;

    let cancelled = false;
    const sequence = valuesLoadRef.current.sequence + 1;
    valuesLoadRef.current = { sequence, keyId };
    setValuesMessage(documentValuesRepository.isAvailable() ? 'Caricamento dati documento...' : '');
    documentValuesRepository
      .load({ fingerprint: loadKey.fingerprint, templateId: loadKey.templateId })
      .then((valueSet) => {
        if (cancelled) return;
        if (valuesLoadRef.current.sequence !== sequence || valuesLoadRef.current.keyId !== keyId) return;
        applyLoadedDocumentValues(valueSet, template, fieldsSnapshot);
      })
      .catch((error) => {
        if (cancelled) return;
        if (valuesLoadRef.current.sequence !== sequence || valuesLoadRef.current.keyId !== keyId) return;
        setValuesMessage(messageForDocumentValuesError(error, 'Dati documento non disponibili.'));
      });

    return () => {
      cancelled = true;
    };
  }, [activeTemplate, documentValuesRepository, documentFields, fingerprint, templateDirty]);

  useEffect(() => {
    const requestId = stageRequestRef.current + 1;
    stageRequestRef.current = requestId;
    const previousToken = stagedTokenRef.current;
    if (previousToken) void textExtractionService.releaseStagedDocument(previousToken);
    stagedTokenRef.current = null;
    setStagedDocument(null);

    if (!document) {
      resetTemplateState();
      setStageStatus('idle');
      return;
    }

    let cancelled = false;
    setFingerprint(null);
    setFingerprintStatus('Calcolo impronta documento...');
    setActiveTemplate(null);
    setTemplateDirty(false);
    setHiddenTemplateRegionCount(0);
    setTemplateMessage('Nessun template associato.');

    if (document.viewType === 'pdf') {
      setStageStatus('staging');
      textExtractionService
        .stagePdfDocument(document.file)
        .then((staged) => {
          if (cancelled || stageRequestRef.current !== requestId) {
            void textExtractionService.releaseStagedDocument(staged.token);
            return;
          }
          stagedTokenRef.current = staged.token;
          setStagedDocument(staged);
          setFingerprint(staged.fingerprint);
          setStageStatus('ready');
          setFingerprintStatus('Ricerca template associato...');
          if (pageCount && staged.pageCount !== pageCount) {
            setExtractionMessage('Conteggio pagine non allineato tra viewer e motore di lettura.');
          }
        })
        .catch((error) => {
          if (cancelled || stageRequestRef.current !== requestId) return;
          setStageStatus(error instanceof Error && error.message.includes('desktop') ? 'unavailable' : 'error');
          setFingerprintStatus('');
          setExtractionMessage(messageForExtractionError(error));
        });
    } else if (document.viewType === 'image') {
      setStageStatus('unavailable');
      setExtractionMessage('Per leggere le immagini sarà necessario il riconoscimento OCR, non ancora attivo.');
    } else {
      setStageStatus('unavailable');
      setExtractionMessage('');
    }

    calculateDocumentFingerprint(document.file)
      .then((value) => {
        if (cancelled) return;
        if (stageRequestRef.current === requestId && document.viewType !== 'pdf') {
          setFingerprint(value);
          setFingerprintStatus('Ricerca template associato...');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setFingerprintStatus('Impronta documento non disponibile.');
      });

    return () => {
      cancelled = true;
      if (previousToken) void textExtractionService.releaseStagedDocument(previousToken);
    };
  }, [document, textExtractionService]);

  useEffect(() => {
    if (!document || !fingerprint || !pageCount) return;

    let cancelled = false;
    setFingerprintStatus('Ricerca template associato...');
    templateRepository
      .findByFingerprint(fingerprint)
      .then((template) => {
        if (cancelled) return;
        if (template) {
          applyTemplate(template, pageCount);
          setTemplateMessage(`Template "${template.name}" applicato automaticamente.`);
        } else {
          setFingerprintStatus('');
          setTemplateMessage('Nessun template associato.');
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setFingerprintStatus('');
        setTemplateMessage(messageForTemplateError(error, 'Template non disponibili.'));
      });

    return () => {
      cancelled = true;
    };
  }, [document, fingerprint, pageCount, templateRepository]);

  const replaceDocument = (file?: File) => {
    if (file) {
      requestProtectedAction({ type: 'replace-document', file });
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

    requestProtectedAction({ type: 'navigation', target });
  };

  const requestProtectedAction = (action: ProtectedWorkspaceAction) => {
    if (unsavedLayoutWarning || hasProtectedValues) {
      setPendingLayoutAction(action);
      return;
    }

    void completeProtectedAction(action);
  };

  const completeProtectedAction = async (action: ProtectedWorkspaceAction) => {
    if (action.type === 'navigation') {
      if (drawingMode?.type === 'new') {
        setDrawingMode(null);
      }
      completeNavigation(action.target);
      return;
    }

    if (action.type === 'replace-document') {
      replaceDocumentWithoutPrompt(action.file);
      return;
    }

    if (action.type === 'reload-template') {
      await reloadSharedTemplateWithoutPrompt();
      return;
    }

    await applyTemplateManuallyWithoutPrompt(action.templateId);
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
      requestProtectedAction({ type: 'navigation', target });
    }
  };

  const stayOnWorkspace = () => {
    setPendingLayoutAction(null);
  };

  const discardLayoutAndContinue = () => {
    const action = pendingLayoutAction;
    setPendingLayoutAction(null);
    if (action) void completeProtectedAction(action);
  };

  const saveValuesAndContinue = async () => {
    if (!pendingLayoutAction) return false;
    const saved = await saveDocumentValues();
    if (!saved) return false;
    const action = pendingLayoutAction;
    setPendingLayoutAction(null);
    await completeProtectedAction(action);
    return true;
  };

  const saveTemplateAndStay = async () => {
    if (!pendingLayoutAction || !activeTemplate) return false;
    const saved = await saveTemplateChanges();
    if (!saved) return false;
    setPendingLayoutAction(null);
    setValuesDirty(false);
    setValuesMessage('Il template è stato aggiornato. Riesegui l’estrazione prima di salvare i dati.');
    return true;
  };

  const saveLayoutAndContinue = async () => {
    if (!pendingLayoutAction) return false;

    if (activeTemplate) {
      const saved = await saveTemplateChanges();
      if (!saved) return false;
      const action = pendingLayoutAction;
      setPendingLayoutAction(null);
      await completeProtectedAction(action);
      return true;
    }

    openSaveDialog();
    return true;
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
      invalidateFieldValue(drawingMode.fieldId);
      onSelectRegion(id);
      setDrawingMode(null);
      markTemplateDirty();
      return;
    }

    setDraftRegion(region);
    void onRefreshCatalog();
    onSelectRegion(id);
    setDrawingMode(null);
    setEditor({ type: 'region', regionId: id });
  };

  const changeRegion = (id: string, rect: NormalizedRect) => {
    if (draftRegion?.id === id) {
      setDraftRegion({ ...draftRegion, rect });
      return;
    }
    const previous = regions.find((region) => region.id === id);
    onRegionsChange(regions.map((region) => (region.id === id ? { ...region, rect } : region)));
    if (!previous || !rectEquals(previous.rect, rect)) invalidateValuesForRegion(id);
    markTemplateDirty();
  };

  const saveEditor = async (data: FieldEditorSave) => {
    setEditorError('');
    let definition: FieldDefinition | undefined = data.definitionId
      ? catalog.find((item) => item.id === data.definitionId)
      : findDefinitionByName(catalog, data.name) ?? undefined;

    if (!definition) {
      try {
        definition = await catalogRepository.create({
          id: makeId('definition'),
          name: data.name,
          kind: data.kind,
          valueType: data.valueType,
        });
        await onRefreshCatalog();
      } catch (error) {
        await onRefreshCatalog();
        setEditorError(messageForCatalogError(error, 'Impossibile salvare il campo nel catalogo condiviso.'));
        return;
      }
    }

    if (editor?.type === 'region') {
      const committedRegions = commitDraftRegion(regions, draftRegion);
      onRegionsChange(committedRegions);
      onDocumentFieldsChange(
        associateRegionToDefinition(
          documentFields,
          makeId('field'),
          definition.id,
          editor.regionId,
        ),
      );
      onSelectRegion(editor.regionId);
      setDraftRegion(null);
      markTemplateDirty();
    }

    if (editor?.type === 'change') {
      onDocumentFieldsChange(changeFieldDefinition(documentFields, editor.fieldId, definition.id));
      invalidateFieldValue(editor.fieldId);
      markTemplateDirty();
    }

    setEditor(null);
  };

  const cancelEditor = () => {
    if (editor?.type === 'region') {
      onDocumentFieldsChange(removeRegionFromFields(documentFields, editor.regionId));
      setDraftRegion(null);
      onSelectRegion(null);
    }
    setEditorError('');
    setEditor(null);
  };

  const saveFormat = async (fieldId: string, data: FieldFormatSave) => {
    const field = documentFields.find((item) => item.id === fieldId);
    if (!field) return;
    const definition = catalog.find((item) => item.id === field.definitionId);
    if (!definition) return;
    setEditorError('');
    try {
      const updated = await catalogRepository.updateFormat({
        id: definition.id,
        expectedRevision: definition.revision,
        kind: data.kind,
        valueType: data.valueType,
      });
      onCatalogChange(catalog.map((item) => (item.id === updated.id ? updated : item)));
      await onRefreshCatalog();
      setEditor(null);
    } catch (error) {
      await onRefreshCatalog();
      setEditorError(messageForCatalogError(error, 'Impossibile aggiornare il formato del campo.'));
    }
  };

  const deleteRegion = (regionId: string) => {
    if (draftRegion?.id === regionId) {
      setDraftRegion(null);
      if (selectedRegionId === regionId) onSelectRegion(null);
      if (editor?.type === 'region' && editor.regionId === regionId) setEditor(null);
      return;
    }

    onRegionsChange(regions.filter((region) => region.id !== regionId));
    invalidateValuesForRegion(regionId);
    onDocumentFieldsChange(removeRegionFromFields(documentFields, regionId));
    if (selectedRegionId === regionId) onSelectRegion(null);
    if (editor?.type === 'region' && editor.regionId === regionId) setEditor(null);
    markTemplateDirty();
  };

  const deleteField = (fieldId: string) => {
    const field = documentFields.find((item) => item.id === fieldId);
    if (!field) return;
    onRegionsChange(regions.filter((region) => !field.regionIds.includes(region.id)));
    invalidateFieldValue(fieldId);
    onDocumentFieldsChange(removeField(documentFields, fieldId));
    if (selectedRegionId && field.regionIds.includes(selectedRegionId)) onSelectRegion(null);
    if (editor?.type === 'change' && editor.fieldId === fieldId) setEditor(null);
    markTemplateDirty();
  };

  const requestDeleteRegion = (regionId: string) => {
    requestFieldDeletion({ type: 'region', regionId });
  };

  const requestDeleteField = (fieldId: string) => {
    requestFieldDeletion({ type: 'field', fieldId });
  };

  const requestFieldDeletion = (command: FieldDeletionCommand) => {
    if (hasOpenDialog) return;
    if (fieldDeletionNeedsConfirmation(command, documentFields, fieldValues)) {
      setPendingFieldDeletion(command);
      return;
    }
    deleteFieldCommand(command);
  };

  const cancelFieldDeletion = () => {
    setPendingFieldDeletion(null);
  };

  const confirmFieldDeletion = () => {
    const command = pendingFieldDeletion;
    if (!command) return;
    setPendingFieldDeletion(null);
    deleteFieldCommand(command);
  };

  const deleteFieldCommand = (command: FieldDeletionCommand) => {
    if (command.type === 'region') {
      deleteRegion(command.regionId);
      return;
    }
    deleteField(command.fieldId);
  };

  const applyTemplate = (template: DocumentTemplate, availablePageCount: number) => {
    const layout = applyTemplateToDocument(template, availablePageCount);
    onRegionsChange(layout.regions);
    onDocumentFieldsChange(layout.fields);
    onSelectRegion(null);
    setActiveTemplate(template);
    setTemplateDirty(false);
    setHiddenTemplateRegionCount(layout.hiddenRegionCount);
    setFingerprintStatus('');
    setFieldValues({});
    setValueSetRevision(null);
    setValuesDirty(false);
    setValuesMessage('');
    setValuesConflictOpen(false);
    setConfirmReloadValues(false);
    setValuesReloadError('');
    setPendingFieldDeletion(null);
    valuesLoadRef.current = { sequence: valuesLoadRef.current.sequence + 1, keyId: '' };
  };

  const saveAsTemplate = async () => {
    if (!document || !fingerprint || !pageCount) return;
    const id = makeId('template');
    const fields = templateFromLayout({ templateId: id, catalog, fields: documentFields, regions });
    if (fields.length === 0) {
      setTemplateMessage('Aggiungi almeno un campo prima di salvare il template.');
      return;
    }
    try {
      const template = await templateRepository.create({
        id,
        name: templateName.trim(),
        sourcePageCount: pageCount,
        documentFingerprint: fingerprint,
        documentSize: document.file.size,
        pageCount,
        fields,
      });
      setTemplateDialog(null);
      setTemplateName('');
      applyTemplate(template, pageCount);
      setTemplateMessage(`Template "${template.name}" salvato.`);
      await onRefreshTemplates();
      const action = pendingLayoutAction;
      setPendingLayoutAction(null);
      if (action) await completeProtectedAction(action);
    } catch (error) {
      setTemplateMessage(messageForTemplateError(error, 'Impossibile salvare il template.'));
    }
  };

  const saveTemplateChanges = async () => {
    if (!activeTemplate || !pageCount) return false;
    const fields = templateFromLayout({ templateId: activeTemplate.id, catalog, fields: documentFields, regions });
    if (fields.length === 0) {
      setTemplateMessage('Il template deve contenere almeno un campo.');
      return false;
    }
    try {
      const template = await templateRepository.update({
        id: activeTemplate.id,
        expectedRevision: activeTemplate.revision,
        sourcePageCount: pageCount,
        fields,
      });
      applyTemplate(template, pageCount);
      setTemplateMessage(`Template "${template.name}" aggiornato alla revisione ${template.revision}.`);
      await onRefreshTemplates();
      return true;
    } catch (error) {
      setTemplateMessage(messageForTemplateError(error, 'Impossibile aggiornare il template.'));
      return false;
    }
  };

  const applyLoadedDocumentValues = (
    valueSet: DocumentValueSet | null,
    template: DocumentTemplate,
    fields: DocumentField[],
  ) => {
    const state = applyLoadedDocumentValuesSnapshot({ fields, template, valueSet });
    setFieldValues(state.values);
    setValueSetRevision(state.valueSetRevision);
    setValuesDirty(state.dirty);
    setValuesMessage(state.message);
  };

  const saveDocumentValues = async () => {
    if (!fingerprint || !activeTemplate || templateDirty) return false;
    if (!documentValuesRepository.isAvailable()) {
      setValuesMessage('Il salvataggio dei dati è disponibile nell’app desktop.');
      return false;
    }
    setValuesSaving(true);
    setValuesMessage('Salvataggio dati documento...');
    try {
      const saved = await documentValuesRepository.save({
        fingerprint,
        templateId: activeTemplate.id,
        templateRevision: activeTemplate.revision,
        expectedRevision: valueSetRevision,
        values: buildPersistedFieldValues(documentFields, fieldValues),
      });
      const state = applySavedDocumentValuesSnapshot({ currentValues: fieldValues, saved });
      setValueSetRevision(state.valueSetRevision);
      setFieldValues(state.values);
      setValuesDirty(state.dirty);
      setValuesMessage(state.message);
      setValuesConflictOpen(false);
      return true;
    } catch (error) {
      setValuesMessage(messageForDocumentValuesError(error, 'Impossibile salvare i dati documento.'));
      if (error instanceof DocumentValuesError && error.code === 'revisionConflict') {
        setValuesConflictOpen(true);
        setPendingLayoutAction(null);
      }
      return false;
    } finally {
      setValuesSaving(false);
    }
  };

  const currentDocumentValuesLoadKey = (): DocumentValuesLoadKey | null => buildDocumentValuesLoadKey({
    documentInstanceId: documentInstanceRef.current,
    fingerprint,
    template: activeTemplate,
    fields: documentFields,
  });

  const requestReloadDocumentValuesAfterConflict = () => {
    setValuesReloadError('');
    if (valuesDirty) {
      setConfirmReloadValues(true);
      return;
    }
    void reloadLatestDocumentValues();
  };

  const reloadLatestDocumentValues = async () => {
    const loadKey = currentDocumentValuesLoadKey();
    if (!loadKey || !activeTemplate) {
      setValuesReloadError('Dati documento non ricaricabili in questo momento.');
      return false;
    }
    setValuesReloading(true);
    setValuesReloadError('');
    try {
      const valueSet = await documentValuesRepository.load({
        fingerprint: loadKey.fingerprint,
        templateId: loadKey.templateId,
      });
      const currentKey = currentDocumentValuesLoadKey();
      if (!currentKey || !loadKeyMatches(loadKey, currentKey)) return false;
      applyLoadedDocumentValues(valueSet, activeTemplate, documentFields);
      setValuesConflictOpen(false);
      setConfirmReloadValues(false);
      setPendingLayoutAction(null);
      return true;
    } catch (error) {
      setValuesReloadError(messageForDocumentValuesError(error, 'Impossibile ricaricare i dati documento.'));
      return false;
    } finally {
      setValuesReloading(false);
    }
  };

  const reloadSharedTemplate = async () => {
    requestProtectedAction({ type: 'reload-template' });
  };

  const reloadSharedTemplateWithoutPrompt = async () => {
    if (!activeTemplate || !pageCount) return;
    try {
      const template = await templateRepository.get(activeTemplate.id);
      if (!template) {
        setTemplateMessage('Template non trovato.');
        return;
      }
      applyTemplate(template, pageCount);
      setTemplateMessage(`Template "${template.name}" ricaricato.`);
      await onRefreshTemplates();
    } catch (error) {
      setTemplateMessage(messageForTemplateError(error, 'Impossibile ricaricare il template.'));
    }
  };

  const applyTemplateManually = async (templateId: string) => {
    requestProtectedAction({ type: 'apply-template', templateId });
  };

  const applyTemplateManuallyWithoutPrompt = async (templateId: string) => {
    if (!document || !fingerprint || !pageCount) return;
    try {
      const template = await templateRepository.bind({
        documentFingerprint: fingerprint,
        templateId,
        documentSize: document.file.size,
        pageCount,
      });
      applyTemplate(template, pageCount);
      setTemplateDialog(null);
      setTemplateMessage(`Template "${template.name}" applicato e associato al documento.`);
      await onRefreshTemplates();
    } catch (error) {
      setTemplateMessage(messageForTemplateError(error, 'Impossibile applicare il template.'));
    }
  };

  const markTemplateDirty = () => {
    if (!activeTemplate) return;
    setTemplateDirty(true);
    setTemplateMessage('Modifiche al template non salvate.');
  };

  const invalidateFieldValue = (fieldId: string) => {
    setFieldValues((current) => {
      if (current[fieldId]) setValuesDirty(true);
      return invalidateFieldValues(current, [fieldId]);
    });
  };

  const invalidateValuesForRegion = (regionId: string) => {
    const affected = documentFields
      .filter((field) => field.regionIds.includes(regionId))
      .map((field) => field.id);
    setFieldValues((current) => {
      if (affected.some((fieldId) => current[fieldId])) setValuesDirty(true);
      return invalidateFieldValues(current, affected);
    });
  };

  const requestExtractData = () => {
    if (!canExtractData || extractionBusy) return;
    if (hasManualCorrections(fieldValues)) {
      setConfirmReread(true);
      return;
    }
    void extractData();
  };

  const extractData = async () => {
    if (!stagedDocument) return;
    const fieldsToRead = readableSingleFields(documentFields, catalog, regions);
    if (fieldsToRead.length === 0) return;
    const fieldIds = fieldsToRead.map((field) => field.id);
    const payload = buildExtractionPayload(fieldsToRead, catalog, regions);
    setConfirmReread(false);
    setExtractionBusy(true);
    setExtractionMessage('Lettura campi...');
    setFieldValues((current) => markFieldsReading(current, fieldIds));
    try {
      const results = await textExtractionService.extractPdfRegions(stagedDocument.token, payload);
      setFieldValues((current) => applyRegionExtractionResults(current, fieldIds, results));
      setValuesDirty(true);
      const allEmpty = results.length > 0 && results.every((result) => result.status === 'empty' || !result.rawText.trim());
      setExtractionMessage(allEmpty ? 'Nessun testo leggibile nelle aree selezionate. Il documento potrebbe essere una scansione.' : '');
    } catch (error) {
      setFieldValues((current) => markFieldsExtractionError(current, fieldIds));
      setExtractionMessage(messageForExtractionError(error));
    } finally {
      setExtractionBusy(false);
    }
  };

  const resetTemplateState = () => {
    setPageCount(null);
    setFingerprint(null);
    setFingerprintStatus('');
    setActiveTemplate(null);
    setTemplateDirty(false);
    setTemplateMessage('Nessun template associato.');
    setHiddenTemplateRegionCount(0);
    setTemplateDialog(null);
    setTemplateName('');
    setValueSetRevision(null);
    setValuesDirty(false);
    setValuesMessage('');
    setValuesConflictOpen(false);
    setConfirmReloadValues(false);
    setValuesReloadError('');
    setPendingFieldDeletion(null);
    valuesLoadRef.current = { sequence: valuesLoadRef.current.sequence + 1, keyId: '' };
  };

  const openSaveDialog = () => {
    setTemplateName(activeTemplate?.name ?? document?.name.replace(/\.[^.]+$/, '') ?? '');
    setTemplateDialog('save');
  };

  const replaceDocumentWithoutPrompt = (file: File) => {
    onReplaceDocument(file);
    setDrawingMode(null);
    setEditor(null);
    setDraftRegion(null);
    resetTemplateState();
    setFieldValues({});
  };

  const drawingMessage =
    drawingMode?.type === 'append'
      ? `Trascina sul documento per aggiungere un'altra area a "${labelForField(drawingMode.fieldId, documentFields, catalog)}"`
      : 'Trascina sul documento per delimitare il campo';

  const templateBar = (
    <div className="template-bar" aria-label="Template documentale">
      <div className="template-bar__status">
        <strong>{activeTemplate ? `${activeTemplate.name} - rev. ${activeTemplate.revision}` : 'Template documento'}</strong>
        <span>
          {fingerprintStatus || templateMessage}
          {hiddenTemplateRegionCount > 0 ? ` ${hiddenTemplateRegionCount} aree fuori dalle pagine correnti.` : ''}
        </span>
      </div>
      <div className="template-bar__actions">
        {activeTemplate ? (
          <>
            <button
              className="button button--primary button--compact"
              type="button"
              disabled={!hasTemplateChanges || !templateStoreReady}
              onClick={saveTemplateChanges}
            >
              <Save aria-hidden="true" size={16} />
              Salva modifiche
            </button>
            <button className="button button--secondary button--compact" type="button" onClick={reloadSharedTemplate}>
              <RefreshCw aria-hidden="true" size={16} />
              Ricarica
            </button>
          </>
        ) : (
          <button
            className="button button--primary button--compact"
            type="button"
            disabled={!templateStoreReady || documentFields.length === 0 || !fingerprint || !pageCount}
            onClick={openSaveDialog}
          >
            <Save aria-hidden="true" size={16} />
            Salva template
          </button>
        )}
        <button
          className="button button--secondary button--compact"
          type="button"
          disabled={!templateStoreReady || templateSummaries.length === 0 || !fingerprint || !pageCount}
          onClick={() => setTemplateDialog('apply')}
        >
          <Upload aria-hidden="true" size={16} />
          Applica
        </button>
      </div>
    </div>
  );

  const unsavedWorkspaceDialog =
    pendingLayoutAction && templateDialog !== 'save' && (unsavedLayoutWarning || showUnsavedValuesDialog || showCombinedUnsavedDialog)
      ? showCombinedUnsavedDialog
        ? (
          <UnsavedLayoutDialog
            warning={{
              title: 'Template e dati non salvati',
              description: `Hai modificato il template "${activeTemplate?.name ?? 'corrente'}" e i dati del documento. Salva prima il template, poi riesegui l’estrazione prima di salvare i dati.`,
              saveActionLabel: 'Salva il template e resta',
            }}
            onStay={stayOnWorkspace}
            onDiscard={discardLayoutAndContinue}
            onSaveAndContinue={saveTemplateAndStay}
          />
        )
        : showUnsavedValuesDialog
          ? (
            <UnsavedLayoutDialog
              warning={{
                title: 'Dati non salvati',
                description: 'Hai modificato i dati del documento. Se continui, queste modifiche andranno perse.',
                saveActionLabel: 'Salva dati e continua',
              }}
              onStay={stayOnWorkspace}
              onDiscard={discardLayoutAndContinue}
              onSaveAndContinue={saveValuesAndContinue}
            />
          )
          : unsavedLayoutWarning
            ? (
              <UnsavedLayoutDialog
                warning={unsavedLayoutWarning}
                onStay={stayOnWorkspace}
                onDiscard={discardLayoutAndContinue}
                onSaveAndContinue={saveLayoutAndContinue}
              />
            )
            : null
      : null;

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
          onPageCountChange={setPageCount}
        />
        <DocumentFieldsPanel
          catalog={catalog}
          fields={documentFields}
          regions={regions}
          selectedRegionId={selectedRegionId}
          drawingMode={Boolean(drawingMode)}
          drawingMessage={drawingMessage}
          canAddRegion={canAddRegion}
          catalogStatus={catalogStatus}
          catalogMessage={catalogMessage}
          editorError={editorError}
          templateBar={templateBar}
          fieldValues={fieldValues}
          extractionMessage={
            valuesMessage ||
            (!documentValuesRepository.isAvailable() && activeTemplate
              ? 'Il salvataggio dei dati è disponibile nell’app desktop.'
              : extractionMessage || extractionStatusMessage(document?.viewType ?? null, stageStatus))
          }
          extractionBusy={extractionBusy}
          canExtractData={canExtractData}
          onExtractData={requestExtractData}
          valuesDirty={valuesDirty}
          valuesSaving={valuesSaving}
          canSaveData={canSaveData}
          onSaveData={() => void saveDocumentValues()}
          onEditFieldValue={(fieldId, value) => {
            setFieldValues((current) => editFieldValue(current, fieldId, value));
            setValuesDirty(true);
          }}
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
          onDeleteRegion={requestDeleteRegion}
          onDeleteField={requestDeleteField}
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
      {pendingFieldDeletion ? (
        <DeleteFieldConfirmDialog
          onCancel={cancelFieldDeletion}
          onConfirm={confirmFieldDeletion}
        />
      ) : null}
      {confirmReloadValues ? (
        <ReloadValuesConfirmDialog
          loading={valuesReloading}
          error={valuesReloadError}
          onCancel={() => setConfirmReloadValues(false)}
          onReload={() => void reloadLatestDocumentValues()}
        />
      ) : valuesConflictOpen ? (
        <ValuesConflictDialog
          loading={valuesReloading}
          error={valuesReloadError}
          onStay={() => setValuesConflictOpen(false)}
          onReload={requestReloadDocumentValuesAfterConflict}
        />
      ) : (
        unsavedWorkspaceDialog
      )}
      {templateDialog === 'save' ? (
        <TemplateSaveDialog
          name={templateName}
          fieldCount={documentFields.length}
          regionCount={regions.length}
          pageCount={pageCount}
          message={templateMessage}
          onNameChange={setTemplateName}
          onCancel={() => setTemplateDialog(null)}
          onSave={saveAsTemplate}
        />
      ) : null}
      {templateDialog === 'apply' ? (
        <TemplateApplyDialog
          templates={templateSummaries}
          message={templateMessage}
          onCancel={() => setTemplateDialog(null)}
          onApply={applyTemplateManually}
        />
      ) : null}
      {confirmReread ? (
        <RereadFieldsDialog
          onCancel={() => setConfirmReread(false)}
          onConfirm={() => void extractData()}
        />
      ) : null}
    </>
  );
}

function DeleteFieldConfirmDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      aria-hidden={false}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-field-title"
        aria-describedby="delete-field-description"
      >
        <button className="modal-close" type="button" aria-label="Chiudi" onClick={onCancel}>
          <X aria-hidden="true" size={18} />
        </button>
        <h2 id="delete-field-title">Eliminare il campo?</h2>
        <p id="delete-field-description">
          Il campo contiene un valore estratto o modificato. Eliminandolo verranno rimossi anche il riquadro e il valore associato.
        </p>
        <div className="confirm-dialog__actions">
          <button className="button button--secondary" type="button" onClick={onCancel}>
            Annulla
          </button>
          <button className="button button--danger" type="button" onClick={onConfirm}>
            Elimina campo
          </button>
        </div>
      </section>
    </div>
  );
}

function RereadFieldsDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      aria-hidden={false}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="reread-fields-title">
        <h2 id="reread-fields-title">Rileggere i campi?</h2>
        <p>I valori corretti manualmente saranno sostituiti dalla nuova lettura del documento.</p>
        <div className="confirm-dialog__actions">
          <button className="button button--secondary" type="button" onClick={onCancel}>
            Annulla
          </button>
          <button className="button button--danger" type="button" onClick={onConfirm}>
            Estrai di nuovo
          </button>
        </div>
      </section>
    </div>
  );
}

function ValuesConflictDialog({
  loading,
  error,
  onStay,
  onReload,
}: {
  loading: boolean;
  error: string;
  onStay: () => void;
  onReload: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      aria-hidden={false}
      onMouseDown={(event) => {
        if (!loading && event.target === event.currentTarget) onStay();
      }}
    >
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="values-conflict-title">
        <button className="modal-close" type="button" aria-label="Chiudi" onClick={onStay} disabled={loading}>
          <X aria-hidden="true" size={18} />
        </button>
        <h2 id="values-conflict-title">Dati modificati</h2>
        <p>I dati di questo documento sono stati modificati da un altro operatore. Ricarica i dati prima di salvare.</p>
        {error ? <p className="field-editor-note">{error}</p> : null}
        <div className="confirm-dialog__actions">
          <button className="button button--secondary" type="button" onClick={onStay} disabled={loading}>
            Resta qui
          </button>
          <button className="button button--primary" type="button" onClick={onReload} disabled={loading}>
            {loading ? 'Ricaricamento...' : 'Ricarica dati'}
          </button>
        </div>
      </section>
    </div>
  );
}

function ReloadValuesConfirmDialog({
  loading,
  error,
  onCancel,
  onReload,
}: {
  loading: boolean;
  error: string;
  onCancel: () => void;
  onReload: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      aria-hidden={false}
      onMouseDown={(event) => {
        if (!loading && event.target === event.currentTarget) onCancel();
      }}
    >
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="reload-values-title">
        <button className="modal-close" type="button" aria-label="Chiudi" onClick={onCancel} disabled={loading}>
          <X aria-hidden="true" size={18} />
        </button>
        <h2 id="reload-values-title">Ricaricare i dati?</h2>
        <p>Le modifiche locali saranno sostituite dai dati salvati più recentemente.</p>
        {error ? <p className="field-editor-note">{error}</p> : null}
        <div className="confirm-dialog__actions">
          <button className="button button--secondary" type="button" onClick={onCancel} disabled={loading}>
            Annulla
          </button>
          <button className="button button--danger" type="button" onClick={onReload} disabled={loading}>
            {loading ? 'Ricaricamento...' : 'Ricarica dati'}
          </button>
        </div>
      </section>
    </div>
  );
}

function TemplateSaveDialog({
  name,
  fieldCount,
  regionCount,
  pageCount,
  message,
  onNameChange,
  onCancel,
  onSave,
}: {
  name: string;
  fieldCount: number;
  regionCount: number;
  pageCount: number | null;
  message: string;
  onNameChange: (name: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="modal-backdrop" aria-hidden={false}>
      <section className="confirm-dialog template-dialog" role="dialog" aria-modal="true" aria-labelledby="save-template-title">
        <h2 id="save-template-title">Salva template condiviso</h2>
        <label className="template-dialog__field">
          <span>Nome template</span>
          <input value={name} onChange={(event) => onNameChange(event.target.value)} autoFocus />
        </label>
        <p>
          Verranno salvati {fieldCount} campi, {regionCount} aree, {pageCount ?? 0} pagine sorgente.
        </p>
        <p className="field-editor-note">{message}</p>
        <div className="confirm-dialog__actions">
          <button className="button button--secondary" type="button" onClick={onCancel}>
            Annulla
          </button>
          <button className="button button--primary" type="button" disabled={!name.trim() || fieldCount === 0} onClick={onSave}>
            Salva template
          </button>
        </div>
      </section>
    </div>
  );
}

function TemplateApplyDialog({
  templates,
  message,
  onCancel,
  onApply,
}: {
  templates: DocumentTemplateSummary[];
  message: string;
  onCancel: () => void;
  onApply: (templateId: string) => void;
}) {
  return (
    <div className="modal-backdrop" aria-hidden={false}>
      <section className="confirm-dialog template-dialog" role="dialog" aria-modal="true" aria-labelledby="apply-template-title">
        <h2 id="apply-template-title">Applica template</h2>
        <p>Seleziona un layout condiviso da associare al documento corrente.</p>
        <div className="template-options">
          {templates.map((template) => (
            <button
              key={template.id}
              className="template-option"
              type="button"
              onClick={() => onApply(template.id)}
            >
              <strong>{template.name}</strong>
              <span>
                Rev. {template.revision} - {template.fieldCount} campi - {template.regionCount} aree - {template.sourcePageCount} pagine
              </span>
            </button>
          ))}
        </div>
        <p className="field-editor-note">{message}</p>
        <div className="confirm-dialog__actions">
          <button className="button button--secondary" type="button" onClick={onCancel}>
            Annulla
          </button>
        </div>
      </section>
    </div>
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

function buildExtractionPayload(
  fields: DocumentField[],
  catalog: FieldDefinition[],
  regions: DocumentRegion[],
): ExtractPdfRegionRequest[] {
  return fields.flatMap((field) => {
    const definition = catalog.find((item) => item.id === field.definitionId);
    if (!definition || definition.kind !== 'single') return [];
    return field.regionIds.flatMap((regionId) => {
      const region = regions.find((item) => item.id === regionId);
      if (!region) return [];
      return [{
        regionId: region.id,
        documentFieldId: field.id,
        fieldDefinitionId: definition.id,
        pageNumber: region.pageNumber,
        rect: region.rect,
      }];
    });
  });
}

function extractionStatusMessage(viewType: LocalDocument['viewType'] | null, status: ExtractionStageStatus) {
  if (viewType === 'image') return 'Per leggere le immagini sarà necessario il riconoscimento OCR, non ancora attivo.';
  if (status === 'unavailable') return 'L’estrazione dei dati è disponibile nell’app desktop.';
  if (status === 'staging') return 'Preparazione lettura PDF...';
  if (status === 'error') return 'Lettura PDF non disponibile per questo documento.';
  return '';
}

function isEditingText(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return isTextEditingElement(target);
}

function messageForCatalogError(error: unknown, fallback: string) {
  if (error instanceof FieldCatalogError) return error.message;
  return fallback;
}

function messageForTemplateError(error: unknown, fallback: string) {
  if (error instanceof DocumentTemplateError) return error.message;
  return fallback;
}

function messageForDocumentValuesError(error: unknown, fallback: string) {
  if (error instanceof DocumentValuesError) return error.message;
  return fallback;
}

function messageForExtractionError(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Errore di lettura del documento.';
}
