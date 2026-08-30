"""Cache warmer for map module. Called by core when headless and module is active."""

import asyncio
from typing import Any

from glancerf.utils.cache import get_cache


def _parse_propagation_aprs_hours(settings: dict) -> float:
    """Parse propagation_aprs_age (H:MM or plain-hours string, default '6:00') into a numeric
    hours value. Must match getMapSettings()'s parsing in script.js so the cache key this warmer
    writes matches the one /api/map/propagation-data computes for a real vhf_aprs request."""
    raw = settings.get("propagation_aprs_age")
    if raw is not None and str(raw).strip():
        age_str = str(raw).strip()
        parts = age_str.split(":")
        if len(parts) == 2:
            try:
                hrs = int(parts[0])
                mins = int(parts[1])
                if 0 <= mins < 60:
                    h = hrs + mins / 60
                    if h > 0:
                        return max(0.25, min(168, h))
            except ValueError:
                pass
        elif len(parts) == 1:
            try:
                h = float(age_str)
                if h > 0:
                    return max(0.25, min(168, h))
            except ValueError:
                pass
    return 6.0


async def warm(settings: dict, config: Any) -> None:
    """Warm propagation and APRS caches. Same cache keys as API."""
    source = (settings.get("propagation_source") or "").strip() or None
    # Only vhf_aprs sends an hours param on a real request; other sources always compute
    # their cache key with hours=None, so warming them with a real value would miss.
    hours = _parse_propagation_aprs_hours(settings) if source == "vhf_aprs" else None
    if source and source in ("kc2g_muf", "kc2g_fof2", "tropo", "vhf_aprs"):
        try:
            from glancerf.modules.map.propagation_service import get_propagation_coordinates
            from glancerf.modules.map.api_routes import _PROPAGATION_CACHE_TTL

            result = await asyncio.to_thread(get_propagation_coordinates, source, hours=hours)
            cache_key = f"map:propagation:{source}|{hours}"
            get_cache().set(cache_key, result, _PROPAGATION_CACHE_TTL)
        except Exception:
            pass
    try:
        from glancerf.modules.map.aprs_client import get_aprs_locations_from_cache
        from glancerf.modules.map.api_routes import _APRS_CACHE_TTL

        aprs_hours = hours if hours is not None else _parse_propagation_aprs_hours(settings)
        filter_str = (settings.get("aprs_filter") or "").strip() or None
        result = await asyncio.to_thread(get_aprs_locations_from_cache, hours=aprs_hours, filter_str=filter_str)
        cache_key = f"map:aprs:{aprs_hours}|{filter_str or ''}"
        get_cache().set(cache_key, result, _APRS_CACHE_TTL)
    except Exception:
        pass
