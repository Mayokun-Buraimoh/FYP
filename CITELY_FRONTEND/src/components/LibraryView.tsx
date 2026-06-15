import { Search, FolderOpen, FileText, MoreVertical, Download, Loader2, ExternalLink } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { cn } from '../lib/utils';
import { getDocuments, type Document, type Recommendation } from '../lib/api';
import { formatRelativeTime } from '../lib/formatDate';

interface LibraryItem extends Recommendation {
    documentTitle: string;
    documentId: number;
    intent: string;
    addedAt: string;
}

interface LibraryViewProps {
    onOpenDocument?: (pdfUrl: string, id: string) => void;
}

export function LibraryView({ onOpenDocument }: LibraryViewProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDocId, setSelectedDocId] = useState<number | 'all'>('all');
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const docs = await getDocuments();
                setDocuments(docs);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to load library.';
                setError(message);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const libraryItems = useMemo(() => {
        const items: LibraryItem[] = [];
        const seen = new Set<number>();

        documents.forEach((doc) => {
            doc.citations?.forEach((citation) => {
                citation.recommendations?.forEach((rec) => {
                    if (seen.has(rec.id)) return;
                    seen.add(rec.id);
                    items.push({
                        ...rec,
                        documentTitle: doc.title || 'Untitled document',
                        documentId: doc.id,
                        intent: citation.intent,
                        addedAt: doc.uploaded_at,
                    });
                });
            });
        });

        return items.sort(
            (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
        );
    }, [documents]);

    const filteredItems = libraryItems.filter((item) => {
        const matchesDoc = selectedDocId === 'all' || item.documentId === selectedDocId;
        const q = searchQuery.trim().toLowerCase();
        const matchesSearch =
            !q ||
            item.title.toLowerCase().includes(q) ||
            item.authors.toLowerCase().includes(q) ||
            item.documentTitle.toLowerCase().includes(q);
        return matchesDoc && matchesSearch;
    });

    const uploadedPapers = documents.map((doc) => ({
        id: doc.id,
        title: doc.title || 'Untitled document',
        count:
            doc.citations?.reduce((sum, c) => sum + (c.recommendations?.length ?? 0), 0) ?? 0,
        fileUrl: doc.file_url,
    }));

    const totalRecs = libraryItems.length;

    return (
        <div className="flex-1 overflow-hidden bg-slate-50/50 flex">
            <div className="w-64 border-r border-slate-border bg-white flex flex-col p-6 overflow-y-auto">
                <h2 className="text-[13px] font-bold text-slate-secondary uppercase tracking-wider mb-6 px-2">
                    Your Papers
                </h2>
                <div className="space-y-1 mb-6">
                    <button
                        onClick={() => setSelectedDocId('all')}
                        className={cn(
                            'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[14px] font-bold transition-all',
                            selectedDocId === 'all'
                                ? 'bg-[#003366] text-white shadow-md shadow-[#003366]/10'
                                : 'text-slate-text hover:bg-slate-50'
                        )}
                    >
                        <div className="flex items-center gap-2.5">
                            <FolderOpen
                                className={cn(
                                    'w-4 h-4',
                                    selectedDocId === 'all' ? 'text-white' : 'text-slate-400'
                                )}
                            />
                            <span>All saved papers</span>
                        </div>
                        <span
                            className={cn(
                                'text-[11px] font-bold',
                                selectedDocId === 'all' ? 'text-white/70' : 'text-slate-secondary'
                            )}
                        >
                            {totalRecs}
                        </span>
                    </button>

                    {uploadedPapers.map((paper) => (
                        <button
                            key={paper.id}
                            onClick={() => setSelectedDocId(paper.id)}
                            className={cn(
                                'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-bold transition-all text-left',
                                selectedDocId === paper.id
                                    ? 'bg-[#003366] text-white shadow-md shadow-[#003366]/10'
                                    : 'text-slate-text hover:bg-slate-50'
                            )}
                        >
                            <span className="truncate pr-2">{paper.title}</span>
                            <span
                                className={cn(
                                    'text-[11px] font-bold shrink-0',
                                    selectedDocId === paper.id ? 'text-white/70' : 'text-slate-secondary'
                                )}
                            >
                                {paper.count}
                            </span>
                        </button>
                    ))}
                </div>

                {uploadedPapers.length > 0 && onOpenDocument && (
                    <div className="border-t border-slate-border pt-4 space-y-2">
                        <p className="text-[10px] font-bold text-slate-secondary uppercase tracking-wider px-2 mb-2">
                            Open PDF
                        </p>
                        {uploadedPapers.map((paper) => (
                            <button
                                key={`open-${paper.id}`}
                                type="button"
                                disabled={!paper.fileUrl}
                                onClick={() => paper.fileUrl && onOpenDocument(paper.fileUrl, paper.id.toString())}
                                className="w-full text-left px-3 py-2 rounded-lg text-[12px] font-bold text-[#003366] hover:bg-[#003366]/5 disabled:opacity-40 truncate"
                            >
                                {paper.title}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex-1 flex flex-col bg-white overflow-hidden">
                <div className="p-8 border-b border-slate-border">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-text mb-1 tracking-tight">
                                Citation Library
                            </h1>
                            <p className="text-slate-secondary text-[14px] font-medium">
                                Papers saved from your uploaded document analyses
                            </p>
                        </div>
                        <button
                            type="button"
                            className="flex items-center gap-2 px-5 py-2.5 bg-[#003366] text-white rounded-xl text-[13px] font-bold hover:bg-[#00254a] transition-all shadow-lg shadow-[#003366]/10"
                            onClick={() => {
                                const blob = new Blob([JSON.stringify(filteredItems, null, 2)], {
                                    type: 'application/json',
                                });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'citely-library.json';
                                a.click();
                                URL.revokeObjectURL(url);
                            }}
                            disabled={filteredItems.length === 0}
                        >
                            <Download className="w-4 h-4" />
                            <span>Export Library</span>
                        </button>
                    </div>

                    <div className="relative group max-w-xl">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#003366] transition-colors">
                            <Search className="w-4 h-4" />
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by title, author, or document…"
                            className="w-full bg-slate-50 border border-slate-border rounded-xl py-3 pl-11 pr-4 text-[14px] font-medium outline-none focus:bg-white focus:border-[#003366] transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 pt-6 space-y-4">
                    {isLoading && (
                        <div className="flex flex-col items-center py-20 text-slate-secondary">
                            <Loader2 className="w-8 h-8 animate-spin text-[#003366] mb-3" />
                            <p className="text-[14px] font-bold">Loading your library…</p>
                        </div>
                    )}

                    {error && (
                        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium">
                            {error}
                        </div>
                    )}

                    {!isLoading && !error && filteredItems.length === 0 && (
                        <div className="text-center py-16 text-slate-secondary">
                            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                            <p className="text-[14px] font-bold mb-1">No saved papers yet</p>
                            <p className="text-[13px] text-slate-400">
                                Analyze an uploaded PDF to save recommended citations here.
                            </p>
                        </div>
                    )}

                    {filteredItems.map((paper) => (
                        <div
                            key={paper.id}
                            className="group bg-white border border-slate-border rounded-2xl p-5 flex items-center gap-6 hover:shadow-md transition-all"
                        >
                            <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-[#003366]">
                                <FileText className="w-6 h-6" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <h3 className="text-[15px] font-bold text-slate-text truncate">
                                        {paper.url ? (
                                            <a
                                                href={paper.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="hover:text-[#003366] hover:underline inline-flex items-center gap-1"
                                            >
                                                {paper.title}
                                                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                                            </a>
                                        ) : (
                                            paper.title
                                        )}
                                    </h3>
                                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-md uppercase">
                                        {paper.intent}
                                    </span>
                                </div>
                                <p className="text-slate-secondary text-[13px] font-medium mb-1">
                                    {paper.authors} • {paper.year || 'N/A'}
                                </p>
                                <p className="text-[11px] font-bold text-slate-400 truncate">
                                    From: {paper.documentTitle}
                                </p>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                                <span className="text-[11px] font-bold text-slate-secondary">
                                    {formatRelativeTime(paper.addedAt)}
                                </span>
                                <button
                                    type="button"
                                    className="p-2 text-slate-400 hover:text-[#003366] transition-all"
                                >
                                    <MoreVertical className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
