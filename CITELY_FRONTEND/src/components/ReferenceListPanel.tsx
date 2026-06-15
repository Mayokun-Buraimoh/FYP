import { useEffect, useState } from 'react';
import { BookMarked, Loader2 } from 'lucide-react';
import { useDocumentWorkspace } from '../context/DocumentWorkspaceContext';
import { buildMergedReferenceList } from '../lib/referenceList';
import { paragraphsToDisplayHtml } from '../lib/manuscriptUtils';

export function ReferenceListPanel() {
    const ctx = useDocumentWorkspace();
    const [references, setReferences] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!ctx?.document) {
            setReferences([]);
            return;
        }

        const inserted = ctx.document.inserted_citations ?? [];
        const manuscriptHtml = paragraphsToDisplayHtml(ctx.paragraphs);

        let cancelled = false;
        setLoading(true);
        buildMergedReferenceList(inserted, ctx.citationStyle, manuscriptHtml)
            .then((list) => {
                if (!cancelled) setReferences(list);
            })
            .catch(console.error)
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [
        ctx?.document?.inserted_citations,
        ctx?.citationStyle,
        ctx?.document,
        ctx?.paragraphs,
    ]);

    if (!ctx) return null;

    const count = references.length;

    return (
        <section className="shrink-0 border-t border-slate-200 bg-white py-8">
            <div className="w-full max-w-6xl mx-auto px-6 lg:px-10">
                <div className="flex items-center gap-2 mb-1">
                    <BookMarked className="w-5 h-5 text-[#003366]" />
                    <h2 className="text-lg font-bold text-slate-text tracking-tight">References</h2>
                    {count > 0 && (
                        <span className="text-[11px] font-bold text-slate-secondary bg-slate-100 px-2 py-0.5 rounded-lg">
                            {count}
                        </span>
                    )}
                </div>
                <p className="text-[12px] text-slate-secondary font-medium mb-4">
                    Combines references from your manuscript with newly inserted citations, sorted
                    alphabetically for your citation style.
                </p>

                {loading && (
                    <div className="flex items-center gap-2 text-[12px] text-slate-secondary py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-[#003366]" />
                        Updating reference list…
                    </div>
                )}

                {!loading && count === 0 && (
                    <p className="text-[13px] text-slate-400 py-2">
                        No references yet. Import a PDF with a References section, or insert citations
                        from Smart Suggestions.
                    </p>
                )}

                {!loading && count > 0 && (
                    <ol className="list-decimal list-outside pl-5 space-y-3 manuscript-prose text-[15px] leading-relaxed text-slate-text">
                        {references.map((entry, idx) => (
                            <li key={`ref-${idx}`} className="pl-1">
                                {entry}
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </section>
    );
}
