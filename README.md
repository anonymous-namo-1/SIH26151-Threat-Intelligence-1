# Threat Intel Collector

Backend-first data collection layer for a dark-web anonymization/de-anonymization research demo.

This module is intentionally split between:

- Synthetic dark-web data for criminal marketplace/forum/chat examples.
- Legal public OSINT data for real threat actors, malware, CVEs, MITRE ATT&CK techniques, domains, IPs, hashes, and public wallet indicators.

It does not crawl real onion services or ingest illegal content. The crawler component is an offline simulator that reads local synthetic fixtures.

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn backend.app.main:app --reload
```

API docs will be available at `http://127.0.0.1:8000/docs`.

## Core Endpoints

- `POST /api/v1/extract` extracts handles, wallets, PGP keys, onion URLs, domains, IPs, emails, hashes, malware names, MITRE techniques, CVEs, and actor mentions.
- `POST /api/v1/enrich/osint` enriches extracted entities against a local legal-public intelligence catalog.
- `POST /api/v1/enrich/blockchain` classifies BTC/ETH wallet indicators and prepares public explorer references without querying illegal sources.
- `POST /api/v1/evidence-card` returns an analyst-friendly evidence card.
- `GET /api/v1/synthetic-sources` returns local fake dark-web records for demo ingestion.

## Next Integration Points

- PostgreSQL: persist submissions, evidence cards, and enrichment jobs.
- Neo4j: store actor-handle-wallet-indicator relationships.
- OpenSearch: index source text, snippets, and normalized indicators.
- Redis/Celery: run enrichment connectors asynchronously.
- Python NLP/embeddings: add named-entity models and semantic clustering after deterministic extraction is stable.

