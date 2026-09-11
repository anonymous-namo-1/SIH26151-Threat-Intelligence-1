from fastapi import FastAPI

from backend.app.api.routes import router


app = FastAPI(
    title="Threat Intel Collector",
    version="0.1.0",
    description=(
        "Data collection layer for synthetic dark-web records and legal public "
        "OSINT enrichment."
    ),
)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(router, prefix="/api/v1")

