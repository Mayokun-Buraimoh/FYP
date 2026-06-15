import fitz
import os
import sys

# Add current dir to path for imports
sys.path.append(os.getcwd())
from documents.services.pdf_engine import extract_sentences

def create_multipage_pdf():
    doc = fitz.open()
    
    # Page 1: Sentence starts
    page1 = doc.new_page()
    text1 = "This is a long sentence that starts on the first page and "
    page1.insert_text(fitz.Point(72, 72), text1)
    
    # Page 2: Sentence ends
    page2 = doc.new_page()
    text2 = "continues onto the second page to test cross-page extraction accuracy."
    page2.insert_text(fitz.Point(72, 72), text2)
    
    # Page 3: Sentence with hyphenation and newlines
    page3 = doc.new_page()
    text3 = "Scientific writing often uses hyphen-\nation at the end of lines to main-\ntain alignment."
    page3.insert_text(fitz.Point(72, 72), text3)
    
    pdf_path = "verification_test.pdf"
    doc.save(pdf_path)
    doc.close()
    return pdf_path

def main():
    pdf_path = create_multipage_pdf()
    print(f"Created {pdf_path}")
    
    results = extract_sentences(pdf_path)
    print(f"Extracted {len(results)} sentences.")
    
    for i, res in enumerate(results):
        print(f"\n--- Sentence {i+1} ---")
        print(f"Original Text: {res['text']}")
        print(f"Cleaned Text:  {res['clean_text']}")
        print(f"Page Number:   {res['pageNumber']}")
        print(f"Boxes Count:   {len(res['boundingBoxes'])}")
        
    # Cleanup
    if os.path.exists(pdf_path):
        os.remove(pdf_path)

if __name__ == "__main__":
    main()
