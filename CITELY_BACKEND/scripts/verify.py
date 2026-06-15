import os
import json
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

def main():
    model_dir = "uniflow_brain"
    
    print(f"Loading model and tokenizer from {model_dir}...")
    tokenizer = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(model_dir)
    
    # Load label mapping
    mapping_path = os.path.join(model_dir, "label_mapping.json")
    if os.path.exists(mapping_path):
        with open(mapping_path, "r") as f:
            label_mapping = json.load(f)
    else:
        label_mapping = None

    model.eval()
    
    # M4 GPU (MPS) support if available, otherwise CPU
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"Using device: {device}")
    model.to(device)

    # Sample sentences to test
    sample_texts = [
        "In recent years, deep learning has revolutionized natural language processing tasks such as translation and summarization [CITE].",
        "We propose a novel method for fine-tuning language models on scientific text.",
        "As demonstrated by previous work (Smith et al., 2020), this approach yields significant improvements over baseline models [CITE]."
    ]

    print("\n--- Running Inference ---")
    for text in sample_texts:
        inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=128)
        inputs = {k: v.to(device) for k, v in inputs.items()}
        
        with torch.no_grad():
            outputs = model(**inputs)
            logits = outputs.logits
            predicted_class_id = logits.argmax(-1).item()
            
            # Map index to actual label string if mapping exists
            predicted_label = label_mapping[str(predicted_class_id)] if label_mapping else str(predicted_class_id)
            
            print(f"\nText: {text}")
            print(f"Predicted intent/label: {predicted_label}")

if __name__ == "__main__":
    main()
