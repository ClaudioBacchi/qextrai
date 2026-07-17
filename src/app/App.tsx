import { useState } from 'react';
import { createLocalDocument, type LocalDocument } from './documentTypes';
import { HomePage } from '../pages/HomePage';
import { PreferencesPage } from '../pages/PreferencesPage';
import { WorkspacePage } from '../pages/WorkspacePage';
import type { DocumentRegion } from '../components/document/documentGeometry';
import type { DocumentField, FieldDefinition } from '../domain/fieldTypes';

export type AppView = 'home' | 'workspace' | 'preferences';

export function App() {
  const [view, setView] = useState<AppView>('home');
  const [documentFile, setDocumentFile] = useState<LocalDocument | null>(null);
  const [fieldCatalog, setFieldCatalog] = useState<FieldDefinition[]>([]);
  const [documentFields, setDocumentFields] = useState<DocumentField[]>([]);
  const [regions, setRegions] = useState<DocumentRegion[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  const openWorkspace = (file: File) => {
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
        />
      )}
    </div>
  );
}
