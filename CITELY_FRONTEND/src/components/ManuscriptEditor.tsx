import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
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
    const [popupRect, setPopupRect] = useState<DOMRect | null>(null);

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
        if (!ctx || !editorRef.current) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
            setPopupRect(null);
            return;
        }
        
        // Ensure selection is inside the editor
        if (!editorRef.current.contains(sel.anchorNode)) {
            setPopupRect(null);
            return;
        }

        const text = sel.toString().trim();
        if (!text) {
            setPopupRect(null);
            return;
        }
        
        ctx.setSelectedSentence(text);
        setPopupRect(sel.getRangeAt(0).getBoundingClientRect());
        
        if (text.length >= MIN_SELECTION_LENGTH) {
            ctx.setManuscriptAnchorId(rootIdRef.current);
        }
    }, [ctx]);

    useEffect(() => {
        document.addEventListener('selectionchange', handleSelection);
        return () => document.removeEventListener('selectionchange', handleSelection);
    }, [handleSelection]);

    // Hide popup when scrolling to keep it anchored to text
    const handleScroll = useCallback(() => {
        setPopupRect(null);
    }, []);

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
        <div className="flex-1 overflow-y-auto bg-white flex flex-col relative" onScroll={handleScroll}>
            {popupRect && selectedLen > 0 && (
                <div 
                    className="fixed z-[100] animate-in fade-in zoom-in-95 duration-200 pointer-events-auto"
                    style={{
                        top: Math.max(10, popupRect.top - 50),
                        left: popupRect.left + (popupRect.width / 2),
                        transform: 'translate(-50%, 0)'
                    }}
                >
                    <div className="bg-slate-800 text-white rounded-xl px-4 py-2 text-sm font-bold shadow-xl border border-slate-700/50 flex items-center gap-3">
                        <span className="opacity-90 tracking-wide truncate max-w-[200px]">
                            {ctx.selectedSentence}
                        </span>
                        <div className="w-px h-4 bg-slate-600 rounded-full" />
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void ctx.findCitationsForSelection();
                            }}
                            disabled={!canFindCitations || ctx.isFindingCitations}
                            className="text-[#3399FF] hover:text-[#66B2FF] flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                            {ctx.isFindingCitations ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Processing...
                                </>
                            ) : canFindCitations ? (
                                <>
                                    <Sparkles className="w-3.5 h-3.5" />
                                    Find citations
                                </>
                            ) : (
                                <span className="text-slate-400 font-medium text-[11px]">Select {MIN_SELECTION_LENGTH}+ chars</span>
                            )}
                        </button>
                    </div>
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
