# GlanceRF

**Open-source ham-radio dashboard** — clocks, maps, weather, countdowns, and more, arranged in a grid you choose so what matters is visible at a glance.

A modern rebuild of Elwoods Hamclock. Run it in a desktop window, in the browser, or headless on **Windows**, **Linux**, **macOS**, **Raspberry Pi**, or **Docker**. With thanks to Elwood for the original project that inspired this one.

*Disclaimer: This is a personal project. I built it for my needs but designed it for ease of use for others. I do my best with requests and bugs, though support and feature work may slow when life gets busy.*

![Main dashboard](docs/screenshots/Main%20Dashboard.png)

---

## How do I install?

**[Quick & easy — get the installer](https://glancerf.zl4st.com/quickstart.html)** — Download for Windows, run one command for Linux or Mac, or use Docker. Follow the prompts. Done.

| | |
| :--- | :--- |
| **Website** | [glancerf.zl4st.com](https://glancerf.zl4st.com) — quickstart, GPIO wiring, full documentation home |
| **Docker Hub** | [pomtom44/glancerf](https://hub.docker.com/r/pomtom44/glancerf) |

---

## Features

- **Modes** — Desktop app or browser. Run locally, or as a service. Read-only port for public displays.
- **Layout** — Any grid size, any monitor; modules resize to fit. Choose which modules go where and resize or expand cells.
- **Example modules** — Clocks. Maps with overlays. Weather. RSS. APRS. SOTA/POTA. See **[Modules](docs/04.Modules.md)** for the full list.

---

## Screenshots

| Main dashboard | Setup | Layout editor |
| :---: | :---: | :---: |
| ![Main dashboard](docs/screenshots/Main%20Dashboard.png) | ![Setup](docs/screenshots/Setup%20Page%201.png) | ![Layout editor](docs/screenshots/Editor%20Layout.png) |

More screenshots on the **[website](https://glancerf.zl4st.com)**.

---

## Installation (four ways)

| Method | Description |
|--------|-------------|
| **1. Core installer** | Download from [glancerf.zl4st.com/installers/](https://glancerf.zl4st.com/installers/) — `GlanceRF-Install-Windows.exe`, `GlanceRF-install-Linux.sh`, or `GlanceRF-install-Mac.sh`. Runs the full installer. |
| **2. GitHub + installer** | Download the [GitHub ZIP](https://github.com/pomtom44/GlanceRF/archive/refs/heads/main.zip), extract, then run the installer from `Project/installers`. |
| **3. Docker** | `docker run -p 8080:8080 pomtom44/glancerf` — see **[Docker](docs/05.Docker.md)** and repo **[DOCKER.md](../DOCKER.md)** for options. |
| **4. Manual** | Clone or download from GitHub, then `pip install -r requirements/requirements-linux.txt` (Linux), `requirements-mac.txt` (macOS), or `requirements-windows.txt` / `requirements-windows-desktop.txt` (Windows) and `python run.py` from the `Project` folder. |

Details: **[Installation](docs/01.Installation.md)**.

---

## Documentation

Guides in this repo use the same numbering as the **[documentation home](https://glancerf.zl4st.com/documentation.html)** on the site (HTML is generated from these Markdown files).

| | |
| :--- | :--- |
| [Installation](docs/01.Installation.md) | Windows, Linux, macOS, Docker |
| [User guide](docs/02.UserGuide.md) | Setup, menu, layout, run at logon, daily use |
| [Configuration](docs/03.Configuration.md) | Config keys, environment variables |
| [Modules](docs/04.Modules.md) | Available modules, map overlays |
| [Docker](docs/05.Docker.md) | Container options |
| [Debugging](docs/06.Debugging.md) | Log levels, APRS debug, troubleshooting |
| [Telemetry](docs/07.Telemetry.md) | What is collected and how to opt out |
| [Third party & services](docs/08.ThirdPartyAndServices.md) | External dependencies and APIs |
| [Architecture](docs/09.Architecture.md) | Project structure, routes, services |
| [Creating a module](docs/10.CreatingAModule.md) | How to add a custom cell module |
| [Feature requests](docs/11.FeatureRequests.md) | Requested features and status |

---

## Technology

**Python 3.8+**. FastAPI and WebSockets. Config in `glancerf_config.json`. Install dependencies with `requirements-linux.txt`, `requirements-mac.txt`, `requirements-windows.txt`, or `requirements-windows-desktop.txt` (PyQt5 / PyQtWebEngine for Windows desktop).

Python · FastAPI · WebSocket · PyQt · Uvicorn

---

## Run modes

| Mode | Description |
|------|-------------|
| **Desktop** | Native PyQt5 window with embedded browser. Console hidden on Windows. |
| **Browser** | Terminal + browser. Server runs in the terminal; opens the default browser. |
| **Terminal** | Terminal only. Server runs in the terminal; no automatic browser. |
| **Headless** | Server only. No window. Use as a Windows service, systemd, or launchd. Tray icon (headless only) for quick access. |

Set via `desktop_mode` in config or the installers.

---

## Feature requests & bugs

See **[Feature requests](docs/11.FeatureRequests.md)** for the list. Open an **[Issue](https://github.com/pomtom44/GlanceRF/issues)** on GitHub. No GitHub account? Email **GlanceRF@zl4st.com**.

---

*This project is developed with AI-assisted tools (e.g. Cursor). Code is reviewed and tested, but please report any issues you encounter.*
