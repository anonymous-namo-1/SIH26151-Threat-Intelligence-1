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
alembic upgrade head
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
- `POST /api/v1/cases` creates an investigation case.
- `GET /api/v1/cases` lists cases with pagination.
- `GET /api/v1/cases/{case_id}` returns one case.
- `POST /api/v1/cases/{case_id}/ingestions` runs extraction and persists the ingestion, entities, and evidence links in one transaction.
- `POST /api/v1/cases/{case_id}/ingest/synthetic` ingests either a local synthetic crawler-simulator record or pasted synthetic dark-web-style text.
- `POST /api/v1/cases/{case_id}/ingest/osint` ingests pasted public report, news, or advisory text with source metadata.
- `GET /api/v1/cases/{case_id}/ingestions` lists persisted ingestions.
- `GET /api/v1/cases/{case_id}/ingestions/{ingestion_id}` returns one persisted ingestion.
- `GET /api/v1/cases/{case_id}/entities` lists case-scoped extracted entities.
- `GET /api/v1/cases/{case_id}/evidence` lists evidence-to-entity links.
- `GET /api/v1/cases/{case_id}/enrichment-runs` lists enrichment run records.

List endpoints support `limit` and `offset`. `limit` is capped at `100`.

## Database Persistence

Argus uses SQLAlchemy 2.x with migration-managed schema changes through Alembic. The runtime database layer includes:

- SQLAlchemy engine and session factory
- FastAPI `get_db` dependency with rollback and cleanup
- UUID primary keys
- PostgreSQL JSONB with SQLite JSON fallback
- UTC-aware timestamps
- SQLite foreign-key enforcement for local tests
- Case-scoped entity deduplication by `(case_id, entity_type, normalized_value)`
- Composite foreign keys on evidence links and enrichment runs to prevent cross-case linking

The app does not run `create_all()` automatically. Apply schema changes with Alembic.

### Environment Variables

- `APP_ENV`: `local`, `test`, `development`, or a deployed environment name. SQLite is allowed only for local/test/development.
- `DATABASE_URL`: SQLAlchemy database URL. Defaults to `sqlite:///./argus_dev.db` for local development.
- `MITRE_ATTACK_STIX_URL`: optional HTTPS URL for the Enterprise ATT&CK STIX bundle.
- `MITRE_ATTACK_CACHE_TTL_SECONDS`: in-memory parsed MITRE dataset cache TTL.
- `MITRE_ATTACK_CONNECT_TIMEOUT_SECONDS`: MITRE connector connection timeout.
- `MITRE_ATTACK_READ_TIMEOUT_SECONDS`: MITRE connector read timeout.

Use `.env.example` as a template. It contains fake local values only.

### Local SQLite Setup

```bash
cp .env.example .env
alembic upgrade head
uvicorn backend.app.main:app --reload
```

SQLite is intended for local development and isolated tests only.

### PostgreSQL Setup

Set `DATABASE_URL` to a PostgreSQL URL supplied by your deployment environment or secret manager:

```bash
export APP_ENV=production
export DATABASE_URL="postgresql+psycopg://argus_user:fake_password@example.internal:5432/argus"
alembic upgrade head
```

Do not hard-code real credentials in source files.

### Migration Commands

```bash
alembic upgrade head
alembic downgrade -1
```

### Example Case Request

```json
{
  "title": "Public ransomware report review",
  "description": "Analyst collection for legal OSINT enrichment.",
  "status": "open"
}
```

### Example Persisted Ingestion Request

```json
{
  "source_type": "public_report",
  "platform": "Analyst Paste",
  "observed_at": "2026-09-01",
  "text": "A public report links LockBit activity to T1486 and CVE-2023-34362.",
  "metadata": {
    "source": "manual analyst paste"
  }
}
```

Authentication and multi-user authorization are not implemented yet. Case-scoped queries prevent accidental cross-case record lookup, but they are not a substitute for user, tenant, or role-based access control.

## Module 1: Synthetic Crawler Simulator Ingestion

The synthetic ingestion endpoint demonstrates dark-web-style collection without crawling real dark-web services. It reads from local fake records or accepts analyst-pasted synthetic text, then reuses the deterministic extractor and persistence service:

`case -> ingestion -> extraction -> persisted entities -> evidence links`

It does not use Tor, onion access, scraping, or live network calls.

### Synthetic Record Request

```json
{
  "synthetic_source_id": "synthetic-forum-leakhub-blackfalcon-20260901"
}
```

### Synthetic Pasted Text Request

```json
{
  "source_type": "synthetic_marketplace",
  "platform": "Analyst Synthetic Paste",
  "handle": "zeroledger",
  "text": "Vendor handle: zeroledger. Contact PGP: 9988AABBCCDD0011. ETH 0x1111111111111111111111111111111111111111.",
  "metadata": {
    "scenario": "demo"
  }
}
```

The endpoint returns the same `PersistedExtractionResponse` shape as the raw persistence endpoint.

## Module 2: Public OSINT Text Ingestion

The public OSINT ingestion endpoint accepts report, news, or advisory text that an analyst already has permission to use. It stores source metadata with the ingestion and runs the same extraction/persistence flow.

It does not fetch `source_url`; the URL is stored as context only.

### Public OSINT Request

```json
{
  "source_name": "CISA Public Advisory",
  "source_url": "https://example.test/public-advisory",
  "published_at": "2026-09-01",
  "observed_at": "2026-09-02",
  "source_type": "public_advisory",
  "text": "A public advisory references CVE-2023-34362, T1486, evil.example, 203.0.113.10, and a SHA-256 hash.",
  "metadata": {
    "collection": "manual"
  }
}
```

Supported extracted evidence includes CVEs, MITRE technique IDs, domains, IPs, file hashes, emails, wallets, malware names, and public threat actor mentions based on the existing extractor.

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

- Neo4j: store actor-handle-wallet-indicator relationships.
- OpenSearch: index source text, snippets, and normalized indicators.
- Redis/Celery: run enrichment connectors asynchronously.
- Python NLP/embeddings: add named-entity models and semantic clustering after deterministic extraction is stable.
