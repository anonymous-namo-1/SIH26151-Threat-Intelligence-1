# Argus Threat Intel Collector

Backend-first **Module 1: Data Collection Layer** for Argus, an SIH26151 threat-intelligence platform.

Module 1 provides a complete safe/legal collection flow:

`case -> ingestion -> extraction -> persisted entities -> evidence`

Completed subfeatures:

- Synthetic dark-web data for criminal marketplace/forum/chat examples.
- Offline dark-web/forum/marketplace crawler simulator.
- Public OSINT text ingestion for reports, news, advisories, and analyst submissions.
- PGP key ID, fingerprint, and armored public key block extraction.
- BTC and ETH wallet extraction/classification.
- Handle and profile text parsing.
- Analyst-supplied onion service metadata collection.
- Case-scoped persistence for ingestions, entities, and evidence links.
- Legal public enrichment hooks for MITRE ATT&CK and blockchain context.

It does not crawl real onion services or ingest illegal content. The dark-web side is synthetic/offline only. Real data is allowed only from legal public OSINT sources and safe API-style enrichment.

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
- `POST /api/v1/profile/parse` parses supplied synthetic or public profile text without scraping or network access.
- `GET /api/v1/data-collection/status` returns Module 1 readiness/capability status and safety warnings.
- `GET /api/v1/synthetic-sources` returns local fake dark-web records for demo ingestion.
- `POST /api/v1/cases` creates an investigation case.
- `GET /api/v1/cases` lists cases with pagination.
- `GET /api/v1/cases/{case_id}` returns one case.
- `POST /api/v1/cases/{case_id}/ingestions` runs extraction and persists the ingestion, entities, and evidence links in one transaction.
- `POST /api/v1/cases/{case_id}/ingest/synthetic` ingests either a local synthetic crawler-simulator record or pasted synthetic dark-web-style text.
- `POST /api/v1/cases/{case_id}/ingest/osint` ingests pasted public report, news, or advisory text with source metadata.
- `POST /api/v1/cases/{case_id}/ingest/profile` ingests pasted synthetic/public profile text through the profile parser and persistence flow.
- `POST /api/v1/cases/{case_id}/ingest/onion-metadata` ingests analyst-supplied onion metadata without fetching onion services.
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

## Module 1: Data Collection Layer

Module 1 is the unified backend collection module. Every case-scoped ingestion endpoint reuses deterministic extraction and persistence so the stored record keeps the original evidence text, extracted entities, and evidence snippets together.

Safety boundaries:

- No Tor integration.
- No live onion crawling or fetching.
- No login bypassing.
- No scraping of illegal marketplaces.
- No AI profiling, fuzzy attribution, graph intelligence, or dashboard code in this module.

### Synthetic Crawler Simulator Ingestion

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

### Public OSINT Text Ingestion

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

### Profile Ingestion

The profile parser accepts pasted synthetic profile text or public profile text an analyst already has permission to review. The case-scoped profile ingestion endpoint parses the profile, converts username, aliases, contacts, PGP keys, wallets, and profile URLs into extraction-friendly evidence text, then persists the resulting entities/evidence.

It does not fetch URLs, scrape websites, log in, use Tor, or touch the network.

#### Example Profile Ingestion Request

```json
{
  "platform": "Public OSINT Forum",
  "source_type": "public_report",
  "observed_at": "2026-09-01",
  "text": "User: threat_researcher\nKnown as: malware-notes\nContact: @researcher_public\nPGP: A1B2C3D4E5F60708\nBTC: bc1qfakewallet123abcxyz\nSource: https://example.test/profiles/threat_researcher"
}
```

The standalone parser remains available at `POST /api/v1/profile/parse` when persistence is not needed.

### Onion Metadata Ingestion

The onion metadata endpoint accepts analyst-supplied metadata only. It validates and persists the supplied onion URL, mirrors, contacts, banners, and server headers as evidence text. It never fetches the onion URL.

#### Example Onion Metadata Request

```json
{
  "onion_url": "http://samplemetadataabcd.onion",
  "title": "Synthetic Onion Metadata",
  "category": "forum",
  "language": "en",
  "first_seen": "2026-08-01",
  "last_seen": "2026-09-01",
  "status": "offline-demo",
  "mirrors": ["http://mirrorabcd1234.onion"],
  "contacts": [
    "@onion_admin",
    "admin@example.test",
    "PGP: A1B2C3D4E5F60708",
    "wallet: 0x1111111111111111111111111111111111111111"
  ],
  "banners": ["Server: nginx 1.25 on 198.51.100.12"],
  "server_headers": {
    "x-contact": "telegram: onion_meta"
  },
  "metadata": {
    "analyst_supplied": true
  }
}
```

### Module Status

`GET /api/v1/data-collection/status` reports implemented Module 1 capabilities and safety warnings.

#### Example Status Response

```json
{
  "module": "Module 1: Data Collection Layer",
  "implemented": true,
  "capabilities": [
    {
      "key": "synthetic_crawler_simulator",
      "label": "Synthetic crawler simulator",
      "implemented": true
    }
  ],
  "safety_warnings": [
    "No Tor access is implemented.",
    "No live onion crawling or fetching is implemented.",
    "Synthetic dark-web data and legal public OSINT only; illegal content ingestion is out of scope."
  ]
}
```

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
