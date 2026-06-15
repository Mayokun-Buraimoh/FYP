# Integrating OpenAI with the Custom SciBERT Model

This document outlines the architectural integration between the custom-trained machine learning model and the cloud-based OpenAI LLM within the project. 

The architecture operates as a **Hybrid AI Pipeline** that utilizes both a domain-specific local model and a cloud-based general LLM to accurately identify citation gaps and recommend relevant literature.

## Architecture Overview

### 1. Phase One: Gap Detection (Previous Work)
When a user uploads a PDF, the document is parsed into individual sentences using `PyMuPDF` and `nltk`. This is where the custom-trained **SciBERT model** (`uniflow_brain`) operates. 
* **The Role:** The SciBERT model acts as the *Intent Classifier*. It analyzes every sentence locally using PyTorch and determines **if** a citation is missing, and **what kind** of citation it is (e.g., *Methodology, Background, Result*). 
* **The Advantage:** This is a highly specialized task. A massive general LLM is too slow and computationally expensive to read every single sentence of a 20-page PDF to find structural gaps. The specialized SciBERT model performs this domain-specific classification quickly and efficiently.

### 2. Phase Two: Semantic Search & Retrieval (OpenAI Integration)
Once the SciBERT model identifies a "citation gap" and tags it with an intent, it passes that metadata to the OpenAI integration component (`api_client.py`).
* **The Role:** OpenAI acts as the *Semantic Reasoner*. It takes the flagged sentence and the SciBERT intent tag, and understands the deep semantic context of the academic claim.
* **The Advantage:** Instead of relying on an LLM to hallucinate fake papers directly from its weights, OpenAI is used to generate highly specific search queries based on the sentence's context. It uses these queries to search real academic databases (like OpenAlex, Crossref, or Semantic Scholar) to retrieve actual, verified real-world papers.

### 3. Phase Three: Ranking & Recommendation (OpenAI Integration)
Once the external academic databases return a list of potential candidate papers (e.g., 20 papers), OpenAI is utilized a second time for evaluation.
* **The Role:** It reads the abstracts and metadata of the real papers and compares them against the original sentence in the uploaded PDF. 
* **The Advantage:** It mathematically scores and ranks the candidate papers based on relevance to the specific claim, returning only the top 3-5 most accurate, peer-reviewed recommendations back to the React frontend.

## Summary

This hybrid pipeline demonstrates an optimal division of labor in modern AI architectures:
* The **SciBERT model** serves as the **"Diagnostic Engine"** that scans the document to diagnose where citations are missing and categorizes their structural intent.
* The **OpenAI integration** serves as the **"Prescription Engine"** that understands the diagnosis naturally, searches the global literature library, and prescribes the exact real-world papers needed to fill the gap without hallucination.
