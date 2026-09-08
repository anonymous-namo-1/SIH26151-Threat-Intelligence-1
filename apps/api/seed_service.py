"""Opt-in, per-user seed data for the entirely fictional Nightglass demo."""

import hashlib
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Case, Entity, Evidence, Relationship, User


TITLE = "Operation Nightglass"
FICTION_NOTICE = (
    "Entirely fictional training data. Names and indicators are invented; domains use "
    "reserved invalid namespaces, IPs use documentation ranges, and keys, wallets, and "
    "transaction identifiers are deliberately unusable."
)


def _time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def create_fictional_case(db: Session, user: User) -> Case:
    """Create one complete Nightglass case for ``user`` without committing it.

    The caller deliberately opts in and owns the transaction. Refusing a second
    seed keeps the operation idempotent without modifying an existing demo case.
    """
    # Serialize seed attempts for this owner before checking the natural
    # per-user seed identity. PostgreSQL holds this row lock until the caller
    # commits or rolls back, so concurrent requests cannot both pass the check.
    # SQLite intentionally ignores FOR UPDATE but remains suitable for
    # single-process disposable integration tests.
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    if db.scalar(select(Case).where(Case.created_by_id == user.id, Case.title == TITLE)):
        raise ValueError("Operation Nightglass seed already exists for this user")

    case = Case(
        title=TITLE,
        description=(
            "Training investigation into whether three invented personas reused fictional "
            "infrastructure and payment indicators. All identity conclusions remain hypotheses."
        ),
        priority="HIGH",
        classification="UNCLASSIFIED",
        created_by_id=user.id,
        tags=["fictional", "training", "evidence-first", "nightglass"],
        notes=f"Scenario snapshot: 2024-02-01 through 2024-04-18. {FICTION_NOTICE}",
    )
    case.assignments = [user]
    db.add(case)
    db.flush()

    definitions = {
        "cluster": ("ACTOR_HYPOTHESIS", "Nightglass Cluster #NG-1042", 0.48, {}, []),
        "null": (
            "PERSONA", "NullRaven", 0.78,
            {
                "aliases": ["null_raven"],
                "pgp_keys": ["DEMO-NIGHTGLASS-KEY-A-NOT-A-VALID-FINGERPRINT"],
                "wallets": ["NG-DEMO-WALLET-A-INVALID"],
                "domains": ["relay-nightglass.example.invalid"],
                "timezone": "UTC+01:00",
            },
            ["fictional", "persona", "hypothesis-subject"],
        ),
        "cipher": (
            "PERSONA", "CipherWolf", 0.72,
            {
                "aliases": ["cipher_wolf"],
                "pgp_keys": ["DEMO-NIGHTGLASS-KEY-A-NOT-A-VALID-FINGERPRINT"],
                "wallets": ["NG-DEMO-WALLET-A-INVALID"],
                "domains": ["relay-nightglass.example.invalid"],
                "timezone": "UTC-05:00",
            },
            ["fictional", "persona", "hypothesis-subject"],
        ),
        "grey": (
            "PERSONA", "GreyMerchant", 0.69,
            {
                "aliases": ["grey_merchant"],
                "wallets": ["NG-DEMO-WALLET-B-INVALID"],
                "domains": ["market-nightglass.example.invalid"],
                "timezone": "UTC+00:00",
            },
            ["fictional", "persona"],
        ),
        "null_user": ("USERNAME", "null_raven", 0.92, {"platform": "Obsidian Forum (fictional)"}, []),
        "cipher_user": ("USERNAME", "cipher_wolf", 0.91, {"platform": "Lattice Board (fictional)"}, []),
        "grey_user": ("USERNAME", "grey_merchant", 0.90, {"platform": "Obsidian Forum (fictional)"}, []),
        "relay_domain": (
            "DOMAIN", "relay-nightglass.example.invalid", 0.95,
            {"ip_addresses": ["192.0.2.77"], "observed_at": "2024-02-10T21:18:00Z"}, [],
        ),
        "market_domain": (
            "DOMAIN", "market-nightglass.example.invalid", 0.94,
            {"ip_addresses": ["198.51.100.42"], "observed_at": "2024-03-22T16:10:00Z"}, [],
        ),
        "relay_ip": (
            "IP_ADDRESS", "192.0.2.77", 0.95,
            {"domains": ["relay-nightglass.example.invalid"], "observed_at": "2024-02-10T21:18:00Z"}, [],
        ),
        "market_ip": (
            "IP_ADDRESS", "198.51.100.42", 0.95,
            {"domains": ["market-nightglass.example.invalid"], "observed_at": "2024-03-22T16:10:00Z"}, [],
        ),
        "wallet_a": (
            "CRYPTO_WALLET", "NG-DEMO-WALLET-A-INVALID", 0.82,
            {"network": "ARGUS_SIMULATED_LEDGER", "fixture": "fictional"}, [],
        ),
        "wallet_b": (
            "CRYPTO_WALLET", "NG-DEMO-WALLET-B-INVALID", 0.80,
            {"network": "ARGUS_SIMULATED_LEDGER", "fixture": "fictional"}, [],
        ),
        "pgp_a": (
            "PGP_KEY", "DEMO-NIGHTGLASS-KEY-A-NOT-A-VALID-FINGERPRINT", 0.83,
            {"valid_key": False, "fixture": "fictional"}, [],
        ),
        "pgp_b": (
            "PGP_KEY", "DEMO-NIGHTGLASS-KEY-B-NOT-A-VALID-FINGERPRINT", 0.76,
            {"valid_key": False, "fixture": "fictional"}, [],
        ),
        "post_null": (
            "FORUM_POST", "NG-POST-001", 0.90,
            {"posted_at": "2024-02-01T22:14:00Z", "platform": "Obsidian Forum (fictional)"}, [],
        ),
        "post_cipher": (
            "FORUM_POST", "NG-POST-002", 0.88,
            {"posted_at": "2024-02-19T03:16:00Z", "platform": "Lattice Board (fictional)"}, [],
        ),
        "post_grey": (
            "FORUM_POST", "NG-POST-003", 0.87,
            {"posted_at": "2024-03-22T16:10:00Z", "platform": "Obsidian Forum (fictional)"}, [],
        ),
        "message_one": (
            "MESSAGE", "NG-MESSAGE-041", 0.84,
            {"published_at": "2024-03-05T23:40:00Z", "platform": "Nightglass Mail (fictional)"}, [],
        ),
        "message_two": (
            "MESSAGE", "NG-MESSAGE-052", 0.81,
            {"published_at": "2024-04-18T09:05:00Z", "platform": "Nightglass Mail (fictional)"}, [],
        ),
        "tx_one": (
            "CRYPTO_TRANSACTION", "NG-SIMULATED-TX-0001", 0.91,
            {
                "hash": "NG-SIMULATED-TX-0001",
                "from_address": "NG-DEMO-WALLET-A-INVALID",
                "to_address": "NG-DEMO-WALLET-B-INVALID",
                "amount": "12.5000",
                "asset": "NGC-DEMO",
                "timestamp": "2024-03-06T00:02:00Z",
                "labels": ["fictional", "supplied-record"],
            },
            [],
        ),
        "tx_two": (
            "CRYPTO_TRANSACTION", "NG-SIMULATED-TX-0002", 0.89,
            {
                "hash": "NG-SIMULATED-TX-0002",
                "from_address": "NG-DEMO-WALLET-B-INVALID",
                "to_address": "NG-DEMO-WALLET-A-INVALID",
                "amount": "4.2500",
                "asset": "NGC-DEMO",
                "timestamp": "2024-04-18T09:09:00Z",
                "labels": ["fictional", "supplied-record"],
            },
            [],
        ),
    }

    entities: dict[str, Entity] = {}
    for key, (kind, value, confidence, metadata, tags) in definitions.items():
        timestamp = metadata.get("posted_at") or metadata.get("published_at") or metadata.get("timestamp")
        entity = Entity(
            case_id=case.id,
            type=kind,
            value=value,
            aliases=metadata.get("aliases", []),
            source="ARGUS Operation Nightglass fictional corpus",
            confidence=confidence,
            description=f"{FICTION_NOTICE} Record role: {kind.lower().replace('_', ' ')}.",
            first_seen=_time(timestamp) if timestamp else None,
            last_seen=_time(timestamp) if timestamp else None,
            tags=["nightglass", *tags],
            extra_metadata=metadata,
        )
        db.add(entity)
        entities[key] = entity
    db.flush()

    evidence_definitions = [
        (
            "nr_post", "FORUM_POST", "Fictional Obsidian Forum export", "2024-02-01T22:20:00Z", "B",
            ["null", "null_user", "post_null", "relay_domain", "pgp_a"],
            (
                "NG-POST-001 by NullRaven (null_raven), posted 2024-02-01T22:14:00Z: "
                "'Use relay-nightglass.example.invalid. Sign only with "
                "DEMO-NIGHTGLASS-KEY-A-NOT-A-VALID-FINGERPRINT. Quiet channels, measured steps.'"
            ),
        ),
        (
            "cw_post", "FORUM_POST", "Fictional Lattice Board export", "2024-02-19T03:20:00Z", "B",
            ["cipher", "cipher_user", "post_cipher", "relay_domain", "pgp_a"],
            (
                "NG-POST-002 by CipherWolf (cipher_wolf), posted 2024-02-19T03:16:00Z: "
                "'Use relay-nightglass.example.invalid. Sign only with "
                "DEMO-NIGHTGLASS-KEY-A-NOT-A-VALID-FINGERPRINT. Quiet channels, measured steps.'"
            ),
        ),
        (
            "nr_wallet", "MESSAGE", "Fictional Nightglass Mail export", "2024-03-05T23:45:00Z", "B",
            ["null", "message_one", "wallet_a", "tx_one"],
            (
                "NG-MESSAGE-041 attributed in the supplied export to NullRaven references "
                "NG-DEMO-WALLET-A-INVALID and NG-SIMULATED-TX-0001 for 12.5000 NGC-DEMO "
                "at 2024-03-06T00:02:00Z."
            ),
        ),
        (
            "cw_wallet", "MESSAGE", "Fictional Lattice Board archive", "2024-03-06T00:10:00Z", "C",
            ["cipher", "wallet_a", "tx_one"],
            (
                "A CipherWolf archive entry independently references NG-DEMO-WALLET-A-INVALID "
                "and NG-SIMULATED-TX-0001. It records destination NG-DEMO-WALLET-B-INVALID "
                "and amount 12.5000 NGC-DEMO."
            ),
        ),
        (
            "grey_market", "FORUM_POST", "Fictional Obsidian Forum export", "2024-03-22T16:15:00Z", "B",
            ["grey", "grey_user", "post_grey", "market_domain", "market_ip", "wallet_b", "pgp_b"],
            (
                "NG-POST-003 by GreyMerchant (grey_merchant), posted 2024-03-22T16:10:00Z, "
                "mentions market-nightglass.example.invalid, documentation IP 198.51.100.42, "
                "NG-DEMO-WALLET-B-INVALID, and DEMO-NIGHTGLASS-KEY-B-NOT-A-VALID-FINGERPRINT."
            ),
        ),
        (
            "dns", "DNS_OBSERVATION", "Fictional passive DNS snapshot", "2024-02-10T21:18:00Z", "A",
            ["relay_domain", "relay_ip", "null", "cipher"],
            (
                "Synthetic passive record at 2024-02-10T21:18:00Z maps "
                "relay-nightglass.example.invalid to reserved documentation address 192.0.2.77. "
                "The record is linked to NullRaven and CipherWolf only because both cited the domain."
            ),
        ),
        (
            "identity_support", "ANALYST_NOTE", "Fictional analyst hypothesis note", "2024-04-02T12:00:00Z", "C",
            ["cluster", "null", "cipher", "pgp_a", "wallet_a"],
            (
                "HYPOTHESIS H1: NullRaven and CipherWolf may represent the same operator because "
                "both independently reference DEMO-NIGHTGLASS-KEY-A-NOT-A-VALID-FINGERPRINT and "
                "NG-DEMO-WALLET-A-INVALID. Reuse can occur and does not establish identity."
            ),
        ),
        (
            "null_timezone", "OBSERVATION", "Fictional posting-window worksheet", "2024-04-03T10:00:00Z", "C",
            ["null"],
            "Observed NullRaven posting-window hypothesis: timezone UTC+01:00. This is not a location fact.",
        ),
        (
            "cipher_timezone", "OBSERVATION", "Fictional posting-window worksheet", "2024-04-03T10:05:00Z", "C",
            ["cipher"],
            "Observed CipherWolf posting-window hypothesis: timezone UTC-05:00. This is not a location fact.",
        ),
        (
            "identity_denial", "ANALYST_NOTE", "Fictional analyst competing hypothesis note",
            "2024-04-04T14:00:00Z", "C", ["cluster", "null", "cipher"],
            (
                "COMPETING HYPOTHESIS H2: NullRaven and CipherWolf may be distinct operators. Their "
                "cited posting-window hypotheses differ (UTC+01:00 versus UTC-05:00), and shared "
                "indicators could reflect deliberate team reuse. No factual identity ruling is made."
            ),
        ),
        (
            "return_tx", "TRANSACTION_RECORD", "ARGUS simulated ledger export", "2024-04-18T09:12:00Z", "A",
            ["grey", "message_two", "wallet_a", "wallet_b", "tx_two"],
            (
                "Supplied fictional ledger record NG-SIMULATED-TX-0002 at 2024-04-18T09:09:00Z: "
                "NG-DEMO-WALLET-B-INVALID to NG-DEMO-WALLET-A-INVALID, 4.2500 NGC-DEMO. "
                "NG-MESSAGE-052 attributed to GreyMerchant mentions the same simulated identifier."
            ),
        ),
    ]

    evidence: dict[str, Evidence] = {}
    for key, kind, source, collected_at, reliability, related, content in evidence_definitions:
        item = Evidence(
            case_id=case.id,
            type=kind,
            source=source,
            source_url=f"https://nightglass-evidence.example.invalid/{key}",
            collected_at=_time(collected_at),
            collector_id=user.id,
            content_hash=hashlib.sha256(content.encode()).hexdigest(),
            content=content,
            reliability=reliability,
            notes=f"{FICTION_NOTICE} Classification: supplied {kind.lower().replace('_', ' ')}.",
            entity_ids=[str(entities[name].id) for name in related],
        )
        db.add(item)
        evidence[key] = item
    db.flush()

    links = [
        ("cluster", "null", "ASSOCIATED_WITH", 0.74, ["identity_support"], "H1 places NullRaven in the fictional cluster."),
        ("cluster", "cipher", "ASSOCIATED_WITH", 0.70, ["identity_support"], "H1 places CipherWolf in the fictional cluster."),
        ("cluster", "grey", "ASSOCIATED_WITH", 0.61, ["grey_market", "return_tx"], "Cited wallet flow links GreyMerchant to the case hypothesis."),
        ("null", "null_user", "USES", 0.94, ["nr_post"], "The supplied post explicitly names persona and username."),
        ("cipher", "cipher_user", "USES", 0.93, ["cw_post"], "The supplied post explicitly names persona and username."),
        ("grey", "grey_user", "USES", 0.92, ["grey_market"], "The supplied post explicitly names persona and username."),
        ("null", "relay_domain", "MENTIONED", 0.91, ["nr_post"], "NullRaven's supplied post explicitly mentions the reserved domain."),
        ("cipher", "relay_domain", "MENTIONED", 0.90, ["cw_post"], "CipherWolf's supplied post explicitly mentions the reserved domain."),
        ("relay_domain", "relay_ip", "RESOLVES_TO", 0.96, ["dns"], "Synthetic DNS evidence explicitly records this historical mapping."),
        ("grey", "market_domain", "MENTIONED", 0.88, ["grey_market"], "GreyMerchant's supplied post mentions the reserved domain."),
        ("market_domain", "market_ip", "RESOLVES_TO", 0.92, ["grey_market"], "The fictional post export contains this reserved mapping."),
        ("null", "pgp_a", "MENTIONED", 0.82, ["nr_post"], "Post text mentions the deliberately invalid key; signing is not established."),
        ("cipher", "pgp_a", "MENTIONED", 0.81, ["cw_post"], "Post text mentions the deliberately invalid key; signing is not established."),
        ("grey", "pgp_b", "MENTIONED", 0.74, ["grey_market"], "Post text mentions the deliberately invalid key; signing is not established."),
        ("null", "wallet_a", "MENTIONED", 0.84, ["nr_wallet"], "Message evidence mentions the invalid demo wallet; ownership is not asserted."),
        ("cipher", "wallet_a", "MENTIONED", 0.78, ["cw_wallet"], "Archive evidence mentions the invalid demo wallet; ownership is not asserted."),
        ("grey", "wallet_b", "MENTIONED", 0.82, ["grey_market", "return_tx"], "Two supplied records mention the invalid demo wallet."),
        ("wallet_a", "tx_one", "PARTICIPATED_IN", 0.93, ["nr_wallet", "cw_wallet"], "Both supplied records cite this simulated transaction."),
        ("wallet_b", "tx_one", "PARTICIPATED_IN", 0.90, ["cw_wallet"], "The supplied destination field cites this invalid wallet."),
        ("wallet_b", "tx_two", "PARTICIPATED_IN", 0.94, ["return_tx"], "The simulated ledger cites this invalid source wallet."),
        ("wallet_a", "tx_two", "PARTICIPATED_IN", 0.94, ["return_tx"], "The simulated ledger cites this invalid destination wallet."),
        (
            "null", "cipher", "SAME_PERSON_AS", 0.58, ["identity_support"],
            "Accepted analyst hypothesis H1: shared cited indicators support possible identity, not a fact.",
        ),
        (
            "null", "cipher", "DISTINCT_FROM", 0.44, ["null_timezone", "cipher_timezone", "identity_denial"],
            "Accepted competing analyst hypothesis H2: cited timezones support possible distinction, not a fact.",
        ),
    ]
    for source, target, kind, confidence, citations, explanation in links:
        db.add(Relationship(
            case_id=case.id,
            source_id=entities[source].id,
            target_id=entities[target].id,
            type=kind,
            confidence=confidence,
            evidence_ids=[str(evidence[name].id) for name in citations],
            explanation=explanation,
            attribution="HUMAN",
            created_by=user.id,
        ))

    return case