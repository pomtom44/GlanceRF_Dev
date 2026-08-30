"""
POTA spots cache. Fetches from api.pota.app/spot/activator, stores in SQLite
under config_dir/cache/pota.db. Purges records older than cache_history_hours.
POTA spots include latitude/longitude directly - no lookup needed.
"""

from datetime import datetime
from typing import Any, Optional, Tuple

from glancerf.services.ota_cache_common import SpotCacheService

_SPOTS_URL = "https://api.pota.app/spot/activator"


def _parse_record(s: dict, now: float) -> Tuple[Optional[Any], float]:
    sid = s.get("spotId")
    if sid is None:
        return None, now
    ts = s.get("spotTime")
    if ts:
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            return sid, dt.timestamp()
        except Exception:
            return sid, now
    return sid, now


_service = SpotCacheService(
    name="POTA",
    db_filename="pota.db",
    spots_url=_SPOTS_URL,
    fetch_interval_sec=120,
    parse_record=_parse_record,
    callsign_fields=("activator", "spotter"),
)


def start_pota_cache() -> None:
    """Start the POTA cache background thread."""
    _service.start()


def stop_pota_cache() -> None:
    """No-op; thread is daemon and exits with process."""
    _service.stop()


def get_cached_spots(
    hours_past: Optional[float] = None,
    callsign_filter: Optional[str] = None,
) -> list:
    """Read spots from local cache. hours_past: optional override; callsign_filter: optional substring match (case-insensitive)."""
    return _service.get_cached_spots(hours_past, callsign_filter)
