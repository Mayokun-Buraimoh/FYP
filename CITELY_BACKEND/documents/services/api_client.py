import os
import re
import time
import unicodedata
import xml.etree.ElementTree as ET
import json

import requests
from dotenv import load_dotenv               

load_dotenv()

SEMANTIC_SCHOLAR_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
OPENALEX_WORKS_URL = "https://api.openalex.org/works"
CROSSREF_WORKS_URL = "https://api.crossref.org/works"
CORE_SEARCH_URL = "https://api.core.ac.uk/v3/search/works/"
EUROPE_PMC_SEARCH_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
ARXIV_API_URL = "http://export.arxiv.org/api/query"

STOPWORDS = {
    "in", "a", "the", "an", "is", "of", "and", "or", "for", "with", "as", "by", "this", "that",
    "to", "at", "from", "we", "our", "their", "was", "were", "be", "been", "are", "it", "on",
    "using", "used", "use", "into", "which", "such", "also", "than", "via", "within", "between",
}

METHODOLOGY_HEAVY_TERMS = {
    "analysis", "method", "methodology", "model", "models", "approach", "results", "test",
    "tests", "factor", "cfa", "sem", "amos", "structural", "equation", "bias", "single",
    "sample", "samples", "data", "measure", "measured", "measures", "construct", "constructs",
}

# Multi-word phrases only — avoids false positives (e.g. "Facebook" in FAISS, "trust" in "trusted").
DOMAIN_HINT_TERMS = [
    "social commerce",
    "community engagement",
    "online community",
    "social support",
    "social presence",
    "community trust",
    "e-commerce",
]


def _env_int(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _env_bool(name, default=True):
    val = os.environ.get(name, str(default)).lower()
    return val in ("1", "true", "yes", "on")


PAPER_SEARCH_LIMIT = _env_int("PAPER_SEARCH_LIMIT", 100)
PAPER_RECOMMENDATIONS_TOP_K = _env_int("PAPER_RECOMMENDATIONS_TOP_K", 10)
PAPER_GAPS_TOP_K = _env_int("PAPER_GAPS_TOP_K", 5)

_SEMANTIC_MODEL = None

def get_semantic_model():
    global _SEMANTIC_MODEL
    if _SEMANTIC_MODEL is None:
        try:
            from sentence_transformers import SentenceTransformer
            print("Loading local semantic model (all-MiniLM-L6-v2)...")
            _SEMANTIC_MODEL = SentenceTransformer('all-MiniLM-L6-v2')
        except Exception as e:
            print(f"Error loading semantic model: {e}")
            _SEMANTIC_MODEL = "FAILED"
    return _SEMANTIC_MODEL if _SEMANTIC_MODEL != "FAILED" else None


def _contact_email():
    return (
        os.environ.get("OPENALEX_CONTACT_EMAIL")
        or os.environ.get("CROSSREF_MAILTO")
        or os.environ.get("NCBI_EMAIL")
        or "citely@localhost"
    )


def _polite_headers():
    return {"User-Agent": f"Citely/1.0 (mailto:{_contact_email()})"}


# PDF bullets / private-use glyphs that pollute OpenAlex queries (see server logs).
_PDF_NOISE_CHARS = re.compile(
    r"[\uf0b7\u2022\u25cf\u25aa\u25e6\u25cb\u25a0\u25a1\u2013\u2014•●○■□▪▫]"
)


def _sanitize_sentence(text):
    """Normalize PDF selection text before search and classification."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text)
    text = _PDF_NOISE_CHARS.sub(" ", text)
    text = re.sub(r"[\x00-\x1f\x7f-\x9f]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _tokenize(text):
    text = _sanitize_sentence(text)
    cleaned = text.lower().replace("-", " ").translate(str.maketrans("", "", '.,!?;:()[]{}"\''))
    seen = set()
    tokens = []
    for w in cleaned.split():
        if w in STOPWORDS or len(w) <= 2:
            continue
        if not w.isascii() or not re.match(r"^[a-z0-9][a-z0-9\-]*$", w):
            continue
        if w in seen:
            continue
        seen.add(w)
        tokens.append(w)
    return tokens


def _topic_search_phrases(sentence):
    """Anchor OpenAlex queries to the paper's subject when detectable."""
    low = _sanitize_sentence(sentence).lower()
    phrases = []
    if "decision support" in low or re.search(r"\bdss\b", low):
        phrases.append('"decision support system"')
        if "cost" in low or "monetary" in low:
            phrases.append("decision support system cost investment")
    if "information system" in low or "information systems" in low:
        phrases.append('"information system"')
    return phrases[:3]


def _collect_domain_hints(gap_list):
    all_text = " ".join((gap.get("sentence") or "") for gap in gap_list).lower()
    matched_hints = [hint for hint in DOMAIN_HINT_TERMS if hint in all_text]

    freq = {}
    for token in _tokenize(all_text):
        if token in METHODOLOGY_HEAVY_TERMS:
            continue
        freq[token] = freq.get(token, 0) + 1

    frequent_terms = [k for k, _ in sorted(freq.items(), key=lambda kv: kv[1], reverse=True)[:5]]
    return matched_hints[:4], frequent_terms[:3]


def _recommendation_relevance_score(rec, sentence_keywords, domain_hints, sentence=""):
    text = f"{rec.get('title') or ''} {rec.get('abstract') or ''}".lower()
    if not text.strip():
        return 0

    sentence_hits = sum(1 for kw in sentence_keywords if kw in text)
    domain_hits = sum(1 for hint in domain_hints if hint in text)
    influence = rec.get("influentialCitationCount", 0) or 0

    score = (domain_hits * 5) + (sentence_hits * 2) + min(influence, 10) * 0.1

    low_sent = _sanitize_sentence(sentence).lower()
    is_dss_context = "decision support" in low_sent or re.search(r"\bdss\b", low_sent)
    if is_dss_context:
        if "decision support" in text or re.search(r"\bdss\b", text):
            score += 25
        elif sentence_hits < 3:
            return -100
        else:
            score -= 10
    if "information system" in low_sent and "information system" in text:
        score += 10
    if ("monetary" in low_sent or "cost" in low_sent) and "cost" in text:
        score += 5

    return score


def get_openai_client():
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key or "placeholder" in api_key or "your_openai_api_key" in api_key:
        return None
    try:
        from openai import OpenAI
        return OpenAI(api_key=api_key)
    except Exception as e:
        print(f"Error initializing OpenAI client: {e}")
        return None


def generate_query(sentence, intent, context=None):
    client = get_openai_client()
    if client:
        try:
            prompt = f"""You are an expert academic search assistant. Your task is to generate a concise, highly targeted keyword search query for finding relevant research papers in academic databases.

Highlighted Sentence to cite:
"{sentence}"
"""
            if context:
                prompt += f'\nSurrounding Context/Paragraph:\n"{context}"\n'
            
            prompt += """
Instructions:
1. Identify the core scientific/academic concepts, methodology, or claims in the highlighted sentence. Use the surrounding context to resolve ambiguity and pinpoint the exact academic domain.
2. Generate a query consisting of 4-8 keywords/phrases. Do NOT include generic terms like "recent years", "various studies", "significant improvements", "propose", "method", "approach", etc. Focus on specific technical/domain terms.
3. Output ONLY the query string, nothing else. Do not use quotes, punctuation, or explanations.
"""
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a helpful academic search query generator."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=60,
                temperature=0.0
            )
            query = response.choices[0].message.content.strip()
            query = re.sub(r'[`"\'\.]', '', query)
            print(f"OpenAI generated query: {query}")
            return query
        except Exception as e:
            print(f"OpenAI query generation failed: {e}. Falling back to default.")

    sentence = _sanitize_sentence(sentence)
    words = _tokenize(sentence)
    keywords = [w for w in words if w not in METHODOLOGY_HEAVY_TERMS]
    if not keywords:
        keywords = words

    topic_phrases = _topic_search_phrases(sentence)
    base_query = " ".join(topic_phrases + keywords[:12])
    intent_lower = intent.lower() if intent else ""

    if "background" in intent_lower:
        base_query += " survey review"
    elif "uses" in intent_lower or "method" in intent_lower:
        base_query += " methodology implementation"
    elif "motivation" in intent_lower or "problem" in intent_lower:
        base_query += " challenge novel perspective"

    return base_query


def _normalize_rec(
    title,
    authors,
    year,
    abstract,
    url,
    doi=None,
    is_open_access=False,
    influential_citations=0,
):
    return {
        "title": title or "Untitled",
        "authors": authors or "Unknown",
        "year": str(year) if year is not None else None,
        "abstract": abstract,
        "url": url,
        "isOpenAccess": is_open_access,
        "doi": doi,
        "influentialCitationCount": influential_citations or 0,
    }


def _reconstruct_openalex_abstract(inverted_index):
    if not inverted_index:
        return None
    positions = []
    for word, idxs in inverted_index.items():
        for idx in idxs:
            positions.append((idx, word))
    positions.sort()
    return " ".join(w for _, w in positions)


def _parse_rec_year(rec):
    year = rec.get("year")
    if year is None:
        return None
    try:
        return int(str(year).strip()[:4])
    except (TypeError, ValueError):
        return None


def _filter_by_year_range(recommendations, year_from=None, year_to=None):
    if year_from is None and year_to is None:
        return recommendations
    filtered = []
    for rec in recommendations:
        y = _parse_rec_year(rec)
        if y is None:
            continue
        if year_from is not None and y < year_from:
            continue
        if year_to is not None and y > year_to:
            continue
        filtered.append(rec)
    return filtered


def _fetch_openalex(query, limit, year_from=None, year_to=None):
    params = {"search": query, "per_page": min(limit, 200)}
    if year_from is not None or year_to is not None:
        filters = []
        y0 = year_from if year_from is not None else 1900
        y1 = year_to if year_to is not None else 2100
        filters.append(f"from_publication_date:{y0}-01-01")
        filters.append(f"to_publication_date:{y1}-12-31")
        params["filter"] = ",".join(filters)
    try:
        response = requests.get(
            OPENALEX_WORKS_URL,
            params=params,
            headers=_polite_headers(),
            timeout=15,
        )
        if response.status_code != 200:
            print(f"OpenAlex response: {response.status_code}")
            return []
        results = []
        for work in response.json().get("results", []):
            authors = work.get("authorships") or []
            author_names = [
                (a.get("author") or {}).get("display_name")
                for a in authors
                if (a.get("author") or {}).get("display_name")
            ]
            doi = work.get("doi", "")
            if doi and doi.startswith("https://doi.org/"):
                doi = doi.replace("https://doi.org/", "")

            oa = work.get("open_access") or {}
            pdf_url = oa.get("oa_url")
            landing = (work.get("primary_location") or {}).get("landing_page_url")
            final_url = f"https://doi.org/{doi}" if doi else (pdf_url or landing or work.get("id"))

            results.append(
                _normalize_rec(
                    title=work.get("title"),
                    authors=", ".join(author_names[:8]),
                    year=work.get("publication_year"),
                    abstract=_reconstruct_openalex_abstract(work.get("abstract_inverted_index")),
                    url=final_url,
                    doi=doi,
                    is_open_access=oa.get("is_oa", False),
                    influential_citations=work.get("cited_by_count", 0),
                )
            )
        return results
    except requests.RequestException as exc:
        print(f"OpenAlex error: {exc}")
        return []


def _fetch_crossref(query, limit, year_from=None, year_to=None):
    params = {"query": query, "rows": min(limit, 100)}
    if year_from is not None or year_to is not None:
        filters = []
        if year_from is not None:
            filters.append(f"from-pub-date:{year_from}")
        if year_to is not None:
            filters.append(f"until-pub-date:{year_to}")
        if filters:
            params["filter"] = ",".join(filters)
    headers = _polite_headers()
    mailto = os.environ.get("CROSSREF_MAILTO")
    if mailto:
        headers["User-Agent"] = f"Citely/1.0 (mailto:{mailto})"
    try:
        response = requests.get(
            CROSSREF_WORKS_URL,
            params=params,
            headers=headers,
            timeout=15,
        )
        if response.status_code != 200:
            print(f"Crossref response: {response.status_code}")
            return []
        results = []
        for item in response.json().get("message", {}).get("items", []):
            title_list = item.get("title") or []
            title = title_list[0] if title_list else None
            author_parts = []
            for author in item.get("author") or []:
                name = f"{author.get('given', '')} {author.get('family', '')}".strip()
                if name:
                    author_parts.append(name)
            year = None
            for date_key in ("published-print", "published-online", "created"):
                parts = (item.get(date_key) or {}).get("date-parts")
                if parts and parts[0]:
                    year = parts[0][0]
                    break
            doi = item.get("DOI")
            results.append(
                _normalize_rec(
                    title=title,
                    authors=", ".join(author_parts[:8]),
                    year=year,
                    abstract=(item.get("abstract") or "").replace("<jats:p>", "").replace("</jats:p>", "")[:2000] or None,
                    url=f"https://doi.org/{doi}" if doi else item.get("URL"),
                    doi=doi,
                    is_open_access=False,
                    influential_citations=item.get("is-referenced-by-count", 0),
                )
            )
        return results
    except requests.RequestException as exc:
        print(f"Crossref error: {exc}")
        return []


def _fetch_semantic_scholar(query, limit):
    api_key = os.environ.get("SEMANTIC_SCHOLAR_API_KEY", "").strip()
    headers = {"x-api-key": api_key} if api_key else {}
    params = {
        "query": query,
        "limit": min(limit, 100),
        "fields": "title,authors,year,abstract,openAccessPdf,url,externalIds,influentialCitationCount",
    }
    max_retries = 3
    for attempt in range(max_retries):
        if not api_key:
            time.sleep(1.5)
        try:
            response = requests.get(
                SEMANTIC_SCHOLAR_URL,
                params=params,
                headers=headers,
                timeout=15,
            )
            print(f"Semantic Scholar response: {response.status_code}")
            if response.status_code == 429:
                pause = int(response.headers.get("Retry-After", 2 ** attempt))
                time.sleep(pause)
                continue
            if response.status_code != 200:
                return []
            results = []
            for raw in response.json().get("data", []):
                authors_list = raw.get("authors") or []
                authors_str = ", ".join(a.get("name") for a in authors_list if a.get("name")) or "Unknown"
                external_ids = raw.get("externalIds") or {}
                doi = external_ids.get("DOI")
                is_oa = bool(raw.get("openAccessPdf"))
                oa_url = (raw.get("openAccessPdf") or {}).get("url") if is_oa else None
                final_url = f"https://doi.org/{doi}" if doi else (oa_url or raw.get("url"))
                results.append(
                    _normalize_rec(
                        title=raw.get("title"),
                        authors=authors_str,
                        year=raw.get("year"),
                        abstract=raw.get("abstract"),
                        url=final_url,
                        doi=doi,
                        is_open_access=is_oa,
                        influential_citations=raw.get("influentialCitationCount", 0),
                    )
                )
            return results
        except requests.RequestException as exc:
            print(f"Semantic Scholar error: {exc}")
            return []
    return []


def _fetch_core(query, limit):
    api_key = os.environ.get("CORE_API_KEY", "").strip()
    if not api_key:
        return []
    try:
        response = requests.get(
            CORE_SEARCH_URL,
            params={"q": query, "limit": min(limit, 100)},
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15,
        )
        if response.status_code != 200:
            print(f"CORE response: {response.status_code}")
            return []
        results = []
        for item in response.json().get("results", []):
            rec = item if isinstance(item, dict) and "title" in item else (item.get("document") or item)
            authors = rec.get("authors") or []
            if authors and isinstance(authors[0], dict):
                author_names = [a.get("name") for a in authors if a.get("name")]
            else:
                author_names = [str(a) for a in authors]
            doi = rec.get("doi")
            download_url = rec.get("downloadUrl") or rec.get("sourceFulltextUrls", [None])[0]
            results.append(
                _normalize_rec(
                    title=rec.get("title"),
                    authors=", ".join(author_names[:8]),
                    year=rec.get("yearPublished"),
                    abstract=rec.get("abstract"),
                    url=download_url or (f"https://doi.org/{doi}" if doi else rec.get("id")),
                    doi=doi,
                    is_open_access=bool(download_url),
                    influential_citations=rec.get("citationCount", 0),
                )
            )
        return results
    except requests.RequestException as exc:
        print(f"CORE error: {exc}")
        return []


def _fetch_europe_pmc(query, limit):
    if not _env_bool("ENABLE_EUROPE_PMC", True):
        return []
    try:
        response = requests.get(
            EUROPE_PMC_SEARCH_URL,
            params={
                "query": query,
                "format": "json",
                "pageSize": min(limit, 100),
                "resultType": "core",
            },
            headers=_polite_headers(),
            timeout=15,
        )
        if response.status_code != 200:
            print(f"Europe PMC response: {response.status_code}")
            return []
        results = []
        for item in response.json().get("resultList", {}).get("result", []):
            doi = item.get("doi")
            results.append(
                _normalize_rec(
                    title=item.get("title"),
                    authors=item.get("authorString", "Unknown"),
                    year=item.get("pubYear"),
                    abstract=item.get("abstractText"),
                    url=f"https://doi.org/{doi}" if doi else item.get("pmcid"),
                    doi=doi,
                    is_open_access=item.get("isOpenAccess") == "Y",
                    influential_citations=item.get("citedByCount", 0),
                )
            )
        return results
    except requests.RequestException as exc:
        print(f"Europe PMC error: {exc}")
        return []


def _fetch_arxiv(query, limit):
    if not _env_bool("ENABLE_ARXIV", True):
        return []
    try:
        terms = "+".join(_tokenize(query)[:12]) or "research"
        search_query = f"all:{terms}"
        response = requests.get(
            ARXIV_API_URL,
            params={"search_query": search_query, "start": 0, "max_results": min(limit, 50)},
            headers=_polite_headers(),
            timeout=15,
        )
        if response.status_code != 200:
            print(f"arXiv response: {response.status_code}")
            return []
        root = ET.fromstring(response.content)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        results = []
        for entry in root.findall("atom:entry", ns):
            title = (entry.find("atom:title", ns).text or "").strip().replace("\n", " ")
            summary = (entry.find("atom:summary", ns).text or "").strip().replace("\n", " ")
            link = entry.find("atom:id", ns).text
            authors = [
                a.find("atom:name", ns).text
                for a in entry.findall("atom:author", ns)
                if a.find("atom:name", ns) is not None
            ]
            published = entry.find("atom:published", ns)
            year = published.text[:4] if published is not None and published.text else None
            results.append(
                _normalize_rec(
                    title=title,
                    authors=", ".join(authors[:8]),
                    year=year,
                    abstract=summary,
                    url=link,
                    doi=None,
                    is_open_access=True,
                    influential_citations=0,
                )
            )
        return results
    except (requests.RequestException, ET.ParseError) as exc:
        print(f"arXiv error: {exc}")
        return []


PROVIDER_FETCHERS = {
    "openalex": _fetch_openalex,
    "crossref": _fetch_crossref,
    "semantic_scholar": _fetch_semantic_scholar,
    "core": _fetch_core,
    "europe_pmc": _fetch_europe_pmc,
    "arxiv": _fetch_arxiv,
}


def _configured_providers():
    raw = os.environ.get("PAPER_SEARCH_PROVIDERS", "openalex,crossref,semantic_scholar")
    names = [p.strip().lower() for p in raw.split(",") if p.strip()]
    return [n for n in names if n in PROVIDER_FETCHERS]


def _normalize_doi(doi):
    if not doi:
        return None
    d = str(doi).strip().lower()
    d = re.sub(r"^https?://(dx\.)?doi\.org/", "", d)
    d = re.sub(r"^doi:", "", d)
    return d.strip() or None


def _dedupe_key(rec):
    doi = _normalize_doi(rec.get("doi"))
    if doi:
        return f"doi:{doi}"
    title = re.sub(r"\s+", " ", (rec.get("title") or "").strip().lower())
    if title:
        return f"title:{title[:160]}"
    return None


def _merge_literature_records(existing, new_rec, provider):
    sources = set(existing.get("sources") or [])
    if existing.get("source"):
        for part in str(existing["source"]).split(","):
            part = part.strip()
            if part:
                sources.add(part)
    sources.add(provider)

    merged = dict(existing)
    merged["sources"] = sorted(sources)
    merged["source"] = ", ".join(merged["sources"])

    if not merged.get("url") and new_rec.get("url"):
        merged["url"] = new_rec["url"]
    if not merged.get("doi") and new_rec.get("doi"):
        merged["doi"] = new_rec["doi"]
    if not merged.get("abstract") and new_rec.get("abstract"):
        merged["abstract"] = new_rec["abstract"]
    if (new_rec.get("influentialCitationCount") or 0) > (merged.get("influentialCitationCount") or 0):
        merged["influentialCitationCount"] = new_rec.get("influentialCitationCount", 0)
    return merged


def _fetch_from_provider(provider, query, limit, year_from=None, year_to=None):
    fetcher = PROVIDER_FETCHERS[provider]
    try:
        results = fetcher(query, limit, year_from=year_from, year_to=year_to)
    except TypeError:
        results = fetcher(query, limit)
    return _filter_by_year_range(results or [], year_from, year_to)


def _search_literature(query, limit, year_from=None, year_to=None):
    """First provider with results (fast path for citation-gap recommendations)."""
    for provider in _configured_providers():
        print(f"Trying {provider} for query: {query[:80]}...")
        results = _fetch_from_provider(provider, query, limit, year_from, year_to)
        if results:
            print(f"  -> {len(results)} results from {provider}")
            return results, provider
        time.sleep(0.25)
    return [], None


def _search_literature_all(query, limit, year_from=None, year_to=None):
    """
    Query every configured literature API, merge results, and deduplicate by DOI/title.
    """
    providers = _configured_providers()
    if not providers:
        return [], [], []

    target = limit or 25
    per_provider = max(8, min(25, target * 2 // max(1, len(providers))))
    merged = {}
    providers_used = []
    providers_empty = []

    for provider in providers:
        print(f"Searching {provider} for: {query[:80]}...")
        try:
            results = _fetch_from_provider(provider, query, per_provider, year_from, year_to)
        except Exception as exc:
            print(f"  {provider} error: {exc}")
            providers_empty.append(provider)
            time.sleep(0.2)
            continue

        if not results:
            providers_empty.append(provider)
            time.sleep(0.2)
            continue

        providers_used.append(provider)
        print(f"  -> {len(results)} from {provider}")
        for rec in results:
            key = _dedupe_key(rec)
            if not key:
                continue
            entry = dict(rec)
            entry["source"] = provider
            entry["sources"] = [provider]
            if key in merged:
                merged[key] = _merge_literature_records(merged[key], entry, provider)
            else:
                merged[key] = entry
        time.sleep(0.2)

    return list(merged.values()), providers_used, providers_empty


def _build_query_for_sentence(sentence, intent, domain_hints=None, frequent_terms=None, context=None):
    query = generate_query(sentence, intent, context=context)
    client = get_openai_client()
    if not client:
        if domain_hints:
            query += " " + " ".join(f'"{h}"' if " " in h else h for h in domain_hints[:2])
        elif frequent_terms:
            query += " " + " ".join(frequent_terms[:2])
    return query


def _rank_recommendations(recommendations, sentence, intent, domain_hints=None, context=None):
    if not recommendations:
        return []

    sentence_clean = _sanitize_sentence(sentence)
    sentence_keywords = [w for w in _tokenize(sentence_clean) if w not in METHODOLOGY_HEAVY_TERMS][:8]
    hints = domain_hints or []

    model = get_semantic_model()
    
    if not model:
        # Fallback to pure heuristic if model fails to load
        print("Semantic model unavailable, falling back to heuristic scoring.")
        ranked = sorted(
            recommendations,
            key=lambda r: _recommendation_relevance_score(r, sentence_keywords, hints, sentence=sentence_clean),
            reverse=True
        )
        return ranked[:PAPER_RECOMMENDATIONS_TOP_K]

    try:
        from sentence_transformers import util
        
        # Prepare the query
        query_text = sentence_clean
        if context:
            # Add some context weight
            query_text = f"{context} {sentence_clean}"
            
        query_emb = model.encode(query_text, convert_to_tensor=True)
        
        # Prepare document texts (title + abstract)
        doc_texts = []
        for rec in recommendations:
            title = rec.get("title") or ""
            abstract = rec.get("abstract") or ""
            doc_texts.append(f"{title} {abstract}")
            
        doc_embs = model.encode(doc_texts, convert_to_tensor=True)
        
        # Compute cosine similarities
        cosine_scores = util.cos_sim(query_emb, doc_embs)[0].cpu().tolist()
        
        ranked_candidates = []
        for idx, rec in enumerate(recommendations):
            base_score = cosine_scores[idx] * 100 # Scale to 0-100
            
            # Boost highly influential papers slightly
            influence = rec.get("influentialCitationCount", 0) or 0
            influence_boost = min(influence, 100) * 0.05
            
            final_score = base_score + influence_boost
            
            rec_copy = rec.copy()
            rec_copy["matchScore"] = round(final_score, 2)
            ranked_candidates.append(rec_copy)
            
        ranked_candidates.sort(key=lambda x: x["matchScore"], reverse=True)
        return ranked_candidates[:PAPER_RECOMMENDATIONS_TOP_K]
        
    except Exception as e:
        print(f"Semantic ranking failed: {e}. Falling back to heuristic scoring.")
        ranked = sorted(
            recommendations,
            key=lambda r: _recommendation_relevance_score(r, sentence_keywords, hints, sentence=sentence_clean),
            reverse=True
        )
        return ranked[:PAPER_RECOMMENDATIONS_TOP_K]



def classify_sentence(sentence):
    from .pdf_engine import clean_for_ai, detect_gaps

    cleaned = _sanitize_sentence(sentence)
    obj = {"text": cleaned, "clean_text": clean_for_ai(cleaned)}
    results = detect_gaps([obj])
    if not results:
        return cleaned, "Background", 0.0
    row = results[0]
    return row.get("sentence", cleaned), row.get("intent", "Background"), float(row.get("score", 0.0))


def fetch_recommendations_for_sentence(sentence, intent=None, year_from=None, year_to=None, context=None):
    """
    Classify a single sentence (if needed), search literature APIs, return ranked papers.
    """
    sentence = _sanitize_sentence(sentence or "")
    if intent:
        classified_sentence, _, score = classify_sentence(sentence)
        sentence = classified_sentence or sentence
    else:
        sentence, intent, score = classify_sentence(sentence)

    domain_hints, frequent_terms = _collect_domain_hints([{"sentence": sentence}])
    query = _build_query_for_sentence(sentence, intent, domain_hints, frequent_terms, context=context)

    raw_results, provider = _search_literature(
        query, PAPER_SEARCH_LIMIT, year_from=year_from, year_to=year_to
    )
    recommendations = _rank_recommendations(
        raw_results, sentence, intent, domain_hints or frequent_terms, context=context
    )

    return {
        "sentence": sentence,
        "intent": intent,
        "score": score,
        "recommendations": recommendations,
        "provider": provider,
        "year_from": year_from,
        "year_to": year_to,
    }


def fetch_recommendations(gap_list, year_from=None, year_to=None):
    """
    Fetch paper recommendations for top citation gaps using configured literature APIs.
  OpenAlex is used first by default (no API key required).
    """
    enriched_gaps = []
    sorted_gaps = sorted(gap_list, key=lambda x: x.get("score", 0.0), reverse=True)
    top_gaps = sorted_gaps[:PAPER_GAPS_TOP_K]

    paper_domain_hints, paper_frequent_terms = _collect_domain_hints(gap_list)
    domain_for_score = paper_domain_hints or paper_frequent_terms

    sentence_to_idx = {gap_list[i].get("sentence", ""): i for i in range(len(gap_list))}

    for gap in top_gaps:
        sentence = gap.get("sentence", "")
        intent = gap.get("intent", "")

        context = None
        idx = sentence_to_idx.get(sentence)
        if idx is not None:
            surrounding = []
            for offset in range(-3, 4):
                curr_idx = idx + offset
                if 0 <= curr_idx < len(gap_list):
                    surrounding.append(gap_list[curr_idx].get("sentence", ""))
            context = " ".join(surrounding)

        query = _build_query_for_sentence(sentence, intent, paper_domain_hints, paper_frequent_terms, context=context)
        raw_results, _provider = _search_literature(
            query, PAPER_SEARCH_LIMIT, year_from=year_from, year_to=year_to
        )
        recommendations = _rank_recommendations(raw_results, sentence, intent, domain_for_score, context=context)

        enriched_gap = gap.copy()
        enriched_gap["recommendations"] = recommendations
        enriched_gaps.append(enriched_gap)

    return enriched_gaps


def search_papers(query, limit=None, year_from=None, year_to=None):
    """
    Global literature search: query all configured APIs, merge, dedupe, rank.
    Returns (results, providers_used, providers_queried).
    """
    query = _sanitize_sentence(query or "")
    if len(query) < 2:
        return [], [], _configured_providers()

    search_limit = limit or min(PAPER_SEARCH_LIMIT, 30)
    raw_results, providers_used, providers_empty = _search_literature_all(
        query, search_limit, year_from=year_from, year_to=year_to
    )
    if not raw_results:
        return [], providers_used, _configured_providers()

    keywords = [w for w in _tokenize(query) if w not in METHODOLOGY_HEAVY_TERMS][:10]
    scored = []
    for rec in raw_results:
        relevance = _recommendation_relevance_score(rec, keywords, [], sentence=query)
        if relevance < 0:
            continue
        match_score = min(99, max(55, int(60 + relevance * 4)))
        entry = dict(rec)
        entry["matchScore"] = match_score
        entry["matchLabel"] = "Relevance"
        scored.append(entry)

    scored.sort(
        key=lambda r: (
            r.get("matchScore", 0),
            r.get("influentialCitationCount", 0) or 0,
        ),
        reverse=True,
    )
    return scored[:search_limit], providers_used, _configured_providers()
