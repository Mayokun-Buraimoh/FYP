# System Architecture: Hybrid AI Integration

This document outlines the architectural integration between the local machine learning models and the cloud-based OpenAI LLM within the project. 

The system operates as a highly optimized **Hybrid AI Pipeline**. It uses specialized local models for heavy data processing and ranking, while delegating complex natural language generation tasks to the cloud (OpenAI).

## The 3-Stage Pipeline

### Stage 1: Local Gap Detection & Intent Classification (SciBERT)
When a user uploads a PDF, the document is parsed into individual sentences using `PyMuPDF` and `nltk`.
* **The Role:** The custom-trained **SciBERT model** (`uniflow_brain`) acts as the *Intent Classifier*. It analyzes every sentence locally using PyTorch and determines **if** a citation is missing, and **what kind** of citation it is (e.g., *Methodology, Background, Result*). 
* **The Advantage:** A massive general LLM is too slow and expensive to read every sentence of a 20-page PDF to find gaps. The specialized SciBERT model performs this domain-specific classification instantly and locally.

### Stage 2: Intent-Driven Search & Retrieval (OpenAI + External APIs)
Once SciBERT identifies a "citation gap" and tags it with a specific intent, the system searches for real-world papers to fill that gap.
* **The Role:** OpenAI acts as the *Query Architect*. It takes both the flagged sentence and the local SciBERT intent tag to generate a highly targeted search query. The Python backend then takes this OpenAI-generated query and automatically searches massive, real-world academic databases (such as OpenAlex, Crossref, and Semantic Scholar).
* **The Advantage:** Instead of relying on an LLM to hallucinate fake papers, the system uses OpenAI purely to craft the perfect search query, guaranteeing that the external APIs only retrieve real, verified, and peer-reviewed literature.

### Stage 3: Local Semantic Vector Ranking (all-MiniLM-L6-v2)
The academic databases return a list of potential candidate papers (e.g., 20 papers). Instead of sending these back to OpenAI for ranking, the system performs a final, highly accurate local analysis.
* **The Role:** A lightweight local semantic vector model (`all-MiniLM-L6-v2` via `sentence-transformers`) acts as the *Semantic Judge*.
* **How it works:** It converts the original sentence from the PDF and the abstracts of the candidate papers into numerical vectors (embeddings). It then calculates the **Cosine Similarity** between them. 
* **The Advantage:** This model truly understands context. If the highlighted sentence mentions "monetary requirements," it mathematically matches it with a paper about "financial costs," even if the exact keywords don't overlap. It ensures the final 3-5 recommendations are perfectly tailored to the sentence's context, all executed blazingly fast on the local machine.

## Summary

This architecture perfectly balances cost, speed, and accuracy:
1. **Local SciBERT** acts as the *Diagnostician* to find the gaps.
2. **Cloud OpenAI + APIs** acts as the *Search Engine* to figure out the best keywords and retrieve real literature.
3. **Local MiniLM** acts as the *Judge* to analyze the search results and pick the best papers based on deep semantic meaning.
