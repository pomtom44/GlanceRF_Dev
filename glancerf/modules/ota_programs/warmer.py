"""Cache warmer for ota_programs. Warms SOTA, POTA and WWFF caches based on source selection."""

import asyncio
from typing import Any

from glancerf.services.sota_cache import get_cached_spots, get_cached_alerts
from glancerf.services.pota_cache import get_cached_spots as get_pota_spots
from glancerf.services.wwff_cache import get_cached_spots as get_wwff_spots


async def warm(settings: dict, config: Any) -> None:
    """Pre-load SOTA, POTA and WWFF data based on which sources are enabled."""
    hours_past = None
    hours_future = None
    callsign = (settings.get("callsign_filter") or "").strip() or None
    try:
        val = settings.get("cache_hours_past")
        if val is not None and val != "":
            h = float(val) if isinstance(val, (int, float)) else float(val)
            if 1 <= h <= 720:
                hours_past = h
    except (TypeError, ValueError):
        pass
    try:
        val = settings.get("cache_hours_future")
        if val is not None and val != "":
            h = float(val) if isinstance(val, (int, float)) else float(val)
            if 1 <= h <= 720:
                hours_future = h
    except (TypeError, ValueError):
        pass

    show_sota = settings.get("show_sota_spots") or settings.get("show_sota_alerts")
    show_pota = settings.get("show_pota_spots")
    show_wwff = settings.get("show_wwff_spots")

    if show_sota:
        await asyncio.to_thread(get_cached_spots, hours_past=hours_past, callsign_filter=callsign)
        await asyncio.to_thread(get_cached_alerts, hours_past=hours_past, hours_future=hours_future, callsign_filter=callsign)
    if show_pota:
        await asyncio.to_thread(get_pota_spots, hours_past=hours_past, callsign_filter=callsign)
    if show_wwff:
        await asyncio.to_thread(get_wwff_spots, hours_past=hours_past, callsign_filter=callsign)
