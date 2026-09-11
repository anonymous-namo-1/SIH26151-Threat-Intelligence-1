import re

from backend.app.models.schemas import (
    BlockchainEnrichmentRequest,
    BlockchainEnrichmentResponse,
    WalletEnrichment,
)


BTC_RE = re.compile(r"^(?:bc1[a-zA-Z0-9]{8,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$")
ETH_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")


class BlockchainEnrichmentService:
    """Classifies wallet indicators without querying private or illegal sources."""

    def enrich(
        self, request: BlockchainEnrichmentRequest
    ) -> BlockchainEnrichmentResponse:
        wallets = [self._enrich_wallet(wallet) for wallet in request.wallets]
        warnings = [
            "No live blockchain API was queried. Explorer URLs are public investigation references."
        ]
        return BlockchainEnrichmentResponse(wallets=wallets, warnings=warnings)

    def _enrich_wallet(self, address: str) -> WalletEnrichment:
        if ETH_RE.match(address):
            return WalletEnrichment(
                address=address,
                chain="ethereum",
                format_valid=True,
                risk_note="Valid Ethereum-format public wallet indicator.",
                public_explorer_urls=[f"https://etherscan.io/address/{address}"],
            )
        if BTC_RE.match(address):
            return WalletEnrichment(
                address=address,
                chain="bitcoin",
                format_valid=True,
                risk_note="Bitcoin-format wallet indicator. Treat synthetic labels as demo-only.",
                public_explorer_urls=[f"https://www.blockchain.com/explorer/addresses/btc/{address}"],
            )
        return WalletEnrichment(
            address=address,
            chain="unknown",
            format_valid=False,
            risk_note="Unrecognized wallet format or intentionally fake synthetic indicator.",
        )

