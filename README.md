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
- `POST /api/v1/enrich/mitre` enriches extracted threat actor and ATT&CK technique entities with the official MITRE ATT&CK Enterprise STIX 2.1 dataset.
- `POST /api/v1/enrich/blockchain` classifies BTC/ETH wallet indicators and prepares public explorer references without querying illegal sources.
- `POST /api/v1/evidence-card` returns an analyst-friendly evidence card.
- `GET /api/v1/synthetic-sources` returns local fake dark-web records for demo ingestion.

## MITRE ATT&CK Connector

The MITRE connector retrieves the official Enterprise ATT&CK STIX 2.1 JSON bundle, validates it as STIX bundle data, ignores revoked/deprecated objects, and parses:

- `intrusion-set` objects for public threat groups and aliases
- `attack-pattern` objects for ATT&CK techniques
- `malware` and `tool` objects for public software context
- `relationship` objects for group-to-technique and group-to-software links

It performs exact normalized matching only. Group-name and alias matches return high confidence; technique matches return groups that MITRE publicly links to that technique. The connector does not scrape websites, access onion services, or treat aliases as proof of real-world identity.

### Environment Variables

- `MITRE_ATTACK_STIX_URL`: optional HTTPS URL for the Enterprise ATT&CK STIX bundle. Default: `https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json`
- `MITRE_ATTACK_CACHE_TTL_SECONDS`: in-memory parsed dataset cache TTL. Default: `86400`
- `MITRE_ATTACK_CONNECT_TIMEOUT_SECONDS`: outbound connection timeout. Default: `3.0`
- `MITRE_ATTACK_READ_TIMEOUT_SECONDS`: response read timeout. Default: `10.0`

Only trusted MITRE/GitHub hosts are allowed, and redirects are manually validated before being followed.

### Example MITRE Request

```json
{
  "entities": {
    "threat_actors": [
      {
        "value": "LockBit",
        "entity_type": "threat_actor",
        "confidence": 0.86
      }
    ],
    "mitre_techniques": [
      {
        "value": "T1486",
        "entity_type": "mitre_technique",
        "confidence": 0.98
      }
    ]
  }
}
```

Every response includes warnings that MITRE ATT&CK enrichment is public analytical context, not proof of attribution or identity.

## Next Integration Points

- PostgreSQL: persist submissions, evidence cards, and enrichment jobs.
- Neo4j: store actor-handle-wallet-indicator relationships.
- OpenSearch: index source text, snippets, and normalized indicators.
- Redis/Celery: run enrichment connectors asynchronously.
- Python NLP/embeddings: add named-entity models and semantic clustering after deterministic extraction is stable.
