"""Read-only analysis of supplied transactions and explicit fictional fixtures."""

from __future__ import annotations
from decimal import Decimal, InvalidOperation, localcontext
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class BlockchainProvider(Protocol):
    def transactions(self, address: str) -> list[dict[str, Any]]: ...


class MockBlockchainProvider:
    """Returns only caller-provided, labeled fictional fixtures; never fetches."""
    def __init__(self, fixtures: dict[str, list[dict[str, Any]]], *, fictional: bool = False):
        if not fictional:
            raise ValueError("Mock fixtures require fictional=True")
        self._fixtures = fixtures

    def transactions(self, address: str) -> list[dict[str, Any]]:
        return [dict(x, fixture_label="fictional") for x in self._fixtures.get(address, [])[:1000]]


def analyze_wallets(entities: list[dict], evidence: list[dict] | None = None,
                    entity_id: str | None = None) -> dict[str, Any]:
    transactions: list[dict] = []
    public_metadata: list[dict[str, Any]] = []
    selected = next((entity for entity in entities[:1000] if isinstance(entity, dict)
                     and str(entity.get("id")) == str(entity_id)), None) if entity_id is not None else None
    selected_type = str(selected.get("type", "")).upper() if selected else ""
    selected_address = str(selected.get("value")) if selected and selected_type == "CRYPTO_WALLET" else None
    evidence_by_entity: dict[str, list[str]] = {}
    for item in (evidence or [])[:2000]:
        if not isinstance(item, dict) or item.get("id") is None:
            continue
        related_ids = item.get("entity_ids", item.get("related_entity_ids", []))
        for related in related_ids if isinstance(related_ids, list) else []:
            key = str(related.get("id") if isinstance(related, dict) else related)
            evidence_by_entity.setdefault(key, []).append(str(item["id"]))
    for entity in entities[:1000]:
        metadata = entity.get("metadata", {}) if isinstance(entity, dict) else {}
        record_entity_id = str(entity.get("id")) if isinstance(entity, dict) and entity.get("id") is not None else ""
        if isinstance(metadata, dict):
            supplied = metadata.get("public_blockchain_metadata", metadata.get("blockchain_metadata"))
            if isinstance(supplied, dict):
                public_metadata.append({"entity_id": entity.get("id"), "metadata": supplied})
        if isinstance(metadata, dict) and str(entity.get("type", "")).upper() == "CRYPTO_TRANSACTION":
            raw = [metadata]
        else:
            raw = metadata.get("transactions", []) if isinstance(metadata, dict) else []
        for tx in raw[:2000] if isinstance(raw, list) else []:
            if isinstance(tx, dict):
                row = {k: tx.get(k) for k in
                       ("hash", "from_address", "to_address", "amount", "asset", "timestamp", "labels")}
                row["entity_id"] = record_entity_id or None
                row["evidence_ids"] = evidence_by_entity.get(record_entity_id, [])[:50]
                if entity_id is None or (
                    selected_type == "CRYPTO_TRANSACTION" and record_entity_id == str(selected.get("id"))
                ) or (
                    selected_address is not None and selected_address in
                    {str(row.get("from_address")), str(row.get("to_address"))}
                ):
                    transactions.append(row)
    totals: dict[str, Decimal] = {}
    counterparties: dict[str, int] = {}
    graph_edges: list[dict[str, Any]] = []
    warnings: list[str] = []
    with localcontext() as context:
        context.prec = 120
        for tx in transactions:
            asset = str(tx.get("asset") or "unknown")
            amount = tx.get("amount")
            try:
                parsed_amount = Decimal(str(amount))
                if not parsed_amount.is_finite():
                    raise InvalidOperation
                totals[asset] = totals.get(asset, Decimal(0)) + parsed_amount
            except (InvalidOperation, ValueError):
                warnings.append(f"Transaction {tx.get('hash') or '(no hash)'} has an invalid amount")
            for key in ("from_address", "to_address"):
                if tx.get(key):
                    counterparties[str(tx[key])] = counterparties.get(str(tx[key]), 0) + 1
            graph_edges.append({
                "from_address": tx.get("from_address"), "to_address": tx.get("to_address"),
                "transaction_hash": tx.get("hash"), "amount": tx.get("amount"),
                "asset": tx.get("asset"), "timestamp": tx.get("timestamp"),
                "labels": tx.get("labels"), "evidence_ids": tx["evidence_ids"],
            })
    totals_json = {asset: format(value, "f") for asset, value in totals.items()}
    return {"transactions": transactions[:2000], "transaction_count": len(transactions),
            "totals_by_asset": totals_json, "counterparties": counterparties,
            "counterparty_graph": {"edges": graph_edges[:2000]},
            "timeline": sorted(transactions, key=lambda x: str(x.get("timestamp") or ""))[:2000],
            "public_metadata": public_metadata[:1000], "balances": None,
            "evidence_ids": sorted({eid for tx in transactions for eid in tx["evidence_ids"]}),
            "warnings": warnings[:100],
            "explanation": "Totals describe supplied transaction values, not wallet balances."}