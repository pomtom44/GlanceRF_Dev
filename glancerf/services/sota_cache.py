"""
SOTA spots and alerts cache. Fetches from api-db2.sota.org.uk, stores in SQLite
under config_dir/cache/sota.db. Purges records older than cache_history_hours
(from SOTA module settings). Started on app startup.
"""

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Optional

import httpx

from glancerf.config import get_config, get_logger

_log = get_logger("sota_cache")

_SPOTS_URL = "https://api-db2.sota.org.uk/api/spots"
_ALERTS_URL = "https://api-db2.sota.org.uk/api/alerts"
_SPOTS_COUNT = 500
_ALERTS_COUNT = 100
_FETCH_INTERVAL_SEC = 120
_RECONNECT_DELAY = 60
_DB_FILENAME = "sota.db"
_CACHE_DIR = "cache"
_DEFAULT_CACHE_HOURS = 24
_MIN_CACHE_HOURS = 1
_MAX_CACHE_HOURS = 720  # 30 days
_TIMEOUT = 30.0


def _get_cache_db_path() -> Path:
    config = get_config()
    cache_dir = config.config_dir / _CACHE_DIR
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / _DB_FILENAME


def _get_sota_settings_value(key: str, default: float) -> float:
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
    """Get cache history (hours past) from SOTA module settings."""
    return _get_sota_settings_value("cache_hours_past", _DEFAULT_CACHE_HOURS)


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
    conn.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY,
            received_at REAL NOT NULL,
            date_activated REAL,
            data TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_alerts_received ON alerts(received_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_alerts_date_activated ON alerts(date_activated)")
    try:
        conn.execute("ALTER TABLE alerts ADD COLUMN date_activated REAL")
        conn.commit()
    except sqlite3.OperationalError:
        pass
    conn.commit()


def _purge_old_records(conn: sqlite3.Connection) -> None:
    hours_past = _get_cache_history_hours()
    now = time.time()
    cutoff_past = now - (hours_past * 3600)
    try:
        n_spots = conn.execute("DELETE FROM spots WHERE received_at < ?", (cutoff_past,)).rowcount
        n_alerts = conn.execute(
            "DELETE FROM alerts WHERE (date_activated IS NOT NULL AND date_activated < ?) OR (date_activated IS NULL AND received_at < ?)",
            (cutoff_past, cutoff_past),
        ).rowcount
        if n_spots or n_alerts:
            conn.commit()
            _log.debug("SOTA cache: purged %d spots, %d alerts", n_spots, n_alerts)
    except sqlite3.Error as e:
        _log.debug("SOTA cache purge error: %s", e)


def _fetch_json(url: str, params: Optional[dict] = None) -> list[dict[str, Any]]:
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as client:
            r = client.get(url, params=params)
        if 200 <= r.status_code < 400:
            return r.json() if r.content else []
    except Exception as e:
        _log.debug("SOTA fetch %s failed: %s", url, e)
    return []


def _run_sota_cache_thread() -> None:
    db_path = _get_cache_db_path()
    conn = None
    while True:
        try:
            conn = sqlite3.connect(str(db_path), timeout=30.0)
            _create_db(conn)
            _purge_old_records(conn)
            now = time.time()
            spots_url = f"{_SPOTS_URL}/{_SPOTS_COUNT}/all/all/"
            spots = _fetch_json(spots_url)
            if spots:
                for s in spots:
                    sid = s.get("id")
                    if sid is None:
                        continue
                    ts = s.get("timeStamp")
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
                _log.debug("SOTA cache: stored %d spots", len(spots))
            alerts_url = f"{_ALERTS_URL}/{_ALERTS_COUNT}/all/all/"
            alerts = _fetch_json(alerts_url)
            if alerts:
                for a in alerts:
                    aid = a.get("id")
                    if aid is None:
                        continue
                    ts = a.get("timeStamp")
                    if ts:
                        try:
                            from datetime import datetime
                            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                            received_at = dt.timestamp()
                        except Exception:
                            received_at = now
                    else:
                        received_at = now
                    date_act = a.get("dateActivated")
                    date_activated = None
                    if date_act:
                        try:
                            from datetime import datetime
                            dt = datetime.fromisoformat(date_act.replace("Z", "+00:00"))
                            date_activated = dt.timestamp()
                        except Exception:
                            pass
                    data = json.dumps(a, ensure_ascii=False)
                    try:
                        conn.execute(
                            "INSERT OR REPLACE INTO alerts (id, received_at, date_activated, data) VALUES (?, ?, ?, ?)",
                            (aid, received_at, date_activated, data),
                        )
                    except sqlite3.IntegrityError:
                        pass
                conn.commit()
                _log.debug("SOTA cache: stored %d alerts", len(alerts))
        except Exception as e:
            _log.debug("SOTA cache error: %s", e)
        finally:
            try:
                if conn is not None:
                    conn.close()
            except Exception:
                pass
            conn = None
        time.sleep(_FETCH_INTERVAL_SEC)


_thread: Optional[threading.Thread] = None


def start_sota_cache() -> None:
    """Start the SOTA cache background thread and summits list refresh."""
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    db_path = _get_cache_db_path()
    _thread = threading.Thread(target=_run_sota_cache_thread, daemon=True)
    _thread.start()
    _log.debug("SOTA cache started: %s", db_path)
    try:
        from glancerf.services.sota_summits import start_sota_summits_refresh
        start_sota_summits_refresh()
    except ImportError:
        pass


def stop_sota_cache() -> None:
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
                    call = (obj.get("activatorCallsign") or obj.get("callsign") or "").upper()
                    if call_filter not in call:
                        continue
                result.append(obj)
            except json.JSONDecodeError:
                pass
        return result
    except Exception as e:
        _log.debug("SOTA cache read spots failed: %s", e)
        return []


def get_cached_alerts(
    hours_past: Optional[float] = None,
    hours_future: Optional[float] = None,
    callsign_filter: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Read alerts from local cache. Filter by dateActivated in [now-hours_past, now+hours_future]."""
    config = get_config()
    db_path = config.config_dir / _CACHE_DIR / _DB_FILENAME
    if not db_path.is_file():
        return []
    hp = hours_past if hours_past is not None else _get_cache_history_hours()
    hf = hours_future if hours_future is not None else _get_sota_settings_value("cache_hours_future", 168)
    now = time.time()
    cutoff_past = now - (hp * 3600)
    cutoff_future = now + (hf * 3600)
    try:
        conn = sqlite3.connect(str(db_path), timeout=10.0)
        cursor = conn.execute(
            """SELECT data FROM alerts WHERE
                (date_activated IS NOT NULL AND date_activated >= ? AND date_activated <= ?)
                OR (date_activated IS NULL AND received_at >= ?)
            ORDER BY COALESCE(date_activated, 1e15) ASC, received_at DESC""",
            (cutoff_past, cutoff_future, cutoff_past),
        )
        rows = cursor.fetchall()
        conn.close()
        result = []
        call_filter = (callsign_filter or "").strip().upper()
        for (data,) in rows:
            try:
                obj = json.loads(data)
                if call_filter:
                    call = (obj.get("activatingCallsign") or obj.get("posterCallsign") or "").upper()
                    if call_filter not in call:
                        continue
                result.append(obj)
            except json.JSONDecodeError:
                pass
        return result
    except Exception as e:
        _log.debug("SOTA cache read alerts failed: %s", e)
        return []
