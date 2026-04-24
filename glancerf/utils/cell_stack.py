"""
Multi-module (stacked / rotating) grid cells.

Layout cells can store a `slots` list in module_settings[cell_key] with per-slot
module_id and settings. Legacy cells use a flat dict keyed by cell only.
"""

from __future__ import annotations

from typing import Any, Dict, Iterator, List, Set, Tuple

_DEFAULT_ROTATE = 30.0

_RESERVED_CELL_KEYS = frozenset({"slots", "rotate_seconds", "rotate_animation"})

# Stacked-cell transition when switching modules (layout editor + main grid)
VALID_ROTATE_ANIMATIONS = frozenset({"none", "fade", "zoom", "slide", "flip"})


def parse_rotate_animation(cell_ms: Dict[str, Any] | None) -> str:
    """Return a valid rotate_animation id for stacked cells; default none (instant)."""
    cell_ms = cell_ms if isinstance(cell_ms, dict) else {}
    raw = cell_ms.get("rotate_animation")
    if isinstance(raw, str) and raw.strip():
        s = raw.strip().lower()
        if s in VALID_ROTATE_ANIMATIONS:
            return s
    return "none"


def normalize_cell_slots(
    layout_module_id: str,
    cell_ms: Dict[str, Any] | None,
) -> Tuple[List[Tuple[str, Dict[str, Any]]], float, bool]:
    """
    Return (list of (module_id, settings_dict), rotate_seconds, has_explicit_slots).

    Legacy: no `slots` key — use layout_module_id and flat cell_ms as settings.
    """
    cell_ms = cell_ms if isinstance(cell_ms, dict) else {}
    slots_raw = cell_ms.get("slots")
    if isinstance(slots_raw, list) and len(slots_raw) > 0:
        slots: List[Tuple[str, Dict[str, Any]]] = []
        for entry in slots_raw:
            if not isinstance(entry, dict):
                continue
            mid = (entry.get("module_id") or "").strip()
            if not mid:
                continue
            sd = entry.get("settings")
            settings = dict(sd) if isinstance(sd, dict) else {}
            slots.append((mid, settings))
        try:
            rotate = float(cell_ms.get("rotate_seconds"))
        except (TypeError, ValueError):
            rotate = _DEFAULT_ROTATE
        if rotate < 5:
            rotate = 5.0
        if rotate > 86400:
            rotate = 86400.0
        return (slots, rotate, True)

    mid = (layout_module_id or "").strip()
    if not mid:
        return ([], _DEFAULT_ROTATE, False)
    flat = {k: v for k, v in cell_ms.items() if k not in _RESERVED_CELL_KEYS}
    return ([(mid, flat)], _DEFAULT_ROTATE, False)


def settings_key_for_slot(cell_key: str, slot_index: int, has_explicit_slots: bool) -> str:
    """Key used in GLANCERF_MODULE_SETTINGS for a slot's flat settings."""
    if has_explicit_slots:
        return f"{cell_key}_slot{slot_index}"
    return cell_key


def expand_module_settings_for_client(module_settings: Dict[str, Any] | None) -> Dict[str, Any]:
    """
    Flatten module_settings for the main page: each slot gets `cellKey_slotN` or legacy
    `cellKey` for a single implicit slot.
    """
    out: Dict[str, Any] = {}
    module_settings = module_settings or {}
    for key, val in module_settings.items():
        if not isinstance(val, dict):
            continue
        if key.startswith("map_overlay_"):
            out[key] = val
            continue
        slots_list, _, has_explicit = normalize_cell_slots("", val)
        if has_explicit and slots_list:
            for i, (_mid, settings) in enumerate(slots_list):
                sk = settings_key_for_slot(key, i, True)
                out[sk] = dict(settings) if isinstance(settings, dict) else {}
        else:
            flat = {k: v for k, v in val.items() if k not in _RESERVED_CELL_KEYS}
            out[key] = flat
    return out


def collect_map_instance_list(
    layout: list | None,
    module_settings: Dict[str, Any] | None,
    grid_rows: int,
    grid_columns: int,
) -> List[Dict[str, str]]:
    """
    Each map module cell/slot gets a stable id (matches data-map-instance-id in HTML) and a label.
    grid_rows/columns reserved for future validation; layout iteration uses the layout matrix.
    """
    _ = (grid_rows, grid_columns)
    raw: List[Tuple[str, str, int, int]] = []
    for cell_key, mid, settings, slot_idx in iter_layout_cell_module_settings(layout, module_settings):
        if mid != "map":
            continue
        settings = settings if isinstance(settings, dict) else {}
        iid = f"{cell_key}_slot{slot_idx}"
        name = (settings.get("map_display_name") or "").strip()
        try:
            r_str, _, c_str = cell_key.partition("_")
            r, c = int(r_str), int(c_str)
        except (TypeError, ValueError):
            r, c = 0, 0
        raw.append((iid, name, r, c))
    n = len(raw)
    out: List[Dict[str, str]] = []
    for iid, name, r, c in raw:
        if n <= 1:
            label = name if name else "Map"
        else:
            label = name if name else f"Map ({r},{c})"
        out.append({"id": iid, "label": label})
    return out


def inject_map_target_settings(
    modules_settings_schema: Dict[str, Any],
    map_instances: List[Dict[str, str]],
) -> None:
    """When multiple map instances exist, add target_map select to modules that draw on the map."""
    if len(map_instances) <= 1:
        return
    opts: List[Dict[str, str]] = [{"value": "", "label": "All maps"}] + [
        {"value": m["id"], "label": m["label"]} for m in map_instances
    ]
    entry = {
        "id": "target_map",
        "label": "Show overlay on map",
        "type": "select",
        "options": opts,
        "default": "",
    }
    for mid in ("aprs", "live_spots", "ota_programs"):
        if mid not in modules_settings_schema:
            continue
        lst = modules_settings_schema[mid]
        if any(isinstance(s, dict) and s.get("id") == "target_map" for s in lst):
            continue
        lst.append(entry)


def collect_module_ids_from_layout(layout: list | None, module_settings: Dict[str, Any] | None) -> Set[str]:
    """All module ids referenced in layout grid (including every stacked slot)."""
    ids: Set[str] = set()
    for _cell_key, mid, _settings, _si in iter_layout_cell_module_settings(layout, module_settings):
        if mid:
            ids.add(mid)
    return ids


def iter_layout_cell_module_settings(
    layout: list | None,
    module_settings: Dict[str, Any] | None,
) -> Iterator[Tuple[str, str, Dict[str, Any], int]]:
    """
    Yield (cell_key, module_id, settings_dict, slot_index) for each module instance
    in the grid (for cache warmer, satellite NORAD, etc.).
    """
    layout = layout or []
    module_settings = module_settings or {}
    for r, row in enumerate(layout):
        if not isinstance(row, list):
            continue
        for c, layout_mid in enumerate(row):
            cell_key = f"{r}_{c}"
            cell_ms = module_settings.get(cell_key)
            if not isinstance(cell_ms, dict):
                cell_ms = {}
            slots_list, _, has_explicit = normalize_cell_slots(
                (layout_mid or "") if isinstance(layout_mid, str) else "",
                cell_ms,
            )
            for slot_idx, (mid, settings) in enumerate(slots_list):
                if not mid:
                    continue
                yield (cell_key, mid, settings if isinstance(settings, dict) else {}, slot_idx)


def satellite_pass_settings_from_cell(
    cell_key: str,
    cell_ms: Dict[str, Any] | None,
    layout_mid: str,
) -> List[Dict[str, Any]]:
    """Return list of settings dicts for satellite_pass in this cell (each slot)."""
    cell_ms = cell_ms if isinstance(cell_ms, dict) else {}
    slots_list, _, _has_explicit = normalize_cell_slots((layout_mid or "").strip(), cell_ms)
    result: List[Dict[str, Any]] = []
    for mid, settings in slots_list:
        if mid == "satellite_pass" and isinstance(settings, dict):
            result.append(settings)
    return result
