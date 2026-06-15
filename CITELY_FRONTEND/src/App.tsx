import { useState } from 'react';
import { LibrarySidebar, type ViewType } from './components/LibrarySidebar';
import { RecommendationSidebar } from './components/RecommendationSidebar';
import { Upload } from './components/Upload';
import { SearchView } from './components/SearchView';
import { LibraryView } from './components/LibraryView';
import { ProjectsList } from './components/ProjectsList';
import { DocumentWorkspace } from './components/DocumentWorkspace';
import { SignIn } from './components/SignIn';
import { SignUp } from './components/SignUp';
import { isAuthenticated, logout } from './lib/api';

type AppPage = 'signin' | 'signup' | 'app';

function App() {
  const [page, setPage] = useState<AppPage>(isAuthenticated() ? 'app' : 'signin');
  const [activeView, setActiveView] = useState<ViewType | 'viewer'>('projects');
  const [selectedPdfUrl, setSelectedPdfUrl] = useState<string>('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [viewerReturnView, setViewerReturnView] = useState<ViewType>('upload');
  const [dataRefreshKey, setDataRefreshKey] = useState(0);

  const handleSignOut = () => {
    logout();
    setPage('signin');
  };

  if (page === 'signin') {
    return (
      <SignIn
        onSignIn={() => setPage('app')}
        onGoToSignUp={() => setPage('signup')}
      />
    );
  }

  if (page === 'signup') {
    return (
      <SignUp
        onSignUp={() => setPage('signin')}
        onGoToSignIn={() => setPage('signin')}
      />
    );
  }

  const handleNavigate = (view: ViewType) => {
    setActiveView(view);
  };

  const openDocumentViewer = (pdfUrl: string, id: string, returnTo: ViewType = 'upload') => {
    setSelectedPdfUrl(pdfUrl);
    setSelectedDocId(id);
    setViewerReturnView(returnTo);
    setActiveView('viewer');
  };

  return (
    <div className="flex min-h-screen bg-white">
      <LibrarySidebar
        activeView={activeView === 'viewer' ? viewerReturnView : (activeView as ViewType)}
        onNavigate={handleNavigate}
        onSignOut={handleSignOut}
      />

      <main className="flex-1 flex overflow-hidden">
        {activeView === 'projects' ? (
          <>
            <ProjectsList
              refreshKey={dataRefreshKey}
              onOpenDocument={(url, id) => openDocumentViewer(url, id, 'projects')}
            />
            <RecommendationSidebar refreshKey={String(dataRefreshKey)} />
          </>
        ) : activeView === 'upload' ? (
          <Upload onViewAnalysis={(url, id) => openDocumentViewer(url, id, 'upload')} />
        ) : activeView === 'search' ? (
          <SearchView />
        ) : activeView === 'library' ? (
          <LibraryView onOpenDocument={(url, id) => openDocumentViewer(url, id, 'library')} />
        ) : activeView === 'viewer' ? (
          selectedPdfUrl && selectedDocId ? (
            <DocumentWorkspace
              documentId={selectedDocId}
              pdfUrl={selectedPdfUrl}
              onBack={() => {
                setDataRefreshKey((k) => k + 1);
                setActiveView(viewerReturnView);
              }}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-secondary font-medium">
              No document selected.
            </div>
          )
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-secondary font-bold uppercase tracking-widest text-sm">
            {activeView} View Coming Soon
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
