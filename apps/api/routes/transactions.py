"""Explicit investigator-approved import of supplied cryptocurrency records."""
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..database import get_db
from ..models import Case, Entity, Evidence, Relationship, User
from ..rbac import audit, get_visible_case, require
from ..redis_service import invalidate_case

router = APIRouter()


class TransactionRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    hash: str = Field(min_length=1, max_length=256)
    from_address: str = Field(min_length=1, max_length=256)
    to_address: str = Field(min_length=1, max_length=256)
    amount: str = Field(pattern=r"^\d{1,30}(\.\d{1,18})?$")
    asset: str = Field(min_length=1, max_length=30)
    timestamp: AwareDatetime
    labels: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("labels")
    @classmethod
    def bounded_labels(cls, labels):
        if any(not label.strip() or len(label) > 120 for label in labels):
            raise ValueError("Labels must contain 1–120 characters")
        return labels


class TransactionImportInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    evidence_id: uuid.UUID
    transactions: list[TransactionRecord] = Field(min_length=1, max_length=200)


@router.post("/cases/{case_id}/transactions/import", status_code=201)
def import_transactions(case_id: uuid.UUID, data: TransactionImportInput,
                        db: Session = Depends(get_db), user: User = Depends(current_user)):
    require(user, "case:edit")
    require(user, "evidence:write")
    get_visible_case(db, user, case_id)
    db.scalar(select(Case).where(Case.id == case_id).with_for_update())
    evidence = db.scalar(select(Evidence).where(Evidence.id == data.evidence_id,
                                                Evidence.case_id == case_id).with_for_update())
    if evidence is None:
        raise HTTPException(404, "Source evidence not found in this case")
    entity_ids, created, existing = [], 0, 0
    related = set(evidence.entity_ids or [])
    for row in data.transactions:
        metadata = row.model_dump(mode="json")
        # Case-sensitive addresses/hashes must not be globally lowercased.
        metadata["asset"] = row.asset.upper()
        # Decimal.normalize() uses the active arithmetic context and rounds long
        # amounts. Formatting is exact; trim only insignificant fractional zeros.
        amount = format(Decimal(row.amount), "f")
        metadata["amount"] = amount.rstrip("0").rstrip(".") if "." in amount else amount
        metadata["evidence_ids"] = [str(evidence.id)]
        metadata["provenance"] = "investigator-supplied; not independently verified on-chain"
        key = f"{metadata['asset']}:{row.hash}"
        found = db.scalar(select(Entity).where(Entity.case_id == case_id,
                                              Entity.type == "CRYPTO_TRANSACTION", Entity.value == key))
        if found:
            if any(found.extra_metadata.get(key) != value for key, value in metadata.items()
                   if key not in {"evidence_ids", "provenance"}):
                raise HTTPException(409, "A transaction with this asset/hash already has different data")
            entity_ids.append(str(found.id))
            existing += 1
            continue
        wallets = []
        for address in (row.from_address, row.to_address):
            wallet = db.scalar(select(Entity).where(Entity.case_id == case_id,
                                                     Entity.type == "CRYPTO_WALLET", Entity.value == address))
            if wallet is None:
                wallet = Entity(case_id=case_id, type="CRYPTO_WALLET", value=address,
                                source=evidence.source, confidence=0.5,
                                extra_metadata={"provenance": metadata["provenance"]})
                db.add(wallet)
                db.flush()
            related.add(str(wallet.id))
            wallets.append(wallet)
        tx = Entity(case_id=case_id, type="CRYPTO_TRANSACTION", value=key,
                    description="Investigator-approved supplied transaction; not independently verified on-chain.",
                    source=evidence.source, first_seen=row.timestamp, last_seen=row.timestamp,
                    confidence=0.5, tags=row.labels, extra_metadata=metadata)
        db.add(tx)
        db.flush()
        entity_ids.append(str(tx.id))
        related.add(str(tx.id))
        if wallets[0].id != wallets[1].id:
            db.add(Relationship(case_id=case_id, source_id=wallets[0].id, target_id=wallets[1].id,
                                type="TRANSACTED_WITH", confidence=0.5, evidence_ids=[str(evidence.id)],
                                explanation=f"Supplied {metadata['asset']} transaction {row.hash}; not an ownership claim.",
                                attribution="HUMAN", created_by=user.id))
        created += 1
    evidence.entity_ids = sorted(related)
    audit(db, user, "transactions.imported", "evidence", evidence.id, case_id,
          {"created": created, "existing": existing})
    db.commit()
    invalidate_case(case_id)
    return {"created": created, "existing": existing, "entity_ids": entity_ids}