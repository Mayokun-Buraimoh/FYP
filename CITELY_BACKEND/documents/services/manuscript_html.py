"""
Normalize manuscript HTML: merge PDF line fragments into paragraphs and tidy editor markup.
"""

import re
from html import escape

from bs4 import BeautifulSoup, NavigableString, Tag

_BLOCK_TAGS = frozenset({"p", "h1", "h2", "h3", "h4", "h5", "h6", "div"})
_TERMINAL_PUNCT = re.compile(r'[.!?:]["\')\]]*\s*$')
_HYPHEN_BREAK = re.compile(r'-\s*$')


def _plain_text(html_fragment: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html_fragment or "")).strip()


def _inner_html(tag: Tag) -> str:
    return "".join(str(c) for c in tag.contents)


def _ends_paragraph(inner_html: str) -> bool:
    plain = _plain_text(inner_html)
    if not plain:
        return True
    return bool(_TERMINAL_PUNCT.search(plain))


def _join_line_html(prev_html: str, next_html: str) -> str:
    prev = prev_html.rstrip()
    next_part = next_html.lstrip()
    if not prev:
        return next_part
    if not next_part:
        return prev
    if _HYPHEN_BREAK.search(_plain_text(prev)):
        return prev.rstrip() + next_part.lstrip()
    prev_plain = _plain_text(prev)
    next_plain = _plain_text(next_part)
    if prev_plain and next_plain and next_plain[0].islower():
        return f"{prev} {next_part}"
    if prev_plain and not _TERMINAL_PUNCT.search(prev_plain):
        return f"{prev} {next_part}"
    return f"{prev} {next_part}"


def _style_attr(tag: Tag) -> str:
    return (tag.get("style") or "").strip()


def _should_merge_paragraphs(prev_style: str, prev_inner: str, next_name: str, next_style: str) -> bool:
    if next_name != "p" or not prev_inner:
        return False
    if prev_style != next_style:
        return False
    if _ends_paragraph(prev_inner):
        return False
    return True


def normalize_manuscript_html(html_content: str) -> str:
    """
    Merge consecutive <p> lines (same indent) into single paragraphs.
    Converts bare <div> blocks from contentEditable into <p> where appropriate.
    """
    if not (html_content or "").strip():
        return html_content or ""

    soup = BeautifulSoup(f"<div id='manuscript-root'>{html_content}</div>", "html.parser")
    root = soup.find(id="manuscript-root")
    if not root:
        return html_content

    output = []

    def flush_paragraph(acc_tag: str, acc_style: str, acc_inner: str):
        if not acc_inner.strip():
            return
        style_attr = f' style="{acc_style}"' if acc_style else ""
        output.append(f"<{acc_tag}{style_attr}>{acc_inner}</{acc_tag}>")

    acc_tag = None
    acc_style = None
    acc_inner = ""

    def emit_page_break():
        nonlocal acc_tag, acc_style, acc_inner
        if acc_inner:
            flush_paragraph(acc_tag or "p", acc_style or "", acc_inner)
            acc_tag, acc_style, acc_inner = None, None, ""
        output.append('<div data-page-break="1"></div>')

    for child in list(root.children):
        if isinstance(child, NavigableString):
            if str(child).strip():
                if acc_inner:
                    acc_inner = _join_line_html(acc_inner, escape(str(child).strip()))
                else:
                    acc_tag, acc_style, acc_inner = "p", "", escape(str(child).strip())
            continue

        if not isinstance(child, Tag):
            continue

        name = (child.name or "").lower()
        if child.get("data-page-break"):
            emit_page_break()
            continue

        if name not in _BLOCK_TAGS:
            continue

        if name == "div":
            if child.find(_BLOCK_TAGS):
                for nested in child.find_all(["p", "h1", "h2", "h3", "h4", "h5", "h6"], recursive=False):
                    name = nested.name.lower()
                    style = _style_attr(nested)
                    inner = _inner_html(nested)
                    if acc_inner and _should_merge_paragraphs(
                        acc_style or "", acc_inner, name, style
                    ):
                        acc_inner = _join_line_html(acc_inner, inner)
                    else:
                        if acc_inner:
                            flush_paragraph(acc_tag or "p", acc_style or "", acc_inner)
                        acc_tag, acc_style, acc_inner = name, style, inner
                continue
            inner = _inner_html(child)
            if not inner.strip():
                continue
            name = "p"

        style = _style_attr(child)
        inner = _inner_html(child)

        if not inner.strip():
            continue

        if acc_inner and acc_tag == "p" and _should_merge_paragraphs(
            acc_style or "", acc_inner, name, style
        ):
            acc_inner = _join_line_html(acc_inner, inner)
            continue

        if acc_inner:
            flush_paragraph(acc_tag or "p", acc_style or "", acc_inner)

        acc_tag, acc_style, acc_inner = name, style, inner

    if acc_inner:
        flush_paragraph(acc_tag or "p", acc_style or "", acc_inner)

    return "\n".join(output)
