"""
Background services for GlanceRF.
"""

from glancerf.services.telemetry import TelemetrySender, send_telemetry
from glancerf.services.cache_warmer import start_cache_warmer, stop_cache_warmer
from glancerf.services.aprs_cache import start_aprs_cache, stop_aprs_cache
from glancerf.services.sota_cache import start_sota_cache, stop_sota_cache
from glancerf.services.pota_cache import start_pota_cache, stop_pota_cache
from glancerf.services.wwff_cache import start_wwff_cache, stop_wwff_cache
from glancerf.services.satellite_services import start_satellite_services, stop_satellite_services

__all__ = [
    "TelemetrySender",
    "send_telemetry",
    "start_cache_warmer",
    "stop_cache_warmer",
    "start_aprs_cache",
    "stop_aprs_cache",
    "start_sota_cache",
    "stop_sota_cache",
    "start_pota_cache",
    "stop_pota_cache",
    "start_wwff_cache",
    "stop_wwff_cache",
    "start_satellite_services",
    "stop_satellite_services",
]
