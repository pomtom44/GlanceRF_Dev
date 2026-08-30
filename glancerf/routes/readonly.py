"""
Read-only server for GlanceRF.
Separate server on readonly_port with no WebSocket or interactive features.
Serves full clock display; connects to main server WebSocket for config_update reload.
"""

import html
import json
import time
from pathlib import Path
from typing import Iterable, Optional

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles

from glancerf.config import get_config, get_logger
from glancerf.web.menu_html import get_menu_html
from glancerf.modules import get_module_assets, get_modules
from glancerf.utils import build_merged_cells_from_spans, build_grid_html, get_aspect_ratio_css, get_effective_location_string
from glancerf.utils.cell_stack import (
    collect_map_instance_list,
    collect_module_ids_from_layout,
    expand_module_settings_for_client,
    inject_map_target_settings,
)
from glancerf.views import render_readonly_page

_log = get_logger("readonly")

_WEB_DIR = Path(__file__).resolve().parent.parent / "web"
_PROJECT_DIR = Path(__file__).resolve().parent.parent.parent


def _get_logo_path():
    """Return path to logo.png."""
    p = _PROJECT_DIR / "logos" / "logo.png"
    if p.is_file():
        return p
    p = _PROJECT_DIR.parent / "logo.png"
    return p if p.is_file() else None


def _main_base_url(request: Request, main_port: int) -> str:
    hostname = request.url.hostname or "127.0.0.1"
    scheme = request.url.scheme or "http"
    return f"{scheme}://{hostname}:{main_port}"


def _main_port_from_config(current_config: Optional[dict]) -> int:
    if not current_config:
        return 8080
    port = current_config.get("port")
    return port if isinstance(port, int) else 8080


def _readonly_notice_html(
    title: str,
    paragraphs: Iterable[str],
    cache_bust: str,
    action_href: Optional[str] = None,
    action_label: Optional[str] = None,
) -> str:
    """Full-page HTML for read-only server when the dashboard cannot load (matches pages.css theme)."""
    esc = html.escape
    para_html = "".join(
        f'<p class="readonly-notice-msg">{esc(p)}</p>' for p in paragraphs
    )
    action_html = ""
    if action_href and action_label:
        action_html = (
            f'<p class="readonly-notice-actions">'
            f'<a class="glancerf-page-back-link" href="{esc(action_href)}">{esc(action_label)}</a></p>'
        )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GlanceRF (Read-Only)</title>
    <link rel="icon" href="/logo.png" type="image/png">
    <link rel="stylesheet" href="/static/css/pages.css?v={esc(cache_bust)}">
    <style>
        .readonly-notice-wrap {{ max-width: 560px; margin: 0 auto; }}
        .readonly-notice-msg {{ margin-bottom: 16px; color: #ccc; font-size: 15px; line-height: 1.5; }}
        .readonly-notice-actions {{ margin-top: 8px; }}
    </style>
</head>
<body>
    <div class="glancerf-page-container readonly-notice-wrap">
        <h1>{esc(title)}</h1>
        {para_html}
        {action_html}
    </div>
</body>
</html>"""


def _readonly_setup_required_page(request: Request, current_config: dict, cache_bust: str) -> str:
    """Themed notice for the genuine first-run case (setup not yet completed)."""
    main_port = _main_port_from_config(current_config)
    main_url = _main_base_url(request, main_port)
    return _readonly_notice_html(
        "Setup required",
        (
            "First-run setup is not finished yet. "
            "Complete it on the main GlanceRF interface, then reload this page.",
        ),
        cache_bust,
        action_href=f"{main_url}/setup",
        action_label="Open setup on the main interface",
    )


def register_readonly_routes(readonly_app: FastAPI) -> None:
    """Register read-only root route on the given FastAPI app."""

    @readonly_app.get("/logo.png", include_in_schema=False)
    def _serve_logo():
        path = _get_logo_path()
        if path is not None:
            return FileResponse(str(path), media_type="image/png")
        return Response(status_code=404)

    @readonly_app.get("/api/ready")
    async def readonly_ready():
        """Readiness check for startup verification."""
        return {"ready": True}

    @readonly_app.get("/")
    async def readonly_root(request: Request):
        """Read-only version of main page - full clock display, no interactions."""
        _log.debug("GET / (readonly)")
        cache_bust = str(int(time.time() * 1000))
        try:
            current_config = get_config()
        except (FileNotFoundError, IOError):
            _log.debug("readonly: config not found")
            main_url = _main_base_url(request, 8080)
            return HTMLResponse(
                content=_readonly_notice_html(
                    "Configuration not found",
                    ("No configuration file was found. Create one using the main interface.",),
                    cache_bust,
                    action_href=f"{main_url}/setup",
                    action_label="Open setup on the main interface",
                ),
                status_code=404,
            )

        if current_config.get("first_run"):
            return HTMLResponse(
                content=_readonly_setup_required_page(request, current_config, cache_bust),
                status_code=200,
            )

        layout = current_config.get("layout")
        grid_columns = current_config.get("grid_columns")
        grid_rows = current_config.get("grid_rows")
        aspect_ratio = current_config.get("aspect_ratio")
        if layout is None or grid_columns is None or grid_rows is None or not aspect_ratio:
            main_port = _main_port_from_config(current_config)
            main_url = _main_base_url(request, main_port)
            return HTMLResponse(
                content=_readonly_notice_html(
                    "Configuration incomplete",
                    ("Grid or aspect settings are missing. Finish setup on the main interface.",),
                    cache_bust,
                    action_href=f"{main_url}/setup",
                    action_label="Open setup on the main interface",
                ),
                status_code=200,
            )
        if not layout or not layout[0]:
            main_port = _main_port_from_config(current_config)
            main_url = _main_base_url(request, main_port)
            return HTMLResponse(
                content=_readonly_notice_html(
                    "Layout empty",
                    ("The dashboard layout has no cells yet. Configure it on the main interface.",),
                    cache_bust,
                    action_href=f"{main_url}/layout",
                    action_label="Open layout editor",
                ),
                status_code=200,
            )

        aspect_ratio_css = get_aspect_ratio_css(aspect_ratio)
        cell_spans = current_config.get("cell_spans") or {}
        merged_cells, _ = build_merged_cells_from_spans(cell_spans)
        module_settings = current_config.get("module_settings") or {}
        has_any_module = bool(collect_module_ids_from_layout(layout, module_settings))
        if not has_any_module:
            # Setup is already finished (this is not the first_run case above) - the grid just
            # has no modules assigned yet. Render through the normal connected page (WebSocket +
            # readonly.js) rather than a bare notice, so this view auto-reloads the moment modules
            # are added on the main interface instead of needing a manual refresh.
            grid_html = (
                '<div class="empty-state-message">'
                'No modules configured yet. Add modules to the layout on the main interface.</div>'
            )
            grid_css = "display: flex; align-items: center; justify-content: center; min-height: 100%;"
        else:
            grid_html = build_grid_html(
                layout,
                cell_spans,
                merged_cells,
                grid_columns,
                grid_rows,
                module_settings=module_settings,
            )
            grid_css = f"grid-template-columns: repeat({grid_columns}, minmax(0, 1fr)); grid-template-rows: repeat({grid_rows}, minmax(0, 1fr));"
        map_overlay_layout = current_config.get("map_overlay_layout") or []
        if not isinstance(map_overlay_layout, list):
            map_overlay_layout = []
        map_overlay_layout = [m for m in map_overlay_layout if m and isinstance(m, str)]
        overlay_modules = collect_module_ids_from_layout(layout, module_settings) | set(map_overlay_layout)
        modules_settings_schema = {}
        show_title = {"id": "show_title", "label": "Show module title", "type": "checkbox", "default": True}
        background_updates_setting = {
            "id": "background_updates",
            "label": "Keep updating while hidden in a rotating cell",
            "type": "checkbox",
            "default": True,
        }
        for m in get_modules():
            mid = m.get("id", "")
            if mid:
                modules_settings_schema[mid] = [show_title, background_updates_setting] + list(m.get("settings") or [])
        map_instances = collect_map_instance_list(layout, module_settings, grid_rows, grid_columns)
        inject_map_target_settings(modules_settings_schema, map_instances)
        map_instance_list_json = json.dumps(map_instances)
        module_css, module_js = get_module_assets(
            layout, map_overlay_layout=map_overlay_layout, module_settings=module_settings
        )
        module_settings_json = json.dumps(expand_module_settings_for_client(module_settings))
        modules_settings_schema_json = json.dumps(modules_settings_schema)
        map_overlay_modules_json = json.dumps(list(overlay_modules))
        map_overlay_layout_json = json.dumps(map_overlay_layout)
        setup_callsign_json = json.dumps(current_config.get("setup_callsign") or "")
        setup_location_json = json.dumps(get_effective_location_string(current_config))

        main_port = _main_port_from_config(current_config)
        main_base_url = _main_base_url(request, main_port)

        _log.debug("readonly: grid=%sx%s main_port=%s", grid_columns, grid_rows, main_port)
        html_content = render_readonly_page(
            aspect_ratio_css=aspect_ratio_css,
            grid_css=grid_css,
            grid_html=grid_html,
            module_css=module_css,
            module_js=module_js,
            module_settings_json=module_settings_json,
            modules_settings_schema_json=modules_settings_schema_json,
            map_instance_list_json=map_instance_list_json,
            map_overlay_modules_json=map_overlay_modules_json,
            map_overlay_layout_json=map_overlay_layout_json,
            setup_callsign_json=setup_callsign_json,
            setup_location_json=setup_location_json,
            main_port=main_port,
            main_base_url=main_base_url,
            cache_bust=cache_bust,
        )
        html_content = html_content.replace("__GLANCERF_MENU_PANEL__", get_menu_html(main_base_url))
        return HTMLResponse(content=html_content)


def run_readonly_server(host: str = "0.0.0.0", port: int = 8081, quiet: bool = False) -> None:
    """Run the read-only FastAPI server (no WebSocket, no interactions)."""
    app = FastAPI(title="GlanceRF (Read-Only)")
    register_readonly_routes(app)

    _web_static = _WEB_DIR / "static"
    if _web_static.is_dir():
        app.mount("/static", StaticFiles(directory=str(_web_static)), name="static")

    import uvicorn
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="error",
        access_log=False,
    )
