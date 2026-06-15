from documents.services.api_client import fetch_recommendations
import os

# Dummy gap data
gaps = [
    {
        "sentence": "Deep learning has revolutionized image recognition tasks in the last decade.",
        "intent": "Background",
        "score": 0.95
    }
]

print("Starting fetch_recommendations test...")
results = fetch_recommendations(gaps)

for gap in results:
    print(f"Gap: {gap['sentence']}")
    print(f"Recommendations: {len(gap['recommendations'])}")
    for rec in gap['recommendations']:
        print(f" - {rec['title']} ({rec['url']})")
