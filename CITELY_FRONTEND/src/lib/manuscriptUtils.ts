export interface ManuscriptParagraph {
    id: string;
    text?: string;
    html?: string;
}

export const MANUSCRIPT_ROOT_ID = 'manuscript-root';

export function normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function stripHtmlToText(html: string): string {
    if (typeof document === 'undefined') {
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function plainTextFromParagraph(p: ManuscriptParagraph): string {
    if (p.text?.trim()) return p.text;
    if (p.html) return stripHtmlToText(p.html);
    return '';
}

export function textToHtml(text: string): string {
    const blocks = text.split(/\n\n+/).filter((b) => b.trim());
    if (!blocks.length) return '<p></p>';
    return blocks.map((b) => `<p>${escapeHtml(b.trim())}</p>`).join('');
}

/** Merge legacy blocks into one editable document. */
export function normalizeToUnified(paragraphs: ManuscriptParagraph[]): ManuscriptParagraph[] {
    if (!paragraphs.length) return [];
    if (paragraphs.length === 1) return paragraphs;

    const id = paragraphs[0]?.id || MANUSCRIPT_ROOT_ID;
    const html = paragraphs
        .map((p) => p.html || (p.text ? textToHtml(p.text) : ''))
        .filter(Boolean)
        .join('');
    const text = paragraphs.map((p) => plainTextFromParagraph(p)).filter(Boolean).join('\n\n');
    return [{ id, html: html || undefined, text }];
}

export function paragraphsToDisplayHtml(paragraphs: ManuscriptParagraph[]): string {
    const unified = normalizeToUnified(paragraphs)[0];
    if (!unified) return '';
    if (unified.html?.trim()) return unified.html;
    if (unified.text?.trim()) return textToHtml(unified.text);
    return '';
}

export function paragraphsToDisplayText(paragraphs: ManuscriptParagraph[]): string {
    const unified = normalizeToUnified(paragraphs)[0];
    if (!unified) return '';
    return plainTextFromParagraph(unified);
}

export function formatIntextCitation(formattedIntext: string): string {
    if (formattedIntext.startsWith('(') || formattedIntext.startsWith('[')) {
        return formattedIntext;
    }
    return ` (${formattedIntext})`;
}

function findSentenceIndex(haystack: string, sentence: string): number {
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

export function appendCitationAfterSentence(
    fullText: string,
    sentence: string,
    formattedIntext: string
): string {
    const cite = formatIntextCitation(formattedIntext);
    const idx = findSentenceIndex(fullText, sentence);
    if (idx === -1) {
        const trimmed = fullText.trimEnd();
        const needsSpace = trimmed.length > 0 && !trimmed.endsWith(' ');
        return `${trimmed}${needsSpace ? ' ' : ''}${cite}`;
    }
    const end = idx + sentence.trim().length;
    return `${fullText.slice(0, end)}${cite}${fullText.slice(end)}`;
}

/** Insert citation after matched sentence inside HTML (preserves formatting). */
export function insertCitationInHtml(
    html: string,
    sentence: string,
    formattedIntext: string
): string {
    const cite = formatIntextCitation(formattedIntext);
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="manuscript-root">${html}</div>`, 'text/html');
    const root = doc.getElementById('manuscript-root');
    if (!root) return html + cite;

    const textNodes: { node: Text; start: number }[] = [];
    let accumulated = '';
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let current: Node | null;
    while ((current = walker.nextNode())) {
        const node = current as Text;
        textNodes.push({ node, start: accumulated.length });
        accumulated += node.data;
    }

    const trimmedSentence = sentence.trim();
    const idx = findSentenceIndex(accumulated, trimmedSentence);
    if (idx === -1) {
        const citeNode = doc.createTextNode(
            accumulated.trim().length ? (cite.startsWith(' ') ? cite : ` ${cite}`) : cite.trimStart()
        );
        root.appendChild(citeNode);
        return root.innerHTML;
    }

    const endIdx = idx + trimmedSentence.length;
    let targetNode: Text | null = null;
    let targetOffset = 0;

    for (const { node, start } of textNodes) {
        const end = start + node.data.length;
        if (endIdx <= end) {
            targetNode = node;
            targetOffset = endIdx - start;
            break;
        }
    }

    if (!targetNode) {
        root.appendChild(doc.createTextNode(cite));
        return root.innerHTML;
    }

    const after = targetNode.splitText(targetOffset);
    const citeNode = doc.createTextNode(cite.startsWith(' ') ? cite : ` ${cite}`);
    targetNode.parentNode?.insertBefore(citeNode, after);
    return root.innerHTML;
}

/** Insert citation into unified manuscript (HTML when available). */
export function insertCitationInManuscript(
    paragraphs: ManuscriptParagraph[],
    sentence: string,
    formattedIntext: string
): { paragraphs: ManuscriptParagraph[]; anchorId: string } {
    const unified = normalizeToUnified(paragraphs);
    const rootId = unified[0]?.id || MANUSCRIPT_ROOT_ID;
    let html = unified[0]?.html || '';
    let text = plainTextFromParagraph(unified[0] || { id: rootId });

    const trimmedSentence = sentence.trim();

    if (html && typeof document !== 'undefined') {
        html = insertCitationInHtml(html, trimmedSentence, formattedIntext);
        text = stripHtmlToText(html);
    } else {
        if (trimmedSentence && normalizeText(text).includes(normalizeText(trimmedSentence))) {
            text = appendCitationAfterSentence(text, trimmedSentence, formattedIntext);
        } else if (trimmedSentence) {
            const cite = formatIntextCitation(formattedIntext);
            text = text.trimEnd() ? `${text.trimEnd()}\n\n${trimmedSentence}${cite}` : `${trimmedSentence}${cite}`;
        } else {
            text = appendCitationAfterSentence(text, '', formattedIntext);
        }
        html = textToHtml(text);
    }

    return { paragraphs: [{ id: rootId, html, text }], anchorId: rootId };
}

export function findParagraphForSentence(
    paragraphs: ManuscriptParagraph[],
    sentence: string
): ManuscriptParagraph | null {
    const unified = normalizeToUnified(paragraphs);
    const needle = normalizeText(sentence);
    if (!needle || !unified[0]) return null;
    if (normalizeText(plainTextFromParagraph(unified[0])).includes(needle)) return unified[0];
    return null;
}
