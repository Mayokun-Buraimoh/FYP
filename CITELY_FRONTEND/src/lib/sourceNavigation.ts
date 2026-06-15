import { normalizeText } from './manuscriptUtils';
import { mapBackendToScaledPosition } from './pdfUtils';
import type { PdfHighlightPosition } from './pdfUtils';

export interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export interface SourceScrollTarget {
    sentence: string;
    pageNumber?: number | null;
    pageWidth?: number | null;
    pageHeight?: number | null;
    boundingBoxes?: BoundingBox[];
    pdfHighlightPosition?: PdfHighlightPosition;
    /** Bumps on each navigation request so repeated clicks re-scroll. */
    nonce: number;
}

export function sentencesMatch(a: string, b: string): boolean {
    const left = normalizeText(a);
    const right = normalizeText(b);
    if (!left || !right) return false;
    return left === right || left.includes(right) || right.includes(left);
}

export function buildHighlightFromScrollTarget(
    target: SourceScrollTarget,
    id = 'scroll-target'
): Record<string, unknown> | null {
    if (!target.boundingBoxes?.length || !target.pageNumber) return null;

    const pageWidth = target.pageWidth ?? 612;
    const pageHeight = target.pageHeight ?? 792;

    return {
        id,
        position: mapBackendToScaledPosition({
            id,
            text: target.sentence,
            pageNumber: target.pageNumber,
            pageWidth,
            pageHeight,
            boundingBoxes: target.boundingBoxes,
        }),
        content: { text: target.sentence },
        text: target.sentence,
        comment: 'Source sentence',
        status: 'unverified',
    };
}

export function findHighlightForSentence(
    highlights: Array<{ id?: string; text?: string; content?: { text?: string }; position?: any }>,
    sentence: string
) {
    const exact = highlights.find((h) => {
        const text = h.text || h.content?.text || '';
        return normalizeText(text) === normalizeText(sentence);
    });
    if (exact) return exact;

    return highlights.find((h) => {
        const text = h.text || h.content?.text || '';
        return sentencesMatch(text, sentence);
    });
}

function pageViewReady(
    viewer: { getPageView?: (index: number) => unknown },
    pageNumber: number
): boolean {
    if (!viewer.getPageView) return false;
    try {
        return Boolean(viewer.getPageView(pageNumber - 1));
    } catch {
        return false;
    }
}

/** Scroll PDF to a source sentence without crashing the viewer. */
export async function safeScrollPdfToTarget(
    utils: {
        getViewer: () => { scrollPageIntoView: (opts: { pageNumber: number }) => void; getPageView?: (index: number) => unknown };
        scrollToHighlight?: (highlight: unknown) => void;
    },
    pdfDocument: { numPages: number; getPage: (n: number) => Promise<unknown> } | null,
    highlights: Array<{ id?: string; text?: string; content?: { text?: string }; position?: { pageNumber?: number; boundingRect?: { pageNumber?: number } } }>,
    target: SourceScrollTarget
): Promise<boolean> {
    const viewer = utils.getViewer?.();
    if (!viewer) return false;

    if (target.pdfHighlightPosition && utils.scrollToHighlight) {
        const pageNumber = target.pdfHighlightPosition.boundingRect.pageNumber;
        if (!pageNumber || pageViewReady(viewer, pageNumber)) {
            try {
                utils.scrollToHighlight({
                    id: 'scroll-target-manual',
                    position: target.pdfHighlightPosition,
                    content: { text: target.sentence },
                });
                return true;
            } catch (error) {
                console.warn('scrollToHighlight (manual position) failed', error);
            }
        }
    }

    const ephemeral = buildHighlightFromScrollTarget(target);
    if (ephemeral && utils.scrollToHighlight) {
        const highlightPage =
            (ephemeral.position as { boundingRect?: { pageNumber?: number }; pageNumber?: number })
                ?.boundingRect?.pageNumber ??
            (ephemeral.position as { pageNumber?: number })?.pageNumber;
        if (!highlightPage || pageViewReady(viewer, highlightPage)) {
            try {
                utils.scrollToHighlight(ephemeral);
                return true;
            } catch (error) {
                console.warn('scrollToHighlight (ephemeral) failed', error);
            }
        }
    }

    const existing = findHighlightForSentence(highlights, target.sentence);
    if (existing && utils.scrollToHighlight) {
        const highlightPage =
            existing.position?.boundingRect?.pageNumber ?? existing.position?.pageNumber;
        if (highlightPage && pageViewReady(viewer, highlightPage)) {
            try {
                utils.scrollToHighlight(existing);
                return true;
            } catch (error) {
                console.warn('scrollToHighlight failed', error);
            }
        }
    }

    const pageNumber = target.pageNumber ?? undefined;
    const numPages = pdfDocument?.numPages ?? pageNumber ?? 0;

    if (pageNumber && pageNumber >= 1 && (!numPages || pageNumber <= numPages)) {
        try {
            viewer.scrollPageIntoView({ pageNumber });
            return true;
        } catch (error) {
            console.warn('scrollPageIntoView failed', error);
        }
    }

    if (pdfDocument) {
        try {
            return await scrollPdfToSentencePage(
                pdfDocument as PdfDocumentLike,
                utils,
                target.sentence,
                target.pageNumber
            );
        } catch (error) {
            console.warn('scrollPdfToSentencePage failed', error);
        }
    }

    return false;
}

/** Scroll the manuscript editor to the matched sentence and briefly highlight it. */
export function scrollToSentenceInElement(root: HTMLElement, sentence: string): boolean {
    const trimmed = sentence.trim();
    if (!trimmed) return false;

    const textNodes: { node: Text; start: number }[] = [];
    let accumulated = '';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let current: Node | null;
    while ((current = walker.nextNode())) {
        const node = current as Text;
        textNodes.push({ node, start: accumulated.length });
        accumulated += node.data;
    }

    const idx = findSentenceIndexInText(accumulated, trimmed);
    if (idx === -1) return false;

    const endIdx = idx + trimmed.length;
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    for (const { node, start } of textNodes) {
        const end = start + node.data.length;
        if (startNode === null && idx >= start && idx < end) {
            startNode = node;
            startOffset = idx - start;
        }
        if (endIdx > start && endIdx <= end) {
            endNode = node;
            endOffset = endIdx - start;
            break;
        }
    }

    if (!startNode || !endNode) return false;

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    const rect = range.getBoundingClientRect();
    const scrollEl =
        (root.closest('.overflow-y-auto') as HTMLElement | null) ??
        (root.parentElement?.closest('.overflow-y-auto') as HTMLElement | null);

    if (scrollEl && rect.height > 0) {
        const scrollRect = scrollEl.getBoundingClientRect();
        const top =
            scrollEl.scrollTop +
            rect.top -
            scrollRect.top -
            scrollEl.clientHeight / 2 +
            rect.height / 2;
        scrollEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } else {
        const probe = document.createElement('span');
        probe.textContent = '\u200b';
        range.insertNode(probe);
        probe.scrollIntoView({ behavior: 'smooth', block: 'center' });
        probe.remove();
    }

    flashRange(root, range);
    return true;
}

function findSentenceIndexInText(haystack: string, sentence: string): number {
    const needle = sentence.trim();
    if (!needle) return -1;
    const idx = haystack.toLowerCase().indexOf(needle.toLowerCase());
    if (idx !== -1) return idx;

    const normHay = normalizeText(haystack);
    const normNeedle = normalizeText(needle);
    if (!normNeedle || !normHay.includes(normNeedle)) return -1;

    const words = haystack.split(/\s+/);
    const needleWords = needle.split(/\s+/);
    for (let i = 0; i <= words.length - needleWords.length; i++) {
        const slice = words.slice(i, i + needleWords.length).join(' ');
        if (normalizeText(slice) === normNeedle) {
            const prefix = words.slice(0, i).join(' ');
            return prefix.length + (prefix.length > 0 ? 1 : 0);
        }
    }
    return -1;
}

function flashRange(root: HTMLElement, range: Range) {
    const mark = document.createElement('mark');
    mark.className = 'manuscript-sentence-flash';
    try {
        range.surroundContents(mark);
        window.setTimeout(() => {
            const parent = mark.parentNode;
            if (!parent) return;
            while (mark.firstChild) {
                parent.insertBefore(mark.firstChild, mark);
            }
            parent.removeChild(mark);
            root.normalize();
        }, 2500);
    } catch {
        // Range spans partial elements — scroll only, no flash wrap.
    }
}

type PdfTextPage = {
    getTextContent: () => Promise<{ items: Array<{ str: string }> }>;
};

type PdfDocumentLike = {
    numPages: number;
    getPage: (n: number) => Promise<PdfTextPage>;
};

type PdfViewerUtils = {
    getViewer: () => { scrollPageIntoView: (opts: { pageNumber: number }) => void };
};

/** Find a PDF page containing the sentence and scroll the viewer to it. */
export async function scrollPdfToSentencePage(
    pdfDocument: PdfDocumentLike,
    viewerUtils: PdfViewerUtils,
    sentence: string,
    pageHint?: number | null
): Promise<boolean> {
    const normNeedle = normalizeText(sentence);
    if (!normNeedle) return false;

    const numPages = pdfDocument.numPages;
    const order: number[] = [];
    if (pageHint && pageHint >= 1 && pageHint <= numPages) order.push(pageHint);
    for (let p = 1; p <= numPages; p++) {
        if (!order.includes(p)) order.push(p);
    }

    const viewer = viewerUtils.getViewer?.();
    if (!viewer?.scrollPageIntoView) return false;

    for (const pageNum of order) {
        const page = await pdfDocument.getPage(pageNum);
        const content = await page.getTextContent();
        const pageText = content.items.map((item) => item.str).join(' ');
        if (normalizeText(pageText).includes(normNeedle)) {
            viewer.scrollPageIntoView({ pageNumber: pageNum });
            return true;
        }
    }
    return false;
}
