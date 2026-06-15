import { Search, Calendar, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { CitationCard } from './CitationCard';
import { PublicationYearSelect } from './PublicationYearSelect';
import { searchPapers, type PaperSearchResult } from '../lib/api';
import { formatYearRangeLabel } from '../lib/yearFilter';
import { resolvePaperUrl } from '../lib/paperUrl';

const PROVIDER_LABELS: Record<string, string> = {
    openalex: 'OpenAlex',
    crossref: 'Crossref',
    semantic_scholar: 'Semantic Scholar',
    core: 'CORE',
    europe_pmc: 'Europe PMC',
    arxiv: 'arXiv',
};

function labelProviders(ids: string[] | undefined): string {
    if (!ids?.length) return 'literature databases';
    return ids.map((id) => PROVIDER_LABELS[id] || id).join(', ');
}

export function SearchView() {
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [results, setResults] = useState<PaperSearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [yearFrom, setYearFrom] = useState<number | null>(null);
    const [yearTo, setYearTo] = useState<number | null>(null);
    const [showYearFilter, setShowYearFilter] = useState(false);
    const [providersUsed, setProvidersUsed] = useState<string[]>([]);
    const [providersQueried, setProvidersQueried] = useState<string[]>([
        'openalex',
        'crossref',
        'semantic_scholar',
    ]);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 400);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const runSearch = useCallback(
        async (query: string) => {
            if (query.length < 2) {
                setResults([]);
                setHasSearched(false);
                setError(null);
                setProvidersUsed([]);
                return;
            }

            setIsLoading(true);
            setError(null);
            setHasSearched(true);
            try {
                const data = await searchPapers(query, {
                    limit: 30,
                    yearFrom,
                    yearTo,
                });
                setResults(data.results || []);
                setProvidersUsed(data.providers_used || []);
                setProvidersQueried(data.providers_queried || []);
            } catch (err) {
                setResults([]);
                setProvidersUsed([]);
                setError(err instanceof Error ? err.message : 'Search failed.');
            } finally {
                setIsLoading(false);
            }
        },
        [yearFrom, yearTo]
    );

    useEffect(() => {
        void runSearch(debouncedQuery);
    }, [debouncedQuery, runSearch]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setDebouncedQuery(searchQuery.trim());
    };

    const setYearRange = (from: number | null, to: number | null) => {
        let yFrom = from;
        let yTo = to;
        if (yFrom !== null && yTo !== null && yFrom > yTo) {
            [yFrom, yTo] = [yTo, yFrom];
        }
        setYearFrom(yFrom);
        setYearTo(yTo);
    };

    const yearFilterActive = yearFrom !== null || yearTo !== null;

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-8 pt-12">
            <div className="max-w-5xl mx-auto">
                <div className="mb-10 text-center">
                    <h1 className="text-3xl font-bold text-slate-text mb-2 tracking-tight">
                        Global Paper Search
                    </h1>
                    <p className="text-slate-secondary text-[15px] font-medium">
                        Searches OpenAlex, Crossref, Semantic Scholar, and your other connected
                        APIs — click any title to open the live paper
                    </p>
                </div>

                <form className="relative mb-6 max-w-3xl mx-auto" onSubmit={handleSubmit}>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#003366] transition-colors">
                            <Search className="w-5 h-5" />
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by title, author, or keywords..."
                            className="w-full bg-white border-2 border-slate-200 rounded-[24px] py-5 pl-14 pr-6 text-[15px] font-medium outline-none focus:border-[#003366] focus:ring-4 focus:ring-[#003366]/5 transition-all shadow-sm"
                        />
                    </div>
                </form>

                <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
                    <button
                        type="button"
                        onClick={() => setShowYearFilter((v) => !v)}
                        className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-[13px] font-bold transition-all ${
                            showYearFilter || yearFilterActive
                                ? 'bg-[#003366] text-white border-[#003366]'
                                : 'bg-white border-slate-border text-slate-text hover:border-[#003366]/30'
                        }`}
                    >
                        <Calendar className="w-4 h-4" />
                        <span>Year range</span>
                        {yearFilterActive && (
                            <span className="text-[10px] opacity-90">
                                ({formatYearRangeLabel(yearFrom, yearTo)})
                            </span>
                        )}
                    </button>
                    {yearFilterActive && (
                        <button
                            type="button"
                            onClick={() => setYearRange(null, null)}
                            className="text-[12px] font-bold text-slate-secondary hover:text-[#003366]"
                        >
                            Clear years
                        </button>
                    )}
                </div>

                {showYearFilter && (
                    <div className="max-w-md mx-auto mb-8 p-4 bg-white border border-slate-border rounded-2xl shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[12px] font-bold text-slate-secondary uppercase tracking-wider">
                                Publication years
                            </span>
                            <button
                                type="button"
                                onClick={() => setShowYearFilter(false)}
                                className="p-1 text-slate-400 hover:text-slate-600"
                                aria-label="Close year filter"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex items-end gap-3">
                            <div className="flex-1">
                                <label className="block text-[10px] font-bold text-slate-secondary mb-1">
                                    From
                                </label>
                                <PublicationYearSelect
                                    value={yearFrom}
                                    onChange={(y) => setYearRange(y, yearTo)}
                                    label="From year"
                                    maxYear={yearTo}
                                />
                            </div>
                            <span className="text-slate-400 text-xs font-bold pb-2">to</span>
                            <div className="flex-1">
                                <label className="block text-[10px] font-bold text-slate-secondary mb-1">
                                    To
                                </label>
                                <PublicationYearSelect
                                    value={yearTo}
                                    onChange={(y) => setYearRange(yearFrom, y)}
                                    label="To year"
                                    minYear={yearFrom}
                                />
                            </div>
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2 px-2">
                        <h2 className="text-sm font-bold text-slate-secondary uppercase tracking-wider">
                            {hasSearched && debouncedQuery
                                ? `Results for "${debouncedQuery}"`
                                : 'Start typing to search'}
                        </h2>
                        {hasSearched && !isLoading && (
                            <div className="text-[12px] font-medium text-slate-secondary text-right">
                                <span>
                                    {results.length} result{results.length === 1 ? '' : 's'}
                                </span>
                                {providersUsed.length > 0 && (
                                    <span className="block text-[11px] text-slate-400">
                                        from {labelProviders(providersUsed)}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {isLoading && (
                        <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-secondary">
                            <Loader2 className="w-5 h-5 animate-spin text-[#003366]" />
                            <span className="text-sm font-medium">
                                Searching {labelProviders(providersQueried)}…
                            </span>
                        </div>
                    )}

                    {error && !isLoading && (
                        <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-red-800 text-sm font-medium">
                            {error}
                        </div>
                    )}

                    {!isLoading &&
                        !error &&
                        hasSearched &&
                        debouncedQuery.length >= 2 &&
                        results.length === 0 && (
                            <p className="text-center text-slate-secondary text-sm py-12 font-medium">
                                No papers found across {labelProviders(providersQueried)}. Try
                                different keywords or widen the year range.
                            </p>
                        )}

                    {!isLoading &&
                        results.map((paper, idx) => {
                            const paperUrl = resolvePaperUrl(paper);
                            return (
                                <CitationCard
                                    key={`${paper.doi || paper.title}-${idx}`}
                                    title={paper.title}
                                    authors={paper.authors}
                                    year={paper.year || 'n.d.'}
                                    matchScore={paper.matchScore}
                                    influentialCitations={paper.influentialCitationCount ?? 0}
                                    url={paperUrl}
                                    isOpenAccess={paper.isOpenAccess}
                                    matchLabel={paper.matchLabel || 'Relevance'}
                                    source={paper.source}
                                    showActions={false}
                                />
                            );
                        })}

                    {!hasSearched && debouncedQuery.length < 2 && (
                        <p className="text-center text-slate-400 text-sm py-8 font-medium max-w-lg mx-auto">
                            Enter at least 2 characters. We query all services in your{' '}
                            <code className="text-[11px] bg-slate-100 px-1 rounded">
                                PAPER_SEARCH_PROVIDERS
                            </code>{' '}
                            config and show merged, deduplicated results with links to each paper.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
