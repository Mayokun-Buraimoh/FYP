import type { Recommendation } from '../lib/api';
import { isRecommendationInserted } from '../lib/recommendationUtils';
import { resolvePaperUrl } from '../lib/paperUrl';

import type { PdfHighlightPosition } from '../lib/pdfUtils';

export interface SuggestionItem {
    id: string;
    sentence: string;
    intent: string;
    score: number;
    recommendations: Recommendation[];
    source: 'manual' | 'ai';
    pageNumber?: number | null;
    pageWidth?: number | null;
    pageHeight?: number | null;
    boundingBoxes?: { x1: number; y1: number; x2: number; y2: number }[];
    pdfHighlightPosition?: PdfHighlightPosition;
}

interface SuggestionCardProps {
    item: SuggestionItem;
    onSelect?: () => void;
    onInsertRecommendation?: (rec: Recommendation, sentence: string) => void;
    insertedIds?: Set<number>;
    isSelected?: boolean;
}

export function SuggestionCard({
    item,
    onSelect,
    onInsertRecommendation,
    insertedIds,
    isSelected = false,
}: SuggestionCardProps) {
    const isManual = item.source === 'manual';
    return (
        <li
            onClick={onSelect}
            className={`bg-white shadow-sm border rounded-xl overflow-hidden transition-all list-none ${
                onSelect ? 'cursor-pointer hover:border-blue-300 hover:shadow-md' : ''
            } ${isManual ? 'border-emerald-200' : 'border-slate-200'} ${
                isSelected ? 'ring-2 ring-[#003366]/40 border-[#003366]/50' : ''
            }`}
        >
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-[11px] font-bold uppercase tracking-wider rounded-md">
                            {item.intent}
                        </span>
                        <span
                            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md ${
                                isManual
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-100 text-slate-600'
                            }`}
                        >
                            {isManual ? 'Your selection' : 'AI detected gap'}
                        </span>
                    </div>
                    <span className="text-slate-400 text-[12px] font-medium">
                        Confidence: {(item.score * 100).toFixed(1)}%
                    </span>
                </div>
                <p className="text-[14px] font-medium text-slate-700 leading-relaxed italic">
                    &ldquo;{item.sentence}&rdquo;
                </p>
                {onSelect && (
                    <p className="mt-2 text-[11px] font-semibold text-[#003366]/70">
                        Click to go to source sentence
                    </p>
                )}
            </div>

            <div className="p-4">
                <h4 className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Recommended Papers
                </h4>
                {!item.recommendations?.length ? (
                    <p className="text-[13px] text-slate-500 italic">No papers found for this sentence.</p>
                ) : (
                    <ul className="space-y-3">
                        {item.recommendations.map((rec, recIdx) => {
                            const inserted = isRecommendationInserted(rec, insertedIds);
                            const paperUrl = resolvePaperUrl(rec);
                            const rowKey =
                                typeof rec.id === 'number' && rec.id > 0
                                    ? String(rec.id)
                                    : `${rec.doi || rec.title}-${recIdx}`;
                            return (
                                <li key={rowKey} className="text-[13px] flex flex-col gap-2">
                                    {paperUrl ? (
                                        <a
                                            href={paperUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="font-bold text-blue-600 hover:text-blue-800 hover:underline leading-tight"
                                        >
                                            {rec.title} ({rec.year || 'N/A'})
                                        </a>
                                    ) : (
                                        <span className="font-bold text-slate-800 leading-tight">
                                            {rec.title} ({rec.year || 'N/A'})
                                        </span>
                                    )}
                                    <span
                                        className="text-slate-500 font-medium truncate"
                                        title={rec.authors}
                                    >
                                        {rec.authors || 'Unknown Authors'}
                                    </span>
                                    {onInsertRecommendation && (
                                        <button
                                            type="button"
                                            disabled={inserted}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onInsertRecommendation(rec, item.sentence);
                                            }}
                                            className="self-start px-3 py-1.5 bg-[#003366] text-white text-[11px] font-bold rounded-lg hover:bg-[#00254a] disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {inserted ? 'Inserted' : 'Insert citation'}
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </li>
    );
}
