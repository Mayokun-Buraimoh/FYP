from documents.services.pdf_engine import detect_gaps
import time

dummy_sentences = [
    {"text": "Artificial intelligence is a branch of computer science."},
    {"text": "We used a standard ResNet-50 architecture for our experiments."},
    {"text": "The results show a 10% improvement over previous methods."}
]

print("Starting detect_gaps test...")
start = time.time()
try:
    results = detect_gaps(dummy_sentences)
    end = time.time()
    print(f"Success! Processed {len(results)} sentences in {end - start:.2f}s")
    for r in results:
        print(f"Text: {r['sentence'][:30]}... | Intent: {r['intent']} | Score: {r['score']:.4f}")
except Exception as e:
    print(f"Error in detect_gaps: {e}")
    import traceback
    traceback.print_exc()
