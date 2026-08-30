"""
WWFF spots cache. Fetches from spots.wwff.co/static/spots.json, stores in SQLite
under config_dir/cache/wwff.db. Purges records older than cache_history_hours.
WWFF spots include latitude/longitude directly - no lookup needed.
"""

from datetime import datetime, timezone
from typing import Any, Optional, Tuple

from glancerf.services.ota_cache_common import SpotCacheService

_SPOTS_URL = "https://spots.wwff.co/static/spots.json"


def _parse_record(s: dict, now: float) -> Tuple[Optional[Any], float]:
    sid = s.get("id")
    if sid is None:
        return None, now
    ts = s.get("spot_time")
    if ts is not None:
        try:
            return sid, float(ts)
        except (TypeError, ValueError):
            return sid, now
    return sid, now


def _post_process(obj: dict) -> dict:
    """WWFF's spot_time is a unix timestamp; add an ISO spotTime field for API compatibility."""
    ts = obj.get("spot_time")
    if ts is not None:
        try:
            dt = datetime.fromtimestamp(float(ts), tz=timezone.utc)
            obj["spotTime"] = dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        except (TypeError, ValueError):
            pass
    return obj


_service = SpotCacheService(
    name="WWFF",
    db_filename="wwff.db",
    spots_url=_SPOTS_URL,
    fetch_interval_sec=60,
    parse_record=_parse_record,
    callsign_fields=("activator", "spotter"),
    post_process=_post_process,
)


def start_wwff_cache() -> None:
    """Start the WWFF cache background thread."""
    _service.start()


def stop_wwff_cache() -> None:
    """No-op; thread is daemon and exits with process."""
    _service.stop()


def get_cached_spots(
    hours_past: Optional[float] = None,
    callsign_filter: Optional[str] = None,
) -> list:
    """Read spots from local cache. hours_past: optional override; callsign_filter: optional substring match (case-insensitive)."""
    return _service.get_cached_spots(hours_past, callsign_filter)
