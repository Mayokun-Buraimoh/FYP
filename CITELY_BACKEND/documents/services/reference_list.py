"""
Build an alphabetically sorted reference list from manuscript + inserted citations.
"""

import re

from bs4 import BeautifulSoup

_STOP_SECTION_HEADINGS = re.compile(
    r"^(acknowledg(e)?ments?|appendix|declaration|certification|abstract|table of contents)$",
    re.I,
)


def _author_sort_key(csl_item):
    authors = csl_item.get("author") or []
    if authors and isinstance(authors[0], dict):
        family = (authors[0].get("family") or "").strip().lower()
        if family:
            return family
    return (csl_item.get("title") or "").strip().lower()


def _reference_line_sort_key(line):
    trimmed = re.sub(r"^\d+[\.)]\s*", "", (line or "").strip())
    match = re.match(r"^([^(.]+?)(?:\s+et\s+al\.?)?\s*\((\d{4}|n\.d\.)", trimmed, re.I)
    if match:
        return match.group(1).split(",")[0].strip().lower()
    first = re.split(r"[,(\s]", trimmed)[0].strip()
    return (first or trimmed).lower()


def _normalize_reference_key(line):
    sort_key = _reference_line_sort_key(line)
    year_match = re.search(r"\((\d{4}|n\.d\.)", line, re.I)
    year = (year_match.group(1).lower() if year_match else "")
    compact = re.sub(r"https?://\S+", "", line.lower())
    compact = re.sub(r"[^a-z0-9]", "", compact)
    return f"{sort_key}|{year}|{compact[:80]}"


def _split_reference_paragraph(text):
    text = (text or "").strip()
    if len(text) < 12:
        return []

    parts = re.split(r"(?=\s*\d+[\.)]\s+)", text)
    parts = [p.strip() for p in parts if len(p.strip()) >= 12]
    if len(parts) > 1:
        return [re.sub(r"^\d+[\.)]\s*", "", p).strip() for p in parts]

    return [re.sub(r"^\d+[\.)]\s*", "", text).strip()]


def extract_manuscript_references(html):
    """
    Return reference lines found under a REFERENCES heading in manuscript HTML.
    """
    if not (html or "").strip():
        return []

    soup = BeautifulSoup(f"<div id='ms-root'>{html}</div>", "html.parser")
    root = soup.find(id="ms-root")
    if not root:
        return []

    elements = [el for el in root.children if getattr(el, "name", None)]
    ref_idx = -1
    for i, el in enumerate(elements):
        text = el.get_text(" ", strip=True)
        if re.match(r"^references$", text, re.I):
            ref_idx = i
            break

    if ref_idx == -1:
        return []

    references = []
    for el in elements[ref_idx + 1 :]:
        text = el.get_text(" ", strip=True)
        if not text:
            continue
        if _STOP_SECTION_HEADINGS.match(text):
            break
        if re.match(r"^references$", text, re.I) and references:
            break
        references.extend(_split_reference_paragraph(text))

    return [r for r in references if r]


def strip_references_section_from_html(html):
    """Remove in-body REFERENCES section so export can append one merged list."""
    if not (html or "").strip():
        return html

    soup = BeautifulSoup(f"<div id='ms-root'>{html}</div>", "html.parser")
    root = soup.find(id="ms-root")
    if not root:
        return html

    elements = [el for el in root.children if getattr(el, "name", None)]
    ref_idx = -1
    for i, el in enumerate(elements):
        text = el.get_text(" ", strip=True)
        if re.match(r"^references$", text, re.I):
            ref_idx = i
            break

    if ref_idx == -1:
        return html

    after_idx = len(elements)
    for i in range(ref_idx + 1, len(elements)):
        text = elements[i].get_text(" ", strip=True)
        if text and _STOP_SECTION_HEADINGS.match(text):
            after_idx = i
            break

    kept = elements[:ref_idx] + elements[after_idx:]
    return "".join(str(el) for el in kept)


def merge_reference_lists(existing_lines, system_lines):
    """Merge manuscript + system references; prefer system formatting on duplicates."""
    by_key = {}

    for line in existing_lines or []:
        trimmed = (line or "").strip()
        if len(trimmed) < 10:
            continue
        key = _normalize_reference_key(trimmed)
        if key not in by_key:
            by_key[key] = (0, trimmed)

    for line in system_lines or []:
        trimmed = (line or "").strip()
        if len(trimmed) < 10:
            continue
        key = _normalize_reference_key(trimmed)
        by_key[key] = (1, trimmed)

    rows = sorted(by_key.values(), key=lambda row: _reference_line_sort_key(row[1]))
    return [line for _, line in rows]


def _item_dedupe_key(csl_item, inserted_id):
    if not isinstance(csl_item, dict):
        return f"inserted-{inserted_id}"
    return (
        csl_item.get("id")
        or (f"doi:{csl_item['DOI']}" if csl_item.get("DOI") else None)
        or f"inserted-{inserted_id}"
    )


def _format_reference_line(csl_item):
    if not isinstance(csl_item, dict):
        return ""

    authors = csl_item.get("author") or []
    if authors and isinstance(authors[0], dict):
        names = []
        for a in authors[:6]:
            if not isinstance(a, dict):
                continue
            family = a.get("family") or ""
            given = a.get("given") or ""
            part = f"{family}, {given[0]}." if given and family else family or given
            if part.strip():
                names.append(part.strip())
        author_str = ", ".join(names) if names else "Unknown"
    else:
        author_str = "Unknown"

    year = "n.d."
    issued = csl_item.get("issued") or {}
    parts = issued.get("date-parts") if isinstance(issued, dict) else None
    if parts and parts[0] and parts[0][0]:
        year = str(parts[0][0])

    title = (csl_item.get("title") or "Untitled").strip()
    doi = csl_item.get("DOI")
    if doi:
        return f"{author_str} ({year}). {title}. https://doi.org/{doi}"
    return f"{author_str} ({year}). {title}."


def build_reference_list_from_inserted(inserted_citations):
    """
    Return unique reference strings sorted alphabetically by first author surname.
    """
    seen = set()
    rows = []

    for ic in inserted_citations:
        csl_item = ic.csl_item if isinstance(ic.csl_item, dict) else {}
        key = _item_dedupe_key(csl_item, ic.id)
        if key in seen:
            continue
        seen.add(key)
        line = _format_reference_line(csl_item)
        if line:
            rows.append((_author_sort_key(csl_item), line))

    rows.sort(key=lambda row: row[0])
    return [line for _, line in rows]


def _manuscript_html_from_content(manuscript_content):
    if not manuscript_content:
        return ""
    if not isinstance(manuscript_content, list):
        return ""

    html_parts = []
    for block in manuscript_content:
        if not isinstance(block, dict):
            continue
        html = (block.get("html") or "").strip()
        if html:
            html_parts.append(html)
    return "\n".join(html_parts)


def build_merged_reference_list(inserted_citations, manuscript_content=None):
    """
    Merge REFERENCES from manuscript HTML with inserted citation entries, sorted A–Z.
    """
    system_lines = build_reference_list_from_inserted(inserted_citations)
    html = _manuscript_html_from_content(manuscript_content)
    existing_lines = extract_manuscript_references(html)
    return merge_reference_lists(existing_lines, system_lines)
