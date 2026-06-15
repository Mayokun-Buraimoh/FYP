import os
import requests
from dotenv import load_dotenv

# Load .env
load_dotenv('.env')

api_key = os.environ.get("SEMANTIC_SCHOLAR_API_KEY")
print(f"API Key found: {'Yes' if api_key else 'No'}")

url = "https://api.semanticscholar.org/graph/v1/paper/search"
params = {
    "query": "artificial intelligence",
    "limit": 1,
    "fields": "title,authors,year,abstract,openAccessPdf,url,externalIds,influentialCitationCount"
}
headers = {}
if api_key:
    headers["x-api-key"] = api_key

try:
    response = requests.get(url, params=params, headers=headers)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text[:200]}...")
except Exception as e:
    print(f"Connection Error: {e}")
