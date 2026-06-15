import type { Recommendation } from './api';

export const PUBLICATION_YEAR_MIN = 1990;

/** Years for dropdowns, newest first (includes next calendar year for in-press). */
export function getPublicationYearOptions(): number[] {
    const end = new Date().getFullYear() + 1;
    const years: number[] = [];
    for (let y = end; y >= PUBLICATION_YEAR_MIN; y--) {
        years.push(y);
    }
    return years;
}

export function parseYearInput(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const y = parseInt(trimmed, 10);
    if (Number.isNaN(y) || y < 1900 || y > 2100) return null;
    return y;
}

export function recommendationInYearRange(
    rec: Recommendation,
    yearFrom: number | null,
    yearTo: number | null
): boolean {
    if (yearFrom === null && yearTo === null) return true;
    const y = parseInt(String(rec.year || ''), 10);
    if (Number.isNaN(y)) return false;
    if (yearFrom !== null && y < yearFrom) return false;
    if (yearTo !== null && y > yearTo) return false;
    return true;
}

export function formatYearRangeLabel(yearFrom: number | null, yearTo: number | null): string {
    if (yearFrom === null && yearTo === null) return 'Any year';
    if (yearFrom !== null && yearTo !== null) return `${yearFrom}–${yearTo}`;
    if (yearFrom !== null) return `${yearFrom}+`;
    return `Up to ${yearTo}`;
}
