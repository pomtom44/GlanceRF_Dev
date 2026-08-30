"""Cache warmer for dxpeditions module. Called by core when headless and module is active."""

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

from glancerf.utils.cache import get_cache


async def warm(settings: dict, config: Any) -> None:
    """Fetch dxpeditions and fill cache. Same cache key as API."""
    sources = settings.get("enabled_sources")
    enabled = None
    if sources:
        try:
            parsed = json.loads(sources) if isinstance(sources, str) else sources
            if isinstance(parsed, list):
                enabled = [s.strip() for s in parsed if isinstance(s, str) and s.strip()] or None
        except (json.JSONDecodeError, TypeError):
            enabled = None
    try:
        from glancerf.modules.dxpeditions.dxpedition_service import get_dxpeditions_cached
        from glancerf.modules.dxpeditions.api_routes import _CACHE_TTL_SEC, _DEFAULT_CREDITS

        result = await asyncio.to_thread(get_dxpeditions_cached, enabled_sources=enabled)
        cache_key = "dxpeditions:list:" + (",".join(sorted(enabled or [])) or "all")
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        active = any(
            (d.get("start_utc") or "") <= now <= (d.get("end_utc") or "")
            for d in (result or []) if isinstance(d, dict)
        )
        try:
            from glancerf.gpio import set_output
            set_output("dxpeditions", "alert", bool(active))
        except Exception:
            pass
        credits = "; ".join(enabled) if enabled else _DEFAULT_CREDITS
        get_cache().set(cache_key, {"dxpeditions": result, "credits": credits}, _CACHE_TTL_SEC)
    except Exception:
        pass
