"""
Layout configurator routes for GlanceRF.
Template and static assets: glancerf/web/templates/layout/, glancerf/web/static/css/layout.css, glancerf/web/static/js/layout.js.
"""

import html as html_module
import json as _json
import re
import time
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, Response

from glancerf.config import get_config, get_logger
from glancerf.utils import build_merged_cells_from_spans, get_effective_location_string, rate_limit_dependency
from glancerf.utils.exception_logging import log_unexpected
from glancerf.utils.cell_stack import collect_map_instance_list, inject_map_target_settings, normalize_cell_slots, parse_rotate_animation
from glancerf.modules import get_modules, get_module_by_id, get_module_dir, get_module_ids
from glancerf.web import ConnectionManager
from glancerf.web.menu_html import get_menu_html

_log = get_logger("layout_routes")
_WEB_DIR = Path(__file__).resolve().parent.parent / "web"
_LAYOUT_TEMPLATE_PATH = _WEB_DIR / "templates" / "layout" / "index.html"
_layout_template_cache = None


def _layout_editor_module_options_html(selected_id: str) -> str:
    """HTML <option> list for module dropdown; selected_id may be '' for empty."""
    sel_id = (selected_id or "").strip()
    parts: list[str] = []
    # Leading empty option so new rows (and syncSlotRows) are not forced to the first module.
    sel_empty = " selected" if not sel_id else ""
    parts.append(f'<option value=""{sel_empty}>—</option>')
    for m in get_modules():
        if m.get("hidden"):
            continue
        mid = (m.get("id") or "").strip()
        sel = " selected" if mid == sel_id else ""
        parts.append(
            f'<option value="{html_module.escape(mid, quote=True)}"{sel}>'
            f"{html_module.escape(m.get('name', ''))}</option>"
        )
    return "".join(parts)


def _build_layout_editor_cell_html(
    row: int,
    col: int,
    cell_value: str,
    colspan: int,
    rowspan: int,
    cell_settings: dict,
    contract_left_disabled: str,
    contract_top_disabled: str,
) -> str:
    """One grid cell for the layout editor: rotate timer + stacked module dropdowns + per-slot config."""
    cell_settings = cell_settings if isinstance(cell_settings, dict) else {}
    slots, rotate_sec, _has_explicit = normalize_cell_slots(cell_value or "", cell_settings)
    if not slots:
        slot_modules = [""]
    else:
        slot_modules = [mid for mid, _ in slots]
    try:
        rs = int(float(rotate_sec))
    except (TypeError, ValueError):
        rs = 30
    rs = max(5, min(86400, rs))
    ra = parse_rotate_animation(cell_settings)
    anim_opts_parts: list[str] = []
    for val, label in (
        ("none", "None (instant)"),
        ("fade", "Fade"),
        ("zoom", "Zoom"),
        ("slide", "Slide"),
        ("flip", "Flip"),
    ):
        sel = " selected" if val == ra else ""
        anim_opts_parts.append(
            f'<option value="{html_module.escape(val, quote=True)}"{sel}>'
            f"{html_module.escape(label)}</option>"
        )
    anim_opts_html = "".join(anim_opts_parts)
    rows_html = ""
    for idx, mid in enumerate(slot_modules):
        opts = _layout_editor_module_options_html(mid)
        rows_html += (
            f'<div class="cell-module-slot-row" data-slot-index="{idx}">'
            f'<div class="cell-slot-row-actions" aria-label="Reorder and remove">'
            f'<button type="button" class="cell-slot-move-up" data-row="{row}" data-col="{col}" '
            f'title="Move module up" aria-label="Move module up">▲</button>'
            f'<button type="button" class="cell-slot-move-down" data-row="{row}" data-col="{col}" '
            f'title="Move module down" aria-label="Move module down">▼</button>'
            f'<button type="button" class="cell-slot-remove" data-row="{row}" data-col="{col}" '
            f'title="Remove module" aria-label="Remove module">✕</button>'
            f"</div>"
            f'<select class="cell-slot-module-select" data-row="{row}" data-col="{col}" '
            f'name="cell_slot_{row}_{col}_{idx}" aria-label="Module {idx + 1}">'
            f"{opts}</select>"
            f'<button type="button" class="cell-slot-config-btn" data-row="{row}" data-col="{col}" '
            f'data-slot-index="{idx}" title="Configure this module" aria-label="Configure module">⚙</button>'
            f'<div class="cell-slot-settings-host cell-module-settings" data-slot-index="{idx}"></div>'
            f"</div>"
        )
    cell_bg = "#111"
    if slots:
        mod = get_module_by_id(slots[0][0])
        if mod:
            cell_bg = mod.get("color", "#111")
    elif (cell_value or "").strip():
        mod = get_module_by_id(cell_value.strip())
        if mod:
            cell_bg = mod.get("color", "#111")
    return f'''
                <div class="grid-cell" data-row="{row}" data-col="{col}" data-colspan="{colspan}" data-rowspan="{rowspan}" style="background-color: {cell_bg};">
                    <div class="cell-stack-editor">
                        <div class="cell-rotate-row">
                            <label class="cell-rotate-label">Rotate every (sec)</label>
                            <input type="number" class="cell-rotate-seconds" min="5" max="86400" value="{rs}" data-row="{row}" data-col="{col}" title="Seconds between modules when multiple are added">
                        </div>
                        <div class="cell-rotate-row cell-rotate-animation-row">
                            <label class="cell-rotate-label">Change animation</label>
                            <select class="cell-rotate-animation" data-row="{row}" data-col="{col}" title="Transition when switching between modules in this cell">{anim_opts_html}</select>
                        </div>
                    </div>
                    <div class="cell-slots-container">{rows_html}</div>
                    <div class="cell-module-settings" style="display:none;" aria-hidden="true"></div>
                    <div class="cell-controls">
                        <button class="expand-btn expand-right" data-row="{row}" data-col="{col}" data-direction="right" title="Expand Right">→</button>
                        <button class="expand-btn expand-down" data-row="{row}" data-col="{col}" data-direction="down" title="Expand Down">↓</button>
                        <button class="contract-btn contract-left{contract_left_disabled}" data-row="{row}" data-col="{col}" data-direction="left" title="Contract Left">←</button>
                        <button class="contract-btn contract-top{contract_top_disabled}" data-row="{row}" data-col="{col}" data-direction="top" title="Contract Top">↑</button>
                    </div>
                </div>
                '''


def _get_layout_template() -> str:
    """Load layout page HTML template from file (cached)."""
    global _layout_template_cache
    if _layout_template_cache is None and _LAYOUT_TEMPLATE_PATH.is_file():
        _layout_template_cache = _LAYOUT_TEMPLATE_PATH.read_text(encoding="utf-8")
    return _layout_template_cache or ""


def register_layout_routes(app: FastAPI, connection_manager: ConnectionManager):
    """Register layout configurator routes."""

    @app.get("/module/{module_id}/layout_settings.js")
    async def module_layout_settings_js(module_id: str):
        """Serve a module's layout_settings.js so the layout editor can load custom setting UIs."""
        folder = get_module_dir(module_id)
        if not folder:
            return Response(status_code=404)
        path = folder / "layout_settings.js"
        if not path.is_file():
            return Response(status_code=404)
        try:
            content = path.read_text(encoding="utf-8")
        except OSError:
            return Response(status_code=404)
        return Response(content=content, media_type="application/javascript; charset=utf-8")

    @app.get("/layout")
    async def layout_configurator():
        """Layout configurator page - configure what displays in each grid cell."""
        _log.debug("GET /layout")
        try:
            current_config = get_config()
        except (FileNotFoundError, IOError):
            _log.debug("layout: config not found, redirecting to setup")
            return RedirectResponse(url="/setup")

        grid_columns = current_config.get("grid_columns")
        grid_rows = current_config.get("grid_rows")
        if grid_columns is None:
            grid_columns = 3
            current_config.set("grid_columns", 3)
        if grid_rows is None:
            grid_rows = 3
            current_config.set("grid_rows", 3)

        layout = current_config.get("layout")
        if layout is None:
            layout = [[""] * grid_columns for _ in range(grid_rows)]
        else:
            while len(layout) > grid_rows:
                layout.pop()
            while len(layout) < grid_rows:
                layout.append([""] * grid_columns)
            for row in layout:
                while len(row) > grid_columns:
                    row.pop()
                while len(row) < grid_columns:
                    row.append("")

        cell_spans = current_config.get("cell_spans")
        if cell_spans is None:
            cell_spans = {}
        else:
            filtered_spans = {}
            for key, span_info in cell_spans.items():
                try:
                    row, col = map(int, key.split("_"))
                    colspan = span_info.get("colspan", 1)
                    rowspan = span_info.get("rowspan", 1)
                    if (
                        0 <= row < grid_rows
                        and 0 <= col < grid_columns
                        and row + rowspan <= grid_rows
                        and col + colspan <= grid_columns
                    ):
                        filtered_spans[key] = span_info
                except (ValueError, KeyError):
                    continue
            cell_spans = filtered_spans

        grid_css = f"grid-template-columns: repeat({grid_columns}, minmax(0, 1fr)); grid-template-rows: repeat({grid_rows}, minmax(0, 1fr));"
        merged_cells, primary_cells = build_merged_cells_from_spans(cell_spans)

        raw_module_settings = current_config.get("module_settings") or {}
        map_overlay_layout = current_config.get("map_overlay_layout") or []
        if not isinstance(map_overlay_layout, list):
            map_overlay_layout = []
        map_overlay_layout = [m for m in map_overlay_layout if m and isinstance(m, str)]
        module_settings_by_cell: dict = {}
        cell_key_re = re.compile(r"^\d+_\d+$")
        if raw_module_settings and any(cell_key_re.match(str(k)) for k in raw_module_settings.keys()):
            module_settings_by_cell = dict(raw_module_settings)
        else:
            for r in range(grid_rows):
                for c in range(grid_columns):
                    if r < len(layout) and c < len(layout[r]):
                        cell_value = layout[r][c] or ""
                        if cell_value and raw_module_settings.get(cell_value):
                            key = f"{r}_{c}"
                            module_settings_by_cell[key] = raw_module_settings[cell_value]

        shared_ota_shortcut = (current_config.get("on_the_air_shortcut") or "").strip()
        for r in range(grid_rows):
            for c in range(grid_columns):
                if r >= len(layout) or c >= len(layout[r]):
                    continue
                key = f"{r}_{c}"
                cell_settings = module_settings_by_cell.get(key) or {}
                if not isinstance(cell_settings, dict):
                    cell_settings = {}
                slots_raw = cell_settings.get("slots")
                if isinstance(slots_raw, list) and slots_raw:
                    changed = False
                    cell_settings = dict(cell_settings)
                    for slot in slots_raw:
                        if not isinstance(slot, dict):
                            continue
                        smid = (slot.get("module_id") or "").strip()
                        if smid not in ("callsign", "on_air_indicator"):
                            continue
                        st = slot.get("settings") if isinstance(slot.get("settings"), dict) else {}
                        st = dict(st)
                        if "on_the_air_shortcut" not in st and shared_ota_shortcut:
                            st["on_the_air_shortcut"] = shared_ota_shortcut
                            slot["settings"] = st
                            changed = True
                    if changed:
                        module_settings_by_cell[key] = cell_settings
                    continue
                mid = layout[r][c] or ""
                if mid not in ("callsign", "on_air_indicator"):
                    continue
                if "on_the_air_shortcut" not in cell_settings and shared_ota_shortcut:
                    cell_settings = dict(cell_settings)
                    cell_settings["on_the_air_shortcut"] = shared_ota_shortcut
                    module_settings_by_cell[key] = cell_settings

        grid_html = ""
        for row in range(grid_rows):
            for col in range(grid_columns):
                span_key = f"{row}_{col}"
                span_info = cell_spans.get(span_key, {})
                colspan = span_info.get("colspan", 1) if (row, col) in primary_cells else 1
                rowspan = span_info.get("rowspan", 1) if (row, col) in primary_cells else 1

                if (row, col) in merged_cells:
                    cell_value = ""
                else:
                    cell_value = layout[row][col] if row < len(layout) and col < len(layout[row]) else ""
                contract_left_disabled = " contract-disabled" if colspan <= 1 else ""
                contract_top_disabled = " contract-disabled" if rowspan <= 1 else ""
                cell_key = f"{row}_{col}"
                ms_for_cell = module_settings_by_cell.get(cell_key) or {}
                grid_html += _build_layout_editor_cell_html(
                    row,
                    col,
                    cell_value,
                    colspan,
                    rowspan,
                    ms_for_cell if isinstance(ms_for_cell, dict) else {},
                    contract_left_disabled,
                    contract_top_disabled,
                )

        modules_settings_schema = {}
        show_title_setting = {"id": "show_title", "label": "Show module title", "type": "checkbox", "default": True}
        for m in get_modules():
            mid = m.get("id", "")
            if not mid:
                continue
            existing = list(m.get("settings") or [])
            modules_settings_schema[mid] = [show_title_setting] + existing

        map_instances = collect_map_instance_list(layout, module_settings_by_cell, grid_rows, grid_columns)
        inject_map_target_settings(modules_settings_schema, map_instances)
        map_instance_list_json = _json.dumps(map_instances)

        from glancerf.utils.module_conflicts import detect_module_conflicts
        conflicts = detect_module_conflicts(layout, map_overlay_layout, module_settings_by_cell, modules_settings_schema)
        for c in conflicts:
            mod = get_module_by_id(c["module_id"])
            c["module_name"] = (mod or {}).get("name", c["module_id"])
        conflict_data_json = _json.dumps(conflicts)
        module_colors_map = {m.get("id", ""): m.get("color", "#111") for m in get_modules() if m.get("id")}
        module_colors_json = _json.dumps(module_colors_map)
        module_settings_by_cell_json = _json.dumps(module_settings_by_cell)
        modules_settings_schema_json = _json.dumps(modules_settings_schema)
        setup_callsign_json = _json.dumps(current_config.get("setup_callsign") or "")
        setup_location_json = _json.dumps(get_effective_location_string(current_config))

        cache_bust = str(int(time.time() * 1000))
        module_settings_scripts = []
        for m in get_modules():
            mid = m.get("id", "")
            if not mid:
                continue
            folder = get_module_dir(mid)
            if folder and (folder / "layout_settings.js").is_file():
                module_settings_scripts.append(mid)
        module_settings_scripts_html = "".join(
            f'<script src="/module/{mid}/layout_settings.js?v={cache_bust}"></script>' for mid in module_settings_scripts
        )

        template = _get_layout_template()
        if not template:
            return HTMLResponse(content="<h1>Layout</h1><p>Template not found.</p>", status_code=500)

        html_content = template.replace("__CACHE_BUST__", cache_bust)
        html_content = html_content.replace("__GRID_CSS__", grid_css)
        html_content = html_content.replace("__GRID_HTML__", grid_html)
        html_content = html_content.replace("__GRID_COLUMNS__", str(grid_columns))
        html_content = html_content.replace("__GRID_ROWS__", str(grid_rows))
        html_content = html_content.replace("__MODULE_COLORS_JSON__", module_colors_json)
        html_content = html_content.replace("__MODULE_SETTINGS_BY_CELL_JSON__", module_settings_by_cell_json)
        html_content = html_content.replace("__CONFLICT_DATA_JSON__", conflict_data_json)
        html_content = html_content.replace("__MODULES_SETTINGS_SCHEMA_JSON__", modules_settings_schema_json)
        html_content = html_content.replace("__SETUP_CALLSIGN_JSON__", setup_callsign_json)
        html_content = html_content.replace("__SETUP_LOCATION_JSON__", setup_location_json)
        html_content = html_content.replace("__MAP_INSTANCE_LIST_JSON__", map_instance_list_json)
        html_content = html_content.replace("__MODULE_SETTINGS_SCRIPTS__", module_settings_scripts_html)
        html_content = html_content.replace("__GLANCERF_MENU_PANEL__", get_menu_html())

        _log.debug("layout: rendered page grid=%sx%s", grid_columns, grid_rows)
        return HTMLResponse(content=html_content)

    @app.post("/layout")
    async def layout_save(request: Request, _: None = Depends(rate_limit_dependency)):
        """Save layout configuration."""
        _log.debug("POST /layout")
        try:
            data = await request.json()
            layout = data.get("layout")
            spans = data.get("spans", {})
            module_settings = data.get("module_settings")

            if layout is None:
                return JSONResponse({"error": "Layout data missing"}, status_code=400)
            if not isinstance(layout, list):
                return JSONResponse({"error": "Invalid layout format"}, status_code=400)

            current_config = get_config()
            grid_columns = current_config.get("grid_columns")
            grid_rows = current_config.get("grid_rows")
            if grid_columns is None or grid_rows is None:
                return JSONResponse(
                    {"error": "Grid dimensions not configured (grid_columns, grid_rows)"},
                    status_code=400,
                )
            try:
                grid_columns = int(grid_columns)
                grid_rows = int(grid_rows)
            except (TypeError, ValueError):
                return JSONResponse({"error": "Grid dimensions must be integers"}, status_code=400)
            if grid_columns < 1 or grid_rows < 1:
                return JSONResponse({"error": "Grid dimensions must be at least 1"}, status_code=400)

            if len(layout) != grid_rows:
                return JSONResponse({"error": f"Layout must have {grid_rows} rows, got {len(layout)}"}, status_code=400)

            valid_module_ids = set(get_module_ids())
            for r, row in enumerate(layout):
                if not isinstance(row, list):
                    return JSONResponse({"error": f"Row {r} is not a list"}, status_code=400)
                if len(row) != grid_columns:
                    return JSONResponse({"error": f"Row {r} must have {grid_columns} columns, got {len(row)}"}, status_code=400)
                for c, cell_value in enumerate(row):
                    if not isinstance(cell_value, str):
                        return JSONResponse({"error": f"Cell ({r},{c}) must be a string"}, status_code=400)
                    if cell_value and cell_value not in valid_module_ids:
                        return JSONResponse({"error": f"Unknown module id at ({r},{c}): {cell_value!r}"}, status_code=400)

            if spans is not None and not isinstance(spans, dict):
                return JSONResponse({"error": "Spans must be an object"}, status_code=400)

            cell_key_re = re.compile(r"^\d+_\d+$")
            old_layout = current_config.get("layout") or []
            current = dict(current_config.get("module_settings") or {})
            for r in range(grid_rows):
                for c in range(grid_columns):
                    cell_key = f"{r}_{c}"
                    old_module = old_layout[r][c] if r < len(old_layout) and c < len(old_layout[r]) else ""
                    new_module = layout[r][c] if r < len(layout) and c < len(layout[r]) else ""
                    if old_module != new_module and cell_key in current:
                        del current[cell_key]
                        _log.debug("layout save: cleared settings for cell %s (module %s -> %s)", cell_key, old_module or "(empty)", new_module or "(empty)")

            if spans:
                for key, span_info in spans.items():
                    try:
                        parts = key.split("_")
                        if len(parts) != 2:
                            return JSONResponse({"error": f"Invalid span key: {key!r} (expected row_col)"}, status_code=400)
                        row, col = int(parts[0]), int(parts[1])
                    except (ValueError, AttributeError):
                        return JSONResponse({"error": f"Invalid span key: {key!r}"}, status_code=400)
                    if row < 0 or row >= grid_rows or col < 0 or col >= grid_columns:
                        return JSONResponse(
                            {"error": f"Span key {key} is outside grid (0-{grid_rows-1} rows, 0-{grid_columns-1} cols)"},
                            status_code=400,
                        )
                    if not isinstance(span_info, dict):
                        return JSONResponse({"error": f"Span {key} value must be an object"}, status_code=400)
                    colspan = span_info.get("colspan", 1)
                    rowspan = span_info.get("rowspan", 1)
                    try:
                        colspan = int(colspan)
                        rowspan = int(rowspan)
                    except (TypeError, ValueError):
                        return JSONResponse({"error": f"Span {key} colspan/rowspan must be integers"}, status_code=400)
                    if colspan < 1 or rowspan < 1:
                        return JSONResponse({"error": f"Span {key} colspan and rowspan must be at least 1"}, status_code=400)
                    if col + colspan > grid_columns or row + rowspan > grid_rows:
                        return JSONResponse(
                            {"error": f"Span {key} (colspan={colspan}, rowspan={rowspan}) goes outside grid"},
                            status_code=400,
                        )

            current_config.set("layout", layout)
            current_config.set("cell_spans", spans or {})

            if module_settings is not None and isinstance(module_settings, dict):
                for cell_key, settings in module_settings.items():
                    if not isinstance(settings, dict):
                        continue
                    if cell_key_re.match(str(cell_key)):
                        if isinstance(settings.get("slots"), list):
                            for slot in settings["slots"]:
                                if not isinstance(slot, dict):
                                    return JSONResponse({"error": f"Invalid slots for {cell_key}"}, status_code=400)
                                smid = (slot.get("module_id") or "").strip()
                                if smid and smid not in valid_module_ids:
                                    return JSONResponse(
                                        {"error": f"Unknown module id in slot at {cell_key}: {smid!r}"},
                                        status_code=400,
                                    )
                        merged = dict(settings)
                        if isinstance(merged.get("slots"), list) and len(merged["slots"]) > 0:
                            merged["rotate_animation"] = parse_rotate_animation(merged)
                        current[cell_key] = merged
                    else:
                        current[cell_key] = {**(current.get(cell_key) or {}), **settings}

            on_the_air_shortcut_val = None
            for cell_key, settings in (module_settings or {}).items():
                if not isinstance(settings, dict):
                    continue
                try:
                    parts = cell_key.split("_")
                    if len(parts) != 2:
                        continue
                    r, c = int(parts[0]), int(parts[1])
                    if r < 0 or r >= grid_rows or c < 0 or c >= grid_columns or r >= len(layout) or c >= len(layout[r]):
                        continue
                    slots = settings.get("slots")
                    if isinstance(slots, list):
                        for slot in slots:
                            if not isinstance(slot, dict):
                                continue
                            if (slot.get("module_id") or "").strip() not in ("callsign", "on_air_indicator"):
                                continue
                            st = slot.get("settings") if isinstance(slot.get("settings"), dict) else {}
                            on_the_air_shortcut_val = (st.get("on_the_air_shortcut") or "").strip()
                    else:
                        mid = layout[r][c] or ""
                        if mid in ("callsign", "on_air_indicator"):
                            on_the_air_shortcut_val = (settings.get("on_the_air_shortcut") or "").strip()
                except (ValueError, TypeError):
                    continue
            if on_the_air_shortcut_val is not None:
                current_config.set("on_the_air_shortcut", on_the_air_shortcut_val)

            for cell_key in list(current):
                if cell_key.startswith("map_overlay_"):
                    continue
                try:
                    parts = cell_key.split("_")
                    if len(parts) != 2:
                        del current[cell_key]
                        continue
                    r, c = int(parts[0]), int(parts[1])
                    if r < 0 or r >= grid_rows or c < 0 or c >= grid_columns:
                        del current[cell_key]
                except ValueError:
                    del current[cell_key]
            current_config.set("module_settings", current)

            try:
                await connection_manager.broadcast_config_update({"reload": True})
            except Exception:
                log_unexpected(_log, "layout save: broadcast_config_update failed")
            _log.debug("layout save: success; broadcast config_update")
            return JSONResponse({"success": True})
        except Exception as e:
            log_unexpected(_log, "layout save failed")
            return JSONResponse({"error": str(e)}, status_code=500)

    @app.post("/api/config/resolve-module-conflict")
    async def resolve_module_conflict(request: Request, _: None = Depends(rate_limit_dependency)):
        """Resolve a module setting conflict by applying chosen value to all instances."""
        _log.debug("POST /api/config/resolve-module-conflict")
        try:
            data = await request.json()
            module_id = (data.get("module_id") or "").strip()
            setting_id = (data.get("setting_id") or "").strip()
            value = data.get("value")

            if not module_id or not setting_id:
                return JSONResponse({"error": "module_id and setting_id required"}, status_code=400)

            current_config = get_config()
            layout = current_config.get("layout") or []
            map_overlay_layout = current_config.get("map_overlay_layout") or []
            if not isinstance(map_overlay_layout, list):
                map_overlay_layout = []
            current = dict(current_config.get("module_settings") or {})

            def _apply_to_module_instances() -> bool:
                changed = False
                for r, row in enumerate(layout or []):
                    if not isinstance(row, list):
                        continue
                    for c, cell_value in enumerate(row):
                        ck = f"{r}_{c}"
                        cell_ms = current.get(ck)
                        if not isinstance(cell_ms, dict):
                            continue
                        slots_raw = cell_ms.get("slots")
                        if isinstance(slots_raw, list) and slots_raw:
                            for slot in slots_raw:
                                if not isinstance(slot, dict):
                                    continue
                                if (slot.get("module_id") or "").strip() != module_id:
                                    continue
                                st = slot.get("settings") if isinstance(slot.get("settings"), dict) else {}
                                st = dict(st)
                                st[setting_id] = value
                                slot["settings"] = st
                                changed = True
                        elif (cell_value or "").strip() == module_id:
                            cell_ms = dict(cell_ms)
                            cell_ms[setting_id] = value
                            current[ck] = cell_ms
                            changed = True
                for i, mid in enumerate(map_overlay_layout or []):
                    if (mid or "").strip() != module_id:
                        continue
                    mk = f"map_overlay_{i}"
                    if mk not in current:
                        current[mk] = {}
                    mks = dict(current[mk])
                    mks[setting_id] = value
                    current[mk] = mks
                    changed = True
                return changed

            if not _apply_to_module_instances():
                return JSONResponse({"error": "Module not found in layout or map overlay"}, status_code=400)

            current_config.set("module_settings", current)
            try:
                await connection_manager.broadcast_config_update({"reload": True})
            except Exception:
                log_unexpected(_log, "resolve-module-conflict: broadcast_config_update failed")
            return JSONResponse({"success": True})
        except Exception as e:
            _log.exception("resolve-module-conflict failed")
            return JSONResponse({"error": str(e)}, status_code=500)
