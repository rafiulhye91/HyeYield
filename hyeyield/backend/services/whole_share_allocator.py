"""
Whole-share investment allocator using exhaustive enumeration (backtracking).

Given a cash balance and a list of assets with prices and target percentages,
finds the integer share counts that:
  1. Minimise the sum of |actual_pct - target_pct| across all assets.
  2. Maximise total invested amount when deviation is tied.
  3. Never exceed the available cash.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class AssetInput:
    symbol: str
    price: float
    target_pct: float


@dataclass
class AllocationOutput:
    symbol: str
    shares: int
    price: float
    amount: float
    actual_pct: float


def allocate(
    cash: float,
    assets: list[AssetInput],
    max_deviation_pct: Optional[float] = None,
) -> list[AllocationOutput]:
    """
    Returns the optimal whole-share allocation for each asset.

    If no feasible allocation exists (e.g. cash < cheapest share),
    returns zero shares for every asset.

    Args:
        cash: Available cash — must not be exceeded.
        assets: Assets with price and target_pct (need not sum to 100).
        max_deviation_pct: Optional per-asset deviation band. Candidates
            where any asset exceeds this are discarded. If no candidate
            satisfies all bands, the candidate with the smallest maximum
            per-asset violation is returned instead.
    """
    if not assets or cash <= 0:
        return [AllocationOutput(symbol=a.symbol, shares=0, price=a.price, amount=0.0, actual_pct=0.0) for a in assets]

    n = len(assets)

    # Normalise target percentages so they sum to 100.
    sum_t = sum(a.target_pct for a in assets)
    if sum_t <= 0:
        targets = [100.0 / n] * n
    else:
        targets = [a.target_pct / sum_t * 100.0 for a in assets]

    # Upper bound on shares per asset (ignoring other assets — safe overestimate).
    max_shares = [int(cash / a.price) for a in assets]

    _EPS = 1e-9

    # Tracking best result found so far.
    best: dict = {"deviation": float("inf"), "invested": 0.0, "combo": [0] * n, "max_band_violation": float("inf")}
    current = [0] * n

    def backtrack(idx: int, remaining: float) -> None:
        if idx == n:
            total_cost = cash - remaining
            if total_cost <= _EPS:
                return

            actual_pcts = [(current[i] * assets[i].price) / total_cost * 100.0 for i in range(n)]
            deviation = sum(abs(actual_pcts[i] - targets[i]) for i in range(n))

            # Check optional per-asset deviation band.
            if max_deviation_pct is not None:
                violations = [abs(actual_pcts[i] - targets[i]) for i in range(n)]
                max_violation = max(violations)
                if max_violation > max_deviation_pct + _EPS:
                    # Still track as fallback in case no candidate satisfies bands.
                    if max_violation < best["max_band_violation"] - _EPS or (
                        abs(max_violation - best["max_band_violation"]) < _EPS and total_cost > best["invested"]
                    ):
                        best["max_band_violation"] = max_violation
                        best["deviation"] = deviation
                        best["invested"] = total_cost
                        best["combo"] = current[:]
                    return

            # Primary: lower deviation wins. Secondary: higher invested wins.
            if deviation < best["deviation"] - _EPS or (
                abs(deviation - best["deviation"]) < _EPS and total_cost > best["invested"] + _EPS
            ):
                best["deviation"] = deviation
                best["invested"] = total_cost
                best["combo"] = current[:]
                best["max_band_violation"] = 0.0
            return

        for s in range(max_shares[idx] + 1):
            cost = s * assets[idx].price
            if cost > remaining + _EPS:
                break
            current[idx] = s
            backtrack(idx + 1, remaining - cost)

        current[idx] = 0

    backtrack(0, cash)

    combo = best["combo"]
    total_invested = sum(combo[i] * assets[i].price for i in range(n))

    return [
        AllocationOutput(
            symbol=assets[i].symbol,
            shares=combo[i],
            price=assets[i].price,
            amount=combo[i] * assets[i].price,
            actual_pct=(combo[i] * assets[i].price / total_invested * 100.0) if total_invested > _EPS else 0.0,
        )
        for i in range(n)
    ]
