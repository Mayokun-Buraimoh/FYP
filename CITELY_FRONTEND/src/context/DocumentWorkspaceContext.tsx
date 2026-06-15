import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    getDocument,
    patchDocument,
    insertCitation,
    seedManuscript,
    recommendForSentence,
    authFetch,
    BASE_URL,
    type Document,
    type ManuscriptParagraph,
    type Recommendation,
} from '../lib/api';
import {
    buildCslItem,
    formatRecommendationIntext,
    CITATION_STYLE_STORAGE_KEY,
    normalizeCitationStyleId,
    type CitationStyleId,
} from '../lib/citationEngine';
import {
    MANUSCRIPT_ROOT_ID,
    normalizeToUnified,
    insertCitationInManuscript,
    paragraphsToDisplayHtml,
    stripHtmlToText,
} from '../lib/manuscriptUtils';
import {
    applyMergedReferencesToManuscript,
    buildMergedReferenceList,
} from '../lib/referenceList';
import {
    buildInsertedRecommendationIdSet,
    recommendationsForSentence,
    resolveRecommendationId,
} from '../lib/recommendationUtils';
import type { SuggestionItem } from '../components/SuggestionCard';
import { normalizeText } from '../lib/manuscriptUtils';
import type { SourceScrollTarget } from '../lib/sourceNavigation';
import type { PdfHighlightPosition } from '../lib/pdfUtils';
import { pdfSelectionToBackendMeta } from '../lib/pdfUtils';

export type WorkspaceTab = 'pdf' | 'manuscript';

interface DocumentWorkspaceContextValue {
    documentId: string;
    pdfUrl: string;
    document: Document | null;
    isLoading: boolean;
    loadError: string | null;
    activeTab: WorkspaceTab;
    setActiveTab: (tab: WorkspaceTab) => void;
    selectedSentence: string | null;
    setSelectedSentence: (sentence: string | null) => void;
    navigateToSourceSentence: (target: Omit<SourceScrollTarget, 'nonce'>) => void;
    setPendingPdfSelection: (payload: { sentence: string; position: PdfHighlightPosition } | null) => void;
    registerPdfScrollHandler: (handler: ((target: SourceScrollTarget) => void) | null) => void;
    registerManuscriptScrollHandler: (handler: ((target: SourceScrollTarget) => void) | null) => void;
    manuscriptAnchorId: string | null;
    setManuscriptAnchorId: (id: string | null) => void;
    citationStyle: CitationStyleId;
    setCitationStyle: (style: CitationStyleId) => void;
    paragraphs: ManuscriptParagraph[];
    setParagraphs: React.Dispatch<React.SetStateAction<ManuscriptParagraph[]>>;
    insertCitationForRecommendation: (rec: Recommendation, sentenceOverride?: string) => Promise<boolean>;
    insertedRecommendationIds: Set<number>;
    toast: string | null;
    clearToast: () => void;
    showToast: (message: string) => void;
    refreshDocument: (options?: { silent?: boolean }) => Promise<void>;
    manualSuggestions: SuggestionItem[];
    addManualSuggestion: (item: SuggestionItem) => void;
    findCitationsForSelection: (sentenceOverride?: string) => Promise<boolean>;
    isFindingCitations: boolean;
    yearFrom: number | null;
    yearTo: number | null;
    setYearRange: (from: number | null, to: number | null) => void;
    yearFilterActive: boolean;
    isAnalyzingDocument: boolean;
    analyzeDocumentError: string | null;
    analyzeDocument: () => Promise<void>;
}

const DocumentWorkspaceContext = createContext<DocumentWorkspaceContextValue | null>(null);

export function useDocumentWorkspace(): DocumentWorkspaceContextValue | null {
    return useContext(DocumentWorkspaceContext);
}

export function useDocumentWorkspaceRequired(): DocumentWorkspaceContextValue {
    const ctx = useContext(DocumentWorkspaceContext);
    if (!ctx) {
        throw new Error('useDocumentWorkspace must be used within DocumentWorkspaceProvider');
    }
    return ctx;
}

interface ProviderProps {
    documentId: string;
    pdfUrl: string;
    children: React.ReactNode;
}

export function DocumentWorkspaceProvider({ documentId, pdfUrl, children }: ProviderProps) {
    const [document, setDocument] = useState<Document | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedSentence, setSelectedSentence] = useState<string | null>(null);
    const [manuscriptAnchorId, setManuscriptAnchorId] = useState<string | null>(null);
    const [paragraphs, setParagraphs] = useState<ManuscriptParagraph[]>([]);
    const [insertedRecommendationIds, setInsertedRecommendationIds] = useState<Set<number>>(new Set());
    const [toast, setToast] = useState<string | null>(null);
    const [manualSuggestions, setManualSuggestions] = useState<SuggestionItem[]>([]);
    const [isFindingCitations, setIsFindingCitations] = useState(false);
    const [yearFrom, setYearFrom] = useState<number | null>(null);
    const [yearTo, setYearTo] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<WorkspaceTab>('pdf');
    const [isAnalyzingDocument, setIsAnalyzingDocument] = useState(false);
    const [analyzeDocumentError, setAnalyzeDocumentError] = useState<string | null>(null);
    const activeTabRef = useRef<WorkspaceTab>('pdf');
    activeTabRef.current = activeTab;

    const pdfScrollHandlerRef = useRef<((target: SourceScrollTarget) => void) | null>(null);
    const manuscriptScrollHandlerRef = useRef<((target: SourceScrollTarget) => void) | null>(null);
    const documentRef = useRef(document);
    documentRef.current = document;
    const manualSuggestionsRef = useRef(manualSuggestions);
    manualSuggestionsRef.current = manualSuggestions;
    const pendingPdfSelectionRef = useRef<{ sentence: string; position: PdfHighlightPosition } | null>(null);

    const setPendingPdfSelection = useCallback(
        (payload: { sentence: string; position: PdfHighlightPosition } | null) => {
            pendingPdfSelectionRef.current = payload;
        },
        []
    );

    const consumePendingPdfSelection = useCallback((sentence: string) => {
        const pending = pendingPdfSelectionRef.current;
        if (!pending) return null;
        if (normalizeText(pending.sentence) !== normalizeText(sentence)) return null;
        pendingPdfSelectionRef.current = null;
        return pending.position;
    }, []);

    const registerPdfScrollHandler = useCallback(
        (handler: ((target: SourceScrollTarget) => void) | null) => {
            pdfScrollHandlerRef.current = handler;
        },
        []
    );

    const registerManuscriptScrollHandler = useCallback(
        (handler: ((target: SourceScrollTarget) => void) | null) => {
            manuscriptScrollHandlerRef.current = handler;
        },
        []
    );

    const navigateToSourceSentence = useCallback(
        (target: Omit<SourceScrollTarget, 'nonce'>) => {
            const sentence = target.sentence.trim();
            if (!sentence) return;

            setSelectedSentence(sentence);

            let enriched = { ...target, sentence };
            const doc = documentRef.current;
            if (!target.pdfHighlightPosition && !target.boundingBoxes?.length) {
                const manual = manualSuggestionsRef.current.find(
                    (item) => normalizeText(item.sentence) === normalizeText(sentence)
                );
                if (manual?.pdfHighlightPosition) {
                    enriched = {
                        ...enriched,
                        pdfHighlightPosition: manual.pdfHighlightPosition,
                        pageNumber: manual.pageNumber ?? manual.pdfHighlightPosition.boundingRect.pageNumber,
                        pageWidth: manual.pageWidth ?? manual.pdfHighlightPosition.boundingRect.width,
                        pageHeight: manual.pageHeight ?? manual.pdfHighlightPosition.boundingRect.height,
                        boundingBoxes: manual.boundingBoxes,
                    };
                }
            }
            if (!target.boundingBoxes?.length && doc?.citations?.length) {
                const match = doc.citations.find(
                    (c) => normalizeText(c.sentence) === normalizeText(sentence)
                );
                if (match?.bounding_boxes?.length && match.page_number) {
                    enriched = {
                        ...enriched,
                        pageNumber: match.page_number,
                        pageWidth: match.page_width ?? enriched.pageWidth,
                        pageHeight: match.page_height ?? enriched.pageHeight,
                        boundingBoxes: match.bounding_boxes,
                    };
                }
            }

            const payload: SourceScrollTarget = { ...enriched, nonce: Date.now() };
            const hasPdfAnchor =
                Boolean(enriched.pdfHighlightPosition) ||
                Boolean(enriched.boundingBoxes?.length && enriched.pageNumber);

            if (hasPdfAnchor) {
                if (activeTabRef.current !== 'pdf') {
                    setActiveTab('pdf');
                    window.setTimeout(() => pdfScrollHandlerRef.current?.(payload), 120);
                } else {
                    pdfScrollHandlerRef.current?.(payload);
                }
                return;
            }

            if (activeTabRef.current === 'pdf') {
                pdfScrollHandlerRef.current?.(payload);
            } else {
                manuscriptScrollHandlerRef.current?.(payload);
            }
        },
        []
    );

    const storedStyle = normalizeCitationStyleId(
        localStorage.getItem(CITATION_STYLE_STORAGE_KEY)
    );
    const [citationStyle, setCitationStyleState] = useState<CitationStyleId>(storedStyle);

    const setCitationStyle = useCallback(
        (style: CitationStyleId) => {
            setCitationStyleState(style);
            localStorage.setItem(CITATION_STYLE_STORAGE_KEY, style);
            if (documentId) {
                patchDocument(documentId, { citation_style: style }).catch(console.error);
            }
        },
        [documentId]
    );

    const setYearRange = useCallback(
        (from: number | null, to: number | null) => {
            let yFrom = from;
            let yTo = to;
            if (yFrom !== null && yTo !== null && yFrom > yTo) {
                [yFrom, yTo] = [yTo, yFrom];
            }
            setYearFrom(yFrom);
            setYearTo(yTo);
            if (documentId) {
                patchDocument(documentId, {
                    year_from: yFrom,
                    year_to: yTo,
                }).catch(console.error);
            }
        },
        [documentId]
    );

    const refreshDocument = useCallback(async (options?: { silent?: boolean }) => {
        if (!options?.silent) {
            setIsLoading(true);
        }
        setLoadError(null);
        try {
            let doc = await getDocument(documentId);
            if (!doc.manuscript_content?.length) {
                const seeded = await seedManuscript(documentId);
                if (seeded.seeded && seeded.manuscript_content?.length) {
                    doc = { ...doc, manuscript_content: seeded.manuscript_content };
                }
            }
            setDocument(doc);
            setParagraphs(normalizeToUnified(doc.manuscript_content || []));
            if (doc.citation_style) {
                const style = normalizeCitationStyleId(doc.citation_style);
                setCitationStyleState(style);
                localStorage.setItem(CITATION_STYLE_STORAGE_KEY, style);
            }
            setYearFrom(doc.year_from ?? null);
            setYearTo(doc.year_to ?? null);
            setInsertedRecommendationIds(
                buildInsertedRecommendationIdSet(doc.inserted_citations ?? [])
            );
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : 'Failed to load document.');
        } finally {
            if (!options?.silent) {
                setIsLoading(false);
            }
        }
    }, [documentId]);

    useEffect(() => {
        refreshDocument();
    }, [refreshDocument]);

    const addManualSuggestion = useCallback((item: SuggestionItem) => {
        setManualSuggestions((prev) => [item, ...prev.filter((p) => p.id !== item.id)]);
    }, []);

    const findCitationsForSelection = useCallback(
        async (sentenceOverride?: string): Promise<boolean> => {
            const sentence = (sentenceOverride || selectedSentence || '').trim();
            if (sentence.length < 20) {
                setToast('Select at least 20 characters (a full sentence) to find citations.');
                return false;
            }
            setIsFindingCitations(true);
            setToast(null);
            try {
                const pdfPosition = consumePendingPdfSelection(sentence);
                const pdfMeta = pdfPosition ? pdfSelectionToBackendMeta(pdfPosition) : null;
                const data = await recommendForSentence(sentence, documentId, undefined, {
                    yearFrom,
                    yearTo,
                }, {
                    pageNumber: pdfMeta?.pageNumber,
                    pageWidth: pdfMeta?.pageWidth,
                    pageHeight: pdfMeta?.pageHeight,
                    boundingBoxes: pdfMeta?.boundingBoxes,
                });
                const refreshed = await getDocument(documentId);
                const persistedRecs =
                    recommendationsForSentence(refreshed, data.sentence) ||
                    data.recommendations ||
                    [];
                addManualSuggestion({
                    id: `manual-${Date.now()}`,
                    sentence: data.sentence,
                    intent: data.intent,
                    score: data.score,
                    recommendations: persistedRecs,
                    source: 'manual',
                    pdfHighlightPosition: pdfPosition ?? undefined,
                    pageNumber: pdfMeta?.pageNumber ?? pdfPosition?.boundingRect.pageNumber,
                    pageWidth: pdfMeta?.pageWidth ?? pdfPosition?.boundingRect.width,
                    pageHeight: pdfMeta?.pageHeight ?? pdfPosition?.boundingRect.height,
                    boundingBoxes: pdfMeta?.boundingBoxes,
                });
                setDocument(refreshed);
                setInsertedRecommendationIds(
                    buildInsertedRecommendationIdSet(refreshed.inserted_citations ?? [])
                );
                setSelectedSentence(data.sentence);
                if (!persistedRecs.length) {
                    setToast('No papers found for this sentence.');
                }
                return true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to find citations.';
                setToast(msg);
                return false;
            } finally {
                setIsFindingCitations(false);
            }
        },
        [selectedSentence, documentId, addManualSuggestion, yearFrom, yearTo, consumePendingPdfSelection]
    );

    const yearFilterActive = yearFrom !== null || yearTo !== null;

    const analyzeDocument = useCallback(async () => {
        if (!pdfUrl) return;
        setIsAnalyzingDocument(true);
        setAnalyzeDocumentError(null);
        try {
            const response = await fetch(pdfUrl);
            if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.statusText}`);
            const blob = await response.blob();

            const formData = new FormData();
            formData.append('pdf_file', blob, 'document.pdf');
            if (documentId) formData.append('document_id', documentId);
            if (yearFrom != null) formData.append('year_from', String(yearFrom));
            if (yearTo != null) formData.append('year_to', String(yearTo));

            const apiResponse = await authFetch(`${BASE_URL}/documents/process-pdf/`, {
                method: 'POST',
                body: formData,
            });

            if (!apiResponse.ok) {
                const errBody = await apiResponse.json().catch(() => ({}));
                const detail =
                    (errBody as { error?: string }).error ||
                    (errBody as { detail?: string }).detail ||
                    apiResponse.statusText;
                throw new Error(detail);
            }

            await refreshDocument({ silent: true });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to analyze document.';
            setAnalyzeDocumentError(message);
            setToast(message);
        } finally {
            setIsAnalyzingDocument(false);
        }
    }, [pdfUrl, documentId, yearFrom, yearTo, refreshDocument]);

    const insertCitationForRecommendation = useCallback(
        async (rec: Recommendation, sentenceOverride?: string): Promise<boolean> => {
            const sentence = (sentenceOverride || selectedSentence || '').trim();
            if (!sentence) {
                setToast('Select a sentence in the PDF or Manuscript tab first.');
                return false;
            }

            try {
                const formatted = await formatRecommendationIntext(rec, citationStyle);
                const cslItem = buildCslItem(rec);
                const recommendationId = resolveRecommendationId(rec, document, sentence);

                const { paragraphs: nextParagraphs, anchorId } = insertCitationInManuscript(
                    paragraphs,
                    sentence,
                    formatted
                );

                const htmlWithCitation = paragraphsToDisplayHtml(nextParagraphs);

                await insertCitation(documentId, {
                    ...(recommendationId ? { recommendation_id: recommendationId } : {}),
                    sentence,
                    anchor_id: anchorId,
                    formatted_intext: formatted,
                    csl_item: cslItem as unknown as Record<string, unknown>,
                    manuscript_content: nextParagraphs,
                });

                const updated = await getDocument(documentId);
                const merged = await buildMergedReferenceList(
                    updated.inserted_citations ?? [],
                    citationStyle,
                    htmlWithCitation
                );
                const htmlWithRefs = applyMergedReferencesToManuscript(
                    htmlWithCitation,
                    merged
                );
                const rootId =
                    normalizeToUnified(nextParagraphs)[0]?.id || MANUSCRIPT_ROOT_ID;
                const finalParagraphs: ManuscriptParagraph[] = [
                    {
                        id: rootId,
                        html: htmlWithRefs,
                        text: stripHtmlToText(htmlWithRefs),
                    },
                ];

                setParagraphs(finalParagraphs);
                if (htmlWithRefs !== htmlWithCitation) {
                    await patchDocument(documentId, { manuscript_content: finalParagraphs });
                }
                setDocument({ ...updated, manuscript_content: finalParagraphs });

                setInsertedRecommendationIds(
                    buildInsertedRecommendationIdSet(updated.inserted_citations ?? [])
                );
                setToast(`Inserted: ${formatted}`);
                return true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Insert failed.';
                setToast(msg);
                return false;
            }
        },
        [selectedSentence, paragraphs, citationStyle, documentId, document]
    );

    const value = useMemo(
        () => ({
            documentId,
            pdfUrl,
            document,
            isLoading,
            loadError,
            activeTab,
            setActiveTab,
            selectedSentence,
            setSelectedSentence,
            navigateToSourceSentence,
            setPendingPdfSelection,
            registerPdfScrollHandler,
            registerManuscriptScrollHandler,
            manuscriptAnchorId,
            setManuscriptAnchorId,
            citationStyle,
            setCitationStyle,
            paragraphs,
            setParagraphs,
            insertCitationForRecommendation,
            insertedRecommendationIds,
            toast,
            clearToast: () => setToast(null),
            showToast: (message: string) => setToast(message),
            refreshDocument,
            manualSuggestions,
            addManualSuggestion,
            findCitationsForSelection,
            isFindingCitations,
            yearFrom,
            yearTo,
            setYearRange,
            yearFilterActive,
            isAnalyzingDocument,
            analyzeDocumentError,
            analyzeDocument,
        }),
        [
            documentId,
            pdfUrl,
            document,
            isLoading,
            loadError,
            activeTab,
            selectedSentence,
            navigateToSourceSentence,
            setPendingPdfSelection,
            registerPdfScrollHandler,
            registerManuscriptScrollHandler,
            manuscriptAnchorId,
            citationStyle,
            setCitationStyle,
            paragraphs,
            insertCitationForRecommendation,
            insertedRecommendationIds,
            toast,
            refreshDocument,
            manualSuggestions,
            addManualSuggestion,
            findCitationsForSelection,
            isFindingCitations,
            yearFrom,
            yearTo,
            setYearRange,
            yearFilterActive,
            isAnalyzingDocument,
            analyzeDocumentError,
            analyzeDocument,
        ]
    );

    return (
        <DocumentWorkspaceContext.Provider value={value}>
            {children}
        </DocumentWorkspaceContext.Provider>
    );
}
