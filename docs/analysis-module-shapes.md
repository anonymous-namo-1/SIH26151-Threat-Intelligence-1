# Analysis module response shapes

Call `run_module(name, entities, evidence, relationships, options)`. Inputs and
outputs are JSON-compatible. Scores are review heuristics, not probabilities or
identity assertions.

## Common envelope

```json
{
  "module": "persona",
  "model_version": "argus-rules-2.0",
  "generated_at": "ISO-8601 UTC",
  "explanation": "string",
  "evidence_ids": ["uuid"],
  "confidence": 74.0,
  "positive_evidence": [],
  "negative_evidence": [],
  "unknown_factors": ["topic_similarity"],
  "data": {}
}
```

`confidence` is `number | null` in the range 0–100. Factor arrays contain:

```json
{"name":"pgp_overlap","status":"supports","score":1.0,"weight":35.0,"contribution":35.0,"reason":"string","evidence_ids":["uuid"]}
```

## Module-specific `data`

| Module | Options used | `data` keys |
|---|---|---|
| `persona` | `left_id`, `right_id`, `rules` | `correlation_score`, `confidence`, `factors`, `positive_evidence`, `negative_evidence`, `evidence_ids`, `contradictions`, `unknown_factors`, `explanation`, `uncertainty`, `model_version`, `generated_at`, `attribution` |
| `stylometry` | `corpus_left`, `corpus_right` | `similarity`, `reliability`, `sample_size_warning`, `features`, `explanation` |
| `temporal` | `start`, `end`, `entity_id` | `posting_hour_distribution`, `weekday_distribution`, `first_seen`, `last_seen`, `activity_bursts`, `inactive_periods`, `migration_candidates`, `observation_count`, `evidence_ids`, `warning` |
| `timeline` | same as temporal | Same keys as `temporal` |
| `wallet` | none | `transactions`, `transaction_count`, `totals_by_asset`, `counterparties`, `counterparty_graph`, `timeline`, `public_metadata`, `balances`, `evidence_ids`, `warnings`, `explanation` |
| `infrastructure` | none | `reuse_paths`, `observed_counts`, `timestamps`, `evidence_ids`, `explanation` |
| `alias` | none | `aliases`, `overlaps`, `explanation` |
| `relationship` | none | `edges`, `cited_edge_count`, `uncited_edge_count`, `explanation` |
| `reliability` | none | `items`, `average_score`, `explanation` |
| `contradiction` | none | `findings`, `explanation` |

### Compact examples

```json
{"module":"stylometry","data":{"similarity":61.2,"reliability":"low","sample_size_warning":"Small samples make lexical measurements unstable.","features":{"left":{},"right":{}}}}
{"module":"temporal","data":{"posting_hour_distribution":[0,1],"weekday_distribution":[1,0],"first_seen":"ISO-8601","last_seen":"ISO-8601","activity_bursts":[],"inactive_periods":[],"migration_candidates":[],"observation_count":1}}
{"module":"wallet","data":{"transactions":[{"hash":"…","from_address":"…","to_address":"…","amount":"2.01","asset":"BTC","timestamp":"ISO-8601","labels":[],"entity_id":"tx-id","evidence_ids":["ev"]}],"totals_by_asset":{"BTC":"2.01"},"counterparties":{},"counterparty_graph":{"edges":[]},"timeline":[],"balances":null}}
{"module":"infrastructure","data":{"reuse_paths":[{"kind":"domains","value":"example.test","entity_ids":["a","b"],"evidence_ids":["ev"]}],"observed_counts":{"domains":1},"timestamps":[]}}
{"module":"alias","data":{"aliases":[{"normalized_alias":"handle","entity_ids":["a","b"]}],"overlaps":[{"normalized_alias":"handle","entity_ids":["a","b"]}]}}
{"module":"relationship","data":{"edges":[],"cited_edge_count":0,"uncited_edge_count":0}}
{"module":"reliability","data":{"items":[{"evidence_id":"ev","score":75,"warnings":["missing integrity hash"]}],"average_score":75}}
{"module":"contradiction","data":{"findings":[{"relationship_id":"r","type":"CONTRADICTS","source_entity_id":"a","target_entity_id":"b","evidence_ids":["ev"],"warning":null}]}}
```

Arrays are bounded. Wallet totals are exact decimal strings summing supplied
transaction values per asset;
`balances` is always `null` because no balance is inferred.