import type { InsertedCitationRecord } from './api';
import {
    formatBibliography,
    type CslItem,
    type CitationStyleId,
} from './citationEngine';
import { escapeHtml } from './manuscriptUtils';

const STOP_SECTION_HEADINGS =
    /^(acknowledg(e)?ments?|appendix|declaration|certification|abstract|table of contents)$/i;

export interface ManuscriptReferenceSections {
    beforeHtml: string;
    afterHtml: string;
    references: string[];
    hadReferencesSection: boolean;
    headingHtml: string;
}

function authorSortKey(item: CslItem): string {
    const family = item.author?.[0]?.family?.trim();
    if (family) return family.toLowerCase();
    return (item.title || '').trim().toLowerCase();
}

/** Sort key for a formatted reference line (APA-style or plain text). */
export function referenceLineSortKey(line: string): string {
    const trimmed = line.replace(/^\d+[\.)]\s*/, '').trim();
    const authorYear = trimmed.match(/^([^(.]+?)(?:\s+et\s+al\.?)?\s*\((\d{4}|n\.d\.)/i);
    if (authorYear) {
        return authorYear[1].split(',')[0].trim().toLowerCase();
    }
    const firstToken = trimmed.split(/[,(\s]/)[0]?.trim();
    return (firstToken || trimmed).toLowerCase();
}

export function normalizeReferenceKey(line: string): string {
    const sort = referenceLineSortKey(line);
    const yearMatch = line.match(/\((\d{4}|n\.d\.)/i);
    const year = yearMatch?.[1]?.toLowerCase() ?? '';
    const compact = line
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[^a-z0-9]/g, '');
    return `${sort}|${year}|${compact.slice(0, 80)}`;
}

function splitReferenceParagraph(text: string): string[] {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 12) return [];

    const numbered = trimmed
        .split(/(?=\s*\d+[\.)]\s+)/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 12);

    if (numbered.length > 1) {
        return numbered.map((s) => s.replace(/^\d+[\.)]\s*/, '').trim());
    }

    return [trimmed.replace(/^\d+[\.)]\s*/, '').trim()];
}

/** Extract reference lines from an imported manuscript REFERENCES section. */
export function parseManuscriptReferenceSections(html: string): ManuscriptReferenceSections {
    const empty: ManuscriptReferenceSections = {
        beforeHtml: html || '',
        afterHtml: '',
        references: [],
        hadReferencesSection: false,
        headingHtml: '<p><strong>References</strong></p>',
    };

    if (!html?.trim() || typeof document === 'undefined') return empty;

    const wrapper = new DOMParser().parseFromString(
        `<div id="ms-root">${html}</div>`,
        'text/html'
    );
    const root = wrapper.getElementById('ms-root');
    if (!root) return empty;

    const elements = Array.from(root.children) as HTMLElement[];
    let refIdx = -1;

    for (let i = 0; i < elements.length; i++) {
        const text = (elements[i].textContent || '').trim();
        if (/^references$/i.test(text)) {
            refIdx = i;
            break;
        }
    }

    if (refIdx === -1) return empty;

    const headingHtml = elements[refIdx].outerHTML;
    const references: string[] = [];
    let afterIdx = elements.length;

    for (let i = refIdx + 1; i < elements.length; i++) {
        const text = (elements[i].textContent || '').trim();
        if (!text) continue;

        if (STOP_SECTION_HEADINGS.test(text)) {
            afterIdx = i;
            break;
        }

        if (/^references$/i.test(text) && references.length > 0) {
            afterIdx = i;
            break;
        }

        references.push(...splitReferenceParagraph(text));
    }

    const beforeHtml = elements
        .slice(0, refIdx)
        .map((el) => el.outerHTML)
        .join('');
    const afterHtml = elements
        .slice(afterIdx)
        .map((el) => el.outerHTML)
        .join('');

    return {
        beforeHtml,
        afterHtml,
        references: references.filter(Boolean),
        hadReferencesSection: true,
        headingHtml,
    };
}

/** Merge PDF/manuscript references with system-generated entries; prefer system formatting on duplicates. */
export function mergeReferenceLists(existingLines: string[], systemLines: string[]): string[] {
    const byKey = new Map<string, { line: string; priority: number }>();

    for (const line of existingLines) {
        const trimmed = line.trim();
        if (trimmed.length < 10) continue;
        const key = normalizeReferenceKey(trimmed);
        if (!byKey.has(key)) {
            byKey.set(key, { line: trimmed, priority: 0 });
        }
    }

    for (const line of systemLines) {
        const trimmed = line.trim();
        if (trimmed.length < 10) continue;
        const key = normalizeReferenceKey(trimmed);
        byKey.set(key, { line: trimmed, priority: 1 });
    }

    return Array.from(byKey.values())
        .sort((a, b) =>
            referenceLineSortKey(a.line).localeCompare(referenceLineSortKey(b.line), undefined, {
                sensitivity: 'base',
            })
        )
        .map((entry) => entry.line);
}

/** Deduplicate inserted citations and sort alphabetically by first author surname. */
export function collectUniqueCslItems(inserted: InsertedCitationRecord[]): CslItem[] {
    const seen = new Set<string>();
    const items: CslItem[] = [];

    for (const ic of inserted) {
        const raw = ic.csl_item;
        if (!raw || typeof raw !== 'object') continue;

        const item = raw as unknown as CslItem;
        const id =
            (typeof item.id === 'string' && item.id) ||
            (item.DOI ? `doi:${item.DOI}` : null) ||
            `inserted-${ic.id}`;

        if (seen.has(id)) continue;
        seen.add(id);

        items.push({
            ...item,
            id,
            type: item.type || 'article-journal',
            title: item.title || 'Untitled',
        });
    }

    items.sort((a, b) =>
        authorSortKey(a).localeCompare(authorSortKey(b), undefined, { sensitivity: 'base' })
    );

    return items;
}

function fallbackReferenceLine(item: CslItem): string {
    const authors =
        item.author
            ?.map((a) => a.family)
            .filter(Boolean)
            .join(', ') || 'Unknown';
    const year = item.issued?.['date-parts']?.[0]?.[0] ?? 'n.d.';
    return `${authors} (${year}). ${item.title || 'Untitled'}.`;
}

/** Build formatted reference list entries for inserted citations only. */
export async function buildReferenceList(
    inserted: InsertedCitationRecord[],
    styleId: CitationStyleId
): Promise<string[]> {
    const items = collectUniqueCslItems(inserted);
    if (!items.length) return [];

    const formatted = await formatBibliography(items, styleId);
    if (formatted.length === items.length) {
        return formatted;
    }

    return items.map(fallbackReferenceLine);
}

/** Merge manuscript REFERENCES (if any) with inserted citations, sorted A–Z. */
export async function buildMergedReferenceList(
    inserted: InsertedCitationRecord[],
    styleId: CitationStyleId,
    manuscriptHtml?: string
): Promise<string[]> {
    const systemLines = await buildReferenceList(inserted, styleId);
    const { references: existingLines } = parseManuscriptReferenceSections(manuscriptHtml || '');
    return mergeReferenceLists(existingLines, systemLines);
}

/** Write merged references into the manuscript HTML (replace or append REFERENCES section). */
export function applyMergedReferencesToManuscript(html: string, entries: string[]): string {
    if (!entries.length) return html;

    const refsHtml = entries.map((entry) => `<p>${escapeHtml(entry)}</p>`).join('');
    const parsed = parseManuscriptReferenceSections(html);

    if (parsed.hadReferencesSection) {
        return `${parsed.beforeHtml}${parsed.headingHtml}${refsHtml}${parsed.afterHtml}`;
    }

    if (typeof document === 'undefined') {
        return `${html}<p><strong>References</strong></p>${refsHtml}`;
    }

    const wrapper = new DOMParser().parseFromString(
        `<div id="ms-root">${html}</div>`,
        'text/html'
    );
    const root = wrapper.getElementById('ms-root');
    if (!root) {
        return `${html}<p><strong>References</strong></p>${refsHtml}`;
    }

    const elements = Array.from(root.children) as HTMLElement[];
    let insertBeforeIdx = elements.length;

    for (let i = 0; i < elements.length; i++) {
        const text = (elements[i].textContent || '').trim();
        if (STOP_SECTION_HEADINGS.test(text)) {
            insertBeforeIdx = i;
            break;
        }
    }

    const before = elements
        .slice(0, insertBeforeIdx)
        .map((el) => el.outerHTML)
        .join('');
    const after = elements
        .slice(insertBeforeIdx)
        .map((el) => el.outerHTML)
        .join('');

    return `${before}<p><strong>References</strong></p>${refsHtml}${after}`;
}
