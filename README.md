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
- `POST /api/v1/cases/{case_id}/ingest/infrastructure` ingests analyst-supplied infrastructure metadata without scanning or network access.
- `GET /api/v1/cases/{case_id}/ingestions` lists persisted ingestions.
- `GET /api/v1/cases/{case_id}/ingestions/{ingestion_id}` returns one persisted ingestion.
- `GET /api/v1/cases/{case_id}/entities` lists case-scoped extracted entities.
- `GET /api/v1/cases/{case_id}/evidence` lists evidence-to-entity links.
- `GET /api/v1/cases/{case_id}/enrichment-runs` lists enrichment run records.
- `GET /api/v1/cases/{case_id}/resolution/candidates` returns deterministic entity-link candidates for a case.
- `GET /api/v1/cases/{case_id}/graph` returns graph-ready nodes and confidence-weighted edges for a case.
- `GET /api/v1/cases/{case_id}/ai-profile` returns deterministic AI-assisted profiling signals and risk scoring for a case.
- `GET /api/v1/cases/{case_id}/infrastructure/findings` returns metadata-only infrastructure misconfiguration and reuse findings.

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

## Module 2: Entity Resolution Engine

The entity resolution engine reads persisted ingestions, entities, and evidence links inside a single case and returns candidate links between entities. It is deterministic and uses rule-based correlation only.

It does not claim real-world identity attribution. Confidence scores are investigative support, not final proof.

### Scoring Rules

- Same wallet reused by multiple primary handles: `0.95`
- Same PGP key ID, fingerprint, or armored public key block reused: `0.95`
- Same Telegram/contact handle or email reused: `0.9`
- Same normalized handle observed across multiple platforms: `0.8`
- Similar username strings by deterministic normalization: `0.6`
- Shared onion URL, domain, or profile URL domain: `0.65`
- Similar writing keywords or text pattern markers: `0.45`
- Shared observed dates or activity within one day: `0.35`

When multiple rules hit the same entity pair, Argus uses the strongest score with a small bounded bonus for additional evidence. The result remains a candidate link.

### Entity Resolution Endpoint

```bash
GET /api/v1/cases/{case_id}/resolution/candidates
```

Example response shape:

```json
{
  "case_id": "00000000-0000-0000-0000-000000000000",
  "generated_at": "2026-09-11T00:00:00Z",
  "candidates": [
    {
      "left_entity": {
        "id": "11111111-1111-1111-1111-111111111111",
        "entity_type": "handle",
        "value": "alphaaccess",
        "normalized_value": "alphaaccess"
      },
      "right_entity": {
        "id": "22222222-2222-2222-2222-222222222222",
        "entity_type": "handle",
        "value": "betabroker",
        "normalized_value": "betabroker"
      },
      "confidence_score": 0.95,
      "rule_hits": [
        {
          "rule": "same_wallet",
          "description": "Same cryptocurrency wallet reused by multiple primary handles.",
          "score": 0.95,
          "matched_value": "0x1111111111111111111111111111111111111111"
        }
      ],
      "warnings": [
        "Candidate link is analytical correlation only, not proof of attribution or real-world identity."
      ]
    }
  ],
  "warnings": [
    "Candidate link is analytical correlation only, not proof of attribution or real-world identity."
  ]
}
```

The engine never performs live crawling, Tor access, illegal-content ingestion, or external network calls.

## Module 3: Graph Intelligence Layer

The graph intelligence layer converts persisted case data and Module 2 resolution candidates into graph-ready JSON for a future animated frontend using React Flow, Cytoscape, D3, or a similar graph renderer.

This module does not build frontend animation code, Neo4j storage, AI profiling, or dashboard views. It returns deterministic API-level graph data only.

### Graph Endpoint

```bash
GET /api/v1/cases/{case_id}/graph
```

Each response includes:

- `nodes`: entity, ingestion, and source nodes with frontend-friendly labels, groups, confidence, risk level, and metadata.
- `edges`: evidence-backed and confidence-weighted links between nodes.
- `warnings`: analytical limitations and safety boundaries.

Supported node types include `handle`, `alias`, `wallet`, `pgp_key`, `telegram`, `email`, `domain`, `ip_address`, `onion_url`, `malware`, `mitre_technique`, `cve`, `source`, and `ingestion`.

Supported edge types include `mentioned_in`, `uses_wallet`, `uses_pgp`, `has_contact`, `hosted_on`, `observed_in_source`, `resolved_candidate`, `shared_indicator`, and `related_to`.

High-confidence edges receive higher weights and `animated: true`; lower-confidence context edges remain available for layout and filtering.

### Example Graph Response

```json
{
  "case_id": "00000000-0000-0000-0000-000000000000",
  "generated_at": "2026-09-11T00:00:00Z",
  "nodes": [
    {
      "id": "entity:11111111-1111-1111-1111-111111111111",
      "entity_id": "11111111-1111-1111-1111-111111111111",
      "type": "wallet",
      "label": "ETH Wallet",
      "value": "0x1111111111111111111111111111111111111111",
      "group": "crypto",
      "risk_level": "high",
      "confidence": 0.98,
      "metadata": {
        "entity_type": "wallet:eth"
      }
    }
  ],
  "edges": [
    {
      "id": "edge:entity:handle-id:entity:wallet-id:uses_wallet",
      "source": "entity:handle-id",
      "target": "entity:wallet-id",
      "type": "uses_wallet",
      "label": "uses wallet",
      "confidence": 0.95,
      "weight": 5,
      "animated": true,
      "style_hint": "high_confidence",
      "evidence_snippets": [
        "Vendor profile includes ETH: 0x1111111111111111111111111111111111111111"
      ],
      "rule_hits": []
    }
  ],
  "warnings": [
    "Graph edges are evidence-backed analytical links, not proof of attribution or identity."
  ]
}
```

Every graph edge is traceable to persisted evidence, an ingestion/source relationship, or a Module 2 resolution rule.

## Module 4: AI Profiling Layer

The AI profiling layer is deterministic AI-assisted analysis for the MVP. It reads persisted case ingestions, extracted entities, Module 2 candidate links, and Module 3 graph data, then returns analyst-friendly signals without calling live LLM or AI APIs.

This module does not perform final attribution, identify real people, scrape websites, use Tor, or crawl onion services. Confidence and risk scores are investigative support only and require analyst review.

### AI Profile Endpoint

```bash
GET /api/v1/cases/{case_id}/ai-profile
```

The response includes:

- `profile_summary`: short case-level summary of evidence volume, graph context, candidate links, and risk.
- `risk_score` and `risk_level`: deterministic capped score from explainable factors.
- `risk_breakdown`: scored contributions with evidence references.
- `stylometry`: repeated phrase, sentence length, punctuation, uncommon-word, contact-wording, and marketplace-language signals.
- `behavior_patterns`: wallet, PGP, contact, platform, activity, infrastructure, and threat-context reuse patterns.
- `rebrand_signals`: migration/rebrand wording and shared identifiers across different handles.
- `attribution_explanations`: explanation of strong Module 2 candidate links.
- `recommended_next_steps`: deterministic legal/public follow-up actions.
- `warnings`: analytical and safety limitations.

### Risk Scoring Rules

- Wallet reuse: `+25`
- PGP key reuse: `+25`
- Shared contact: `+20`
- Onion or infrastructure evidence: `+10`
- Multiple platforms: `+10`
- Malware, MITRE technique, or CVE mention: `+10`
- Weak stylometry or activity match: `+5`

Scores are capped at `100`.

Risk levels:

- `low`: `0-30`
- `medium`: `31-60`
- `high`: `61-85`
- `critical`: `86-100`

### Example AI Profile Response

```json
{
  "case_id": "00000000-0000-0000-0000-000000000000",
  "generated_at": "2026-09-11T00:00:00Z",
  "profile_summary": "Profile generated from 2 persisted ingestion(s), 8 graph node(s), 12 evidence-backed edge(s), and 1 candidate link(s). 1 candidate link(s) are high confidence. Risk is high (65/100).",
  "risk_score": 65,
  "risk_level": "high",
  "risk_breakdown": {
    "total": 65,
    "level": "high",
    "contributions": [
      {
        "factor": "same_wallet",
        "points": 25,
        "rationale": "Wallet reuse appears in Module 2 candidate rules.",
        "evidence_refs": ["same_wallet"]
      }
    ]
  },
  "stylometry": [
    {
      "signal_type": "shared_repeated_phrases",
      "description": "Multiple ingestions share repeated phrase patterns.",
      "confidence": 0.55,
      "matched_values": ["silver river escrow"],
      "evidence_snippets": ["Delivery phrase silver river escrow protocol."],
      "source_ingestion_ids": ["11111111-1111-1111-1111-111111111111"]
    }
  ],
  "behavior_patterns": [
    {
      "pattern": "same_wallet_reuse",
      "description": "Multiple primary handles reuse the same cryptocurrency wallet.",
      "confidence": 0.95,
      "supporting_entities": ["0x1111111111111111111111111111111111111111"],
      "evidence_snippets": ["ETH: 0x1111111111111111111111111111111111111111"],
      "source_ingestion_ids": ["11111111-1111-1111-1111-111111111111"],
      "graph_edge_ids": ["edge:entity:handle-id:entity:wallet-id:uses_wallet"]
    }
  ],
  "rebrand_signals": [],
  "attribution_explanations": [
    {
      "candidate_pair": ["blackfalcon", "falcon_ops"],
      "confidence": 0.98,
      "explanation": "These handles are linked because they reuse the same cryptocurrency wallet, and reuse the same PGP key material.",
      "supporting_rules": ["same_wallet", "same_pgp"],
      "evidence_snippets": ["PGP: A1B2C3D4E5F60708"],
      "source_ingestion_ids": ["11111111-1111-1111-1111-111111111111"],
      "warning": "This is not proof of real-world identity."
    }
  ],
  "recommended_next_steps": [
    "Verify wallet history through a legal public blockchain explorer.",
    "Check whether the PGP key or fingerprint appears in legal public OSINT.",
    "Inspect graph neighbors for evidence-backed shared identifiers.",
    "Review source credibility and preserve original evidence snippets.",
    "Collect more independent evidence before any attribution decision."
  ],
  "warnings": [
    "AI profiling output is deterministic analyst support only, not proof of attribution or real-world identity.",
    "No live AI API, Tor access, onion crawling, or illegal-content scraping is used."
  ]
}
```

All profile conclusions must trace back to persisted evidence, entity records, graph edges, or Module 2 resolution rules. The endpoint is designed for analyst triage, not final identity attribution.

## Module 5: Infrastructure Misconfiguration Layer

The infrastructure misconfiguration layer analyzes analyst-supplied or synthetic infrastructure metadata already persisted inside a case. It detects suspicious infrastructure reuse and misconfiguration signals without scanning hosts, fetching URLs, using Tor, crawling onion services, or touching illegal content.

Findings are investigative signals only. They are not proof of attribution, identity, compromise, or ownership.

### Infrastructure Ingestion Endpoint

```bash
POST /api/v1/cases/{case_id}/ingest/infrastructure
```

The endpoint accepts supplied metadata such as URLs, onion URLs, domains, IPs, page titles, server headers, powered-by headers, TLS certificate details, HTTP status, open ports, observation date, source label, and notes. It persists the observation through the existing ingestion, extraction, entity, and evidence flow.

Example request:

```json
{
  "url": "https://portal.example.test/login",
  "onion_url": "http://portalabcd1234.onion",
  "domain": "portal.example.test",
  "ip_address": "203.0.113.10",
  "page_title": "Falcon Market Login",
  "server_header": "nginx/1.25.3",
  "powered_by_header": "Express 4.18.2",
  "tls_issuer": "Example Test CA",
  "tls_subject": "CN=portal.example.test",
  "tls_serial": "00FAKE1234",
  "certificate_fingerprint": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "http_status": 200,
  "open_ports": [80, 443],
  "observed_at": "2026-09-01",
  "source_label": "Analyst Infrastructure Paste",
  "notes": "Metadata supplied by analyst; no live scanning performed.",
  "metadata": {
    "collection": "manual"
  }
}
```

The response uses the standard `PersistedExtractionResponse` shape and stores `network_access: false` in ingestion metadata.

### Infrastructure Findings Endpoint

```bash
GET /api/v1/cases/{case_id}/infrastructure/findings
```

Detection rules include:

- Same server or header pattern reused across multiple handles, platforms, or sources.
- Same certificate fingerprint reused across domains or onion metadata.
- Same TLS issuer and subject reused.
- Similar onion and clearnet page-title metadata.
- Exposed `X-Powered-By` or equivalent technology headers.
- Admin, debug, staging, test, or dev descriptors in supplied headers/title/metadata.
- Conflicting descriptors, such as one supplied onion title and a different clearnet mirror title.
- Same IP or domain appearing in multiple infrastructure observations.

Risk scoring:

- Shared certificate fingerprint: `+30`
- Shared server/header pattern: `+20`
- Clearnet/onion metadata similarity: `+20`
- Leaked powered-by/server technology: `+10`
- Descriptor inconsistency: `+10`
- Repeated IP/domain infrastructure: `+10`

Scores are capped at `100`.

Risk levels:

- `low`: `0-30`
- `medium`: `31-60`
- `high`: `61-85`
- `critical`: `86-100`

Example response:

```json
{
  "case_id": "00000000-0000-0000-0000-000000000000",
  "generated_at": "2026-09-11T00:00:00Z",
  "findings": [
    {
      "finding_type": "shared_certificate_fingerprint",
      "title": "Shared certificate fingerprint",
      "severity": "high",
      "confidence": 0.95,
      "description": "Same TLS certificate fingerprint appears across multiple infrastructure observations.",
      "matched_values": [
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      ],
      "evidence_snippets": [
        "Infrastructure observation supplied by analyst; network_access: false url: https://portal.example.test/login"
      ],
      "source_ingestion_ids": [
        "11111111-1111-1111-1111-111111111111"
      ],
      "related_handles": []
    }
  ],
  "signals": [
    {
      "signal_type": "supplied_open_ports",
      "description": "Open ports were supplied by the analyst as metadata.",
      "confidence": 0.45,
      "evidence_snippets": [
        "open ports: 80, 443"
      ],
      "source_ingestion_ids": [
        "11111111-1111-1111-1111-111111111111"
      ],
      "metadata": {
        "open_ports": [80, 443]
      }
    }
  ],
  "risk_score": 60,
  "risk_level": "medium",
  "warnings": [
    "Infrastructure findings are metadata-only investigative signals, not proof of attribution or real-world identity.",
    "No live host scanning, Tor access, onion crawling, or external network lookup is performed."
  ]
}
```

Every finding is derived from persisted metadata, extracted entities, evidence snippets, or source ingestion IDs. The module is safe/legal prototype analysis only.

## Next Integration Points

- Neo4j: store actor-handle-wallet-indicator relationships.
- OpenSearch: index source text, snippets, and normalized indicators.
- Redis/Celery: run enrichment connectors asynchronously.
- Python NLP/embeddings: add named-entity models and semantic clustering after deterministic extraction is stable.
