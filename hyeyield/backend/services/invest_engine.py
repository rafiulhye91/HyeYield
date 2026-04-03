from dataclasses import dataclass, field
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.allocation import Allocation
from backend.models.schedule_allocation import ScheduleAllocation
from backend.models.schwab_account import SchwabAccount
from backend.models.trade_log import TradeLog
from backend.models.user import User
from backend.services.schwab_client import SchwabAPIError, SchwabAuthError, SchwabClient
from backend.services.whole_share_allocator import AssetInput, allocate


@dataclass
class OrderResult:
    symbol: str
    shares: int
    price: float
    amount: float
    status: str
    message: str


@dataclass
class InvestResult:
    account_number: str
    account_name: str
    orders: List[OrderResult] = field(default_factory=list)
    total_invested: float = 0.0
    cash_before: float = 0.0
    cash_after: float = 0.0
    rotation_used: int = 0
    dry_run: bool = True
    error: Optional[str] = None


class InvestEngine:
    def __init__(self, db: AsyncSession, user_id: int):
        self._db = db
        self._user_id = user_id

    async def run_account(self, account_id: int, dry_run: bool = True, schedule_id: Optional[int] = None, schedule_name: Optional[str] = None) -> InvestResult:
        # 1. Load account + allocations ordered by display_order
        result = await self._db.execute(
            select(SchwabAccount).where(
                SchwabAccount.id == account_id,
                SchwabAccount.user_id == self._user_id,
            )
        )
        account = result.scalar_one_or_none()
        if account is None:
            return InvestResult(
                account_number="unknown",
                account_name="unknown",
                dry_run=dry_run,
                error="Account not found",
            )

        invest_result = InvestResult(
            account_number=account.account_number,
            account_name=account.account_name,
            dry_run=dry_run,
            rotation_used=account.rotation_state,
        )

        # 2. Load user credentials and check connected
        user_result = await self._db.execute(select(User).where(User.id == self._user_id))
        user = user_result.scalar_one()
        if not user.refresh_token_enc:
            invest_result.error = "Not connected to Schwab"
            return invest_result

        # 3. Load allocations — per-schedule if running from a schedule, else account-level
        if schedule_id:
            alloc_result = await self._db.execute(
                select(ScheduleAllocation)
                .where(ScheduleAllocation.schedule_id == schedule_id)
                .order_by(ScheduleAllocation.display_order)
            )
        else:
            alloc_result = await self._db.execute(
                select(Allocation)
                .where(Allocation.account_id == account_id)
                .order_by(Allocation.display_order)
            )
        allocations = alloc_result.scalars().all()
        if not allocations:
            invest_result.error = "No allocations configured"
            return invest_result

        # 4. Create Schwab client using user-level credentials
        client = SchwabClient(
            app_key=user.get_app_key(),
            app_secret=user.get_app_secret(),
            refresh_token=user.get_refresh_token(),
        )

        try:
            access_token, new_refresh = await client.refresh_access_token()
            user.set_refresh_token(new_refresh)
            await self._db.commit()

            # 5. Get account hashes and balances
            hashes = await client.get_account_hashes(access_token)
            account_hash = hashes.get(account.account_number)
            if not account_hash:
                invest_result.error = f"Account number {account.account_number} not found in Schwab"
                return invest_result

            balances = await client.get_all_balances(access_token)
            cash = _extract_cash(balances, account.account_number)
            invest_result.cash_before = cash

            # 6. Check minimum
            if cash < account.min_order_value:
                invest_result.error = f"Insufficient cash: ${cash:.2f} < min ${account.min_order_value:.2f}"
                return invest_result

            # 7. Apply rotation: rotate allocations by rotation_state
            n = len(allocations)
            rotation = account.rotation_state % n
            rotated = list(allocations[rotation:]) + list(allocations[:rotation])

            # 8. Fetch all quotes, then run whole-share allocator.
            asset_inputs: list[AssetInput] = []
            quote_errors: dict[str, str] = {}
            for alloc in rotated:
                try:
                    price = await client.get_quote(access_token, alloc.symbol)
                    asset_inputs.append(AssetInput(symbol=alloc.symbol, price=price, target_pct=alloc.target_pct))
                except (SchwabAPIError, SchwabAuthError) as e:
                    quote_errors[alloc.symbol] = str(e)

            # Log quote failures immediately.
            for alloc in rotated:
                if alloc.symbol in quote_errors:
                    order = OrderResult(
                        symbol=alloc.symbol,
                        shares=0,
                        price=0.0,
                        amount=0.0,
                        status="FAILED",
                        message=quote_errors[alloc.symbol],
                    )
                    invest_result.orders.append(order)
                    await self._log(account, alloc.symbol, order, dry_run, schedule_id, schedule_name)

            allocations_out = allocate(cash, asset_inputs)
            remaining_cash = cash

            for alloc_out in allocations_out:
                if alloc_out.shares < 1:
                    order = OrderResult(
                        symbol=alloc_out.symbol,
                        shares=0,
                        price=alloc_out.price,
                        amount=0.0,
                        status="SKIPPED",
                        message=f"Allocator assigned 0 shares (price ${alloc_out.price:.2f})",
                    )
                elif dry_run:
                    order = OrderResult(
                        symbol=alloc_out.symbol,
                        shares=alloc_out.shares,
                        price=alloc_out.price,
                        amount=alloc_out.amount,
                        status="DRY_RUN",
                        message=f"Dry run — no order placed (target {alloc_out.actual_pct:.1f}%)",
                    )
                    remaining_cash -= alloc_out.amount
                else:
                    try:
                        order_id, status = await client.place_order(access_token, account_hash, alloc_out.symbol, alloc_out.shares)
                        order = OrderResult(
                            symbol=alloc_out.symbol,
                            shares=alloc_out.shares,
                            price=alloc_out.price,
                            amount=alloc_out.amount,
                            status=status,
                            message=f"Order ID: {order_id}",
                        )
                        remaining_cash -= alloc_out.amount
                    except (SchwabAPIError, SchwabAuthError) as e:
                        order = OrderResult(
                            symbol=alloc_out.symbol,
                            shares=0,
                            price=alloc_out.price,
                            amount=0.0,
                            status="FAILED",
                            message=str(e),
                        )

                invest_result.orders.append(order)
                await self._log(account, alloc_out.symbol, order, dry_run, schedule_id, schedule_name)

            invest_result.cash_after = remaining_cash
            invest_result.total_invested = cash - remaining_cash

            # 10. Advance rotation_state and update last_run
            from datetime import datetime
            account.rotation_state = account.rotation_state + 1
            account.last_run = datetime.utcnow()
            await self._db.commit()

        except (SchwabAuthError, SchwabAPIError) as e:
            invest_result.error = str(e)

        return invest_result

    async def run_all(self, dry_run: bool = True) -> List[InvestResult]:
        result = await self._db.execute(
            select(SchwabAccount).where(
                SchwabAccount.user_id == self._user_id,
                SchwabAccount.enabled == True,
            )
        )
        accounts = result.scalars().all()
        results = []
        for account in accounts:
            results.append(await self.run_account(account.id, dry_run=dry_run))
        return results

    async def _log(self, account: SchwabAccount, symbol: str, order: OrderResult, dry_run: bool, schedule_id: Optional[int] = None, schedule_name: Optional[str] = None):
        log = TradeLog(
            user_id=self._user_id,
            account_id=account.id,
            schedule_id=schedule_id,
            schedule_name=schedule_name,
            symbol=symbol,
            shares=order.shares,
            price=order.price,
            amount=order.amount,
            status=order.status,
            message=order.message,
            dry_run=dry_run,
        )
        self._db.add(log)
        await self._db.commit()


def _extract_cash(balances: list, account_number: str) -> float:
    """Extract available cash from Schwab balances response for a given account number."""
    for item in balances:
        acct = item.get("securitiesAccount", {})
        if acct.get("accountNumber") == account_number:
            return float(
                acct.get("currentBalances", {}).get("cashAvailableForTrading", 0.0)
            )
    return 0.0
