"""Pure analysis fixtures for the frontend renderer smoke test; no database."""
import json
from services.argus_analysis.modules import MODULE_NAMES, run_module

entities = [
    {"id": "a", "type": "PERSONA", "value": "Alpha", "aliases": ["shared"],
     "metadata": {"domains": ["example.invalid"], "timezone": "UTC", "platform": "A",
                  "timestamp": "2026-09-08T23:30:00-05:00"}},
    {"id": "b", "type": "PERSONA", "value": "Beta", "aliases": ["shared"],
     "metadata": {"domains": ["example.invalid"], "timezone": "UTC+2", "platform": "B",
                  "timestamp": "2026-09-09T04:31:00Z"}},
    {"id": "wallet", "type": "CRYPTO_WALLET", "value": "fictional-A",
     "metadata": {"public_blockchain_metadata": {"source": "fictional supplied record"}}},
    {"id": "tx", "type": "CRYPTO_TRANSACTION", "value": "TEST:hash", "metadata": {
        "hash": "hash", "from_address": "fictional-A", "to_address": "fictional-B",
        "amount": "0.123456789123456789", "asset": "TEST",
        "timestamp": "2026-09-09T04:30:00Z", "labels": ["fictional"]}},
    {"id": "later", "type": "POST", "value": "later",
     "metadata": {"platform": "B", "posted_at": "2026-10-10T04:30:00Z"}},
]
evidence = [
    {"id": "ev-a", "entity_ids": ["a", "wallet", "tx"], "content": "Alpha uses example.invalid UTC. " * 40,
     "source": "Fictional fixture", "content_hash": "a" * 64},
    {"id": "ev-b", "entity_ids": ["b", "later"], "content": "Beta uses example.invalid UTC+2. " * 40,
     "source": "Fictional fixture", "content_hash": "b" * 64},
]
relationships = [{"id": "rel", "source_id": "a", "target_id": "b", "type": "SAME_AS",
                  "evidence_ids": ["ev-a", "ev-b"], "confidence": 0.4, "explanation": "Supplied hypothesis"}]
options = {"left_id": "a", "right_id": "b", "corpus_left": ["Alpha sample. " * 40],
           "corpus_right": ["Beta sample. " * 40]}
fixtures = [run_module(name, entities, evidence, relationships, options) for name in sorted(MODULE_NAMES)]
fixtures += [run_module(name, [], [], [], options) for name in sorted(MODULE_NAMES - {"persona"})]
print(json.dumps(fixtures))