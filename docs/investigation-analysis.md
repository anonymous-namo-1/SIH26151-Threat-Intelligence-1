# ARGUS investigation analysis

The **Analysis** workspace operates within the selected case. Its ten modules
return structured JSON that can be downloaded, with model version, calculation
time, evidence references, gaps and explanations. Completed results are retained
as case jobs; they are historical observations, not automatically refreshed facts.

## Suggested workflow

1. Select or create an authorized case.
2. Open **Evidence** and supply text or drop a TXT, CSV, JSON or text-bearing PDF.
   The original is validated, hashed and privately preserved before interpretation.
   Image-only PDFs require externally obtained OCR; ARGUS does not invent missing text.
3. Run extraction, or let the document upload queue it. Extraction produces
   **suggestions only**. Use the review queue to edit, accept or reject entities and
   relationships. Accept entity suggestions before dependent relationship suggestions.
   Accepting is explicit, permission-controlled and audited. Finalized decisions
   cannot be silently replaced by a second request.
4. Review source evidence and link it to relevant entities. Merely citing an
   unrelated document is not support for an indicator or identity hypothesis.
5. Use Analysis for persona, stylometry, temporal, wallet, infrastructure, alias,
   relationship, evidence-reliability, contradiction or timeline work.
6. Use the case assistant for evidence retrieval. Its displayed findings are
   validated extracts from case evidence, not unchecked model paraphrases.

## Interpreting scores

- Persona scores are **bounded heuristic points**, not calibrated probabilities
  of common identity or wrongdoing. Unknown factors contribute no support.
- Case investigators with editing permission can adjust scoring weights.
  A weight of zero disables its contribution. Every change creates a versioned,
  audited rules record; prior analysis results keep their prior version.
- Evidence reliability measures documented provenance/completeness. It does not
  certify that source assertions are true.
- Offline stylometry is a surface-form comparison. Short samples, language,
  copied material and genre can dominate its measurements. Corpora are supplied
  by the investigator; they are not silently added to case evidence.
- Temporal distributions use UTC, not inferred home locations. Collection times
  are not treated as posting times. Sparse data must not be read as a migration.

## Cryptocurrency imports

In Wallets, preview a supplied CSV or JSON transaction file, choose its case
evidence record, and explicitly approve the import. Required fields:

```json
{
  "hash": "fictional-example",
  "from_address": "fictional-sender",
  "to_address": "fictional-recipient",
  "amount": "0.123456789123456789",
  "asset": "TEST",
  "timestamp": "2026-09-08T12:00:00Z",
  "labels": ["fictional example"]
}
```

JSON amounts must be **strings** to preserve precision; timestamps must include
a timezone. Import is idempotent by case, asset and hash. Conflicting reimports
are rejected instead of overwriting prior data. Totals describe supplied
transactions, not balances. No private keys, fund transfers or live on-chain
verification are performed. The replaceable mock blockchain provider accepts
explicitly fictional fixtures only.

## Supplied infrastructure

Domain, IP, certificate, DNS, hosting and service records can carry observation
timestamps and structured metadata. Reuse paths are hypotheses requiring
support for both endpoints. There is no active scanning, exploitation or
authentication bypass.

## Runtime boundaries

Interactive modules accept at most 1,000 records in each category and 5 MB of
case text; larger inputs fail explicitly rather than claiming full coverage.
Extraction and assistant context are also bounded and report their limitations.
No new database tables or startup migrations are needed for this extension.

The existing Vercel/frontend and persistent-backend split is unchanged.
These features do not repair an unresolved external gateway hostname.

## Renderer regression checks

These checks use fictional in-memory engine data, never a database or live AI.
They cover populated and empty module results, nested stylometry measurements,
exact cryptocurrency values, and evidence-link routing.

```sh
PYTHONPATH=. python tests/analysis/render_fixtures.py > /tmp/argus-render-fixtures.json
TZ=America/Edmonton scripts/node_modules/.bin/tsx \
  --tsconfig artifacts/sih26151-intelligence/tsconfig.render.json \
  artifacts/sih26151-intelligence/src/features/analysis/results/__tests__/render.test.ts \
  /tmp/argus-render-fixtures.json
```