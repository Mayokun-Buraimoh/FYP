import { TrendingUp, FileText, ExternalLink } from 'lucide-react';
import { Badge } from './Badge';

interface CitationCardProps {
    title: string;
    authors: string;
    year: string;
    matchScore: number;
    influentialCitations: number;
    url?: string;
    isOpenAccess?: boolean;
    onInsert?: () => void;
    onViewAbstract?: () => void;
    insertDisabled?: boolean;
    insertDisabledReason?: string;
    inserted?: boolean;
    matchLabel?: string;
    /** API source label, e.g. "OpenAlex" or "OpenAlex, Crossref". */
    source?: string;
    /** Show Insert Citation and Abstract buttons (default true). */
    showActions?: boolean;
}

export function CitationCard({
    title,
    authors,
    year,
    matchScore,
    influentialCitations,
    url,
    onInsert,
    onViewAbstract,
    insertDisabled = false,
    insertDisabledReason,
    inserted = false,
    matchLabel = 'Intent confidence',
    source,
    showActions = true,
}: CitationCardProps) {
    const sourceLabel = source
        ? source
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' '))
              .join(', ')
        : null;

    return (
        <div className="bg-white border border-slate-border rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all transform hover:-translate-y-0.5 group">
            <div className="flex flex-wrap gap-2 items-center justify-between mb-3.5">
                <div className="flex flex-wrap gap-2 items-center">
                    <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-2.5 py-1 text-[11px] font-bold">
                        {matchScore}% {matchLabel}
                    </Badge>
                    {sourceLabel && (
                        <Badge className="bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1 text-[10px] font-bold">
                            {sourceLabel}
                        </Badge>
                    )}
                </div>
                <div className="flex items-center text-slate-secondary text-[10px] font-bold tracking-tight bg-slate-50 px-2 py-1 rounded-lg">
                    <TrendingUp className="w-3 h-3 mr-1 text-[#003366]" />
                    <span className="uppercase">{influentialCitations} Influential Citations</span>
                </div>
            </div>

            <h3 className="text-[#1a1a1a] font-bold text-[14px] leading-[1.4] mb-1.5 group-hover:text-[#003366] transition-colors">
                {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">
                        {title}
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                ) : (
                    title
                )}
            </h3>

            <p
                className={`text-slate-secondary text-[12px] font-medium ${showActions ? 'mb-5' : 'mb-0'}`}
            >
                {authors} • {year}
            </p>

            {showActions && (
                <div className="flex gap-2.5">
                    <button
                        type="button"
                        onClick={onInsert}
                        disabled={insertDisabled || !onInsert || inserted}
                        title={insertDisabledReason}
                        className="flex-1 bg-[#003366] text-white text-[12px] font-bold py-3 rounded-xl hover:bg-[#002855] transition-all active:scale-[0.97] shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {inserted ? 'Inserted' : 'Insert Citation'}
                    </button>
                    <button
                        type="button"
                        onClick={onViewAbstract}
                        className="px-4 border border-[#003366]/20 text-[#003366] text-[12px] font-bold py-3 rounded-xl hover:bg-[#003366]/5 transition-all flex items-center justify-center active:scale-[0.97]"
                    >
                        <FileText className="w-4 h-4 mr-1.5" />
                        Abstract
                    </button>
                </div>
            )}
        </div>
    );
}
