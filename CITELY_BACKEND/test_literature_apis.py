"""Quick check that literature APIs in .env are reachable."""
import os
from dotenv import load_dotenv

load_dotenv(".env")

from documents.services.api_client import (
    _fetch_arxiv,
    _fetch_core,
    _fetch_crossref,
    _fetch_europe_pmc,
    _fetch_openalex,
    _fetch_semantic_scholar,
)

QUERY = "machine learning citation recommendation"


def check(name, fn):
    results = fn(QUERY, 3)
    status = "OK" if results else "no results"
    print(f"{name}: {status} ({len(results)} items)")
    if results:
        print(f"  sample: {results[0].get('title', '')[:60]}...")


if __name__ == "__main__":
    print(f"Contact email: {os.environ.get('OPENALEX_CONTACT_EMAIL')}")
    print(f"Providers: {os.environ.get('PAPER_SEARCH_PROVIDERS')}\n")
    check("OpenAlex", _fetch_openalex)
    check("Crossref", _fetch_crossref)
    check("Semantic Scholar", _fetch_semantic_scholar)
    check("CORE", _fetch_core)
    check("Europe PMC", _fetch_europe_pmc)
    check("arXiv", _fetch_arxiv)
