import argparse
import os

from sqlalchemy import select

from .database import Base, SessionLocal, engine
from .models import Audit, Role, User
from .seed_service import create_fictional_case


def init_db(development: bool) -> None:
    if not development:
        raise SystemExit("init-db is development-only; use Replit Publish schema management for production")
    Base.metadata.create_all(engine)
    print("ARGUS development schema initialized")


def provision_admin(clerk_sub: str, name: str) -> None:
    if not clerk_sub.strip():
        raise SystemExit("A known Clerk subject is required")
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.clerk_sub == clerk_sub))
        if not user:
            user = User(clerk_sub=clerk_sub, name=name, role=Role.ADMIN)
            db.add(user); db.flush()
        else:
            user.role, user.active = Role.ADMIN, True
        db.add(Audit(actor_id=user.id, action="admin.provisioned", resource_type="user",
                     resource_id=str(user.id), extra_metadata={"method": "cli", "clerk_sub": clerk_sub}))
        db.commit()
        print(f"Provisioned administrator {user.id}")


def seed_user(clerk_sub: str) -> None:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.clerk_sub == clerk_sub))
        if not user:
            raise SystemExit("User must sign in once before per-user seeding")
        try:
            case = create_fictional_case(db, user)
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc
        db.add(Audit(actor_id=user.id, case_id=case.id, action="workspace.seeded",
                     resource_type="case", resource_id=str(case.id),
                     extra_metadata={"method": "cli", "fictional": True}))
        db.commit()
        print(f"Seeded fictional case {case.id}")


def main() -> None:
    parser = argparse.ArgumentParser(description="ARGUS explicit development administration")
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init-db")
    init.add_argument("--development", action="store_true")
    admin = sub.add_parser("provision-admin")
    admin.add_argument("--clerk-sub", required=True)
    admin.add_argument("--name", default="ARGUS Administrator")
    seed = sub.add_parser("seed-user")
    seed.add_argument("--clerk-sub", required=True)
    args = parser.parse_args()
    if args.command == "init-db":
        init_db(args.development)
    elif args.command == "provision-admin":
        provision_admin(args.clerk_sub, args.name)
    else:
        seed_user(args.clerk_sub)


if __name__ == "__main__":
    main()