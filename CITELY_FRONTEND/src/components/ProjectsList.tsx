import { FileText, MoreVertical, Clock, Loader2, UploadCloud } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { getDocuments, type Document } from '../lib/api';
import { formatRelativeTime } from '../lib/formatDate';

type ProjectStatus = 'Uploaded' | 'Analyzed';

const statusStyles: Record<ProjectStatus, string> = {
    Uploaded: 'bg-slate-100 text-slate-700',
    Analyzed: 'bg-blue-100 text-blue-700',
};

function mapDocumentToProject(doc: Document) {
    const citationCount = doc.citations?.length ?? 0;
    const recommendationCount =
        doc.citations?.reduce((sum, c) => sum + (c.recommendations?.length ?? 0), 0) ?? 0;

    return {
        id: doc.id.toString(),
        title: doc.title || 'Untitled document',
        lastEdited: `Uploaded ${formatRelativeTime(doc.uploaded_at)}`,
        status: (citationCount > 0 ? 'Analyzed' : 'Uploaded') as ProjectStatus,
        citationsCount: recommendationCount,
        gapsCount: citationCount,
        fileUrl: doc.file_url,
    };
}

interface ProjectsListProps {
    onOpenDocument: (pdfUrl: string, id: string) => void;
    refreshKey?: number;
}

export function ProjectsList({ onOpenDocument, refreshKey = 0 }: ProjectsListProps) {
    const [projects, setProjects] = useState<ReturnType<typeof mapDocumentToProject>[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const docs = await getDocuments();
                setProjects(docs.map(mapDocumentToProject));
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to load projects.';
                setError(message);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [refreshKey]);

    return (
        <div className="flex-1 overflow-y-auto bg-white p-10">
            <div className="max-w-4xl mx-auto">
                <div className="mb-10">
                    <h1 className="text-[32px] font-bold text-slate-text mb-2 tracking-tight">My Projects</h1>
                    <p className="text-slate-secondary text-[15px] font-medium">
                        Your uploaded research papers
                    </p>
                </div>

                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-secondary">
                        <Loader2 className="w-10 h-10 animate-spin text-[#003366] mb-4" />
                        <p className="text-[14px] font-bold">Loading your papers…</p>
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium mb-6">
                        {error}
                    </div>
                )}

                {!isLoading && !error && projects.length === 0 && (
                    <div className="text-center py-20 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                        <UploadCloud className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <p className="text-[15px] font-bold text-slate-secondary mb-2">No papers yet</p>
                        <p className="text-[13px] text-slate-400 font-medium">
                            Upload a PDF from the Upload tab to see it here.
                        </p>
                    </div>
                )}

                <div className="space-y-4">
                    {projects.map((project) => (
                        <div
                            key={project.id}
                            onClick={() => {
                                if (project.fileUrl) {
                                    onOpenDocument(project.fileUrl, project.id);
                                }
                            }}
                            className={cn(
                                'group bg-white border border-slate-border rounded-xl p-6 hover:shadow-lg hover:border-[#003366]/30 transition-all relative',
                                project.fileUrl ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                            )}
                        >
                            <div className="flex items-start justify-between mb-6">
                                <div className="flex items-start gap-4">
                                    <div className="mt-1 text-[#003366] opacity-80 group-hover:opacity-100 transition-opacity">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-[16px] font-bold text-slate-text mb-1.5 group-hover:text-[#003366] transition-colors">
                                            {project.title}
                                        </h3>
                                        <div className="flex items-center gap-1.5 text-[13px] text-slate-secondary font-medium">
                                            <Clock className="w-3.5 h-3.5" />
                                            <span>{project.lastEdited}</span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    className="p-2 -mt-2 -mr-2 text-slate-400 hover:text-slate-text hover:bg-slate-50 rounded-lg transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <MoreVertical className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex items-center justify-between ml-9">
                                <span
                                    className={cn(
                                        'px-2.5 py-1 rounded-md text-[11px] font-bold',
                                        statusStyles[project.status]
                                    )}
                                >
                                    {project.status}
                                </span>

                                <div className="flex items-center gap-4 text-[13px] font-medium text-slate-secondary">
                                    <span>{project.citationsCount} suggested papers</span>
                                    {project.gapsCount > 0 && (
                                        <span>{project.gapsCount} citation gaps</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
