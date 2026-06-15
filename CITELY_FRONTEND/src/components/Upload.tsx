import { UploadCloud, FileText, CheckCircle2, X, Loader2 } from 'lucide-react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';
import { getDocuments, uploadDocument } from '../lib/api';
import { formatRelativeTime } from '../lib/formatDate';

interface UploadedFile {
    id: string;
    name: string;
    size: string;
    uploadedAt: string;
    status: 'Ready' | 'Processing';
    url?: string;
}

interface UploadProps {
    onViewAnalysis?: (pdfUrl: string, id: string) => void;
}

export function Upload({ onViewAnalysis }: UploadProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchFiles = async () => {
        try {
            const docs = await getDocuments();
            const mappedFiles: UploadedFile[] = docs.map(doc => ({
                id: doc.id.toString(),
                name: doc.title,
                size: '---', // Size not stored in DB currently
                uploadedAt: formatRelativeTime(doc.uploaded_at),
                status: 'Ready',
                url: doc.file_url
            }));
            setFiles(mappedFiles);
        } catch (error) {
            console.error('Failed to fetch documents:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchFiles();
    }, []);

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const onDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFiles = async (newFiles: FileList | null) => {
        if (!newFiles) return;

        setIsLoading(true);
        try {
            for (const file of Array.from(newFiles)) {
                await uploadDocument(file);
            }
            await fetchFiles();
        } catch (error) {
            console.error('Failed to upload files:', error);
            alert('Failed to upload some files. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
    }, []);

    const handleBrowseClick = () => {
        fileInputRef.current?.click();
    };

    const removeFile = (id: string) => {
        setFiles(files.filter(f => f.id !== id));
    };

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-8 pt-12">
            <div className="max-w-5xl mx-auto">
                <div className="mb-10">
                    <h1 className="text-3xl font-bold text-slate-text mb-2 tracking-tight">Upload Papers</h1>
                    <p className="text-slate-secondary text-[15px] font-medium">
                        Upload research papers to analyze and extract citations
                    </p>
                </div>

                {/* Dropzone */}
                <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    className={cn(
                        "relative group border-2 border-dashed rounded-[32px] p-16 transition-all duration-300 flex flex-col items-center justify-center bg-white",
                        isDragging
                            ? "border-[#003366] bg-[#003366]/5 scale-[0.99]"
                            : "border-slate-200 hover:border-[#003366]/40",
                        isLoading && "opacity-50 pointer-events-none"
                    )}
                >
                    <div className="w-20 h-20 bg-[#003366] rounded-full flex items-center justify-center text-white mb-6 shadow-xl shadow-[#003366]/20 group-hover:scale-110 transition-transform duration-500">
                        {isLoading ? <Loader2 className="w-10 h-10 animate-spin" /> : <UploadCloud className="w-10 h-10" />}
                    </div>

                    <h2 className="text-xl font-bold text-slate-text mb-2">Drag and drop your papers here</h2>
                    <p className="text-slate-secondary text-[14px] font-medium mb-8">
                        Supported formats: PDF, DOC, DOCX (Max 10 MB)
                    </p>

                    <input
                        type="file"
                        multiple
                        className="hidden"
                        ref={fileInputRef}
                        accept=".pdf,.doc,.docx"
                        onChange={(e) => handleFiles(e.target.files)}
                    />
                    <button
                        onClick={handleBrowseClick}
                        className="bg-[#003366] text-white font-bold px-10 py-4 rounded-2xl hover:bg-[#00254a] transition-all shadow-lg shadow-[#003366]/10 active:scale-95"
                    >
                        Browse Files
                    </button>
                </div>

                {/* Uploaded Section */}
                <div className="mt-16">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-slate-text">
                            Uploaded Papers ({files.length})
                        </h2>
                    </div>

                    <div className="space-y-4">
                        {files.map((file) => (
                            <div
                                key={file.id}
                                className="bg-white border border-slate-border rounded-2xl p-5 flex items-center gap-5 hover:shadow-md transition-all group relative"
                            >
                                <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-[#003366]">
                                    <FileText className="w-6 h-6" />
                                </div>

                                <div className="flex-1">
                                    <h3 className="text-[15px] font-bold text-slate-text mb-1">{file.name}</h3>
                                    <div className="flex items-center gap-2 text-slate-secondary text-[13px] font-medium">
                                        <span>{file.size}</span>
                                        <span>•</span>
                                        <span>{file.uploadedAt}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2 text-emerald-600 font-bold text-[13px]">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>Ready</span>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                if (onViewAnalysis && file.url) {
                                                    onViewAnalysis(file.url, file.id);
                                                }
                                            }}
                                            disabled={!file.url}
                                            className="px-5 py-2.5 rounded-xl border border-[#003366]/20 text-[#003366] text-[13px] font-bold hover:bg-[#003366]/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            View Analysis
                                        </button>
                                        <button className="px-5 py-2.5 rounded-xl bg-[#003366] text-white text-[13px] font-bold hover:bg-[#00254a] transition-all shadow-sm">
                                            Add to Project
                                        </button>
                                    </div>
                                </div>

                                <button
                                    onClick={() => removeFile(file.id)}
                                    className="absolute -right-2 -top-2 w-6 h-6 bg-white border border-slate-border rounded-full flex items-center justify-center text-slate-secondary hover:text-red-500 hover:border-red-500 transition-all opacity-0 group-hover:opacity-100 shadow-sm"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
