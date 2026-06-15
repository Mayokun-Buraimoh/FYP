import { CitationCard } from './CitationCard';
import { SuggestionCard } from './SuggestionCard';
import { cn } from '../lib/utils';
import { useState, useEffect } from 'react';
import { Sparkles, Loader2, Filter } from 'lucide-react';
import { getDocuments, type Recommendation, type Citation } from '../lib/api';
import { useDocumentWorkspace } from '../context/DocumentWorkspaceContext';
import { formatYearRangeLabel, recommendationInYearRange } from '../lib/yearFilter';
import { PublicationYearSelect } from './PublicationYearSelect';
import { sentencesMatch } from '../lib/sourceNavigation';

const CATEGORIES = ['All', 'Background', 'Methodology', 'Comparison'];
const WORKSPACE_CATEGORIES = ['All', 'Background', 'Methodology', 'Comparison'];

interface EnrichedRecommendation extends Recommendation {
    matchScore: number;
    influentialCitations: number;
    category: string;
    sourceDocument: string;
}

interface CitationGapGroup {
    id: number;
    sentence: string;
    intent: string;
    score: number;
    recommendations: Recommendation[];
    category: string;
    page_number?: number | null;
    page_width?: number | null;
    page_height?: number | null;
    bounding_boxes?: { x1: number; y1: number; x2: number; y2: number }[];
}

function intentToCategory(intent: string): string {
    const lower = intent.toLowerCase();
    if (lower.includes('compare') || lower.includes('contrast')) return 'Comparison';
    if (lower === 'uses' || lower.includes('method')) return 'Methodology';
    return 'Background';
}

function citationToGapGroup(citation: Citation): CitationGapGroup {
    return {
        id: citation.id,
        sentence: citation.sentence,
        intent: citation.intent,
        score: citation.score,
        recommendations: citation.recommendations ?? [],
        category: intentToCategory(citation.intent),
        page_number: citation.page_number,
        page_width: citation.page_width,
        page_height: citation.page_height,
        bounding_boxes: citation.bounding_boxes,
    };
}

function filterGapRecommendations(
    gaps: CitationGapGroup[],
    yearFrom: number | null,
    yearTo: number | null
): CitationGapGroup[] {
    if (yearFrom === null && yearTo === null) return gaps;
    return gaps.map((gap) => ({
        ...gap,
        recommendations: (gap.recommendations ?? []).filter((rec) =>
            recommendationInYearRange(rec, yearFrom, yearTo)
        ),
    }));
}

function filterManualSuggestions(
    items: import('./SuggestionCard').SuggestionItem[],
    yearFrom: number | null,
    yearTo: number | null
) {
    if (yearFrom === null && yearTo === null) return items;
    return items.map((item) => ({
        ...item,
        recommendations: item.recommendations.filter((rec) =>
            recommendationInYearRange(rec, yearFrom, yearTo)
        ),
    }));
}

interface RecommendationSidebarProps {
    refreshKey?: string;
    inWorkspace?: boolean;
}

function FindCitationsLoadingPanel({ sentence }: { sentence?: string | null }) {
    const preview =
        sentence && sentence.length > 140 ? `${sentence.slice(0, 140)}…` : sentence;

    return (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-8 bg-slate-50/95 backdrop-blur-[2px]">
            <Loader2 className="w-10 h-10 text-[#003366] animate-spin mb-4" />
            <p className="text-[15px] font-bold text-slate-text mb-2 text-center">
                Finding citations…
            </p>
            <p className="text-[13px] text-slate-secondary font-medium text-center max-w-[260px] leading-relaxed">
                Searching literature databases for papers that support your sentence.
            </p>
            {preview && (
                <p className="mt-4 text-[11px] text-slate-400 font-medium text-center line-clamp-4 max-w-[280px] italic">
                    &ldquo;{preview}&rdquo;
                </p>
            )}
        </div>
    );
}

export function RecommendationSidebar({ refreshKey, inWorkspace = false }: RecommendationSidebarProps) {
    const workspace = useDocumentWorkspace();
    const [activeCategory, setActiveCategory] = useState('Background');
    const [recommendations, setRecommendations] = useState<EnrichedRecommendation[]>([]);
    const [gapGroups, setGapGroups] = useState<CitationGapGroup[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchAllRecommendations = async () => {
            if (inWorkspace) {
                if (!workspace?.document) {
                    setGapGroups([]);
                    setRecommendations([]);
                    setIsLoading(workspace?.isLoading ?? true);
                    return;
                }
                const groups = (workspace.document.citations ?? []).map(citationToGapGroup);
                setGapGroups(groups);
                setRecommendations([]);
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            try {
                const docs = await getDocuments();
                const seen = new Set<number>();
                const allRecs: EnrichedRecommendation[] = [];

                docs.forEach((doc) => {
                    const docTitle = doc.title || 'Untitled document';
                    doc.citations?.forEach((citation) => {
                        citation.recommendations?.forEach((rec) => {
                            if (seen.has(rec.id)) return;
                            seen.add(rec.id);
                            allRecs.push({
                                ...rec,
                                matchScore: Math.floor(citation.score * 100),
                                influentialCitations: rec.influential_citations ?? 0,
                                category: intentToCategory(citation.intent),
                                sourceDocument: docTitle,
                            });
                        });
                    });
                });
                setRecommendations(allRecs);
                setGapGroups([]);
            } catch (error) {
                console.error('Failed to fetch recommendations:', error);
                setRecommendations([]);
                setGapGroups([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAllRecommendations();
    }, [refreshKey, inWorkspace, workspace?.document, workspace?.isLoading]);

    useEffect(() => {
        if (inWorkspace) {
            setActiveCategory('All');
        }
    }, [inWorkspace]);

    const yearFrom = inWorkspace ? (workspace?.yearFrom ?? null) : null;
    const yearTo = inWorkspace ? (workspace?.yearTo ?? null) : null;
    const yearFilteredGaps = filterGapRecommendations(gapGroups, yearFrom, yearTo);
    const yearFilteredManual = filterManualSuggestions(
        workspace?.manualSuggestions ?? [],
        yearFrom,
        yearTo
    );

    const categoryList = inWorkspace ? WORKSPACE_CATEGORIES : CATEGORIES.filter((c) => c !== 'All');
    const filteredGaps =
        activeCategory === 'All'
            ? yearFilteredGaps
            : yearFilteredGaps.filter((g) => g.category === activeCategory);
    const filteredCitations =
        activeCategory === 'All'
            ? recommendations
            : recommendations.filter((c) => c.category === activeCategory);

    const canInsert = inWorkspace && !!workspace;
    const selectedSentence = workspace?.selectedSentence ?? null;

    const handleNavigateToSource = (payload: {
        sentence: string;
        pageNumber?: number | null;
        pageWidth?: number | null;
        pageHeight?: number | null;
        boundingBoxes?: { x1: number; y1: number; x2: number; y2: number }[];
        pdfHighlightPosition?: import('../lib/pdfUtils').PdfHighlightPosition;
    }) => {
        workspace?.navigateToSourceSentence(payload);
    };

    return (
        <div
            className={cn(
                'border-l border-slate-border bg-slate-50 flex flex-col flex-shrink-0 z-40 overflow-hidden shadow-sm',
                inWorkspace ? 'w-[360px] h-full' : 'w-[383px] h-screen sticky top-0'
            )}
        >
            <div className="p-6 bg-white border-b border-slate-border">
                <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-5 h-5 text-[#003366]" />
                    <h2 className="text-lg font-bold text-slate-text tracking-tight">Smart Suggestions</h2>
                </div>
                <p className="text-slate-secondary text-[12px] font-medium leading-relaxed mb-6">
                    {inWorkspace
                        ? 'Papers grouped by the sentence they support. Insert uses that sentence automatically.'
                        : 'Suggested papers from your analyzed uploads.'}
                </p>

                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-secondary uppercase tracking-wider">
                        <Filter className="w-3 h-3" />
                        <span>Filter by Intent</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {categoryList.map((cat) => (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setActiveCategory(cat)}
                                className={cn(
                                    'px-4 py-2 rounded-xl text-[11px] font-bold transition-all duration-200',
                                    activeCategory === cat
                                        ? 'bg-[#003366] text-white shadow-lg shadow-[#003366]/20'
                                        : 'bg-slate-100 text-slate-secondary hover:bg-slate-200'
                                )}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {inWorkspace && workspace && (
                    <div className="space-y-2 pt-1 border-t border-slate-100">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-secondary uppercase tracking-wider">
                            <span>Publication years</span>
                        </div>
                        <div className="flex items-end gap-2">
                            <div className="flex-1 min-w-0">
                                <label className="block text-[10px] font-bold text-slate-secondary mb-1">
                                    From
                                </label>
                                <PublicationYearSelect
                                    value={workspace.yearFrom}
                                    onChange={(year) =>
                                        workspace.setYearRange(year, workspace.yearTo)
                                    }
                                    label="From publication year"
                                    maxYear={workspace.yearTo}
                                />
                            </div>
                            <span className="text-slate-400 text-xs font-bold pb-2 shrink-0">to</span>
                            <div className="flex-1 min-w-0">
                                <label className="block text-[10px] font-bold text-slate-secondary mb-1">
                                    To
                                </label>
                                <PublicationYearSelect
                                    value={workspace.yearTo}
                                    onChange={(year) =>
                                        workspace.setYearRange(workspace.yearFrom, year)
                                    }
                                    label="To publication year"
                                    minYear={workspace.yearFrom}
                                />
                            </div>
                        </div>
                        {(workspace.yearFrom !== null || workspace.yearTo !== null) && (
                            <button
                                type="button"
                                onClick={() => workspace.setYearRange(null, null)}
                                className="text-[10px] font-bold text-slate-secondary hover:text-[#003366]"
                            >
                                Clear year filter
                            </button>
                        )}
                        <p className="text-[10px] text-slate-400 font-medium leading-snug">
                            {workspace.yearFilterActive
                                ? `Only papers from ${formatYearRangeLabel(workspace.yearFrom, workspace.yearTo)}. Re-run PDF analysis or Find citations to refresh.`
                                : 'Choose Any on both dropdowns to include all publication years.'}
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                if (workspace.selectedSentence) {
                                    void workspace.findCitationsForSelection(workspace.selectedSentence);
                                } else {
                                    void workspace.analyzeDocument();
                                }
                            }}
                            disabled={workspace.isAnalyzingDocument || workspace.isFindingCitations}
                            className="mt-3 w-full bg-[#003366] text-white py-2 rounded-xl text-[12px] font-bold hover:bg-[#002244] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {workspace.isAnalyzingDocument || workspace.isFindingCitations ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Processing...</span>
                                </>
                            ) : workspace.selectedSentence ? (
                                'Find citations for selection'
                            ) : (
                                'Analyze full document'
                            )}
                        </button>
                    </div>
                )}
            </div>

            {isLoading && (
                <div className="px-6 py-3 bg-white">
                    <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3 flex items-center gap-3">
                        <Loader2 className="w-3.5 h-3.5 text-[#003366] animate-spin" />
                        <span className="text-[#003366] text-[11px] font-bold">
                            Loading suggestions…
                        </span>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
                {inWorkspace && workspace?.isFindingCitations && (
                    <FindCitationsLoadingPanel sentence={workspace.selectedSentence} />
                )}

                <div
                    className={cn(
                        'flex-1 overflow-y-auto p-6 pt-2 space-y-4 scroll-smooth',
                        inWorkspace && workspace?.isFindingCitations && 'pointer-events-none opacity-30'
                    )}
                >
                {inWorkspace ? (
                    <ul className="space-y-4">
                        {yearFilteredManual.map((item) => (
                            <SuggestionCard
                                key={item.id}
                                item={item}
                                isSelected={sentencesMatch(selectedSentence ?? '', item.sentence)}
                                onSelect={() =>
                                    handleNavigateToSource({
                                        sentence: item.sentence,
                                        pageNumber: item.pageNumber,
                                        pageWidth: item.pageWidth,
                                        pageHeight: item.pageHeight,
                                        boundingBoxes: item.boundingBoxes,
                                        pdfHighlightPosition: item.pdfHighlightPosition,
                                    })
                                }
                                onInsertRecommendation={
                                    canInsert
                                        ? (rec, sentence) => {
                                              void workspace!.insertCitationForRecommendation(
                                                  rec,
                                                  sentence
                                              );
                                          }
                                        : undefined
                                }
                                insertedIds={workspace?.insertedRecommendationIds}
                            />
                        ))}
                        {filteredGaps.map((gap) => (
                            <SuggestionCard
                                key={gap.id}
                                item={{
                                    id: String(gap.id),
                                    sentence: gap.sentence,
                                    intent: gap.intent,
                                    score: gap.score,
                                    recommendations: gap.recommendations,
                                    source: 'ai',
                                }}
                                isSelected={sentencesMatch(selectedSentence ?? '', gap.sentence)}
                                onSelect={() =>
                                    handleNavigateToSource({
                                        sentence: gap.sentence,
                                        pageNumber: gap.page_number,
                                        pageWidth: gap.page_width,
                                        pageHeight: gap.page_height,
                                        boundingBoxes: gap.bounding_boxes,
                                    })
                                }
                                onInsertRecommendation={
                                    canInsert
                                        ? (rec, sentence) => {
                                              void workspace!.insertCitationForRecommendation(
                                                  rec,
                                                  sentence
                                              );
                                          }
                                        : undefined
                                }
                                insertedIds={workspace?.insertedRecommendationIds}
                            />
                        ))}
                    </ul>
                ) : (
                    filteredCitations.map((citation) => (
                        <div key={citation.id}>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1 truncate">
                                From: {citation.sourceDocument}
                            </p>
                            <CitationCard
                                {...citation}
                                influentialCitations={citation.influentialCitations}
                                matchLabel="Intent confidence"
                            />
                        </div>
                    ))
                )}

                {!isLoading &&
                    inWorkspace &&
                    filteredGaps.length === 0 &&
                    !(workspace?.manualSuggestions?.length) && (
                    <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-slate-100 px-4">
                        <p className="text-slate-secondary text-[13px] font-bold mb-1">No suggestions yet</p>
                        <p className="text-slate-400 text-[12px] font-medium leading-relaxed">
                            Set your publication year range and click <strong>Analyze full document</strong>, or highlight a sentence and click <strong>Find citations for selection</strong>.
                        </p>
                    </div>
                )}

                {!isLoading && !inWorkspace && filteredCitations.length === 0 && (
                    <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-slate-100 px-4">
                        <p className="text-slate-secondary text-[13px] font-bold mb-1">No suggestions yet</p>
                        <p className="text-slate-400 text-[12px] font-medium leading-relaxed">
                            Open a project and run document analysis.
                        </p>
                    </div>
                )}
                </div>
            </div>

            {!inWorkspace && (
                <div className="p-6 bg-white border-t border-slate-border">
                    <button
                        type="button"
                        className="w-full border-2 border-dashed border-slate-200 text-slate-secondary text-[12px] font-bold py-4 rounded-2xl hover:border-[#003366] hover:text-[#003366] hover:bg-[#003366]/5 transition-all duration-300"
                        onClick={() => window.open('https://openalex.org', '_blank', 'noopener,noreferrer')}
                    >
                        Discover More from Web
                    </button>
                </div>
            )}
        </div>
    );
}
