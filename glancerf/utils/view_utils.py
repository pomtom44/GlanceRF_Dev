"""
View utilities for GlanceRF.
Grid building and span logic for main and readonly pages.
"""

import html as html_module
from typing import Any, Dict, Optional, Set, Tuple

from glancerf.utils.cell_stack import normalize_cell_slots, parse_rotate_animation, settings_key_for_slot


def build_merged_cells_from_spans(cell_spans: Dict[str, Any]) -> Tuple[Set[Tuple[int, int]], Dict]:
    """From cell_spans config, compute merged_cells set and primary_cells dict."""
    merged_cells: Set[Tuple[int, int]] = set()
    primary_cells: Dict = {}
    for key, span_info in (cell_spans or {}).items():
        try:
            parts = key.split("_")
            if len(parts) != 2:
                continue
            row, col = int(parts[0]), int(parts[1])
        except (ValueError, AttributeError):
            continue
        colspan = span_info.get("colspan", 1)
        rowspan = span_info.get("rowspan", 1)
        primary_cells[(row, col)] = {"colspan": colspan, "rowspan": rowspan}
        for r in range(row, row + rowspan):
            for c in range(col, col + colspan):
                if r != row or c != col:
                    merged_cells.add((r, c))
    return merged_cells, primary_cells


def _wrap_inner_with_title(
    inner: str,
    module_name: str,
    show_title: bool,
) -> str:
    if show_title and module_name:
        title_escaped = html_module.escape(module_name, quote=True)
        return (
            f'<div class="glancerf-cell-inner">'
            f'<div class="glancerf-module-title">{title_escaped}</div>'
            f'<div class="glancerf-module-content">{inner}</div>'
            f"</div>"
        )
    return (
        f'<div class="glancerf-cell-inner">'
        f'<div class="glancerf-module-content">{inner}</div>'
        f"</div>"
    )


def build_grid_html(
    layout: list,
    cell_spans: Dict[str, Any],
    merged_cells: Set[Tuple[int, int]],
    grid_columns: int,
    grid_rows: int,
    module_settings: Optional[Dict[str, Any]] = None,
    get_module_by_id=None,
) -> str:
    """Generate grid cells HTML. get_module_by_id: callable(id) -> dict or None."""
    from glancerf.modules import get_module_by_id as _get_module

    settings = module_settings or {}
    get_module = get_module_by_id or (lambda id: _get_module(id) or {"color": "#111", "inner_html": "", "name": ""})
    grid_html = ""
    for row in range(grid_rows):
        for col in range(grid_columns):
            if (row, col) in merged_cells:
                continue
            cell_value = (
                layout[row][col]
                if row < len(layout) and col < len(layout[row])
                else ""
            )
            if not isinstance(cell_value, str):
                cell_value = ""
            cell_key = f"{row}_{col}"
            cell_settings = settings.get(cell_key) or {}
            if not isinstance(cell_settings, dict):
                cell_settings = {}
            slots, rotate_sec, has_explicit = normalize_cell_slots(cell_value, cell_settings)

            span_info = (cell_spans or {}).get(cell_key, {})
            colspan = span_info.get("colspan", 1)
            rowspan = span_info.get("rowspan", 1)
            span_style = f"grid-column: span {colspan}; grid-row: span {rowspan};"

            if not slots:
                grid_html += (
                    f'<div class="grid-cell grid-cell-empty" data-row="{row}" data-col="{col}" '
                    f'style="background-color: #111; {span_style}"></div>'
                )
                continue

            if len(slots) == 1:
                mid, slot_st = slots[0]
                module = get_module(mid) or {}
                cell_color = module.get("color", "#111")
                inner = module.get("inner_html", "")
                show_title = slot_st.get("show_title", True)
                if show_title in (False, "false", "0", 0):
                    show_title = False
                else:
                    show_title = True
                module_name = module.get("name", "") if (show_title and mid) else ""
                wrapped = _wrap_inner_with_title(inner, module_name, show_title)
                sk = settings_key_for_slot(cell_key, 0, has_explicit)
                safe_id = "".join(c for c in mid if c.isalnum() or c in "_-").replace(" ", "-").strip("-") or ""
                cell_class = f"grid-cell grid-cell-{safe_id}" if safe_id else "grid-cell"
                style = f"background-color: {cell_color}; {span_style}"
                sk_attr = html_module.escape(sk, quote=True)
                map_inst_attr = ""
                if mid == "map":
                    mid_esc = html_module.escape(f"{cell_key}_slot0", quote=True)
                    map_inst_attr = f' data-map-instance-id="{mid_esc}"'
                grid_html += (
                    f'<div class="{cell_class}" data-row="{row}" data-col="{col}" data-settings-key="{sk_attr}" '
                    f'data-slot-index="0"{map_inst_attr} style="{style}">{wrapped}</div>'
                )
                continue

            # Multi-slot rotating stack
            first_mod = get_module(slots[0][0]) or {}
            stack_color = first_mod.get("color", "#111")
            rs = html_module.escape(str(int(rotate_sec)), quote=True)
            anim = html_module.escape(parse_rotate_animation(cell_settings), quote=True)
            stack_html_parts: list[str] = [
                f'<div class="grid-cell grid-cell-stack" data-row="{row}" data-col="{col}" '
                f'data-rotate-seconds="{rs}" data-rotate-animation="{anim}" '
                f'style="background-color: {stack_color}; {span_style}">'
                f'<div class="glancerf-cell-stack-inner">'
            ]
            for slot_idx, (mid, slot_st) in enumerate(slots):
                module = get_module(mid) or {}
                inner = module.get("inner_html", "")
                show_title = slot_st.get("show_title", True)
                if show_title in (False, "false", "0", 0):
                    show_title = False
                else:
                    show_title = True
                module_name = module.get("name", "") if (show_title and mid) else ""
                wrapped = _wrap_inner_with_title(inner, module_name, show_title)
                sk = settings_key_for_slot(cell_key, slot_idx, True)
                sk_attr = html_module.escape(sk, quote=True)
                safe_id = "".join(c for c in mid if c.isalnum() or c in "_-").replace(" ", "-").strip("-") or ""
                slot_class = f"glancerf-cell-slot grid-cell-{safe_id}" if safe_id else "glancerf-cell-slot"
                active = " glancerf-cell-slot-active" if slot_idx == 0 else ""
                map_inst_attr = ""
                if mid == "map":
                    mid_esc = html_module.escape(f"{cell_key}_slot{slot_idx}", quote=True)
                    map_inst_attr = f' data-map-instance-id="{mid_esc}"'
                stack_html_parts.append(
                    f'<div class="{slot_class}{active}" data-slot-index="{slot_idx}" data-row="{row}" '
                    f'data-col="{col}" data-settings-key="{sk_attr}"{map_inst_attr}>{wrapped}</div>'
                )
            stack_html_parts.append("</div></div>")
            grid_html += "".join(stack_html_parts)
    return grid_html
