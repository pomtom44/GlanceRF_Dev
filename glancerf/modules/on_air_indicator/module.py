"""Shows On-Air (red) or Off-Air (grey). Toggle via GPIO or keyboard shortcut."""

from glancerf.modules.loader import load_assets

inner_html, css, js = load_assets(__file__)

MODULE = {
    "id": "on_air_indicator",
    "name": "On-Air Indicator",
    "color": "#0d1117",
    "inner_html": inner_html,
    "css": css,
    "js": js,
    "settings": [
        {"id": "on_the_air_shortcut", "label": "Keyboard shortcut (optional)", "type": "text", "default": "", "placeholder": "e.g. F12"},
    ],
    "gpio": {
        "inputs": [{"id": "on_air_indicator", "name": "On-Air Indicator"}],
    },
}


def _on_gpio_on_air_indicator(value: bool) -> None:
    """GPIO input: On-Air Indicator toggle. UI receives gpio_input WebSocket and updates display."""
    pass


GPIO_INPUT_HANDLERS = {"on_air_indicator": _on_gpio_on_air_indicator}
