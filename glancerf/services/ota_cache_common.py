"""
Shared building blocks for the ota_programs award-program caches (SOTA, POTA, WWFF):
config lookups, JSON fetching, and a generic single-endpoint "list of spots" cache
engine (SpotCacheService) used directly by pota_cache.py and wwff_cache.py.

SOTA is not built on SpotCacheService - it fetches two endpoints (spots + alerts)
into two tables with different purge/filter rules, so forcing it into this shape
would make the shared engine worse for everyone else. sota_cache.py reuses only
the generic helpers below (db path, settings lookup, JSON fetch).
"""

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Callable, Optional, Tuple

import httpx

from glancerf.config import get_config, get_logger

_CACHE_DIR = "cache"


def get_cache_db_path(db_filename: str) -> Path:
    """Return path to a cache DB file under config_dir/cache/, creating the dir if needed."""
    config = get_config()
    cache_dir = config.config_dir / _CACHE_DIR
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / db_filename


def get_ota_programs_settings_value(
    key: str, default: float, min_val: float = 1.0, max_val: float = 720.0
) -> float:
    """Max value for `key` across every ota_programs cell/map-overlay instance in the layout."""
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
    cell_keys = []
    for row_idx, row in enumerate(layout):
        if not isinstance(row, list):
            continue
        for col_idx, cell_value in enumerate(row):
            if isinstance(cell_value, str) and cell_value.strip() == "ota_programs":
                cell_keys.append(f"{row_idx}_{col_idx}")
    for i, mid in enumerate(map_overlay):
        if isinstance(mid, str) and mid.strip() == "ota_programs":
            cell_keys.append(f"map_overlay_{i}")
    max_val_found = default
    for cell_key in cell_keys:
        settings = module_settings.get(cell_key)
        if not isinstance(settings, dict):
            continue
        val = settings.get(key)
        if val is None or val == "":
            continue
        try:
            h = float(val)
            h = max(min_val, min(max_val, h))
            max_val_found = max(max_val_found, h)
        except (TypeError, ValueError):
            pass
    return max_val_found


def fetch_json(url: str, timeout: float, log) -> list:
    """GET url, return parsed JSON list, or [] on any failure (logged at debug on `log`)."""
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            r = client.get(url)
        if 200 <= r.status_code < 400:
            return r.json() if r.content else []
    except Exception as e:
        log.debug("fetch %s failed: %s", url, e)
    return []


class SpotCacheService:
    """
    Background cache for a single-endpoint "list of spots" API: fetch on an interval,
    store each record's (id, received_at, raw JSON) in one SQLite table, purge by age,
    serve back filtered by age/callsign.
    """

    def __init__(
        self,
        name: str,
        db_filename: str,
        spots_url: str,
        fetch_interval_sec: int,
        parse_record: Callable[[dict, float], Tuple[Optional[Any], float]],
        callsign_fields: Tuple[str, ...],
        default_cache_hours: float = 24,
        min_cache_hours: float = 1,
        max_cache_hours: float = 720,
        timeout: float = 30.0,
        post_process: Optional[Callable[[dict], dict]] = None,
    ):
        """
        parse_record(raw_spot, now) -> (id, received_at): extract this API's id/timestamp
            fields; return (None, now) to skip a record with no usable id.
        callsign_fields: field names tried in order for the callsign-filter lookup
            (first non-empty wins), e.g. ("activator", "spotter").
        post_process(obj) -> obj: optional per-record transform applied when reading
            back from cache (e.g. adding a derived field).
        """
        self.name = name
        self.db_filename = db_filename
        self.spots_url = spots_url
        self.fetch_interval_sec = fetch_interval_sec
        self.parse_record = parse_record
        self.callsign_fields = callsign_fields
        self.default_cache_hours = default_cache_hours
        self.min_cache_hours = min_cache_hours
        self.max_cache_hours = max_cache_hours
        self.timeout = timeout
        self.post_process = post_process
        self.log = get_logger(name.lower() + "_cache")
        self._thread: Optional[threading.Thread] = None

    def _db_path(self) -> Path:
        return get_cache_db_path(self.db_filename)

    def _cache_history_hours(self) -> float:
        return get_ota_programs_settings_value(
            "cache_hours_past", self.default_cache_hours, self.min_cache_hours, self.max_cache_hours
        )

    def _create_db(self, conn: sqlite3.Connection) -> None:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS spots (id INTEGER PRIMARY KEY, received_at REAL NOT NULL, data TEXT NOT NULL)"
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_spots_received ON spots(received_at)")
        conn.commit()

    def _purge_old_records(self, conn: sqlite3.Connection) -> None:
        cutoff = time.time() - (self._cache_history_hours() * 3600)
        try:
            n = conn.execute("DELETE FROM spots WHERE received_at < ?", (cutoff,)).rowcount
            if n:
                conn.commit()
                self.log.debug("%s cache: purged %d spots", self.name, n)
        except sqlite3.Error as e:
            self.log.debug("%s cache purge error: %s", self.name, e)

    def _run_thread(self) -> None:
        db_path = self._db_path()
        conn = None
        while True:
            try:
                conn = sqlite3.connect(str(db_path), timeout=30.0)
                self._create_db(conn)
                self._purge_old_records(conn)
                now = time.time()
                spots = fetch_json(self.spots_url, self.timeout, self.log)
                if spots:
                    stored = 0
                    for s in spots:
                        sid, received_at = self.parse_record(s, now)
                        if sid is None:
                            continue
                        data = json.dumps(s, ensure_ascii=False)
                        try:
                            conn.execute(
                                "INSERT OR REPLACE INTO spots (id, received_at, data) VALUES (?, ?, ?)",
                                (sid, received_at, data),
                            )
                            stored += 1
                        except sqlite3.IntegrityError:
                            pass
                    conn.commit()
                    self.log.debug("%s cache: stored %d spots", self.name, stored)
            except Exception as e:
                self.log.debug("%s cache error: %s", self.name, e)
            finally:
                try:
                    if conn is not None:
                        conn.close()
                except Exception:
                    pass
                conn = None
            time.sleep(self.fetch_interval_sec)

    def start(self) -> None:
        """Start the background fetch thread (no-op if already running)."""
        if self._thread is not None and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run_thread, daemon=True)
        self._thread.start()
        self.log.debug("%s cache started: %s", self.name, self._db_path())

    def stop(self) -> None:
        """No-op; thread is daemon and exits with process."""
        pass

    def get_cached_spots(
        self,
        hours_past: Optional[float] = None,
        callsign_filter: Optional[str] = None,
    ) -> list:
        """Read spots from local cache. hours_past: optional override; callsign_filter: optional substring match (case-insensitive)."""
        db_path = self._db_path()
        if not db_path.is_file():
            return []
        cutoff_hours = hours_past if hours_past is not None else self._cache_history_hours()
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
                        call = ""
                        for field in self.callsign_fields:
                            call = obj.get(field) or ""
                            if call:
                                break
                        if call_filter not in call.upper():
                            continue
                    if self.post_process:
                        obj = self.post_process(obj)
                    result.append(obj)
                except json.JSONDecodeError:
                    pass
            return result
        except Exception as e:
            self.log.debug("%s cache read spots failed: %s", self.name, e)
            return []
