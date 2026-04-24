"""
Log caught exceptions with tracebacks so default and verbose logs show root causes.

Use only inside an ``except`` block (``exc_info=True`` uses the active exception).
"""

from __future__ import annotations

import logging
from typing import Any


def log_unexpected(logger: logging.Logger, msg: str, *args: Any, level: int = logging.WARNING) -> None:
    """Log ``msg % args`` at *level* with full traceback (active exception)."""
    logger.log(level, msg, *args, exc_info=True)


def log_unexpected_debug(logger: logging.Logger, msg: str, *args: Any) -> None:
    """Like :func:`log_unexpected` at DEBUG — enable *verbose* / *debug* log_level for tracebacks."""
    logger.debug(msg, *args, exc_info=True)
