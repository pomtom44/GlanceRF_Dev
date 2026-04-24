"""Activator spots from SOTA, POTA and WWFF. Pick which sources to show."""

from glancerf.modules.loader import load_assets

inner_html, css, js = load_assets(__file__)

MODULE = {
    "id": "ota_programs",
    "name": "OTA Programs",
    "color": "#1a3a2a",
    "inner_html": inner_html,
    "css": css,
    "js": js,
    "settings": [
        {"id": "show_sota_spots", "label": "SOTA spots", "type": "checkbox", "default": True},
        {"id": "show_sota_alerts", "label": "SOTA alerts", "type": "checkbox", "default": True},
        {"id": "show_pota_spots", "label": "POTA spots", "type": "checkbox", "default": True},
        {"id": "show_wwff_spots", "label": "WWFF spots", "type": "checkbox", "default": True},
        {
            "id": "list_mode",
            "label": "List display",
            "type": "select",
            "options": [
                {"value": "separate", "label": "Separate (SOTA / POTA / WWFF sections)"},
                {"value": "together", "label": "Together (one combined list)"},
            ],
            "default": "separate",
        },
        {"id": "show_countdown", "label": "Countdown to scheduled alert", "type": "checkbox", "default": True},
        {"id": "show_time_since", "label": "Time since spot", "type": "checkbox", "default": True},
        {
            "id": "cache_hours_past",
            "label": "How far past to keep (hours)",
            "type": "number",
            "min": 1,
            "max": 720,
            "default": "24",
            "placeholder": "Log retention & cache purge",
        },
        {
            "id": "cache_hours_future",
            "label": "How far future to cache (hours)",
            "type": "number",
            "min": 1,
            "max": 720,
            "default": "168",
            "placeholder": "SOTA alerts scheduled ahead",
        },
        {
            "id": "callsign_filter",
            "label": "Callsign filter",
            "type": "text",
            "default": "",
            "placeholder": "e.g. G4 or /P",
        },
        {"id": "show_on_map", "label": "Show on map", "type": "checkbox", "default": False},
    ],
    "cache_warmer": True,
}
