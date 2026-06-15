import { useCallback, useState } from 'react';
import { ArrowLeft, Download, X } from 'lucide-react';
import { downloadManuscriptDocx } from '../lib/api';
import { DocumentWorkspaceProvider, useDocumentWorkspace } from '../context/DocumentWorkspaceContext';
import { SemanticDocumentViewer } from './SemanticDocumentViewer';
import { ManuscriptEditor } from './ManuscriptEditor';
import { RecommendationSidebar } from './RecommendationSidebar';
import { CitationStyleSelector } from './CitationStyleSelector';
import { cn } from '../lib/utils';

interface DocumentWorkspaceProps {
    documentId: string;
    pdfUrl: string;
    onBack: () => void;
}

function DocumentWorkspaceInner({ onBack }: { onBack: () => void }) {
    const ctx = useDocumentWorkspace();
    const [exporting, setExporting] = useState(false);


    const handleDownloadWord = useCallback(async () => {
        if (!ctx?.documentId || exporting) return;
        setExporting(true);
        try {
            const baseName = (ctx.document?.title || 'manuscript').replace(/[^\w\s-]/g, '').trim() || 'manuscript';
            await downloadManuscriptDocx(ctx.documentId, `${baseName}.docx`);
            ctx.showToast?.('Manuscript downloaded as Word.');
        } catch (e) {
            ctx.showToast?.(e instanceof Error ? e.message : 'Export failed.');
        } finally {
            setExporting(false);
        }
    }, [ctx, exporting]);

    if (!ctx) return null;

    return (
        <div className="flex h-screen w-full bg-slate-50">
            <div className="flex-1 flex flex-col min-w-0">
                <div className="h-16 border-b border-slate-border px-6 flex items-center justify-between bg-white shrink-0 gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            type="button"
                            onClick={onBack}
                            className="p-2 -ml-1 text-slate-400 hover:text-slate-text hover:bg-slate-50 rounded-lg"
                            title="Back"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h1 className="text-lg font-semibold text-slate-text truncate">
                            {ctx.document?.title || 'Document'}
                        </h1>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={handleDownloadWord}
                            disabled={exporting}
                            title="Download manuscript as Word"
                            className="flex items-center gap-2 px-3 py-2 text-[12px] font-bold text-slate-secondary hover:text-[#003366] hover:bg-slate-50 rounded-lg border border-slate-border disabled:opacity-50"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">
                                {exporting ? 'Exporting…' : 'Word'}
                            </span>
                        </button>
                        <span className="text-xs font-bold text-slate-secondary hidden sm:inline">
                            Citation style
                        </span>
                        <CitationStyleSelector
                            value={ctx.citationStyle}
                            onChange={ctx.setCitationStyle}
                        />
                        <div className="flex rounded-xl border border-slate-border overflow-hidden">
                            {(['pdf', 'manuscript'] as const).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => ctx.setActiveTab(t)}
                                    className={cn(
                                        'px-4 py-2 text-[12px] font-bold capitalize transition-colors',
                                        ctx.activeTab === t
                                            ? 'bg-[#003366] text-white'
                                            : 'bg-white text-slate-secondary hover:bg-slate-50'
                                    )}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {ctx.toast && (
                    <div className="mx-6 mt-3 flex items-center justify-between gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm font-medium">
                        <span>{ctx.toast}</span>
                        <button type="button" onClick={ctx.clearToast} className="p-1 hover:bg-emerald-100 rounded">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    {ctx.activeTab === 'pdf' ? (
                        <SemanticDocumentViewer
                            embedded
                            pdfUrl={ctx.pdfUrl}
                            documentId={ctx.documentId}
                            initialMatches={[]}
                            hideAnalysisSidebar
                            onSelectionChange={ctx.setSelectedSentence}
                            onInsertRecommendation={ctx.insertCitationForRecommendation}
                            onManualSuggestion={ctx.addManualSuggestion}
                        />
                    ) : (
                        <ManuscriptEditor />
                    )}
                </div>
            </div>

            <RecommendationSidebar inWorkspace />
        </div>
    );
}

export function DocumentWorkspace({ documentId, pdfUrl, onBack }: DocumentWorkspaceProps) {
    return (
        <DocumentWorkspaceProvider documentId={documentId} pdfUrl={pdfUrl}>
            <DocumentWorkspaceInner onBack={onBack} />
        </DocumentWorkspaceProvider>
    );
}
