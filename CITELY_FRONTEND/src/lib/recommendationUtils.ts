import type { Document, Recommendation } from './api';

export function isValidRecommendationId(id: unknown): id is number {
    return typeof id === 'number' && Number.isFinite(id) && id > 0;
}

export function buildInsertedRecommendationIdSet(inserted: { recommendation: number | null }[]): Set<number> {
    const set = new Set<number>();
    for (const row of inserted) {
        if (isValidRecommendationId(row.recommendation)) {
            set.add(row.recommendation);
        }
    }
    return set;
}

export function isRecommendationInserted(
    rec: Recommendation,
    insertedIds?: Set<number>
): boolean {
    return isValidRecommendationId(rec.id) && Boolean(insertedIds?.has(rec.id));
}

function normalizeSentence(s: string): string {
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Resolve DB recommendation id when API payload omitted id (e.g. before refresh). */
export function resolveRecommendationId(
    rec: Recommendation,
    document: Document | null,
    sentence?: string
): number | undefined {
    if (isValidRecommendationId(rec.id)) return rec.id;
    if (!document?.citations?.length) return undefined;

    const needle = sentence ? normalizeSentence(sentence) : '';
    const citations = document.citations;
    const ordered = needle
        ? [
              ...citations.filter((c) => normalizeSentence(c.sentence) === needle),
              ...citations.filter((c) => normalizeSentence(c.sentence) !== needle),
          ]
        : citations;

    for (const citation of ordered) {
        for (const row of citation.recommendations ?? []) {
            if (rec.doi && row.doi && rec.doi === row.doi && isValidRecommendationId(row.id)) {
                return row.id;
            }
            if (
                rec.title &&
                row.title &&
                rec.title.trim() === row.title.trim() &&
                isValidRecommendationId(row.id)
            ) {
                return row.id;
            }
        }
    }
    return undefined;
}

/** After find-citations, attach persisted recommendations (with ids) for a sentence. */
export function recommendationsForSentence(
    document: Document | null,
    sentence: string
): Recommendation[] | null {
    if (!document?.citations?.length) return null;
    const needle = normalizeSentence(sentence);
    const match = document.citations.find((c) => normalizeSentence(c.sentence) === needle);
    return match?.recommendations?.length ? match.recommendations : null;
}
