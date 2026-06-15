/** Resolve a clickable URL for a paper from API fields. */
export function resolvePaperUrl(paper: {
    url?: string | null;
    doi?: string | null;
}): string | undefined {
    const url = paper.url?.trim();
    if (url && /^https?:\/\//i.test(url)) {
        return url;
    }
    const doi = paper.doi?.trim();
    if (!doi) return undefined;
    const bare = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:/i, '');
    return bare ? `https://doi.org/${bare}` : undefined;
}
