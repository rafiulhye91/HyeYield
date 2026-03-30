import logging

import httpx

logger = logging.getLogger(__name__)


async def send_notify(topic: str, title: str, message: str) -> None:
    """POST a notification to ntfy.sh. Fails silently — never raises."""
    if not topic:
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://ntfy.sh/",
                json={"topic": topic, "title": title, "message": message},
            )
        if resp.status_code >= 400:
            logger.warning("ntfy rejected notification for topic '%s': %d %s", topic, resp.status_code, resp.text)
        else:
            logger.info("ntfy notification sent to topic '%s' (status %d)", topic, resp.status_code)
    except Exception:
        logger.warning("ntfy notification failed for topic '%s'", topic, exc_info=True)
