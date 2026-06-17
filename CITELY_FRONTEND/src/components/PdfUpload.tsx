import { useState, useRef } from 'react';
import { UploadCloud, FileText, ExternalLink, Loader2, X, CheckCircle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

interface UploadedDocument {
    id: number;
    title: string;
    file_url: string;
    uploaded_at: string;
}

export function PdfUpload() {
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [documents, setDocuments] = useState<UploadedDocument[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // ── Fetch existing documents on first render ──────────────────────────────
    useState(() => {
        fetch(`${API_BASE}/documents/`)
            .then(r => r.json())
            .then((data: UploadedDocument[]) => setDocuments(data))
            .catch(() => {/* silent */});
    });

    const uploadFile = async (file: File) => {
        if (!file.name.endsWith('.pdf') && !file.name.endsWith('.docx')) {
            setError('Only PDF and Word (.docx) files are accepted.');
            return;
        }

        setError(null);
        setSuccessMsg(null);
        setUploading(true);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', file.name.replace('.pdf', '').replace('.docx', ''));

        try {
            const res = await fetch(`${API_BASE}/documents/`, {
                method: 'POST',
                body: formData,   // No Content-Type header — browser sets it with boundary
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.detail || 'Upload failed. Please try again.');
            }

            const doc: UploadedDocument = await res.json();
            setDocuments(prev => [doc, ...prev]);
            setSuccessMsg(`"${doc.title}" uploaded successfully.`);
            setTimeout(() => setSuccessMsg(null), 4000);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Upload failed.');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) uploadFile(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) uploadFile(file);
    };

    const removeDoc = (id: number) =>
        setDocuments(prev => prev.filter(d => d.id !== id));

    return (
        <div className="flex-1 p-8 overflow-y-auto bg-slate-50">
            <h2 className="text-2xl font-bold text-[#1e3a6e] mb-1">Upload Papers</h2>
            <p className="text-sm text-slate-500 mb-8">Upload PDFs or Word Documents to analyse and extract citations</p>

            {/* Drop Zone */}
            <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => !uploading && inputRef.current?.click()}
                className={`
                    border-2 border-dashed rounded-2xl p-14 flex flex-col items-center justify-center
                    cursor-pointer transition-all duration-200 mb-6
                    ${dragging ? 'border-[#1e3a6e] bg-[#1e3a6e]/5' : 'border-slate-300 bg-white hover:border-[#1e3a6e]/50 hover:bg-slate-100/60'}
                    ${uploading ? 'pointer-events-none opacity-70' : ''}
                `}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.docx"
                    className="hidden"
                    onChange={handleFileInput}
                />

                {uploading ? (
                    <>
                        <Loader2 className="w-12 h-12 text-[#1e3a6e] animate-spin mb-4" />
                        <p className="text-[15px] font-semibold text-[#1e3a6e]">Uploading…</p>
                    </>
                ) : (
                    <>
                        <UploadCloud className="w-12 h-12 text-slate-400 mb-4" />
                        <p className="text-[15px] font-semibold text-slate-700">
                            Drag & drop your file here, or <span className="text-[#1e3a6e] underline">browse</span>
                        </p>
                        <p className="text-xs text-slate-400 mt-2">Only .pdf and .docx files are accepted</p>
                    </>
                )}
            </div>

            {/* Feedback banners */}
            {error && (
                <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-600 font-medium">
                    {error}
                </div>
            )}
            {successMsg && (
                <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-[13px] text-green-700 font-medium flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    {successMsg}
                </div>
            )}

            {/* Uploaded PDFs list */}
            {documents.length > 0 && (
                <div>
                    <h3 className="text-[13px] font-semibold text-slate-500 uppercase tracking-widest mb-3">
                        Uploaded Documents ({documents.length})
                    </h3>
                    <ul className="space-y-2">
                        {documents.map(doc => (
                            <li
                                key={doc.id}
                                className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 hover:shadow-sm transition group"
                            >
                                <FileText className="w-5 h-5 text-[#1e3a6e] shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[14px] font-semibold text-gray-800 truncate">{doc.title || 'Untitled'}</p>
                                    <p className="text-[12px] text-slate-400">
                                        {new Date(doc.uploaded_at).toLocaleString()}
                                    </p>
                                </div>
                                <a
                                    href={doc.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[13px] text-[#1e3a6e] font-semibold hover:underline shrink-0"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    Open
                                </a>
                                <button
                                    onClick={() => removeDoc(doc.id)}
                                    className="opacity-0 group-hover:opacity-100 transition text-slate-400 hover:text-red-500 ml-1"
                                    title="Remove from list"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
