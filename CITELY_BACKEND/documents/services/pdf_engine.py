import sys
import os
import re
import html as html_module
import fitz  # PyMuPDF
import nltk
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import json

# Ensure necessary NLTK data is available
try:
    nltk.data.find('tokenizers/punkt_tab/english/')
except LookupError:
    import ssl
    try:
        _create_unverified_https_context = ssl._create_unverified_context
    except AttributeError:
        pass
    else:
        ssl._create_default_https_context = _create_unverified_https_context
    nltk.download('punkt')
    nltk.download('punkt_tab')

# Standard abbreviations in scientific texts to prevent incorrect splits
ABBREVIATIONS = [
    'al.', 'fig.', 'eq.', 'eqs.', 'ref.', 'refs.', 'e.g.', 'i.e.', 'etc.', 'vs.', 
    'no.', 'vol.', 'ed.', 'eds.', 'cf.', 'pp.', 'pg.', 'p.', 'assoc.', 'biol.', 
    'chem.', 'dept.', 'dr.', 'eng.', 'inc.', 'inst.', 'jr.', 'natl.', 'univ.'
]

def configure_nltk_tokenizer():
    """Configure NLTK's Punkt tokenizer with custom abbreviations."""
    tokenizer = nltk.data.load('tokenizers/punkt/english.pickle')
    # Add custom scientific abbreviations
    for abbr in ABBREVIATIONS:
        # punkt expects abbreviations without the trailing period
        clean_abbr = abbr[:-1] if abbr.endswith('.') else abbr
        tokenizer._params.abbrev_types.add(clean_abbr)
    return tokenizer

NLTK_TOKENIZER = configure_nltk_tokenizer()

# We load the model lazily to avoid heavy initialization on app startup if not needed
_MODEL = None
_TOKENIZER = None
_LABEL_MAPPING = None
_DEVICE = None

def get_model():
    global _MODEL, _TOKENIZER, _LABEL_MAPPING, _DEVICE
    if _MODEL is None:
        model_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uniflow_brain")
        
        if not os.path.exists(model_dir):
            raise FileNotFoundError(f"Model directory not found at: {model_dir}")
        
        print(f"Loading SciBERT model from {model_dir}...", file=sys.stderr)
        _TOKENIZER = AutoTokenizer.from_pretrained(model_dir)
        _MODEL = AutoModelForSequenceClassification.from_pretrained(model_dir)

        # M4 Mac GPU
        _DEVICE = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
        print(f"Running model on: {_DEVICE}", file=sys.stderr)
        _MODEL.to(_DEVICE)
        _MODEL.eval()

        mapping_path = os.path.join(model_dir, "label_mapping.json")
        if os.path.exists(mapping_path):
            with open(mapping_path, "r") as f:
                _LABEL_MAPPING = json.load(f)
    
    return _MODEL, _TOKENIZER, _LABEL_MAPPING, _DEVICE

def clean_for_ai(text):
    """Clean the text for AI classification while keeping original for display."""
    if not text:
        return ""
    # Remove hyphenation at the end of lines
    text = re.sub(r'-\n\s*', '', text)
    # Replace newlines with spaces
    text = re.sub(r'\s*\n\s*', ' ', text)
    # Remove multiple spaces
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def extract_sentences(pdf_file_path_or_bytes):
    """
    Extracts sentences from a PDF file and identifies their coordinates.
    Handles cross-page sentences and preserves exact wording.
    """
    if isinstance(pdf_file_path_or_bytes, bytes):
        doc = fitz.open("pdf", pdf_file_path_or_bytes)
    else:
        doc = fitz.open(pdf_file_path_or_bytes)
    
    # Collect raw text and metadata from all pages
    full_text = ""
    page_data = []
    
    for page_idx, page in enumerate(doc):
        # We use a separator that is unlikely to appear in the text but 
        # doesn't break sentence tokenization. A simple newline is usually safest.
        page_text = page.get_text("text")
        start_offset = len(full_text)
        full_text += page_text
        end_offset = len(full_text)
        
        page_data.append({
            "idx": page_idx,
            "width": page.rect.width,
            "height": page.rect.height,
            "start": start_offset,
            "end": end_offset
        })
    
    # Tokenize the entire document text to preserve cross-page sentences
    # Note: NLTK's sent_tokenize handles multiple newlines better than a simple split
    sentences = NLTK_TOKENIZER.tokenize(full_text)
    
    sentence_metadata = []
    
    for s in sentences:
        s_raw = s.strip()
        if len(s_raw) <= 20: # Slightly higher threshold for scientific text
            continue
            
        # Clean for AI classification
        s_clean = clean_for_ai(s_raw)
        
        # Find which pages this sentence spans
        # We'll use the raw string to search on the pages
        # This ensures "exactly the wording" requirement
        
        combined_boxes = []
        primary_page = -1
        
        # A sentence can span multiple pages. We check all pages it might be on.
        # For simplicity in the first pass, we search for the string on each page.
        # PyMuPDF search_for handles line breaks/whitespace differences quite well.
        
        for p_info in page_data:
            page = doc[p_info["idx"]]
            
            # Use search_for with a slightly cleaned version that matches PDF search behavior
            # (PyMuPDF's search_for is case-insensitive by default and ignores extra spaces)
            rects = page.search_for(s_raw)
            if not rects:
                # If exact search fails (often due to hyphenation or weird spacing),
                # try searching for a significant chunk of the sentence
                search_text = s_clean[:50] if len(s_clean) > 50 else s_clean
                rects = page.search_for(search_text)
            
            if rects:
                if primary_page == -1:
                    primary_page = p_info["idx"] + 1
                
                boxes = [{"x1": r.x0, "y1": r.y0, "x2": r.x1, "y2": r.y1} for r in rects]
                # We only add boxes if they correspond to this page's width/height context
                # In this MVP, we'll just track the boxes and the first page they appeared on
                combined_boxes.extend(boxes)
        
        if primary_page != -1:
            p_idx = primary_page - 1
            sentence_metadata.append({
                "text": s_raw, # EXACT wording from PDF
                "clean_text": s_clean, # For AI processing
                "pageNumber": primary_page,
                "pageWidth": page_data[p_idx]["width"],
                "pageHeight": page_data[p_idx]["height"],
                "boundingBoxes": combined_boxes
            })
    
    doc.close()
    return sentence_metadata


def _span_is_bold(span):
    flags = span.get("flags", 0)
    if flags & 16:
        return True
    font = (span.get("font") or "").lower()
    return "bold" in font or "black" in font or "heavy" in font


def _line_inner_html(spans, body_size):
    inner = []
    for span in spans:
        text = span.get("text", "")
        if not text:
            continue
        escaped = html_module.escape(text)
        if _span_is_bold(span) or (body_size and span.get("size", 12) > body_size * 1.08):
            escaped = f"<strong>{escaped}</strong>"
        inner.append(escaped)
    return "".join(inner)


def _ends_paragraph_text(inner_html):
    plain = re.sub(r"<[^>]+>", "", inner_html or "").strip()
    if not plain:
        return True
    return bool(re.search(r'[.!?:]["\')\]]*\s*$', plain))


def _join_line_inner(prev_html, next_html):
    prev = (prev_html or "").rstrip()
    nxt = (next_html or "").lstrip()
    if not prev:
        return nxt
    if not nxt:
        return prev
    prev_plain = re.sub(r"<[^>]+>", "", prev).rstrip()
    if prev_plain.endswith("-") and not prev_plain.endswith("--"):
        return prev + nxt
    if nxt and nxt[0].islower():
        return f"{prev} {nxt}"
    if prev_plain and not re.search(r'[.!?:]["\')\]]*\s*$', prev_plain):
        return f"{prev} {nxt}"
    return f"{prev} {nxt}"


def extract_manuscript_html(pdf_file_path_or_bytes):
    """
    Build HTML from PDF structure, merging wrapped lines into paragraphs
    so export matches the uploaded document layout (not one line per <p>).
    """
    if isinstance(pdf_file_path_or_bytes, bytes):
        doc = fitz.open(stream=pdf_file_path_or_bytes, filetype="pdf")
    else:
        doc = fitz.open(pdf_file_path_or_bytes)

    page_lines = []
    for page_idx, page in enumerate(doc):
        blocks = page.get_text("dict").get("blocks", [])
        sizes = []
        for block in blocks:
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    if span.get("text", "").strip():
                        sizes.append(span.get("size", 12))
        body_size = sorted(sizes)[len(sizes) // 2] if sizes else 12.0
        page_left = min(
            (
                span["bbox"][0]
                for block in blocks
                if block.get("type") == 0
                for line in block.get("lines", [])
                for span in line.get("spans", [])
                if span.get("text", "").strip()
            ),
            default=50.0,
        )

        lines_on_page = []
        for block in blocks:
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                if not spans:
                    continue
                inner = _line_inner_html(spans, body_size)
                if not inner.strip():
                    continue

                bbox = line.get("bbox") or spans[0].get("bbox") or [0, 0, 0, 12]
                line_x0 = min(s["bbox"][0] for s in spans)
                indent_px = max(0, int(line_x0 - page_left))
                max_size = max((s.get("size", 12) for s in spans), default=12)
                tag = "h3" if max_size > body_size * 1.2 else "p"

                lines_on_page.append(
                    {
                        "page": page_idx,
                        "y0": bbox[1],
                        "y1": bbox[3],
                        "indent": indent_px,
                        "tag": tag,
                        "inner": inner,
                    }
                )

        lines_on_page.sort(key=lambda row: (row["y0"], row["indent"]))
        page_lines.append(lines_on_page)

    doc.close()

    parts = []
    for page_idx, lines_on_page in enumerate(page_lines):
        if page_idx > 0:
            parts.append('<div data-page-break="1"></div>')

        current = None
        for line in lines_on_page:
            if current is None:
                current = line.copy()
                continue

            gap = line["y0"] - current["y1"]
            line_height = max(current["y1"] - current["y0"], 8.0)
            same_page = line["page"] == current["page"]
            same_tag = current["tag"] == line["tag"] == "p"
            similar_indent = abs(line["indent"] - current["indent"]) <= 18
            can_merge = (
                same_page
                and same_tag
                and similar_indent
                and gap < line_height * 2.0
                and gap > -4
                and not _ends_paragraph_text(current["inner"])
            )

            if can_merge:
                current["inner"] = _join_line_inner(current["inner"], line["inner"])
                current["y1"] = line["y1"]
            else:
                margin_style = ""
                if current["indent"] > 14:
                    margin_style = f' style="margin-left: {min(current["indent"], 220)}px"'
                parts.append(f"<{current['tag']}{margin_style}>{current['inner']}</{current['tag']}>")
                current = line.copy()

        if current:
            margin_style = ""
            if current["indent"] > 14:
                margin_style = f' style="margin-left: {min(current["indent"], 220)}px"'
            parts.append(f"<{current['tag']}{margin_style}>{current['inner']}</{current['tag']}>")

    return "\n".join(parts)


def detect_gaps(sentence_objects):
    """
    Detect citation gaps in a list of sentence objects.
    """
    model, tokenizer, label_mapping, device = get_model()
    
    results = []
    # Use clean_text for AI if available, otherwise fallback to text
    sentences_for_ai = [obj.get("clean_text", obj["text"]) for obj in sentence_objects]
    
    # Process in batches to avoid OOM
    batch_size = 64
    for i in range(0, len(sentences_for_ai), batch_size):
        batch_sentences = sentences_for_ai[i:i + batch_size]
        batch_objects = sentence_objects[i:i + batch_size]
        
        inputs = tokenizer(batch_sentences, return_tensors="pt", padding=True, truncation=True, max_length=128)
        inputs = {k: v.to(device) for k, v in inputs.items()}
        
        with torch.no_grad():
            outputs = model(**inputs)
            logits = outputs.logits
            probs = torch.nn.functional.softmax(logits, dim=-1)
            
            top_probs, top_classes = torch.max(probs, dim=-1)
            
            top_probs = top_probs.cpu().numpy()
            top_classes = top_classes.cpu().numpy()
            
            for j, (pred_class, score) in enumerate(zip(top_classes, top_probs)):
                intent = label_mapping[str(pred_class)] if label_mapping else str(pred_class)
                
                # Merge AI results with position metadata
                obj = batch_objects[j].copy()
                obj.update({
                    "sentence": obj.pop("text"),
                    "intent": intent,
                    "score": float(score)
                })
                results.append(obj)
                
    return results


def extract_manuscript_from_blocks(pdf_file_path_or_bytes):
    """
    Fallback method to extract manuscript content as continuous blocks (paragraphs)
    instead of single sentences, preventing the scattered list effect.
    """
    if isinstance(pdf_file_path_or_bytes, bytes):
        doc = fitz.open(stream=pdf_file_path_or_bytes, filetype="pdf")
    else:
        doc = fitz.open(pdf_file_path_or_bytes)

    paragraphs = []
    
    for page in doc:
        # get_text("blocks") returns tuples: (x0, y0, x1, y1, "text", block_no, block_type)
        # PyMuPDF naturally returns blocks in reading order (e.g. down column A, then down column B).
        blocks = page.get_text("blocks")
        
        for block in blocks:
            # block_type == 0 means text
            if block[6] == 0:
                text = block[4].strip()
                # Skip tiny artifacts (like single numbers, very short headers)
                if len(text) < 15 and not any(c.isalpha() for c in text):
                    continue
                
                # Clean up hyphenation and unnecessary line breaks inside the block
                # but keep the paragraph intact.
                text = re.sub(r'-\n\s*', '', text)
                text = re.sub(r'\s*\n\s*', ' ', text)
                text = re.sub(r'\s+', ' ', text).strip()
                
                if text:
                    paragraphs.append(text)
                    
    doc.close()
    
    if not paragraphs:
        return ""
        
    return "\n\n".join(paragraphs)

