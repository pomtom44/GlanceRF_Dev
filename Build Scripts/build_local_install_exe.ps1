$ErrorActionPreference = "Stop"

# -----------------------------------------------------------------------------
# Builds the local/Stage-2 installer EXE (PS2EXE) for either Prod or Dev,
# one variant per run.
#
# Always compiles from GlanceRF's (prod) canonical installers\install-windows-gui.ps1
# - for a Dev build, DEV branding is injected into the source text at build time
# (window title / message box titles), so there is only ever one hand-maintained
# source script, never two files that can silently drift apart.
#
# Prompts for:
#   - Prod or Dev
#   - Version number (embedded as the EXE's file/product version)
#
# Output: .\output\localinstallers\GlanceRF-Install-Windows.exe (same filename
# either way - move it into the target repo's installers\ folder after building)
#
# Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File "build_local_install_exe.ps1"
# -----------------------------------------------------------------------------

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DevRepoRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path

# --- Locate the prod (GlanceRF) repo: try the sibling-folder default, but never
# assume it silently - confirm/override if it's not actually there. ---
$DefaultProdRoot = Join-Path (Split-Path -Parent $DevRepoRoot) "GlanceRF"
$ProdRepoRoot = $DefaultProdRoot
if (-not (Test-Path (Join-Path $ProdRepoRoot "installers\install-windows-gui.ps1"))) {
    Write-Host "Could not find the GlanceRF (prod) repo at the expected sibling path:"
    Write-Host "  $DefaultProdRoot"
    $ProdRepoRoot = Read-Host "Enter the path to the GlanceRF (prod) repo root"
    if (-not (Test-Path (Join-Path $ProdRepoRoot "installers\install-windows-gui.ps1"))) {
        throw "install-windows-gui.ps1 not found under: $ProdRepoRoot\installers"
    }
}
$ProdRepoRoot = (Resolve-Path $ProdRepoRoot).Path
$SourcePs1 = Join-Path $ProdRepoRoot "installers\install-windows-gui.ps1"
$ProdIcon = Join-Path $ProdRepoRoot "logos\logo.ico"
$DevIcon = Join-Path $DevRepoRoot "logos\logo.ico"

$OutputDir = Join-Path $ScriptDir "output\localinstallers"
$OutputExe = Join-Path $OutputDir "GlanceRF-Install-Windows.exe"

# --- Ask which variant ---
Write-Host ""
Write-Host "Build for:"
Write-Host "  1) Prod (GlanceRF)"
Write-Host "  2) Dev  (GlanceRF_Dev)"
$choice = Read-Host "Choice (1/2)"
$isDev = ($choice -eq "2")

# --- Ask for version number ---
$versionInput = Read-Host "Version number (e.g. 2.1.0)"
$parts = @($versionInput -split "\.")
while ($parts.Count -lt 4) { $parts += "0" }
$version = ($parts[0..3] -join ".")
if ($version -notmatch "^\d+\.\d+\.\d+\.\d+$") {
    throw "Invalid version number: '$versionInput' (expected something like 2.1.0 or 2.1.0.0)"
}

$title = if ($isDev) { "GlanceRF (DEV) Installer" } else { "GlanceRF Installer" }
$product = if ($isDev) { "GlanceRF Dev" } else { "GlanceRF" }
$icon = if ($isDev) { $DevIcon } else { $ProdIcon }

# --- Ensure the ps2exe module is available ---
if (-not (Get-Module -ListAvailable -Name ps2exe)) {
    Write-Host "ps2exe module not found. Installing from PSGallery (CurrentUser scope)..."
    try {
        Install-Module -Name ps2exe -Scope CurrentUser -Force -AllowClobber
    } catch {
        throw "Failed to install the ps2exe module: $_`nInstall it manually with: Install-Module -Name ps2exe -Scope CurrentUser"
    }
}
Import-Module ps2exe -ErrorAction Stop
if (-not (Get-Command Invoke-ps2exe -ErrorAction SilentlyContinue)) {
    throw "Invoke-ps2exe not available after importing the ps2exe module."
}

# --- Syntax-check the canonical source before compiling ---
Write-Host "Checking syntax of $SourcePs1 ..."
$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($SourcePs1, [ref]$null, [ref]$parseErrors) | Out-Null
if ($parseErrors -and $parseErrors.Count -gt 0) {
    Write-Host "install-windows-gui.ps1 has $($parseErrors.Count) syntax error(s):"
    $parseErrors | ForEach-Object { Write-Host " - $_" }
    throw "Fix the syntax errors above before building."
}

# --- Build source: prod as-is, dev = prod source with branding substituted ---
$BuildSourcePs1 = $SourcePs1
$tempFile = $null
if ($isDev) {
    $content = Get-Content -LiteralPath $SourcePs1 -Raw
    $devContent = $content -replace [regex]::Escape("GlanceRF Installer"), "GlanceRF (DEV) Installer"
    $tempFile = Join-Path $env:TEMP "install-windows-gui-dev-$([Guid]::NewGuid().ToString('N')).ps1"
    Set-Content -LiteralPath $tempFile -Value $devContent -Encoding UTF8
    $BuildSourcePs1 = $tempFile
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
if (Test-Path -LiteralPath $OutputExe) { Remove-Item -LiteralPath $OutputExe -Force }

Write-Host "Building $OutputExe (title: '$title', version: $version)..."
$ps2exeArgs = @{
    inputFile  = $BuildSourcePs1
    outputFile = $OutputExe
    noConsole  = $true
    x64        = $true
    title      = $title
    product    = $product
    version    = $version
}
if ($icon -and (Test-Path $icon)) { $ps2exeArgs["iconFile"] = $icon }

try {
    Invoke-ps2exe @ps2exeArgs
} finally {
    if ($tempFile -and (Test-Path $tempFile)) { Remove-Item $tempFile -Force -ErrorAction SilentlyContinue }
}

if (-not (Test-Path $OutputExe)) { throw "Build failed: $OutputExe was not created." }

$hash = (Get-FileHash -LiteralPath $OutputExe -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host ""
Write-Host "Done: $OutputExe"
Write-Host "Variant: $(if ($isDev) { 'Dev' } else { 'Prod' })"
Write-Host "Version: $version"
Write-Host "SHA256: $hash"
Write-Host ""
$targetHint = if ($isDev) { "GlanceRF_Dev\installers\GlanceRF-Install-Windows.exe" } else { "GlanceRF\installers\GlanceRF-Install-Windows.exe" }
Write-Host "Move it to: $targetHint"
