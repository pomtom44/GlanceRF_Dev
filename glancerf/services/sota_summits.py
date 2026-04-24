"""
SOTA summits list cache. Fetches summitslist.csv from storage.sota.org.uk,
parses it, and provides lookup by summit code for lat/lon coordinates.
Used to enrich SOTA spots and alerts with coordinates for map display.
"""

import csv
import threading
import time
from pathlib import Path
from typing import Optional

import httpx

from glancerf.config import get_config, get_logger

_log = get_logger("sota_summits")

_SUMMITS_URL = "https://storage.sota.org.uk/summitslist.csv"
_SUMMITS_FILENAME = "summitslist.csv"
_CACHE_DIR = "cache"
_REFRESH_INTERVAL_SEC = 86400  # 24 hours
_TIMEOUT = 60.0

# In-memory lookup: summit_code -> {lat, lon}
_summit_coords: dict[str, tuple[float, float]] = {}
_summit_coords_lock = threading.Lock()
_last_fetch_time: float = 0


def _get_summits_path() -> Path:
    config = get_config()
    cache_dir = config.config_dir / _CACHE_DIR
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / _SUMMITS_FILENAME


def _parse_summit_code(association_code: Optional[str], summit_code: Optional[str]) -> Optional[str]:
    """Build full summit code for lookup. API may return summitCode as 'ST-009' and associationCode as 'JA'."""
    sc = (summit_code or "").strip()
    ac = (association_code or "").strip()
    if not sc:
        return None
    # If summitCode already contains '/', use as-is (e.g. G/CE-001)
    if "/" in sc:
        return sc
    if ac:
        return f"{ac}/{sc}"
    return sc


def _load_from_file(path: Path) -> dict[str, tuple[float, float]]:
    result: dict[str, tuple[float, float]] = {}
    try:
        with path.open("r", encoding="utf-8", errors="replace") as f:
            # First line may be title "SOTA Summits List (Date=...)", second is header
            first = f.readline()
            if first and "SummitCode" not in first:
                pass  # consumed title line; next line is header
            reader = csv.DictReader(f)
            if not reader.fieldnames:
                return result
            for row in reader:
                code = (row.get("SummitCode") or "").strip()
                if not code:
                    continue
                try:
                    lon = float(row.get("Longitude", 0))
                    lat = float(row.get("Latitude", 0))
                except (TypeError, ValueError):
                    continue
                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    result[code] = (lat, lon)
        _log.debug("SOTA summits: loaded %d entries from %s", len(result), path)
    except Exception as e:
        _log.debug("SOTA summits load failed: %s", e)
    return result


def _fetch_and_store() -> None:
    global _summit_coords, _last_fetch_time
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as client:
            r = client.get(_SUMMITS_URL)
        if 200 <= r.status_code < 400 and r.content:
            path = _get_summits_path()
            path.write_bytes(r.content)
            coords = _load_from_file(path)
            with _summit_coords_lock:
                _summit_coords.clear()
                _summit_coords.update(coords)
                _last_fetch_time = time.time()
            _log.debug("SOTA summits: fetched and loaded %d entries", len(coords))
    except Exception as e:
        _log.debug("SOTA summits fetch failed: %s", e)
        # Fall back to existing file if any
        path = _get_summits_path()
        if path.is_file():
            coords = _load_from_file(path)
            with _summit_coords_lock:
                if not _summit_coords:
                    _summit_coords.update(coords)


def _ensure_loaded() -> None:
    global _last_fetch_time
    with _summit_coords_lock:
        now = time.time()
        if _summit_coords and (now - _last_fetch_time) < _REFRESH_INTERVAL_SEC:
            return
        path = _get_summits_path()
        if path.is_file() and not _summit_coords:
            coords = _load_from_file(path)
            _summit_coords.update(coords)
            _last_fetch_time = now
            if _summit_coords:
                return
    _fetch_and_store()


def lookup_summit_coords(
    association_code: Optional[str] = None,
    summit_code: Optional[str] = None,
    full_code: Optional[str] = None,
) -> Optional[tuple[float, float]]:
    """
    Look up lat, lon for a summit. Returns (lat, lon) or None.
    Pass either full_code (e.g. 'JA/ST-009') or association_code + summit_code.
    """
    _ensure_loaded()
    key = full_code
    if not key and (association_code or summit_code):
        key = _parse_summit_code(association_code, summit_code)
    if not key:
        return None
    key = (key or "").strip()
    if not key:
        return None
    with _summit_coords_lock:
        if key in _summit_coords:
            return _summit_coords[key]
        # Try normalized: Association/Region-Number (association part uppercased)
        if "/" in key:
            parts = key.split("/", 1)
            norm = parts[0].upper() + "/" + parts[1]
            if norm in _summit_coords:
                return _summit_coords[norm]
        for k, v in _summit_coords.items():
            if k.upper() == key.upper():
                return v
    return None


def start_sota_summits_refresh() -> None:
    """Start background thread to refresh summits list periodically."""
    def run() -> None:
        while True:
            _fetch_and_store()
            time.sleep(_REFRESH_INTERVAL_SEC)

    t = threading.Thread(target=run, daemon=True)
    t.start()
    _log.debug("SOTA summits refresh thread started")
