"""
Countdown module API routes. The live_stopwatch running/reset state lives entirely
client-side (browser JS) - unlike other modules' GPIO outputs (contests, sun_times,
dxpeditions, webcam), which are driven from state the backend already knows. This
endpoint lets the frontend report running-state changes so the "Running LED" GPIO
output declared in module.py can actually be driven.
"""

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from glancerf.config import get_logger
from glancerf.utils import rate_limit_dependency

_log = get_logger("countdown.api_routes")


def register_routes(app: FastAPI) -> None:
    """Register POST /api/countdown/running. Updates the running GPIO output when called."""

    @app.post("/api/countdown/running")
    async def countdown_running(request: Request, _: None = Depends(rate_limit_dependency)):
        try:
            body = await request.json()
        except Exception:
            return JSONResponse({"error": "Invalid JSON"}, status_code=400)
        running = bool(body.get("running"))
        try:
            from glancerf.gpio import set_output
            set_output("countdown", "running", running)
        except Exception as e:
            _log.debug("countdown set_output failed: %s", e)
        return JSONResponse({"ok": True})
