import os
import json
from documents.services.api_client import fetch_recommendations

def run_test():
    # Mock SciBERT output
    mock_gaps = [
        {
            "sentence": "In recent years, deep learning has revolutionized natural language processing tasks such as translation and summarization.",
            "intent": "Background",
            "score": 0.9443
        },
        {
            "sentence": "We propose a novel method for fine-tuning language models on scientific text.",
            "intent": "Uses",
            "score": 0.8541
        },
        {
            "sentence": "As demonstrated by previous work, this approach yields significant improvements over baseline models.",
            "intent": "Motivation",
            "score": 0.3444
        }
    ]
    
    # Check for API Key
    api_key = os.environ.get("SEMANTIC_SCHOLAR_API_KEY")
    if api_key:
        print(f"✅ Found SEMANTIC_SCHOLAR_API_KEY (Starting with {api_key[:4]}...)")
    else:
        print("⚠️ No SEMANTIC_SCHOLAR_API_KEY found in environment. Falling back to unauthenticated requests.")
        
    print("\nProcessing Gaps...\n")
    
    enriched_gaps = fetch_recommendations(mock_gaps)
    
    print("--- RAW JSON RESPONSE ---")
    print(json.dumps(enriched_gaps, indent=2))
    print("-------------------------")

if __name__ == "__main__":
    # Simulate Django settings minimal context block for standalone
    import django
    import sys
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend_prj.settings")
    django.setup()
    
    run_test()
