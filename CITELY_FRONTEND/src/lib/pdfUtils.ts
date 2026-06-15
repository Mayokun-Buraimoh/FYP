// Backend representation
export interface BackendMatch {
    id: string;
    text: string;
    pageNumber: number;
    pageWidth: number;
    pageHeight: number;
    boundingBoxes: { x1: number; y1: number; x2: number; y2: number }[];
}

/** PDF highlighter scaled position (from text selection). */
export interface PdfHighlightPosition {
    boundingRect: {
        pageNumber: number;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        width: number;
        height: number;
    };
    rects: Array<{
        pageNumber: number;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        width: number;
        height: number;
    }>;
    usePdfCoordinates?: boolean;
}

export function pdfSelectionToBackendMeta(position: PdfHighlightPosition) {
    const pageNumber = position.boundingRect.pageNumber;
    const pageWidth = position.boundingRect.width;
    const pageHeight = position.boundingRect.height;
    const rects = position.rects?.length ? position.rects : [position.boundingRect];
    const boundingBoxes = rects.map((rect) => ({
        x1: rect.x1,
        y1: rect.y1,
        x2: rect.x2,
        y2: rect.y2,
    }));
    return { pageNumber, pageWidth, pageHeight, boundingBoxes };
}

// Convert Backend Match to ScaledPosition
export const mapBackendToScaledPosition = (match: BackendMatch): any => {
    if (!match.boundingBoxes || match.boundingBoxes.length === 0) {
        return {
            boundingRect: { x1: 0, y1: 0, x2: 0, y2: 0, width: 0, height: 0, pageNumber: match.pageNumber },
            rects: [],
            pageNumber: match.pageNumber
        };
    }

    const rects = match.boundingBoxes.map((box) => ({
        x1: box.x1,
        y1: box.y1,
        x2: box.x2,
        y2: box.y2,
        left: (box.x1 / match.pageWidth) * 100,
        top: (box.y1 / match.pageHeight) * 100,
        height: Math.max(0, ((box.y2 - box.y1) / match.pageHeight) * 100),
        width: Math.max(0, ((box.x2 - box.x1) / match.pageWidth) * 100),
        pageNumber: match.pageNumber,
    }));

    const boundingRect = {
        x1: Math.min(...match.boundingBoxes.map((b) => b.x1)),
        y1: Math.min(...match.boundingBoxes.map((b) => b.y1)),
        x2: Math.max(...match.boundingBoxes.map((b) => b.x2)),
        y2: Math.max(...match.boundingBoxes.map((b) => b.y2)),
        left: Math.min(...rects.map((r) => r.left)),
        top: Math.min(...rects.map((r) => r.top)),
        width: Math.max(0, Math.max(...rects.map((r) => r.left + r.width)) - Math.min(...rects.map((r) => r.left))),
        height: Math.max(0, Math.max(...rects.map((r) => r.top + r.height)) - Math.min(...rects.map((r) => r.top))),
        pageNumber: match.pageNumber,
    };

    return { boundingRect, rects, pageNumber: match.pageNumber };
};
