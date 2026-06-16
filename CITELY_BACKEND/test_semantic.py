import os
import sys

# Add project path so we can import modules
sys.path.append("/Users/mayokun/Desktop/FYP/CITELY_BACKEND")

from documents.services.api_client import _rank_recommendations, get_semantic_model

sentence = "Our study focuses on the monetary requirements for deploying remote servers in cloud environments."
intent = "Methodology"

recommendations = [
    {
        "id": "1",
        "title": "A Survey on Cloud Computing",
        "abstract": "This paper provides a broad overview of cloud computing architectures.",
        "influentialCitationCount": 50
    },
    {
        "id": "2",
        "title": "Cost Analysis of Remote Server Deployment",
        "abstract": "This research calculates the financial costs and monetary impact of deploying remote servers for enterprise applications.",
        "influentialCitationCount": 10
    },
    {
        "id": "3",
        "title": "Security in Remote Environments",
        "abstract": "We analyze the cryptographic protocols needed to secure remote server deployments.",
        "influentialCitationCount": 5
    }
]

print("Loading model...")
model = get_semantic_model()
if model:
    print("Model loaded successfully.")
    print("Ranking recommendations semantically...")
    ranked = _rank_recommendations(recommendations, sentence, intent)
    
    print("\nResults:")
    for i, r in enumerate(ranked):
        print(f"{i+1}. {r['title']} (Score: {r['matchScore']})")
else:
    print("Failed to load model.")
