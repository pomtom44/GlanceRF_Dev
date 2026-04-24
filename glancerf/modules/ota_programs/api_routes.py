"""
Register SOTA, POTA and WWFF API routes for ota_programs module.
Serves spots and alerts from local SQLite caches. SOTA enriched with lat/lon from summits list.
"""

import asyncio

from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse

from glancerf.config import get_logger
from glancerf.services.sota_cache import get_cached_spots, get_cached_alerts
from glancerf.services.pota_cache import get_cached_spots as get_pota_spots
from glancerf.services.wwff_cache import get_cached_spots as get_wwff_spots

_log = get_logger("ota_programs.api_routes")


def _enrich_sota_with_coords(items: list[dict], summit_key: str = "summitCode", assoc_key: str = "associationCode") -> None:
    """Add lat, lon to SOTA items from summit lookup. Mutates in place."""
    try:
        from glancerf.services.sota_summits import lookup_summit_coords
    except ImportError:
        return
    for item in items:
        if item.get("latitude") is not None and item.get("longitude") is not None:
            continue
        coords = lookup_summit_coords(
            association_code=item.get(assoc_key),
            summit_code=item.get(summit_key),
        )
        if coords:
            item["latitude"] = coords[0]
            item["longitude"] = coords[1]


def register_routes(app: FastAPI) -> None:
    """Register GET /api/sota/data and GET /api/pota/data."""

    @app.get("/api/sota/data")
    async def get_sota_data(
        hours_past: float | None = Query(None, alias="hours"),
        hours_future: float | None = Query(None),
        callsign: str | None = Query(None),
        spots: bool = Query(True),
        alerts: bool = Query(True),
    ):
        """Return SOTA spots and/or alerts from local cache. Enriched with lat/lon for map."""
        _log.debug("API: GET /api/sota/data hours_past=%s hours_future=%s callsign=%s", hours_past, hours_future, callsign)
        try:
            result = {}
            if spots:
                spots_list = await asyncio.to_thread(
                    get_cached_spots,
                    hours_past=hours_past,
                    callsign_filter=callsign,
                )
                await asyncio.to_thread(_enrich_sota_with_coords, spots_list)
                result["spots"] = spots_list
            else:
                result["spots"] = []
            if alerts:
                alerts_list = await asyncio.to_thread(
                    get_cached_alerts,
                    hours_past=hours_past,
                    hours_future=hours_future,
                    callsign_filter=callsign,
                )
                await asyncio.to_thread(_enrich_sota_with_coords, alerts_list, "summitCode", "associationCode")
                result["alerts"] = alerts_list
            else:
                result["alerts"] = []
            return result
        except Exception as e:
            _log.debug("SOTA data failed: %s", e)
            return JSONResponse(
                {"error": "Failed to load SOTA data", "detail": str(e)},
                status_code=502,
            )

    @app.get("/api/pota/data")
    async def get_pota_data(
        hours_past: float | None = Query(None, alias="hours"),
        callsign: str | None = Query(None),
        spots: bool = Query(True),
    ):
        """Return POTA spots from local cache. Spots include lat/lon for map."""
        _log.debug("API: GET /api/pota/data hours_past=%s callsign=%s", hours_past, callsign)
        try:
            if spots:
                spots_list = await asyncio.to_thread(
                    get_pota_spots,
                    hours_past=hours_past,
                    callsign_filter=callsign,
                )
                return {"spots": spots_list}
            return {"spots": []}
        except Exception as e:
            _log.debug("POTA data failed: %s", e)
            return JSONResponse(
                {"error": "Failed to load POTA data", "detail": str(e)},
                status_code=502,
            )

    @app.get("/api/wwff/data")
    async def get_wwff_data(
        hours_past: float | None = Query(None, alias="hours"),
        callsign: str | None = Query(None),
        spots: bool = Query(True),
    ):
        """Return WWFF spots from local cache. Spots include lat/lon for map."""
        _log.debug("API: GET /api/wwff/data hours_past=%s callsign=%s", hours_past, callsign)
        try:
            if spots:
                spots_list = await asyncio.to_thread(
                    get_wwff_spots,
                    hours_past=hours_past,
                    callsign_filter=callsign,
                )
                return {"spots": spots_list}
            return {"spots": []}
        except Exception as e:
            _log.debug("WWFF data failed: %s", e)
            return JSONResponse(
                {"error": "Failed to load WWFF data", "detail": str(e)},
                status_code=502,
            )
