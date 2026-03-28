import asyncio
from typing import Dict, List

# Maps user_id -> list of queues (one per open SSE connection / browser tab)
_subscriptions: Dict[int, List[asyncio.Queue]] = {}


def subscribe(user_id: int) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subscriptions.setdefault(user_id, []).append(q)
    return q


def unsubscribe(user_id: int, q: asyncio.Queue) -> None:
    subs = _subscriptions.get(user_id, [])
    if q in subs:
        subs.remove(q)
    if not subs:
        _subscriptions.pop(user_id, None)


async def notify_user(user_id: int, data: dict) -> None:
    """Push an event to all SSE connections open for this user."""
    for q in list(_subscriptions.get(user_id, [])):
        await q.put(data)
