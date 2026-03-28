import base64
import logging
from datetime import datetime, time

import httpx
import pytz

logger = logging.getLogger(__name__)

_SCHWAB_TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token"
_SCHWAB_TRADER_URL = "https://api.schwabapi.com/trader/v1"
_SCHWAB_MARKET_URL = "https://api.schwabapi.com/marketdata/v1"

_ET = pytz.timezone("America/New_York")
_MARKET_OPEN = time(9, 30)
_MARKET_CLOSE = time(16, 0)


class SchwabAuthError(Exception):
    """Raised when Schwab OAuth / token refresh fails."""


class SchwabAPIError(Exception):
    """Raised when a Schwab API call returns a non-2xx response."""


class SchwabClient:
    def __init__(self, app_key: str, app_secret: str, refresh_token: str):
        self._app_key = app_key
        self._app_secret = app_secret
        self._refresh_token = refresh_token
        self._http = httpx.AsyncClient(timeout=30.0)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _basic_auth(self) -> str:
        raw = f"{self._app_key}:{self._app_secret}"
        return base64.b64encode(raw.encode()).decode()

    def _is_market_open(self) -> bool:
        now = datetime.now(_ET)
        if now.weekday() >= 5:  # Saturday=5, Sunday=6
            return False
        return _MARKET_OPEN <= now.time() < _MARKET_CLOSE

    async def _close(self):
        await self._http.aclose()

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------

    async def refresh_access_token(self) -> tuple:
        """Returns (access_token, new_refresh_token). Caller must save new_refresh_token to DB."""
        logger.debug("Refreshing Schwab access token")
        resp = await self._http.post(
            _SCHWAB_TOKEN_URL,
            headers={
                "Authorization": f"Basic {self._basic_auth()}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "refresh_token",
                "refresh_token": self._refresh_token,
            },
        )
        if resp.status_code != 200:
            logger.debug("Token refresh failed: %s %s", resp.status_code, resp.text)
            raise SchwabAuthError(f"Token refresh failed: {resp.status_code} {resp.text}")

        data = resp.json()
        access_token = data["access_token"]
        new_refresh_token = data.get("refresh_token", self._refresh_token)
        self._refresh_token = new_refresh_token
        logger.debug("Token refresh succeeded")
        return access_token, new_refresh_token

    # ------------------------------------------------------------------
    # Account data
    # ------------------------------------------------------------------

    async def get_account_hashes(self, access_token: str) -> dict:
        """Returns {accountNumber: hashValue} for all linked accounts."""
        logger.debug("Fetching account hashes")
        resp = await self._http.get(
            f"{_SCHWAB_TRADER_URL}/accounts/accountNumbers",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if resp.status_code != 200:
            raise SchwabAPIError(f"get_account_hashes failed: {resp.status_code} {resp.text}")

        return {item["accountNumber"]: item["hashValue"] for item in resp.json()}

    async def get_all_balances(self, access_token: str) -> list:
        """Returns a list of account balance dicts."""
        logger.debug("Fetching all account balances")
        resp = await self._http.get(
            f"{_SCHWAB_TRADER_URL}/accounts",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"fields": "positions"},
        )
        if resp.status_code != 200:
            raise SchwabAPIError(f"get_all_balances failed: {resp.status_code} {resp.text}")

        return resp.json()

    # ------------------------------------------------------------------
    # Market data
    # ------------------------------------------------------------------

    async def search_instruments(self, access_token: str, query: str) -> list:
        """Returns up to 10 matching instruments [{symbol, description}]."""
        resp = await self._http.get(
            f"{_SCHWAB_MARKET_URL}/instruments",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"symbol": query, "projection": "symbol-search"},
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        instruments = data.get("instruments", [])
        return [
            {"symbol": i["symbol"], "description": i.get("description", "")}
            for i in instruments
            if i.get("assetType") in ("EQUITY", "ETF", "MUTUAL_FUND")
        ][:10]

    async def get_quote(self, access_token: str, symbol: str) -> float:
        """Returns the last price for a symbol."""
        logger.debug("Fetching quote for %s", symbol)
        resp = await self._http.get(
            f"{_SCHWAB_MARKET_URL}/quotes",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"symbols": symbol, "fields": "quote"},
        )
        if resp.status_code != 200:
            raise SchwabAPIError(f"get_quote failed for {symbol}: {resp.status_code} {resp.text}")

        data = resp.json()
        return float(data[symbol]["quote"]["lastPrice"])

    # ------------------------------------------------------------------
    # Orders
    # ------------------------------------------------------------------

    async def place_order(
        self, access_token: str, account_hash: str, symbol: str, shares: int
    ) -> tuple:
        """
        Places a market buy order. Returns (order_id, status).
        Raises SchwabAPIError if market is closed or order placement fails.
        """
        if not self._is_market_open():
            raise SchwabAPIError("Market is closed — orders can only be placed 9:30–16:00 ET on weekdays")

        logger.debug("Placing order: %s x%d", symbol, shares)

        order_payload = {
            "orderType": "MARKET",
            "session": "NORMAL",
            "duration": "DAY",
            "orderStrategyType": "SINGLE",
            "orderLegCollection": [
                {
                    "instruction": "BUY",
                    "quantity": shares,
                    "instrument": {
                        "symbol": symbol,
                        "assetType": "EQUITY",
                    },
                }
            ],
        }

        resp = await self._http.post(
            f"{_SCHWAB_TRADER_URL}/accounts/{account_hash}/orders",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json=order_payload,
        )

        if resp.status_code not in (200, 201):
            raise SchwabAPIError(f"place_order failed for {symbol}: {resp.status_code} {resp.text}")

        # Order ID is returned in the Location header
        location = resp.headers.get("Location", "")
        order_id = location.rstrip("/").split("/")[-1] if location else "unknown"
        logger.debug("Order placed: id=%s", order_id)
        return order_id, "WORKING"
