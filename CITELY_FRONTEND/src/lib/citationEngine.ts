import CSL from 'citeproc/citeproc_commonjs.js';
import type { Recommendation } from './api';

export interface CslAuthor {
    family: string;
    given?: string;
}

export interface CslItem {
    id: string;
    type: string;
    title: string;
    author?: CslAuthor[];
    issued?: { 'date-parts': number[][] };
    DOI?: string;
    URL?: string;
}

/** Maps style id → CSL file in /public/csl/ */
export const STYLE_FILES: Record<string, string> = {
    apa: 'apa.csl',
    'apa-6': 'apa-6th-edition.csl',
    'apa-no-ampersand': 'apa-no-ampersand.csl',
    'apa-numeric': 'apa-numeric-superscript.csl',
    'apa-single-spaced': 'apa-single-spaced.csl',
    'apa-with-abstract': 'apa-with-abstract.csl',
    ieee: 'ieee.csl',
    acm: 'association-for-computing-machinery.csl',
    'harvard-cimkd': 'harvard-cimkd.csl',
    'harvard-cite-them-right': 'harvard-cite-them-right.csl',
    'harvard-anglia': 'harvard-anglia-ruskin-university.csl',
    'harvard-deakin': 'harvard-deakin-university.csl',
    'harvard-greenwich': 'harvard-university-of-greenwich.csl',
    'harvard-kent': 'harvard-university-of-kent.csl',
    'harvard-birmingham': 'harvard-university-of-birmingham.csl',
    'chicago-author-date': 'chicago-author-date.csl',
    'chicago-ad-17': 'chicago-author-date-17th-edition.csl',
    'chicago-ad-16': 'chicago-author-date-16th-edition.csl',
    'chicago-notes': 'chicago-notes-bibliography.csl',
    'chicago-notes-17': 'chicago-notes-bibliography-17th-edition.csl',
    'chicago-notes-16': 'chicago-notes-bibliography-16th-edition.csl',
};

export const CITATION_STYLE_GROUPS = [
    {
        family: 'APA',
        options: [
            { id: 'apa', label: 'APA 7th edition' },
            { id: 'apa-6', label: 'APA 6th edition' },
            { id: 'apa-no-ampersand', label: 'APA 7th (no ampersand)' },
            { id: 'apa-numeric', label: 'APA numeric (superscript)' },
            { id: 'apa-single-spaced', label: 'APA 7th (single-spaced)' },
            { id: 'apa-with-abstract', label: 'APA 7th (with abstract)' },
        ],
    },
    {
        family: 'IEEE',
        options: [
            { id: 'ieee', label: 'IEEE' },
            { id: 'acm', label: 'ACM (numeric, engineering)' },
        ],
    },
    {
        family: 'Harvard',
        options: [
            { id: 'harvard-cimkd', label: 'Harvard (CIMKD)' },
            { id: 'harvard-cite-them-right', label: 'Harvard (Cite Them Right)' },
            { id: 'harvard-anglia', label: 'Harvard (Anglia Ruskin)' },
            { id: 'harvard-deakin', label: 'Harvard (Deakin)' },
            { id: 'harvard-greenwich', label: 'Harvard (Greenwich)' },
            { id: 'harvard-kent', label: 'Harvard (Kent)' },
            { id: 'harvard-birmingham', label: 'Harvard (Birmingham)' },
        ],
    },
    {
        family: 'Chicago',
        options: [
            { id: 'chicago-author-date', label: 'Chicago author-date' },
            { id: 'chicago-ad-17', label: 'Chicago author-date (17th ed.)' },
            { id: 'chicago-ad-16', label: 'Chicago author-date (16th ed.)' },
            { id: 'chicago-notes', label: 'Chicago notes & bibliography' },
            { id: 'chicago-notes-17', label: 'Chicago notes (17th ed.)' },
            { id: 'chicago-notes-16', label: 'Chicago notes (16th ed.)' },
        ],
    },
] as const;

export const CITATION_STYLE_OPTIONS = CITATION_STYLE_GROUPS.flatMap((g) =>
    g.options.map((o) => ({ ...o, family: g.family }))
);

export type CitationStyleId = (typeof CITATION_STYLE_OPTIONS)[number]['id'];

export const DEFAULT_CITATION_STYLE: CitationStyleId = 'apa';

export const CITATION_STYLE_STORAGE_KEY = 'citely_citation_style';

/** Accept stored ids from older builds; fall back to APA 7. */
export function normalizeCitationStyleId(id: string | null | undefined): CitationStyleId {
    if (id && id in STYLE_FILES) {
        return id as CitationStyleId;
    }
    return DEFAULT_CITATION_STYLE;
}

const styleCache = new Map<string, string>();
let localeXml: string | null = null;

export function parseAuthors(authors: string): CslAuthor[] {
    if (!authors || authors === 'Unknown') {
        return [{ family: 'Unknown' }];
    }
    const parts = authors.split(/[,;]|\band\b/i).map((s) => s.trim()).filter(Boolean);
    return parts.map((part) => {
        const tokens = part.split(/\s+/).filter(Boolean);
        if (tokens.length === 1) {
            return { family: tokens[0] };
        }
        const family = tokens[tokens.length - 1].replace(/\.$/, '');
        const given = tokens.slice(0, -1).join(' ');
        return { family, given };
    });
}

export function buildCslItem(rec: Recommendation): CslItem {
    const id = rec.doi ? `doi:${rec.doi}` : `rec-${rec.id}`;
    const item: CslItem = {
        id,
        type: 'article-journal',
        title: rec.title || 'Untitled',
        author: parseAuthors(rec.authors),
    };
    const year = parseInt(String(rec.year || ''), 10);
    if (!Number.isNaN(year)) {
        item.issued = { 'date-parts': [[year]] };
    }
    if (rec.doi) item.DOI = rec.doi;
    if (rec.url) item.URL = rec.url;
    return item;
}

export function fallbackCitation(rec: Recommendation): string {
    const authors = (rec.authors || 'Unknown').split(',')[0]?.trim() || 'Unknown';
    const year = rec.year || 'n.d.';
    return `(${authors}, ${year})`;
}

async function loadStyleXml(styleId: string): Promise<string> {
    const file = STYLE_FILES[styleId] || STYLE_FILES.apa;
    if (styleCache.has(file)) return styleCache.get(file)!;
    const res = await fetch(`/csl/${file}`);
    if (!res.ok) throw new Error(`Failed to load CSL style: ${file}`);
    const xml = await res.text();
    styleCache.set(file, xml);
    return xml;
}

async function loadLocaleXml(): Promise<string> {
    if (localeXml) return localeXml;
    const res = await fetch('/csl/locales-en-US.xml');
    if (!res.ok) throw new Error('Failed to load CSL locale');
    localeXml = await res.text();
    return localeXml;
}

async function runWithProcessor<T>(
    styleId: string,
    items: CslItem[],
    fn: (processor: InstanceType<typeof CSL.Engine>) => T
): Promise<T> {
    const resolvedId = normalizeCitationStyleId(styleId);
    const [styleXml, locale] = await Promise.all([loadStyleXml(resolvedId), loadLocaleXml()]);
    const itemsById: Record<string, CslItem> = {};
    items.forEach((item) => {
        itemsById[item.id] = item;
    });

    const sys = {
        retrieveLocale: () => locale,
        retrieveItem: (id: string) => itemsById[id],
    };

    const processor = new CSL.Engine(sys, styleXml, 'en-US', false);
    processor.updateItems(Object.keys(itemsById));
    return fn(processor);
}

export async function formatIntextCitation(
    items: CslItem[],
    styleId: string
): Promise<string> {
    if (!items.length) return '';
    try {
        return await runWithProcessor(styleId, items, (processor) => {
            const citationItems = items.map((item) => ({ id: item.id }));
            const result = processor.processCitationCluster(
                { citationItems, properties: { noteIndex: 0 } },
                [],
                []
            );
            if (Array.isArray(result) && Array.isArray(result[1]) && result[1].length > 0) {
                const formatted = result[1][0][1];
                if (typeof formatted === 'string') {
                    return stripHtml(formatted);
                }
            }
            return '';
        });
    } catch (err) {
        console.error('citeproc formatIntextCitation failed', err);
        return '';
    }
}

export async function formatBibliography(
    items: CslItem[],
    styleId: string
): Promise<string[]> {
    if (!items.length) return [];
    try {
        return await runWithProcessor(styleId, items, (processor) => {
            const bib = processor.makeBibliography();
            if (bib && bib[1]) {
                return (bib[1] as string[]).map(stripHtml);
            }
            return [];
        });
    } catch (err) {
        console.error('citeproc formatBibliography failed', err);
        return [];
    }
}

export async function formatRecommendationIntext(
    rec: Recommendation,
    styleId: string
): Promise<string> {
    const item = buildCslItem(rec);
    const formatted = await formatIntextCitation([item], styleId);
    return formatted || fallbackCitation(rec);
}

function stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, '').trim();
}
