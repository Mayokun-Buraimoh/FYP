import { useCallback, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useDocumentWorkspace } from '../context/DocumentWorkspaceContext';
import { patchDocument, type ManuscriptParagraph } from '../lib/api';
import {
    MANUSCRIPT_ROOT_ID,
    normalizeToUnified,
    paragraphsToDisplayHtml,
    paragraphsToDisplayText,
    stripHtmlToText,
} from '../lib/manuscriptUtils';
import { scrollToSentenceInElement, type SourceScrollTarget } from '../lib/sourceNavigation';
import { ReferenceListPanel } from './ReferenceListPanel';
import '../styles/manuscript-editor.css';

const EMPTY_HTML = '<p><br></p>';
const MIN_SELECTION_LENGTH = 20;
/** Matches reference list width; uses most of the center column beside Smart Suggestions. */
const MANUSCRIPT_COLUMN_CLASS = 'w-full max-w-6xl mx-auto px-6 lg:px-10';

export function ManuscriptEditor() {
    const ctx = useDocumentWorkspace();
    const editorRef = useRef<HTMLDivElement>(null);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rootIdRef = useRef<string>(MANUSCRIPT_ROOT_ID);
    const lastSyncedHtml = useRef<string>('');

    const scheduleSave = useCallback(
        (next: ManuscriptParagraph[]) => {
            if (!ctx) return;
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(() => {
                patchDocument(ctx.documentId, { manuscript_content: next }).catch(console.error);
            }, 500);
        },
        [ctx]
    );

    const unified = ctx ? normalizeToUnified(ctx.paragraphs) : [];
    if (unified[0]?.id) {
        rootIdRef.current = unified[0].id;
    }
    const displayHtml = paragraphsToDisplayHtml(ctx?.paragraphs ?? []) || EMPTY_HTML;
    const displayText = paragraphsToDisplayText(ctx?.paragraphs ?? []);

    const updateManuscript = useCallback(
        (html: string, text: string) => {
            if (!ctx) return;
            const rootId = rootIdRef.current;
            const next: ManuscriptParagraph[] = [{ id: rootId, html, text }];
            ctx.setParagraphs(next);
            scheduleSave(next);
        },
        [ctx, scheduleSave]
    );

    useEffect(() => {
        const el = editorRef.current;
        if (!el || ctx?.isLoading) return;
        const nextHtml = displayHtml.trim() ? displayHtml : EMPTY_HTML;
        if (nextHtml === lastSyncedHtml.current) return;
        el.innerHTML = nextHtml;
        lastSyncedHtml.current = nextHtml;
    }, [displayHtml, ctx?.isLoading]);

    const handleInput = useCallback(() => {
        const el = editorRef.current;
        if (!el || !ctx) return;
        const html = el.innerHTML;
        lastSyncedHtml.current = html;
        updateManuscript(html, stripHtmlToText(html));
    }, [ctx, updateManuscript]);

    const handleSelection = useCallback(() => {
        if (!ctx) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
        const text = sel.toString().trim();
        if (!text) return;
        ctx.setSelectedSentence(text);
        if (text.length >= MIN_SELECTION_LENGTH) {
            ctx.setManuscriptAnchorId(rootIdRef.current);
        }
    }, [ctx]);

    useEffect(() => {
        return () => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
        };
    }, []);

    useEffect(() => {
        if (!ctx) return;

        const handleScroll = (target: SourceScrollTarget) => {
            window.setTimeout(() => {
                const el = editorRef.current;
                if (!el) return;
                const found = scrollToSentenceInElement(el, target.sentence);
                if (!found) {
                    ctx.showToast('Could not locate this sentence in the manuscript.');
                }
            }, 80);
        };

        ctx.registerManuscriptScrollHandler(handleScroll);
        return () => ctx.registerManuscriptScrollHandler(null);
    }, [ctx]);

    if (!ctx) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-secondary text-sm">
                Manuscript unavailable.
            </div>
        );
    }

    if (ctx.isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#003366]" />
                <p className="text-sm font-medium text-slate-secondary">Loading manuscript…</p>
            </div>
        );
    }

    const hasContent =
        ctx.paragraphs.length > 0 ||
        displayText.trim().length > 0 ||
        displayHtml.replace(/<[^>]+>/g, '').trim().length > 0;

    if (!hasContent) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <p className="text-[15px] font-bold text-slate-secondary mb-2">No manuscript text yet</p>
                <p className="text-[13px] text-slate-400 max-w-md">
                    Run document analysis from the PDF tab to import formatted text (bold, indentation)
                    from your PDF into the manuscript.
                </p>
            </div>
        );
    }

    const selectedLen = ctx.selectedSentence?.trim().length ?? 0;
    const canFindCitations = selectedLen >= MIN_SELECTION_LENGTH;

    return (
        <div className="flex-1 overflow-y-auto bg-white flex flex-col">
            {selectedLen > 0 && (
                <div
                    className={`shrink-0 mt-4 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl flex flex-wrap items-center gap-3 ${MANUSCRIPT_COLUMN_CLASS}`}
                >
                    <p className="text-[12px] text-slate-600 flex-1 min-w-[200px]">
                        {canFindCitations ? (
                            <>
                                Selected: &ldquo;
                                {ctx.selectedSentence!.length > 80
                                    ? `${ctx.selectedSentence!.slice(0, 80)}…`
                                    : ctx.selectedSentence}
                                &rdquo;
                            </>
                        ) : (
                            <>Select at least {MIN_SELECTION_LENGTH} characters (a full sentence).</>
                        )}
                    </p>
                    <button
                        type="button"
                        disabled={!canFindCitations || ctx.isFindingCitations}
                        onClick={() => void ctx.findCitationsForSelection()}
                        className="px-4 py-2 bg-[#003366] text-white text-[12px] font-bold rounded-lg hover:bg-[#00254a] disabled:opacity-50"
                    >
                        {ctx.isFindingCitations ? 'Finding…' : 'Find citations'}
                    </button>
                </div>
            )}
            <div className={`${MANUSCRIPT_COLUMN_CLASS} py-10 min-h-full flex-1`}>
                <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-multiline
                    className="manuscript-prose manuscript-editable outline-none min-h-[calc(100vh-12rem)] text-[17px] leading-[1.75] text-slate-text border border-transparent hover:border-slate-200 focus:border-[#003366]/40 rounded-lg p-8 lg:p-10 bg-slate-50/30 focus:bg-white transition-colors w-full"
                    onInput={handleInput}
                    onMouseUp={handleSelection}
                    onKeyUp={handleSelection}
                />
            </div>
            <ReferenceListPanel />
        </div>
    );
}
