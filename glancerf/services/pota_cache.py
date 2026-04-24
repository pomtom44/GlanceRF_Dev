"""
POTA spots cache. Fetches from api.pota.app/spot/activator, stores in SQLite
under config_dir/cache/pota.db. Purges records older than cache_history_hours.
POTA spots include latitude/longitude directly - no lookup needed.
"""

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Optional

import httpx

from glancerf.config import get_config, get_logger

_log = get_logger("pota_cache")

_SPOTS_URL = "https://api.pota.app/spot/activator"
_FETCH_INTERVAL_SEC = 120
_RECONNECT_DELAY = 60
_DB_FILENAME = "pota.db"
_CACHE_DIR = "cache"
_DEFAULT_CACHE_HOURS = 24
_MIN_CACHE_HOURS = 1
_MAX_CACHE_HOURS = 720
_TIMEOUT = 30.0


def _get_cache_db_path() -> Path:
    config = get_config()
    cache_dir = config.config_dir / _CACHE_DIR
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / _DB_FILENAME


def _get_pota_settings_value(key: str, default: float) -> float:
    """Get max value for key across all ota_programs cells."""
    config = get_config()
    layout = config.get("layout") or []
    if not isinstance(layout, list):
        return default
    map_overlay = config.get("map_overlay_layout") or []
    if not isinstance(map_overlay, list):
        map_overlay = []
    module_settings = config.get("module_settings") or {}
    if not isinstance(module_settings, dict):
        module_settings = {}
    max_val = default
    cells_to_check = []
    for row_idx, row in enumerate(layout):
        if not isinstance(row, list):
            continue
        for col_idx, cell_value in enumerate(row):
            if isinstance(cell_value, str) and cell_value.strip() == "ota_programs":
                cells_to_check.append((f"{row_idx}_{col_idx}", "ota_programs"))
    for i, mid in enumerate(map_overlay):
        if isinstance(mid, str) and mid.strip() == "ota_programs":
            cells_to_check.append((f"map_overlay_{i}", "ota_programs"))
    for cell_key, _ in cells_to_check:
        settings = module_settings.get(cell_key)
        if not isinstance(settings, dict):
            continue
        val = settings.get(key)
        if val is None or val == "":
            continue
        try:
            h = float(val) if isinstance(val, (int, float)) else float(val)
            h = max(_MIN_CACHE_HOURS, min(_MAX_CACHE_HOURS, h))
            max_val = max(max_val, h)
        except (TypeError, ValueError):
            pass
    return max_val


def _get_cache_history_hours() -> float:
    """Get cache history (hours past) from POTA module settings."""
    return _get_pota_settings_value("cache_hours_past", _DEFAULT_CACHE_HOURS)


def _create_db(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS spots (
            id INTEGER PRIMARY KEY,
            received_at REAL NOT NULL,
            data TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_spots_received ON spots(received_at)")
    conn.commit()


def _purge_old_records(conn: sqlite3.Connection) -> None:
    hours_past = _get_cache_history_hours()
    now = time.time()
    cutoff_past = now - (hours_past * 3600)
    try:
        n_spots = conn.execute("DELETE FROM spots WHERE received_at < ?", (cutoff_past,)).rowcount
        if n_spots:
            conn.commit()
            _log.debug("POTA cache: purged %d spots", n_spots)
    except sqlite3.Error as e:
        _log.debug("POTA cache purge error: %s", e)


def _fetch_json(url: str) -> list[dict[str, Any]]:
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as client:
            r = client.get(url)
        if 200 <= r.status_code < 400:
            return r.json() if r.content else []
    except Exception as e:
        _log.debug("POTA fetch %s failed: %s", url, e)
    return []


def _run_pota_cache_thread() -> None:
    db_path = _get_cache_db_path()
    conn = None
    while True:
        try:
            conn = sqlite3.connect(str(db_path), timeout=30.0)
            _create_db(conn)
            _purge_old_records(conn)
            now = time.time()
            spots = _fetch_json(_SPOTS_URL)
            if spots:
                for s in spots:
                    sid = s.get("spotId")
                    if sid is None:
                        continue
                    ts = s.get("spotTime")
                    if ts:
                        try:
                            from datetime import datetime
                            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                            received_at = dt.timestamp()
                        except Exception:
                            received_at = now
                    else:
                        received_at = now
                    data = json.dumps(s, ensure_ascii=False)
                    try:
                        conn.execute(
                            "INSERT OR REPLACE INTO spots (id, received_at, data) VALUES (?, ?, ?)",
                            (sid, received_at, data),
                        )
                    except sqlite3.IntegrityError:
                        pass
                conn.commit()
                _log.debug("POTA cache: stored %d spots", len(spots))
        except Exception as e:
            _log.debug("POTA cache error: %s", e)
        finally:
            try:
                if conn is not None:
                    conn.close()
            except Exception:
                pass
            conn = None
        time.sleep(_FETCH_INTERVAL_SEC)


_thread: Optional[threading.Thread] = None


def start_pota_cache() -> None:
    """Start the POTA cache background thread."""
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    db_path = _get_cache_db_path()
    _thread = threading.Thread(target=_run_pota_cache_thread, daemon=True)
    _thread.start()
    _log.debug("POTA cache started: %s", db_path)


def stop_pota_cache() -> None:
    """No-op; thread is daemon and exits with process."""
    pass


def get_cached_spots(
    hours_past: Optional[float] = None,
    callsign_filter: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Read spots from local cache. hours_past: optional override; callsign_filter: optional substring match (case-insensitive)."""
    config = get_config()
    db_path = config.config_dir / _CACHE_DIR / _DB_FILENAME
    if not db_path.is_file():
        return []
    cutoff_hours = hours_past if hours_past is not None else _get_cache_history_hours()
    cutoff = time.time() - (cutoff_hours * 3600)
    try:
        conn = sqlite3.connect(str(db_path), timeout=10.0)
        cursor = conn.execute(
            "SELECT data FROM spots WHERE received_at >= ? ORDER BY received_at DESC",
            (cutoff,),
        )
        rows = cursor.fetchall()
        conn.close()
        result = []
        call_filter = (callsign_filter or "").strip().upper()
        for (data,) in rows:
            try:
                obj = json.loads(data)
                if call_filter:
                    call = (obj.get("activator") or obj.get("spotter") or "").upper()
                    if call_filter not in call:
                        continue
                result.append(obj)
            except json.JSONDecodeError:
                pass
        return result
    except Exception as e:
        _log.debug("POTA cache read spots failed: %s", e)
        return []
