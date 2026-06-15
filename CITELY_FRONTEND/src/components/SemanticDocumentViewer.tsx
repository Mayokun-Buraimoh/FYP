import React, { useState, useEffect, useCallback } from "react";
import {
    PdfHighlighter,
    PdfLoader,
    TextHighlight,
    type PdfSelection,
} from "react-pdf-highlighter-extended";

import { CiteOrSnubTip } from "./CiteOrSnubTip";
import type { SemanticHighlight } from "./CiteOrSnubTip";
import { SelectionTip } from "./SelectionTip";
import { SuggestionCard, type SuggestionItem } from "./SuggestionCard";
export type { SemanticHighlight };
import { ArrowLeft } from "lucide-react";
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { recommendForSentence, type Recommendation } from '../lib/api';
import { useDocumentWorkspace } from '../context/DocumentWorkspaceContext';
import { mapBackendToScaledPosition } from '../lib/pdfUtils';
import {
    safeScrollPdfToTarget,
    type SourceScrollTarget,
} from '../lib/sourceNavigation';
import type { PdfHighlightPosition } from '../lib/pdfUtils';

export type HighlightStatus = "unverified" | "cited";

const MIN_SELECTION_LENGTH = 20;

interface ManualSuggestion {
    id: string;
    sentence: string;
    intent: string;
    score: number;
    recommendations: Recommendation[];
    source: 'manual';
}

interface AiSuggestion {
    id: string;
    sentence: string;
    intent: string;
    score: number;
    recommendations: Recommendation[];
    source: 'ai';
    highlightId: string;
}

type SidebarSuggestion = ManualSuggestion | AiSuggestion;

function toSuggestionItem(item: SidebarSuggestion): SuggestionItem {
    return {
        id: item.id,
        sentence: item.sentence,
        intent: item.intent,
        score: item.score,
        recommendations: item.recommendations,
        source: item.source,
    };
}

interface SemanticDocumentViewerProps {
    pdfUrl: string;
    documentId?: string | null;
    initialMatches: any[];
    onBack?: () => void;
    embedded?: boolean;
    hideAnalysisSidebar?: boolean;
    onSelectionChange?: (text: string | null) => void;
    onInsertRecommendation?: (rec: Recommendation, sentence: string) => Promise<boolean>;

    onManualSuggestion?: (item: import('./SuggestionCard').SuggestionItem) => void;
}

interface PdfDocumentPaneProps {
    pdfDocument: React.ComponentProps<typeof PdfHighlighter>['pdfDocument'];
    pdfDocumentRef: React.MutableRefObject<PdfDocumentPaneProps['pdfDocument'] | null>;
    pdfHighlighterRef: React.MutableRefObject<any>;
    highlights: any[];
    isFindingCitations: boolean;
    onSelection: (selection: { content?: { text?: string } }) => void;
    getCurrentSelection: () => PdfSelection | null;
    onCiteFromSelection: (text: string) => void;
    clearSelectionTip: () => void;
    setCiteError: (value: string | null) => void;
    setTipHighlight: (value: SemanticHighlight | null) => void;
}

const PdfDocumentPane = React.memo(function PdfDocumentPane({
    pdfDocument,
    pdfDocumentRef,
    pdfHighlighterRef,
    highlights,
    isFindingCitations,
    onSelection,
    getCurrentSelection,
    onCiteFromSelection,
    clearSelectionTip,
    setCiteError,
    setTipHighlight,
}: PdfDocumentPaneProps) {
    useEffect(() => {
        pdfDocumentRef.current = pdfDocument;
    }, [pdfDocument, pdfDocumentRef]);

    return (
        <PdfHighlighter
            pdfDocument={pdfDocument}
            enableAreaSelection={(event) => event.altKey}
            highlights={highlights}
            onSelection={onSelection}
            selectionTip={
                <SelectionTip
                    getSelection={getCurrentSelection}
                    isLoading={isFindingCitations}
                    onCite={onCiteFromSelection}
                    onDismiss={() => {
                        clearSelectionTip();
                        setCiteError(null);
                    }}
                />
            }
            utilsRef={(utils) => {
                pdfHighlighterRef.current = utils;
            }}
        >
            {highlights.map((highlight) => {
                const semanticHighlight = highlight as SemanticHighlight;
                const isCited = semanticHighlight.status === 'cited';

                return (
                    <TextHighlight
                        key={semanticHighlight.id}
                        isScrolledTo={false}
                        highlight={semanticHighlight}
                        onClick={() => {
                            if (!isCited) {
                                setTipHighlight(semanticHighlight);
                            }
                        }}
                    />
                );
            })}
        </PdfHighlighter>
    );
});


export const SemanticDocumentViewer: React.FC<SemanticDocumentViewerProps> = ({
    pdfUrl,
    documentId,
    initialMatches,
    onBack,
    embedded = false,
    hideAnalysisSidebar = false,
    onSelectionChange,
    onInsertRecommendation,
    onManualSuggestion,
}) => {
    const workspace = useDocumentWorkspace();
    const [highlights, setHighlights] = useState<any[]>(initialMatches);
    const [tipHighlight, setTipHighlight] = useState<SemanticHighlight | null>(null);

    const [manualSuggestions, setManualSuggestions] = useState<ManualSuggestion[]>([]);
    const [isFetchingCite, setIsFetchingCite] = useState(false);
    const [citeError, setCiteError] = useState<string | null>(null);

    const pdfHighlighterRef = React.useRef<any>(null);
    const pdfDocumentRef = React.useRef<React.ComponentProps<typeof PdfHighlighter>['pdfDocument'] | null>(null);
    const highlightsRef = React.useRef<any[]>(highlights);
    highlightsRef.current = highlights;

    const clearSelectionTip = useCallback(() => {
        pdfHighlighterRef.current?.setTip?.(null);
    }, []);

    const getCurrentSelection = useCallback(() => {
        return pdfHighlighterRef.current?.getCurrentSelection?.() ?? null;
    }, []);


    useEffect(() => {
        if (!embedded || !workspace?.document?.citations?.length) return;

        const fromCitations = workspace.document.citations
            .filter((c) => c.bounding_boxes?.length && c.page_number)
            .map((c) => ({
                id: `citation-${c.id}`,
                position: mapBackendToScaledPosition({
                    id: String(c.id),
                    text: c.sentence,
                    pageNumber: c.page_number!,
                    pageWidth: c.page_width ?? 612,
                    pageHeight: c.page_height ?? 792,
                    boundingBoxes: c.bounding_boxes,
                }),
                content: { text: c.sentence },
                text: c.sentence,
                comment: 'Gap detected',
                status: 'unverified' as const,
            }));

        setHighlights((prev) => {
            const withoutCitation = prev.filter(
                (h) => !String(h.id).startsWith('citation-')
            );
            return [...withoutCitation, ...fromCitations];
        });
    }, [embedded, workspace?.document?.citations]);

    useEffect(() => {
        if (!embedded || !workspace?.manualSuggestions?.length) return;

        const manualHighlights = workspace.manualSuggestions
            .filter((item) => item.pdfHighlightPosition)
            .map((item) => ({
                id: item.id,
                position: item.pdfHighlightPosition,
                content: { text: item.sentence },
                text: item.sentence,
                comment: 'Your selection',
                status: 'unverified' as const,
            }));

        if (!manualHighlights.length) return;

        setHighlights((prev) => {
            const withoutManual = prev.filter((h) => !String(h.id).startsWith('manual-'));
            return [...withoutManual, ...manualHighlights];
        });
    }, [embedded, workspace?.manualSuggestions]);

    useEffect(() => {
        if (!embedded || !workspace) return;

        const handleScroll = (target: SourceScrollTarget) => {
            const run = async (attempt = 0) => {
                const utils = pdfHighlighterRef.current;
                if (!utils) {
                    if (attempt < 25) {
                        window.setTimeout(() => void run(attempt + 1), 80);
                    } else {
                        workspace.showToast('PDF viewer is still loading. Try again.');
                    }
                    return;
                }

                const ok = await safeScrollPdfToTarget(
                    utils,
                    pdfDocumentRef.current as { numPages: number; getPage: (n: number) => Promise<unknown> } | null,
                    highlightsRef.current,
                    target
                );
                if (!ok) {
                    workspace.showToast('Could not locate this sentence in the PDF.');
                }
            };

            void run();
        };

        workspace.registerPdfScrollHandler(handleScroll);
        return () => workspace.registerPdfScrollHandler(null);
    }, [embedded, workspace]);

    const selectionTextRef = React.useRef<string | null>(null);

    const capturePdfSelection = useCallback(
        (text: string) => {
            if (!embedded || !workspace) return;
            const live = getCurrentSelection();
            if (live?.position) {
                workspace.setPendingPdfSelection({
                    sentence: text,
                    position: live.position as PdfHighlightPosition,
                });
            }
        },
        [embedded, workspace, getCurrentSelection]
    );

    const handleSelection = useCallback(
        (selection: { content?: { text?: string } }) => {
            const text = selection.content?.text?.trim() ?? '';
            if (text.length >= MIN_SELECTION_LENGTH) {
                selectionTextRef.current = text;
                onSelectionChange?.(text);
                setCiteError(null);
                capturePdfSelection(text);
            }
        },
        [onSelectionChange, capturePdfSelection]
    );

    const handleInsertFromViewer = useCallback(
        async (rec: Recommendation, sentence: string) => {
            if (!onInsertRecommendation) return;
            const s = sentence || selectionTextRef.current || '';
            await onInsertRecommendation(rec, s);
        },
        [onInsertRecommendation]
    );

    const handleCiteFromSelection = useCallback(
        async (text: string) => {
            selectionTextRef.current = text;
            onSelectionChange?.(text);
            const trimmed = text.trim();
            if (trimmed.length < MIN_SELECTION_LENGTH) {
                setCiteError('Select a full sentence (at least 20 characters).');
                return;
            }

            clearSelectionTip();
            setTipHighlight(null);

            if (embedded && workspace) {
                setCiteError(null);
                capturePdfSelection(trimmed);
                await workspace.findCitationsForSelection(trimmed);
                return;
            }

            setIsFetchingCite(true);
            setCiteError(null);

            try {
                const live = getCurrentSelection();
                const pdfPosition = live?.position as PdfHighlightPosition | undefined;
                const data = await recommendForSentence(
                    trimmed,
                    documentId ?? null,
                    undefined,
                    {
                        yearFrom: workspace?.yearFrom ?? null,
                        yearTo: workspace?.yearTo ?? null,
                    },
                    pdfPosition
                        ? {
                              pageNumber: pdfPosition.boundingRect.pageNumber,
                              pageWidth: pdfPosition.boundingRect.width,
                              pageHeight: pdfPosition.boundingRect.height,
                              boundingBoxes: (pdfPosition.rects?.length
                                  ? pdfPosition.rects
                                  : [pdfPosition.boundingRect]
                              ).map((r) => ({
                                  x1: r.x1,
                                  y1: r.y1,
                                  x2: r.x2,
                                  y2: r.y2,
                              })),
                          }
                        : undefined
                );
                const item: import('./SuggestionCard').SuggestionItem = {
                    id: `manual-${Date.now()}`,
                    sentence: data.sentence,
                    intent: data.intent,
                    score: data.score,
                    recommendations: data.recommendations || [],
                    source: 'manual',
                    pdfHighlightPosition: pdfPosition,
                    pageNumber: pdfPosition?.boundingRect.pageNumber,
                    pageWidth: pdfPosition?.boundingRect.width,
                    pageHeight: pdfPosition?.boundingRect.height,
                };
                if (onManualSuggestion) {
                    onManualSuggestion(item);
                } else {
                    setManualSuggestions((prev) => [
                        { ...item, source: 'manual' as const },
                        ...prev,
                    ]);
                }
                if (!data.recommendations?.length) {
                    setCiteError('No papers found for this sentence.');
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Failed to fetch recommendations.';
                setCiteError(message);
            } finally {
                setIsFetchingCite(false);
            }
        },
        [
            documentId,
            embedded,
            workspace,
            clearSelectionTip,
            onSelectionChange,
            onManualSuggestion,
            capturePdfSelection,
            getCurrentSelection,
        ]
    );

    const handleSnub = async (highlightId: string) => {
        setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
        if (highlightId === 'pending-selection') {
            clearSelectionTip();
            return;
        }
        try {
            await fetch('/api/feedback/negative', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ matchId: highlightId }),
            });
        } catch (error) {
            console.error('Failed to register snub', error);
        }
    };

    const aiSidebarItems: AiSuggestion[] = (workspace?.document?.citations ?? []).map((c, idx) => ({
        id: `ai-${idx}`,
        sentence: c.sentence,
        intent: c.intent,
        score: c.score,
        recommendations: c.recommendations || [],
        source: 'ai' as const,
        highlightId: `citation-${c.id}`,
    }));

    const isAnalyzing = workspace?.isAnalyzingDocument ?? false;
    const analysisError = workspace?.analyzeDocumentError ?? null;
    const isFindingCitations =
        embedded && workspace ? workspace.isFindingCitations : isFetchingCite;
    const showSidebarSpinner = isAnalyzing || isFindingCitations;
    const hasManualSuggestions = manualSuggestions.length > 0;
    const hasAiSuggestions = aiSidebarItems.length > 0;
    const showInternalSidebar = !hideAnalysisSidebar;

    return (
        <div
            className={
                embedded
                    ? 'flex flex-1 flex-col min-h-0 w-full'
                    : 'flex h-screen w-full bg-slate-50 relative'
            }
        >
            <div className={`flex-1 flex flex-col min-h-0 bg-white relative ${showInternalSidebar ? '' : 'w-full'}`}>
                {!embedded && onBack && (
                <div className="h-16 border-b border-slate-border px-8 flex items-center justify-between sticky top-0 bg-white z-[100] shrink-0">
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={onBack}
                            className="p-2 -ml-2 text-slate-400 hover:text-slate-text hover:bg-slate-50 rounded-lg transition-colors"
                            title="Back"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h1 className="text-lg font-semibold text-slate-text w-96 truncate">
                            Document Analysis View
                        </h1>
                    </div>
                </div>
                )}

                <div
                    className="flex-1 overflow-hidden relative min-h-0"
                    style={embedded ? undefined : { height: 'calc(100vh - 64px)' }}
                >
                    <PdfLoader
                        document={pdfUrl}
                        workerSrc={pdfWorker}
                        beforeLoad={() => (
                            <div className="p-8 font-medium text-slate-secondary">Loading PDF...</div>
                        )}
                    >
                        {(pdfDocument) => (
                            <PdfDocumentPane
                                pdfDocument={pdfDocument}
                                pdfDocumentRef={pdfDocumentRef}
                                pdfHighlighterRef={pdfHighlighterRef}
                                highlights={highlights}
                                isFindingCitations={isFindingCitations}
                                onSelection={handleSelection}
                                getCurrentSelection={getCurrentSelection}
                                onCiteFromSelection={handleCiteFromSelection}
                                clearSelectionTip={clearSelectionTip}
                                setCiteError={setCiteError}
                                setTipHighlight={setTipHighlight}
                            />
                        )}
                    </PdfLoader>

                    {tipHighlight && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
                            <CiteOrSnubTip
                                highlight={tipHighlight}
                                isLoading={isFindingCitations}
                                onCite={(h) => handleCiteFromSelection(h.text)}
                                onSnub={(id) => {
                                    handleSnub(id);
                                    setTipHighlight(null);
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>

            {showInternalSidebar && (
            <div className="w-[420px] bg-white border-l border-slate-border flex flex-col h-full sticky right-0 top-0">
                <div className="h-16 border-b border-slate-border flex items-center px-6 shrink-0 bg-slate-50">
                    <h3 className="font-bold text-[16px] text-slate-text flex items-center gap-2">
                        Citation Suggestions
                        {showSidebarSpinner && (
                            <span className="flex h-3 w-3 relative ml-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                            </span>
                        )}
                    </h3>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                    {isFindingCitations && (
                        <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-xl text-center">
                            <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-2"></div>
                            <p className="text-[13px] font-bold text-blue-800">Finding papers for your selection…</p>
                        </div>
                    )}

                    {citeError && (
                        <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium">
                            {citeError}
                        </div>
                    )}

                    {hasManualSuggestions && (
                        <ul className="space-y-6 mb-6">
                            {manualSuggestions.map((item) => (
                                <SuggestionCard
                                    key={item.id}
                                    item={toSuggestionItem(item)}
                                    onInsertRecommendation={
                                        onInsertRecommendation
                                            ? (rec, sentence) => handleInsertFromViewer(rec, sentence)
                                            : undefined
                                    }
                                />
                            ))}
                        </ul>
                    )}

                    {isAnalyzing ? (
                        <div
                            className={
                                hasManualSuggestions
                                    ? 'p-4 bg-white border border-slate-200 rounded-xl text-center'
                                    : 'h-full flex flex-col items-center justify-center text-center pb-20'
                            }
                        >
                            <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-4 mx-auto"></div>
                            <p className="text-[14px] font-bold text-slate-secondary mb-2">Analyzing Document...</p>
                            <p className="text-[13px] font-medium text-slate-400">
                                Extracting sentences and detecting citation gaps via SciBERT.
                            </p>
                        </div>
                    ) : analysisError && !hasManualSuggestions && !hasAiSuggestions ? (
                        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium">
                            {analysisError}
                        </div>
                    ) : !hasManualSuggestions && !hasAiSuggestions ? (
                        <div className="h-full flex flex-col items-center justify-center text-center pb-20 opacity-60">
                            <p className="text-[14px] font-bold text-slate-secondary mb-2">No suggestions yet</p>
                            <p className="text-[13px] font-medium text-slate-400 px-4">
                                Highlight a sentence and click &ldquo;Find citations&rdquo; to search for papers.
                            </p>
                        </div>
                    ) : hasAiSuggestions ? (
                        <ul className="space-y-6">
                            {aiSidebarItems.map((item) => (
                                <SuggestionCard
                                    key={item.id}
                                    item={toSuggestionItem(item)}
                                    onSelect={() => {
                                        const highlight = highlights.find((h) => h.id === item.highlightId);
                                        if (highlight && pdfHighlighterRef.current) {
                                            pdfHighlighterRef.current.scrollToHighlight(highlight);
                                        }
                                        onSelectionChange?.(item.sentence);
                                        selectionTextRef.current = item.sentence;
                                    }}
                                    onInsertRecommendation={
                                        onInsertRecommendation
                                            ? (rec, sentence) => handleInsertFromViewer(rec, sentence)
                                            : undefined
                                    }
                                />
                            ))}
                        </ul>
                    ) : null}
                </div>
            </div>
            )}
        </div>
    );
};
