export const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';
const AUTH_URL = `${BASE_URL}/auth`;

// ─── Token helpers ────────────────────────────────────────────────────────────

export function getAccessToken(): string | null {
    return localStorage.getItem('access_token');
}

export function getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token');
}

export function isAuthenticated(): boolean {
    return !!getAccessToken();
}

function saveTokens(access: string, refresh: string) {
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
}

export function logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

export interface AuthUser {
    id: number;
    email: string;
    username: string;
}

export interface AuthError {
    message: string;
    field?: string;
}

async function handleResponse<T>(res: Response): Promise<T> {
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        // Django returns validation errors as { field: [msg, ...] } or { detail: msg }
        const firstError =
            (data as { error?: string })?.error ||
            data?.detail ||
            Object.values(data as Record<string, string[]>)
                .flat()
                .filter(Boolean)[0] ||
            'Something went wrong. Please try again.';
        throw new Error(firstError);
    }

    return data as T;
}

/** POST /api/auth/login/ */
export async function login(email: string, password: string): Promise<AuthUser> {
    const res = await fetch(`${AUTH_URL}/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    const data = await handleResponse<{ access: string; refresh: string }>(res);
    saveTokens(data.access, data.refresh);

    // Decode the JWT to pull out basic user info (no library needed)
    const payload = JSON.parse(atob(data.access.split('.')[1]));
    const user: AuthUser = {
        id: payload.user_id,
        email: payload.email,
        username: payload.username,
    };
    localStorage.setItem('user', JSON.stringify(user));
    return user;
}

/** POST /api/auth/register/ */
export async function register(
    email: string,
    username: string,
    password: string,
    password2: string
): Promise<void> {
    const res = await fetch(`${AUTH_URL}/register/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password, password2 }),
    });
    await handleResponse<unknown>(res);
}

/** POST /api/auth/token/refresh/ — called automatically when needed */
export async function refreshAccessToken(): Promise<string | null> {
    const refresh = getRefreshToken();
    if (!refresh) return null;

    const res = await fetch(`${AUTH_URL}/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
    });

    if (!res.ok) {
        logout();
        return null;
    }

    const data: { access: string } = await res.json();
    localStorage.setItem('access_token', data.access);
    return data.access;
}

/** Fetch wrapper that auto-attaches the Authorization header */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    let token = getAccessToken();

    const makeRequest = (t: string | null) => {
        const isFormData = options.body instanceof FormData;
        const headers: Record<string, string> = {
            ...(t ? { Authorization: `Bearer ${t}` } : {}),
            ...(options.headers as Record<string, string> ?? {}),
        };

        if (!isFormData && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        return fetch(url, {
            ...options,
            headers,
        });
    };

    let res = await makeRequest(token);

    // If 401, try refreshing once
    if (res.status === 401) {
        token = await refreshAccessToken();
        if (token) res = await makeRequest(token);
    }

    return res;
}

export function getStoredUser(): AuthUser | null {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as AuthUser) : null;
}

// ─── Documents API ────────────────────────────────────────────────────────────

export interface Recommendation {
    id: number;
    title: string;
    authors: string;
    year: string;
    abstract: string;
    url: string;
    doi: string;
    is_open_access: boolean;
    influential_citations?: number;
}

export interface Citation {
    id: number;
    sentence: string;
    intent: string;
    score: number;
    page_number: number | null;
    page_width?: number | null;
    page_height?: number | null;
    bounding_boxes: BoundingBox[];
    recommendations: Recommendation[];
}

export interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export interface ManuscriptParagraph {
    id: string;
    text?: string;
    html?: string;
}

export interface InsertedCitationRecord {
    id: number;
    recommendation: number | null;
    citation_gap: number | null;
    sentence_text: string;
    formatted_intext: string;
    csl_item: Record<string, unknown>;
    anchor_id: string;
    created_at: string;
}

export interface Document {
    id: number;
    title: string;
    file: string;
    file_url: string;
    uploaded_at: string;
    citation_style?: string;
    year_from?: number | null;
    year_to?: number | null;
    manuscript_content?: ManuscriptParagraph[];
    citations: Citation[];
    inserted_citations?: InsertedCitationRecord[];
}

export async function getDocument(id: number | string): Promise<Document> {
    const res = await authFetch(`${BASE_URL}/documents/${id}/`);
    return handleResponse<Document>(res);
}

export async function patchDocument(
    id: number | string,
    data: Partial<Pick<Document, 'citation_style' | 'year_from' | 'year_to' | 'manuscript_content'>>
): Promise<Document> {
    const res = await authFetch(`${BASE_URL}/documents/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    });
    return handleResponse<Document>(res);
}

export interface InsertCitationPayload {
    recommendation_id?: number;
    sentence?: string;
    anchor_id?: string;
    formatted_intext: string;
    csl_item: Record<string, unknown>;
    manuscript_content?: ManuscriptParagraph[];
    citation_gap_id?: number;
}

export interface InsertCitationResponse {
    inserted_citation: InsertedCitationRecord;
    formatted_intext: string;
    manuscript_content: ManuscriptParagraph[];
}

export async function insertCitation(
    documentId: number | string,
    payload: InsertCitationPayload
): Promise<InsertCitationResponse> {
    const res = await authFetch(`${BASE_URL}/documents/${documentId}/insert-citation/`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    return handleResponse<InsertCitationResponse>(res);
}

export async function seedManuscript(
    documentId: number | string,
    options?: { force?: boolean }
): Promise<{
    manuscript_content: ManuscriptParagraph[];
    seeded: boolean;
}> {
    const query = options?.force ? '?force=true' : '';
    const res = await authFetch(`${BASE_URL}/documents/${documentId}/seed-manuscript/${query}`, {
        method: 'POST',
    });
    return handleResponse(res);
}

/** GET /api/documents/:id/export-manuscript/ — download manuscript as Word (.docx) */
export async function downloadManuscriptDocx(
    documentId: number | string,
    filename?: string
): Promise<void> {
    const res = await authFetch(`${BASE_URL}/documents/${documentId}/export-manuscript/`);
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message =
            (data as { error?: string })?.error ||
            (data as { detail?: string })?.detail ||
            'Could not export manuscript.';
        throw new Error(message);
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^";\n]+)"?/i);
    const name = filename || (match ? match[1].trim() : 'manuscript.docx');

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name.endsWith('.docx') ? name : `${name}.docx`;
    link.click();
    URL.revokeObjectURL(url);
}

export async function getDocuments(): Promise<Document[]> {
    const res = await authFetch(`${BASE_URL}/documents/`);
    return handleResponse<Document[]>(res);
}

export async function uploadDocument(file: File): Promise<Document> {
    const formData = new FormData();
    formData.append('file', file);
    
    const res = await authFetch(`${BASE_URL}/documents/`, {
        method: 'POST',
        body: formData,
    });
    return handleResponse<Document>(res);
}

export interface RecommendForSentenceResponse {
    sentence: string;
    intent: string;
    score: number;
    recommendations: Recommendation[];
    provider?: string;
    error?: string;
    detail?: string;
}

/** POST /api/documents/recommend-for-sentence/ */
export interface YearRangeParams {
    yearFrom?: number | null;
    yearTo?: number | null;
}

export interface PdfSelectionParams {
    pageNumber?: number | null;
    pageWidth?: number | null;
    pageHeight?: number | null;
    boundingBoxes?: BoundingBox[];
}

export interface PaperSearchResult {
    title: string;
    authors: string;
    year: string | null;
    abstract?: string | null;
    url: string | null;
    doi: string | null;
    isOpenAccess?: boolean;
    influentialCitationCount?: number;
    matchScore: number;
    matchLabel?: string;
    /** Primary or combined API source(s), e.g. "openalex" or "openalex, crossref". */
    source?: string;
    sources?: string[];
}

export interface PaperSearchResponse {
    query: string;
    results: PaperSearchResult[];
    count: number;
    provider?: string;
    providers_used?: string[];
    providers_queried?: string[];
    message?: string;
    error?: string;
}

/** GET /api/documents/search-papers/?q=... */
export async function searchPapers(
    query: string,
    options?: { yearFrom?: number | null; yearTo?: number | null; limit?: number }
): Promise<PaperSearchResponse> {
    const params = new URLSearchParams({ q: query.trim() });
    if (options?.yearFrom != null) params.set('year_from', String(options.yearFrom));
    if (options?.yearTo != null) params.set('year_to', String(options.yearTo));
    if (options?.limit != null) params.set('limit', String(options.limit));

    const res = await authFetch(`${BASE_URL}/documents/search-papers/?${params.toString()}`);
    return handleResponse<PaperSearchResponse>(res);
}

export async function recommendForSentence(
    sentence: string,
    documentId?: string | null,
    intent?: string,
    yearRange?: YearRangeParams,
    pdfSelection?: PdfSelectionParams
): Promise<RecommendForSentenceResponse> {
    const body: Record<string, unknown> = { sentence };
    if (documentId) body.document_id = Number(documentId);
    if (intent) body.intent = intent;
    if (yearRange?.yearFrom != null) body.year_from = yearRange.yearFrom;
    if (yearRange?.yearTo != null) body.year_to = yearRange.yearTo;
    if (pdfSelection?.pageNumber != null) body.page_number = pdfSelection.pageNumber;
    if (pdfSelection?.pageWidth != null) body.page_width = pdfSelection.pageWidth;
    if (pdfSelection?.pageHeight != null) body.page_height = pdfSelection.pageHeight;
    if (pdfSelection?.boundingBoxes?.length) body.bounding_boxes = pdfSelection.boundingBoxes;

    const res = await authFetch(`${BASE_URL}/documents/recommend-for-sentence/`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
    return handleResponse<RecommendForSentenceResponse>(res);
}
