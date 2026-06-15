import os
import torch
import pandas as pd
from datasets import Dataset
from transformers import (
    AutoTokenizer, 
    AutoModelForSequenceClassification, 
    TrainingArguments, 
    Trainer
)
from sklearn.metrics import accuracy_score, precision_recall_fscore_support
from sklearn.preprocessing import LabelEncoder

def compute_metrics(pred):
    labels = pred.label_ids
    preds = pred.predictions.argmax(-1)
    precision, recall, f1, _ = precision_recall_fscore_support(labels, preds, average='weighted', zero_division=0)
    acc = accuracy_score(labels, preds)
    return {
        'accuracy': acc,
        'f1': f1,
        'precision': precision,
        'recall': recall
    }

def main():
    model_name = "allenai/scibert_scivocab_uncased"
    train_path = "dataset/processed/train.csv"
    val_path = "dataset/processed/validation.csv"
    output_dir = "uniflow_brain"

    print("Loading datasets...")
    train_df = pd.read_csv(train_path)
    val_df = pd.read_csv(val_path)

    # Determine text and label columns dynamically based on clean_data.py
    text_col = 'cleaned_text'
    # The label column could be 'intent'
    label_col = 'intent' if 'intent' in train_df.columns else 'label'
    
    # Let's check for column again to be safe
    if label_col not in train_df.columns:
        for col in ['citation_intent', 'class', 'intent']:
            if col in train_df.columns:
                label_col = col
                break

    print(f"Using label column: '{label_col}'")
    
    # Handle missing values
    train_df = train_df.dropna(subset=[text_col, label_col])
    val_df = val_df.dropna(subset=[text_col, label_col])
    
    # Since we might be doing a simple classification, we need to encode labels to integers
    le = LabelEncoder()
    train_df['label_id'] = le.fit_transform(train_df[label_col].astype(str))
    val_df['label_id'] = le.transform(val_df[label_col].astype(str))
    
    num_labels = len(le.classes_)
    print(f"Found {num_labels} classes: {le.classes_}")

    # For debugging/speed, let's take a subset if dataset is huge, but we will train on all.
    # We will sample if it's too big to run quickly, but for fine-tuning, let's just proceed.

    train_dataset = Dataset.from_pandas(train_df[[text_col, 'label_id']])
    val_dataset = Dataset.from_pandas(val_df[[text_col, 'label_id']])

    print("Initializing tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(model_name)

    def tokenize_function(examples):
        return tokenizer(examples[text_col], padding="max_length", truncation=True, max_length=128)

    print("Tokenizing datasets...")
    tokenized_train = train_dataset.map(tokenize_function, batched=True)
    tokenized_val = val_dataset.map(tokenize_function, batched=True)

    # Rename label_id to labels for HF Trainer
    tokenized_train = tokenized_train.rename_column("label_id", "labels")
    tokenized_val = tokenized_val.rename_column("label_id", "labels")

    # Remove string columns to avoid tensor conversion errors
    cols_to_remove = [text_col]
    if '__index_level_0__' in tokenized_train.column_names:
        cols_to_remove.append('__index_level_0__')
    
    tokenized_train = tokenized_train.remove_columns(cols_to_remove)
    tokenized_val = tokenized_val.remove_columns(cols_to_remove)
    
    tokenized_train.set_format("torch")
    tokenized_val.set_format("torch")

    print(f"Initializing model '{model_name}' with {num_labels} labels...")
    model = AutoModelForSequenceClassification.from_pretrained(model_name, num_labels=num_labels)

    # MANDATORY: Set use_mps_device=True for M4 GPU
    training_args = TrainingArguments(
        output_dir="./results",
        eval_strategy="epoch",
        save_strategy="epoch",
        num_train_epochs=3,
        per_device_train_batch_size=16,
        per_device_eval_batch_size=16,
        logging_dir='./logs',
        logging_steps=50,
        load_best_model_at_end=True,
        fp16=False, # MPS doesn't support fp16 well sometimes, keep default or use bf16 if supported
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_train,
        eval_dataset=tokenized_val,
        compute_metrics=compute_metrics,
    )

    print("Starting training...")
    trainer.train()

    print(f"Saving model to {output_dir}...")
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)
    
    # Save the label mapping as well
    label_mapping = {str(i): str(c) for i, c in enumerate(le.classes_)}
    import json
    with open(os.path.join(output_dir, "label_mapping.json"), "w") as f:
        json.dump(label_mapping, f)

    print("Training complete and model saved.")

if __name__ == "__main__":
    main()
