import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.services.schwab_client import SchwabAuthError, SchwabAPIError, SchwabClient


def make_client():
    return SchwabClient(
        app_key="test_key",
        app_secret="test_secret",
        refresh_token="test_refresh",
    )


def mock_response(status_code, json_data=None, headers=None):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    resp.headers = headers or {}
    resp.text = str(json_data)
    return resp


# ------------------------------------------------------------------
# refresh_access_token
# ------------------------------------------------------------------

@pytest.mark.asyncio
async def test_refresh_access_token_success():
    client = make_client()
    resp = mock_response(200, {"access_token": "new_access", "refresh_token": "new_refresh"})
    client._http.post = AsyncMock(return_value=resp)

    access, refresh = await client.refresh_access_token()

    assert access == "new_access"
    assert refresh == "new_refresh"
    assert client._refresh_token == "new_refresh"


@pytest.mark.asyncio
async def test_refresh_access_token_failure_raises_auth_error():
    client = make_client()
    resp = mock_response(401, {"error": "invalid_grant"})
    client._http.post = AsyncMock(return_value=resp)

    with pytest.raises(SchwabAuthError):
        await client.refresh_access_token()


@pytest.mark.asyncio
async def test_refresh_access_token_keeps_old_refresh_if_not_returned():
    client = make_client()
    resp = mock_response(200, {"access_token": "new_access"})  # no refresh_token in response
    client._http.post = AsyncMock(return_value=resp)

    access, refresh = await client.refresh_access_token()

    assert access == "new_access"
    assert refresh == "test_refresh"  # original unchanged


# ------------------------------------------------------------------
# get_quote
# ------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_quote_success():
    client = make_client()
    resp = mock_response(200, {"SPUS": {"quote": {"lastPrice": 42.50}}})
    client._http.get = AsyncMock(return_value=resp)

    price = await client.get_quote("access_tok", "SPUS")

    assert price == 42.50


@pytest.mark.asyncio
async def test_get_quote_failure_raises_api_error():
    client = make_client()
    resp = mock_response(400, {"error": "bad symbol"})
    client._http.get = AsyncMock(return_value=resp)

    with pytest.raises(SchwabAPIError):
        await client.get_quote("access_tok", "INVALID")


# ------------------------------------------------------------------
# place_order
# ------------------------------------------------------------------

@pytest.mark.asyncio
async def test_place_order_success_during_market_hours():
    client = make_client()
    resp = mock_response(201, {}, headers={"Location": "/accounts/hash123/orders/9876"})
    client._http.post = AsyncMock(return_value=resp)

    with patch.object(client, "_is_market_open", return_value=True):
        order_id, status = await client.place_order("access_tok", "hash123", "SPUS", 3)

    assert order_id == "9876"
    assert status == "WORKING"


@pytest.mark.asyncio
async def test_place_order_raises_when_market_closed():
    client = make_client()

    with patch.object(client, "_is_market_open", return_value=False):
        with pytest.raises(SchwabAPIError, match="Market is closed"):
            await client.place_order("access_tok", "hash123", "SPUS", 1)


@pytest.mark.asyncio
async def test_place_order_raises_on_api_error():
    client = make_client()
    resp = mock_response(400, {"error": "insufficient funds"})
    client._http.post = AsyncMock(return_value=resp)

    with patch.object(client, "_is_market_open", return_value=True):
        with pytest.raises(SchwabAPIError):
            await client.place_order("access_tok", "hash123", "SPUS", 1)
