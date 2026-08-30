# Installer EXE builders

This folder is the **only** place exe-builder source/scripts live across the whole project (`GlanceRF`, `GlanceRF_Dev`, `GlanceRF_Web`). Two independent builders, for two different exes:

## `build_web_install_exe.ps1` — Stage 1 web bootstrapper

Builds the two Windows bootstrap EXEs published to `GlanceRF_Web/installers/`:

- **`GlanceRF-Install-Windows.exe`** — downloads `pomtom44/GlanceRF` (`main` branch)
- **`GlanceRF-Dev-Install-Windows.exe`** — downloads `pomtom44/GlanceRF_Dev` (`main` branch)

Both are the **same source** (`GlanceRF.NativeBootstrap/`, a small .NET Framework 4.8.1 WinForms wizard) — a compile-time MSBuild property (`BootstrapVariant`) selects the download URL and branding. See `GlanceRF.NativeBootstrap/InstallerForm.cs` for the two `ZipUrl` constants and `GlanceRF.NativeBootstrap.csproj` for the `BootstrapVariant` condition.

This is the **Stage 1 bootstrapper** only: it downloads the GitHub zip, extracts it, locates the project root, and hands off to the Stage 2 local installer already inside the zip. It does not itself install Python, create a venv, or run GlanceRF.

The EXE is small (~150 KB) because it's **not self-contained** — it targets `net481` and relies on the .NET Framework 4.8 runtime that ships with Windows 10/11.

**Run:**
```powershell
powershell -ExecutionPolicy Bypass -File "build_web_install_exe.ps1"
```
No prompts — always rebuilds **both** variants in one run, writes to `.\output\webinstallers\`:
- `GlanceRF-Install-Windows.exe` + `.sha256`
- `GlanceRF-Dev-Install-Windows.exe` + `.sha256`
- `RELEASE-CHECKSUMS.txt` — human-readable summary of both

**After building, move both EXEs into `GlanceRF_Web/installers/` manually** — this script doesn't publish anywhere itself.

**Prerequisites:** .NET SDK (8.x is fine) — `dotnet --list-sdks` must show at least one SDK. Install with:
```powershell
winget install --id Microsoft.DotNet.SDK.8 --exact
```
If `winget` says the SDK is installed but `dotnet --list-sdks` is empty: on 64-bit Windows, `dotnet` on PATH can resolve to the x86 host (`C:\Program Files (x86)\dotnet\dotnet.exe`, often runtimes-only) while the SDK is under the x64 host (`C:\Program Files\dotnet\dotnet.exe`). The script prefers the x64 host when it finds SDKs there; you can also fix this by reordering PATH.

---

## `build_local_install_exe.ps1` — Stage 2 local installer

Builds the local/full installer EXE (PS2EXE) that gets published to `GlanceRF\installers\GlanceRF-Install-Windows.exe` (prod) or `GlanceRF_Dev\installers\GlanceRF-Install-Windows.exe` (dev) — the one Stage 1 hands off to, and the one that actually creates the `.venv`, installs dependencies, and sets up the service/shortcut/startup task.

Unlike the web bootstrapper, there's no PS2EXE equivalent of a compile-time variant flag, and prod/dev are two entirely separate repos rather than one repo with two remotes — so this builds **one variant per run**, always compiling from `GlanceRF`'s canonical `installers\install-windows-gui.ps1`. For a Dev build, DEV branding (window title / message box titles) is injected into the source **text at build time** via a temp file — there is deliberately no separately hand-maintained Dev copy of the `.ps1` to drift out of sync with prod's bug fixes.

**Run:**
```powershell
powershell -ExecutionPolicy Bypass -File "build_local_install_exe.ps1"
```
Prompts for:
- **Prod or Dev** (1/2)
- **Version number** (e.g. `2.1.0`, normalized to a 4-part file version)

Writes `.\output\localinstallers\GlanceRF-Install-Windows.exe` (same filename either way — move it into the target repo's `installers\` folder after building, per the on-screen instruction at the end of the run).

Locates the `GlanceRF` (prod) repo via the sibling-folder convention (`..\..\GlanceRF` relative to this script) by default, but never assumes it silently — if not found there, it prompts for the path instead of failing.

**Prerequisites:** same PS2EXE module as any PowerShell-based installer build — the script installs it automatically from PSGallery (`CurrentUser` scope) if missing.

---

## History

This folder previously lived in an old, untracked, pre-repo-split snapshot (`Single Installers/Build/windows/` under what's now called `GlanceRF_OLD/` in the main repo), alongside a `Build-Windows-Installer.ps1` wrapper and references to Dev-specific shell/PowerShell bootstrap scripts (`GlanceRF-Dev-Install-Linux.sh`, `-Mac.sh`, `-Windows.ps1`) that were never found to actually exist in any live repo. A separate, older local-installer builder (`GlanceRF.InstallGui`, .NET 6 WinForms, via `Build_Project_Install_Exe.ps1`) also existed in that same legacy snapshot and has since been confirmed fully superseded and removed. This folder now holds the only exe-builder source/scripts across the whole project.
