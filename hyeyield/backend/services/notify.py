import logging

import httpx

logger = logging.getLogger(__name__)


async def send_notify(topic: str, title: str, message: str) -> None:
    """POST a notification to ntfy.sh. Fails silently — never raises."""
    if not topic:
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"https://ntfy.sh/{topic}",
                content=message.encode(),
                headers={"Title": title},
            )
        logger.debug("ntfy notification sent to topic '%s'", topic)
    except Exception:
        logger.warning("ntfy notification failed for topic '%s'", topic, exc_info=True)
