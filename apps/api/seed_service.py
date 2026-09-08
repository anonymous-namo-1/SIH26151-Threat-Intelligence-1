import hashlib
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Case, Entity, Evidence, Relationship, User


TITLE = "Fictional Operation Glass Harbor"


def create_fictional_case(db: Session, user: User) -> Case:
    if db.scalar(select(Case).where(Case.created_by_id == user.id, Case.title == TITLE)):
        raise ValueError("Fictional seed already exists")
    case = Case(
        title=TITLE,
        description="Training-only fictional investigation using reserved example data.",
        priority="MEDIUM", classification="UNCLASSIFIED", created_by_id=user.id,
        tags=["fictional", "training"],
        notes="Historical training snapshot dated 2023-06-15. No real-person attribution.",
    )
    case.assignments = [user]
    db.add(case); db.flush()
    evidence_text = (
        "Fictional training record: persona HarborFox mentioned harbor-node.example.invalid, "
        "TEST-NET address 192.0.2.44, a deliberately invalid wallet, and a synthetic PGP key."
    )
    evidence = Evidence(
        case_id=case.id, type="MANUAL", source="ARGUS fictional training corpus",
        collected_at=datetime(2023, 6, 15, 12, 0, tzinfo=timezone.utc),
        collector_id=user.id, content_hash=hashlib.sha256(evidence_text.encode()).hexdigest(),
        content=evidence_text, reliability="B",
        notes="Synthetic source created solely for product demonstration.", entity_ids=[],
    )
    db.add(evidence); db.flush()
    definitions = [
        ("ACTOR_HYPOTHESIS", "Glass Harbor cluster", .35),
        ("PERSONA", "HarborFox (fictional)", .65),
        ("USERNAME", "harborfox_demo", .75),
        ("DOMAIN", "harbor-node.example.invalid", .90),
        ("IP_ADDRESS", "192.0.2.44", .90),
        ("CRYPTO_WALLET", "FICTIONAL_WALLET_NOT_VALID_7HARBOR", .20),
        ("PGP_KEY", "FFFF FFFF FFFF FFFF FFFF FFFF FFFF FFFF FFFF FFFF", .40),
    ]
    entities = [
        Entity(case_id=case.id, type=kind, value=value, source="Fictional training evidence",
               confidence=confidence, description="Synthetic indicator; not a real-world attribution.")
        for kind, value, confidence in definitions
    ]
    db.add_all(entities); db.flush()
    evidence.entity_ids = [str(item.id) for item in entities]
    links = [
        (0, 1, "ASSOCIATED_WITH", .35, "Fictional cluster hypothesis includes this persona."),
        (1, 2, "USES", .70, "Training source explicitly associates the handle with the persona."),
        (1, 3, "MENTIONED", .65, "Training source records a domain mention."),
        (3, 4, "RESOLVES_TO", .80, "Synthetic historical DNS observation."),
        (1, 5, "MENTIONED", .30, "Invalid training wallet was mentioned; ownership is unsupported."),
        (1, 6, "SIGNED_WITH", .40, "Synthetic key reference; requires human review."),
    ]
    for source, target, kind, confidence, explanation in links:
        db.add(Relationship(
            case_id=case.id, source_id=entities[source].id, target_id=entities[target].id,
            type=kind, confidence=confidence, evidence_ids=[str(evidence.id)],
            explanation=explanation, attribution="HUMAN", created_by=user.id,
        ))
    return case