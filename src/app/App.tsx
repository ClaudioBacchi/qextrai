import { useEffect, useMemo, useState } from 'react';
import { createLocalDocument, type LocalDocument } from './documentTypes';
import { HomePage } from '../pages/HomePage';
import { PreferencesPage } from '../pages/PreferencesPage';
import { WorkspacePage } from '../pages/WorkspacePage';
import type { DocumentRegion } from '../components/document/documentGeometry';
import type { DocumentField, FieldDefinition } from '../domain/fieldTypes';
import {
  createFieldCatalogRepository,
  type FieldCatalogRepository,
  type FieldCatalogStatus,
} from '../domain/fieldCatalogRepository';
import {
  createDocumentTemplateRepository,
  type DocumentTemplateRepository,
} from '../domain/documentTemplateRepository';
import {
  createDocumentTextExtractionService,
  type DocumentTextExtractionService,
} from '../domain/documentTextExtractionService';
import {
  createDocumentValuesRepository,
  type DocumentValuesRepository,
} from '../domain/documentValuesRepository';
import type { DocumentTemplateSummary } from '../domain/documentTemplates';
import { isTauriRuntime } from '../services/tauriRuntime';

export type AppView = 'home' | 'workspace' | 'preferences';

export function App() {
  const [view, setView] = useState<AppView>('home');
  const [documentFile, setDocumentFile] = useState<LocalDocument | null>(null);
  const [fieldCatalog, setFieldCatalog] = useState<FieldDefinition[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<FieldCatalogStatus>('loading');
  const [catalogMessage, setCatalogMessage] = useState('');
  const [templateSummaries, setTemplateSummaries] = useState<DocumentTemplateSummary[]>([]);
  const [templateStatus, setTemplateStatus] = useState<FieldCatalogStatus>('loading');
  const [documentFields, setDocumentFields] = useState<DocumentField[]>([]);
  const [regions, setRegions] = useState<DocumentRegion[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const catalogRepository = useMemo<FieldCatalogRepository>(() => createFieldCatalogRepository(), []);
  const templateRepository = useMemo<DocumentTemplateRepository>(() => createDocumentTemplateRepository(), []);
  const textExtractionService = useMemo<DocumentTextExtractionService>(() => createDocumentTextExtractionService(), []);
  const documentValuesRepository = useMemo<DocumentValuesRepository>(() => createDocumentValuesRepository(), []);

  const refreshCatalog = async (mode: 'initial' | 'refresh' = 'refresh') => {
    const desktop = isTauriRuntime();
    setCatalogStatus((current) => {
      if (!desktop) return 'temporary';
      if (mode === 'initial' && fieldCatalog.length === 0) return 'loading';
      return current === 'ready' || current === 'stale' ? 'refreshing' : current;
    });
    try {
      const catalog = await catalogRepository.list();
      setFieldCatalog(catalog);
      setCatalogStatus(desktop ? 'ready' : 'temporary');
      setCatalogMessage('');
    } catch {
      setCatalogStatus((current) => (fieldCatalog.length > 0 || current === 'refreshing' ? 'stale' : 'unavailable'));
      setCatalogMessage('Catalogo non disponibile.');
    }
  };

  useEffect(() => {
    void refreshCatalog('initial');
    void refreshTemplates();
  }, []);

  const refreshTemplates = async () => {
    const desktop = isTauriRuntime();
    setTemplateStatus((current) => (!desktop ? 'temporary' : current === 'ready' ? 'refreshing' : 'loading'));
    try {
      const summaries = await templateRepository.list();
      setTemplateSummaries(summaries);
      setTemplateStatus(desktop ? 'ready' : 'temporary');
    } catch {
      setTemplateStatus(templateSummaries.length > 0 ? 'stale' : 'unavailable');
    }
  };

  const openWorkspace = (file: File) => {
    void refreshCatalog('refresh');
    void refreshTemplates();
    setDocumentFile(createLocalDocument(file));
    setDocumentFields([]);
    setRegions([]);
    setSelectedRegionId(null);
    setView('workspace');
  };

  const closeDocument = () => {
    setDocumentFile(null);
    setDocumentFields([]);
    setRegions([]);
    setSelectedRegionId(null);
    setView('home');
  };

  const replaceDocument = (file: File) => {
    void refreshCatalog('refresh');
    void refreshTemplates();
    setDocumentFile(createLocalDocument(file));
    setDocumentFields([]);
    setRegions([]);
    setSelectedRegionId(null);
  };

  return (
    <div className={`app-shell app-shell--${view}`}>
      {view === 'home' && (
        <HomePage
          onOpenDocument={openWorkspace}
          onOpenPreferences={() => setView('preferences')}
        />
      )}
      {view === 'workspace' && (
        <WorkspacePage
          document={documentFile}
          catalog={fieldCatalog}
          documentFields={documentFields}
          regions={regions}
          selectedRegionId={selectedRegionId}
          onCatalogChange={setFieldCatalog}
          catalogStatus={catalogStatus}
          catalogMessage={catalogMessage}
          catalogRepository={catalogRepository}
          onRefreshCatalog={() => refreshCatalog('refresh')}
          templateRepository={templateRepository}
          textExtractionService={textExtractionService}
          documentValuesRepository={documentValuesRepository}
          templateSummaries={templateSummaries}
          templateStatus={templateStatus}
          onRefreshTemplates={refreshTemplates}
          onDocumentFieldsChange={setDocumentFields}
          onRegionsChange={setRegions}
          onSelectRegion={setSelectedRegionId}
          onReplaceDocument={replaceDocument}
          onBack={closeDocument}
          onOpenPreferences={() => setView('preferences')}
        />
      )}
      {view === 'preferences' && (
        <PreferencesPage
          onBack={() => setView(documentFile ? 'workspace' : 'home')}
          catalogStatus={catalogStatus}
          catalogCount={fieldCatalog.length}
          templateStatus={templateStatus}
          templateCount={templateSummaries.length}
        />
      )}
    </div>
  );
}
