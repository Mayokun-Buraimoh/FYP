import os
import django
from django.test import Client
import json

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend_prj.settings')
django.setup()

def create_dummy_pdf():
    # We will just write a fake PDF with PyMuPDF to test extraction
    import fitz
    doc = fitz.open()
    page = doc.new_page()
    
    text = (
        "In recent years, deep learning has revolutionized natural language processing tasks such as translation and summarization. "
        "We propose a novel method for fine-tuning language models on scientific text. "
        "As demonstrated by previous work (Smith et al., 2020), this approach yields significant improvements over baseline models. "
        "See Fig. 1 for details on the architecture."
    )
    
    page.insert_text(fitz.Point(50, 50), text, fontsize=11)
    
    pdf_path = "test_dummy.pdf"
    doc.save(pdf_path)
    doc.close()
    return pdf_path

def main():
    print("Creating dummy PDF...")
    pdf_path = create_dummy_pdf()
    
    print("Initializing Django test client...")
    client = Client()
    
    print("Sending POST request to /api/documents/process-pdf/...")
    
    with open(pdf_path, 'rb') as pdf_file:
        response = client.post(
            '/api/documents/process-pdf/', 
            {'pdf_file': pdf_file}, 
            format='multipart'
        )
    
    print(f"Response Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print("\n--- Processing Results ---")
        print(f"Total Sentences Extracted: {data.get('total_sentences_extracted')}")
        print("\nExtracted Gaps/Intents:")
        for res in data.get('results', []):
            print(f"- Sentence: {res['sentence']}")
            print(f"  Intent:   {res['intent']} (Score: {res['score']:.4f})")
            
            recs = res.get('recommendations', [])
            if recs:
                print("  Recommendations:")
                for i, r in enumerate(recs[:2], 1): # show up to 2
                    print(f"    {i}. {r.get('title')} ({r.get('year')})")
                    print(f"       Authors: {r.get('authors')}")
                    print(f"       URL: {r.get('openAccessPdf', {}).get('url') if r.get('openAccessPdf') else 'N/A'}")
            else:
                print("  Recommendations: None (Rate limited or no results)")
            print("\n")
    else:
        print(f"Error: {response.content}")
        
    # Cleanup
    if os.path.exists(pdf_path):
        os.remove(pdf_path)

if __name__ == '__main__':
    main()
