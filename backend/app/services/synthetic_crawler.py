import json
from functools import lru_cache
from pathlib import Path

from backend.app.models.schemas import SyntheticSourceRecord


SYNTHETIC_PATH = Path(__file__).resolve().parents[1] / "data" / "synthetic_darkweb_seed.json"


class SyntheticCrawlerSimulator:
    """Offline crawler simulator for fake dark-web records only."""

    @lru_cache(maxsize=1)
    def load_records(self) -> list[SyntheticSourceRecord]:
        with SYNTHETIC_PATH.open("r", encoding="utf-8") as file:
            return [SyntheticSourceRecord(**record) for record in json.load(file)]

    def get_record(self, record_id: str) -> SyntheticSourceRecord | None:
        for record in self.load_records():
            if record.id == record_id:
                return record
        return None
