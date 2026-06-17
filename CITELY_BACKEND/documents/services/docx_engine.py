import io
import mammoth
from .pdf_engine import NLTK_TOKENIZER, clean_for_ai

def extract_docx_sentences(file_bytes):
    """
    Extracts sentences from a DOCX file and identifies their 'mock' coordinates
    so they can be passed seamlessly to SciBERT which expects PyMuPDF-style metadata.
    """
    with io.BytesIO(file_bytes) as docx_file:
        result = mammoth.extract_raw_text(docx_file)
        full_text = result.value
        
    sentences = NLTK_TOKENIZER.tokenize(full_text)
    
    sentence_metadata = []
    
    for s in sentences:
        s_raw = s.strip()
        if len(s_raw) <= 20: 
            continue
            
        s_clean = clean_for_ai(s_raw)
        
        sentence_metadata.append({
            "text": s_raw, 
            "clean_text": s_clean, 
            "pageNumber": 1,  # DOCX is pageless
            "pageWidth": 612.0,
            "pageHeight": 792.0,
            "boundingBoxes": []  # No bounding boxes in DOCX
        })
        
        # Limit to first 300 sentences to prevent SciBERT CPU inference from hanging 
        # on massive documents (which is normally masked by PyMuPDF's bounding box filtering)
        if len(sentence_metadata) >= 300:
            break
            
    return sentence_metadata

def extract_manuscript_html_from_docx(file_bytes):
    """
    Build HTML from DOCX structure using Mammoth.
    Returns clean, semantic HTML that works perfectly in rich text editors.
    """
    with io.BytesIO(file_bytes) as docx_file:
        result = mammoth.convert_to_html(docx_file)
        html = result.value
        return html
