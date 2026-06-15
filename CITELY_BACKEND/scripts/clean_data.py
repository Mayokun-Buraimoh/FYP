import pandas as pd
import re
import os
from sklearn.model_selection import train_test_split

def clean_citations(text):
    if not isinstance(text, str):
        return ""
    
    # Replace numerical citations like [1], [1, 2], [1-3]
    text = re.sub(r'\[\s*\d+(?:\s*,\s*\d+)*\s*(?:-\s*\d+)?\s*\]', '[CITE]', text)
    
    # Replace author-year citations like (Smith, 2020), (Smith et al., 2020)
    # This is a basic heuristic for typical (Author, Year) or (Author et al., Year) formats
    text = re.sub(r'\([A-Za-z][A-Za-z\s\.\-&]+,\s*\d{4}[a-z]?\)', '[CITE]', text)
    
    return text

def main():
    input_file = 'dataset/acl_arc_combined (1).csv'
    output_dir = 'dataset/processed'
    
    print(f"Loading data from {input_file}...")
    # Assuming 'text' and 'label' or 'citation_intent' columns exist
    # Let's read the dataset and check its columns
    try:
        df = pd.read_csv(input_file)
        print(f"Dataset loaded with {len(df)} rows.")
        print(f"Columns: {df.columns.tolist()}")
    except Exception as e:
        print(f"Error loading {input_file}: {e}")
        return

    # Check which column contains text (usually 'text', 'sentence', or 'context')
    text_col = 'text'
    if 'text' not in df.columns:
        for col in ['sentence', 'context', 'paragraph']:
            if col in df.columns:
                text_col = col
                break
    
    # Check for label column
    label_col = 'label'
    if 'label' not in df.columns:
        for col in ['intent', 'citation_intent', 'class']:
            if col in df.columns:
                label_col = col
                break

    print(f"Using text column: '{text_col}', label column: '{label_col}'")
    
    # Apply cleaning
    print("Masking citations...")
    df['cleaned_text'] = df[text_col].apply(clean_citations)
    
    # Drop NAs if any string conversion failed
    df = df.dropna(subset=['cleaned_text', label_col])
    
    # Optional filtering to ensure text has [CITE] if we only want instances with citations
    # But for citation gap detection, we might also have negative examples (no citations).
    
    # Split into train and validation
    train_df, val_df = train_test_split(df, test_size=0.1, random_state=42, stratify=df[label_col] if df[label_col].dtype != 'object' or df[label_col].nunique() < 50 else None)
    
    os.makedirs(output_dir, exist_ok=True)
    
    train_path = os.path.join(output_dir, 'train.csv')
    val_path = os.path.join(output_dir, 'validation.csv')
    
    train_df.to_csv(train_path, index=False)
    val_df.to_csv(val_path, index=False)
    
    print(f"Saved {len(train_df)} train samples to {train_path}")
    print(f"Saved {len(val_df)} validation samples to {val_path}")
    
    # Show example
    sample = df[df[text_col] != df['cleaned_text']].head(1)
    if not sample.empty:
        print("\nExample masking:")
        print("Original:", sample.iloc[0][text_col])
        print("Masked:  ", sample.iloc[0]['cleaned_text'])

if __name__ == '__main__':
    main()
