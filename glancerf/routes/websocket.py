"""
WebSocket routes for GlanceRF desktop/browser sync.
"""

import json

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from glancerf.config import DETAILED_LEVEL, get_logger
from glancerf.utils.exception_logging import log_unexpected
from glancerf.web import ConnectionManager

_log = get_logger("websocket")


def register_websocket_routes(app: FastAPI, connection_manager: ConnectionManager):
    """Register WebSocket routes."""

    @app.websocket("/ws/desktop")
    async def websocket_desktop(websocket: WebSocket):
        """WebSocket endpoint for desktop app (source of truth)."""
        _log.log(DETAILED_LEVEL, "WebSocket: desktop connected")
        await connection_manager.connect_desktop(websocket)
        try:
            while True:
                data = await websocket.receive_json()
                msg_type = data.get("type")
                _log.debug("WebSocket desktop received type=%s", msg_type)
                if msg_type in ("state", "update", "dom"):
                    await connection_manager.broadcast_from_desktop(data)
                    if msg_type in ("state", "update"):
                        connection_manager.desktop_state = data.get("data", {})
        except WebSocketDisconnect:
            _log.log(DETAILED_LEVEL, "WebSocket: desktop disconnected")
            await connection_manager.disconnect(websocket)
        except Exception:
            log_unexpected(_log, "WebSocket desktop: connection loop error")
            await connection_manager.disconnect(websocket)

    @app.websocket("/ws/browser")
    async def websocket_browser(websocket: WebSocket):
        """WebSocket endpoint for web browsers (two-way mirroring)."""
        _log.log(DETAILED_LEVEL, "WebSocket: browser connected")
        await connection_manager.connect_browser(websocket)
        try:
            while True:
                # Parse text frames manually so invalid JSON is logged (and we never drop the next frame:
                # receive_json() consumes the message before json.loads, so an extra receive_text() was wrong).
                text = await websocket.receive_text()
                try:
                    data = json.loads(text)
                except json.JSONDecodeError as e:
                    preview = text if len(text) <= 240 else text[:240] + "…"
                    _log.debug(
                        "WebSocket browser: ignored non-JSON text frame (%s): %r",
                        e,
                        preview,
                    )
                    continue
                if not isinstance(data, dict):
                    _log.debug(
                        "WebSocket browser: ignored JSON value (expected object, got %s)",
                        type(data).__name__,
                    )
                    continue
                msg_type = data.get("type")
                _log.debug("WebSocket browser received type=%s", msg_type)
                if msg_type in ("state", "update"):
                    await connection_manager.broadcast_from_browser(data, websocket)
        except WebSocketDisconnect:
            _log.log(DETAILED_LEVEL, "WebSocket: browser disconnected")
            await connection_manager.disconnect(websocket)
        except Exception:
            log_unexpected(_log, "WebSocket browser: connection loop error")
            await connection_manager.disconnect(websocket)

    @app.websocket("/ws/readonly")
    async def websocket_readonly(websocket: WebSocket):
        """WebSocket endpoint for read-only portal (receives config_update only)."""
        _log.log(DETAILED_LEVEL, "WebSocket: readonly connected")
        await connection_manager.connect_readonly(websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            _log.log(DETAILED_LEVEL, "WebSocket: readonly disconnected")
            await connection_manager.disconnect(websocket)
        except Exception:
            log_unexpected(_log, "WebSocket readonly: connection loop error")
            await connection_manager.disconnect(websocket)
