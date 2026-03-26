import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.services.invest_engine import InvestEngine, InvestResult, OrderResult, _extract_cash


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def make_account(
    id=1, user_id=1, account_number="12345", account_name="Test",
    rotation_state=0, min_order_value=1.0, remainder_symbol="SPUS",
    refresh_token_enc="enc_token",
):
    acct = MagicMock()
    acct.id = id
    acct.user_id = user_id
    acct.account_number = account_number
    acct.account_name = account_name
    acct.rotation_state = rotation_state
    acct.min_order_value = min_order_value
    acct.remainder_symbol = remainder_symbol
    acct.refresh_token_enc = refresh_token_enc
    acct.get_app_key.return_value = "key"
    acct.get_app_secret.return_value = "secret"
    acct.get_refresh_token.return_value = "refresh"
    return acct


def make_allocation(symbol, target_pct, display_order):
    a = MagicMock()
    a.symbol = symbol
    a.target_pct = target_pct
    a.display_order = display_order
    return a


def make_engine(db=None):
    return InvestEngine(db=db or AsyncMock(), user_id=1)


# ------------------------------------------------------------------
# Test 1: Rotation ordering
# ------------------------------------------------------------------

@pytest.mark.asyncio
async def test_rotation_advances_order():
    """Run 1 starts [SPUS, IAU, VDE]; rotation_state advances to 1."""
    engine = make_engine()
    account = make_account(rotation_state=0)
    allocations = [
        make_allocation("SPUS", 50, 0),
        make_allocation("IAU", 30, 1),
        make_allocation("VDE", 20, 2),
    ]

    db = AsyncMock()
    engine._db = db

    # Patch DB queries
    account_result = MagicMock()
    account_result.scalar_one_or_none.return_value = account

    alloc_result = MagicMock()
    alloc_result.scalars.return_value.all.return_value = allocations

    log_result = MagicMock()

    db.execute = AsyncMock(side_effect=[account_result, alloc_result, log_result, log_result, log_result, log_result])

    with patch("backend.services.invest_engine.SchwabClient") as MockClient:
        client = MockClient.return_value
        client.refresh_access_token = AsyncMock(return_value=("access_tok", "new_refresh"))
        client.get_account_hashes = AsyncMock(return_value={"12345": "hash123"})
        client.get_all_balances = AsyncMock(return_value=[{
            "securitiesAccount": {
                "accountNumber": "12345",
                "currentBalances": {"cashAvailableForTrading": 1000.0},
            }
        }])
        client.get_quote = AsyncMock(return_value=168.0)

        result = await engine.run_account(1, dry_run=True)

    # First order should be SPUS (rotation_state=0, no rotation)
    assert result.orders[0].symbol == "SPUS"
    assert result.orders[1].symbol == "IAU"
    assert result.orders[2].symbol == "VDE"
    # rotation_state advanced
    assert account.rotation_state == 1


# ------------------------------------------------------------------
# Test 2: Whole shares only (floor division)
# ------------------------------------------------------------------

@pytest.mark.asyncio
async def test_whole_shares_floor():
    """$500 cash, 50% alloc, price $168 -> 1 share (not 1.48)."""
    engine = make_engine()
    account = make_account(rotation_state=0, min_order_value=1.0)
    allocations = [make_allocation("SPUS", 100, 0)]

    db = AsyncMock()
    engine._db = db

    account_result = MagicMock()
    account_result.scalar_one_or_none.return_value = account
    alloc_result = MagicMock()
    alloc_result.scalars.return_value.all.return_value = allocations
    log_result = MagicMock()

    db.execute = AsyncMock(side_effect=[account_result, alloc_result, log_result, log_result])

    with patch("backend.services.invest_engine.SchwabClient") as MockClient:
        client = MockClient.return_value
        client.refresh_access_token = AsyncMock(return_value=("tok", "new_ref"))
        client.get_account_hashes = AsyncMock(return_value={"12345": "hash"})
        client.get_all_balances = AsyncMock(return_value=[{
            "securitiesAccount": {
                "accountNumber": "12345",
                "currentBalances": {"cashAvailableForTrading": 500.0},
            }
        }])
        client.get_quote = AsyncMock(return_value=168.0)

        result = await engine.run_account(1, dry_run=True)

    spus_order = next(o for o in result.orders if o.symbol == "SPUS" and not o.is_remainder)
    assert spus_order.shares == 2  # int(500 * 1.0 / 168) = int(2.976) = 2


# ------------------------------------------------------------------
# Test 3: dry_run=True -> status DRY_RUN, no HTTP order calls
# ------------------------------------------------------------------

@pytest.mark.asyncio
async def test_dry_run_no_orders_placed():
    engine = make_engine()
    account = make_account()
    allocations = [make_allocation("SPUS", 100, 0)]

    db = AsyncMock()
    engine._db = db

    account_result = MagicMock()
    account_result.scalar_one_or_none.return_value = account
    alloc_result = MagicMock()
    alloc_result.scalars.return_value.all.return_value = allocations
    log_result = MagicMock()

    db.execute = AsyncMock(side_effect=[account_result, alloc_result, log_result, log_result])

    with patch("backend.services.invest_engine.SchwabClient") as MockClient:
        client = MockClient.return_value
        client.refresh_access_token = AsyncMock(return_value=("tok", "new_ref"))
        client.get_account_hashes = AsyncMock(return_value={"12345": "hash"})
        client.get_all_balances = AsyncMock(return_value=[{
            "securitiesAccount": {
                "accountNumber": "12345",
                "currentBalances": {"cashAvailableForTrading": 500.0},
            }
        }])
        client.get_quote = AsyncMock(return_value=100.0)

        result = await engine.run_account(1, dry_run=True)

    assert result.dry_run is True
    for order in result.orders:
        assert order.status == "DRY_RUN"
    client.place_order.assert_not_called()


# ------------------------------------------------------------------
# Test 4: Insufficient cash -> error, no orders
# ------------------------------------------------------------------

@pytest.mark.asyncio
async def test_insufficient_cash_returns_error():
    engine = make_engine()
    account = make_account(min_order_value=1.0)
    allocations = [make_allocation("SPUS", 100, 0)]

    db = AsyncMock()
    engine._db = db

    account_result = MagicMock()
    account_result.scalar_one_or_none.return_value = account
    alloc_result = MagicMock()
    alloc_result.scalars.return_value.all.return_value = allocations

    db.execute = AsyncMock(side_effect=[account_result, alloc_result])

    with patch("backend.services.invest_engine.SchwabClient") as MockClient:
        client = MockClient.return_value
        client.refresh_access_token = AsyncMock(return_value=("tok", "new_ref"))
        client.get_account_hashes = AsyncMock(return_value={"12345": "hash"})
        client.get_all_balances = AsyncMock(return_value=[{
            "securitiesAccount": {
                "accountNumber": "12345",
                "currentBalances": {"cashAvailableForTrading": 0.50},
            }
        }])

        result = await engine.run_account(1, dry_run=True)

    assert result.error is not None
    assert "Insufficient" in result.error
    assert result.orders == []


# ------------------------------------------------------------------
# Test 5: _extract_cash helper
# ------------------------------------------------------------------

def test_extract_cash():
    balances = [{
        "securitiesAccount": {
            "accountNumber": "12345",
            "currentBalances": {"cashAvailableForTrading": 342.50},
        }
    }]
    assert _extract_cash(balances, "12345") == 342.50
    assert _extract_cash(balances, "99999") == 0.0
