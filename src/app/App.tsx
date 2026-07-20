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
import { isTauriRuntime } from '../services/tauriRuntime';

export type AppView = 'home' | 'workspace' | 'preferences';

export function App() {
  const [view, setView] = useState<AppView>('home');
  const [documentFile, setDocumentFile] = useState<LocalDocument | null>(null);
  const [fieldCatalog, setFieldCatalog] = useState<FieldDefinition[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<FieldCatalogStatus>('loading');
  const [catalogMessage, setCatalogMessage] = useState('');
  const [documentFields, setDocumentFields] = useState<DocumentField[]>([]);
  const [regions, setRegions] = useState<DocumentRegion[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const catalogRepository = useMemo<FieldCatalogRepository>(() => createFieldCatalogRepository(), []);

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
  }, []);

  const openWorkspace = (file: File) => {
    void refreshCatalog('refresh');
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
        />
      )}
    </div>
  );
}
