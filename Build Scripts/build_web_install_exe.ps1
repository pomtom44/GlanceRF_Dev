$ErrorActionPreference = "Stop"

# -----------------------------------------------------------------------------
# Builds both Windows bootstrap installer EXEs (release + dev) from the
# GlanceRF.NativeBootstrap C# WinForms project (sibling folder to this script).
# Same source, compile-time BootstrapVariant flag selects target repo + branding.
#
#   Release:  https://github.com/pomtom44/GlanceRF/archive/refs/heads/main.zip
#             -> GlanceRF-Install-Windows.exe (default publish; no BootstrapVariant)
#
#   Dev:      https://github.com/pomtom44/GlanceRF_Dev/archive/refs/heads/main.zip
#             -> GlanceRF-Dev-Install-Windows.exe (publish with -p:BootstrapVariant=Dev)
#
# Both EXEs: net481, win-x64, not self-contained; same wizard code, compile-time channel only.
#
# Output goes to .\output\webinstallers next to this script. Move the built EXEs to
# their target folder (GlanceRF_Web\installers\) manually after building.
#
# Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File "build_web_install_exe.ps1"
# -----------------------------------------------------------------------------

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NativeProject = Join-Path $ScriptDir "GlanceRF.NativeBootstrap\GlanceRF.NativeBootstrap.csproj"

$OutputDir = Join-Path $ScriptDir "output\webinstallers"
$NativeOutRelease = Join-Path $OutputDir "native"
$NativeOutDev = Join-Path $OutputDir "native-dev"

$FinalReleaseExe = Join-Path $OutputDir "GlanceRF-Install-Windows.exe"
$FinalReleaseSha256 = "$FinalReleaseExe.sha256"
$FinalDevExe = Join-Path $OutputDir "GlanceRF-Dev-Install-Windows.exe"
$FinalDevSha256 = "$FinalDevExe.sha256"

if (-not (Test-Path -LiteralPath $NativeProject)) {
    throw "Project not found: $NativeProject"
}

function Get-GitDescribe {
    try {
        $git = Get-Command git -ErrorAction SilentlyContinue
        if (-not $git) { return $null }

        $repoTop = (& git -C $ScriptDir rev-parse --show-toplevel 2>$null).Trim()
        if (-not $repoTop) { return $null }

        $commit = (& git -C $repoTop rev-parse HEAD 2>$null).Trim()
        if (-not $commit) { return $null }

        $dirty = ""
        $status = & git -C $repoTop status --porcelain 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($status)) {
            $dirty = " (dirty)"
        }

        return "$commit$dirty"
    } catch {
        return $null
    }
}

function New-Sha256Sidecar {
    param(
        [Parameter(Mandatory = $true)][string] $FilePath
    )

    if (-not (Test-Path -LiteralPath $FilePath)) {
        throw "Cannot hash missing file: $FilePath"
    }

    $hash = (Get-FileHash -LiteralPath $FilePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $name = [System.IO.Path]::GetFileName($FilePath)
    $sidecar = "$FilePath.sha256"

    # GNU coreutils-ish format: "<hash>  <filename>" (two spaces)
    $line = "$hash  $name"
    $line | Out-File -LiteralPath $sidecar -Encoding utf8 -Force
    return [pscustomobject]@{ Hash = $hash; Sidecar = $sidecar; FileName = $name }
}

function Write-ReleaseChecksums {
    param(
        [Parameter(Mandatory = $true)][string] $OutPath,
        [Parameter(Mandatory = $true)][object[]] $Entries,
        [string] $GitDescribe
    )

    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("GlanceRF Windows bootstrap checksums (release + dev)")
    $lines.Add("Generated (UTC): $([DateTime]::UtcNow.ToString('yyyy-MM-dd HH:mm:ss'))")
    if (-not [string]::IsNullOrWhiteSpace($GitDescribe)) {
        $lines.Add("Git: $GitDescribe")
    }
    $lines.Add("")
    $lines.Add("Verify on Windows (PowerShell, hash is case-insensitive):")
    $lines.Add('  (Get-FileHash -Algorithm SHA256 -LiteralPath ".\\GlanceRF-Install-Windows.exe").Hash.ToLowerInvariant()')
    $lines.Add('  (Get-FileHash -Algorithm SHA256 -LiteralPath ".\\GlanceRF-Dev-Install-Windows.exe").Hash.ToLowerInvariant()')
    $lines.Add('  cmd.exe: certutil -hashfile "GlanceRF-Install-Windows.exe" SHA256')
    $lines.Add('  cmd.exe: certutil -hashfile "GlanceRF-Dev-Install-Windows.exe" SHA256')
    $lines.Add("")
    $lines.Add("Compare each computed SHA256 to the matching .sha256 sidecar or to the entries below.")
    $lines.Add("")
    $lines.Add("Files:")
    foreach ($e in $Entries) {
        $fi = Get-Item -LiteralPath $e.Path
        $lines.Add("- $($e.Name)")
        $lines.Add("  Path: $($e.Path)")
        $lines.Add("  Bytes: $($fi.Length)")
        $lines.Add("  SHA256: $($e.Hash)")
        $lines.Add("  SHA256 sidecar: $($e.Sidecar)")
        $lines.Add("")
    }

    $lines -join [Environment]::NewLine | Out-File -LiteralPath $OutPath -Encoding utf8 -Force
}

function Resolve-DotNetExe {
    $candidates = @(
        (Join-Path ${env:ProgramFiles} "dotnet\dotnet.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "dotnet\dotnet.exe")
    ) | Where-Object { $_ -and (Test-Path $_) }

    $pathCmd = Get-Command dotnet -ErrorAction SilentlyContinue
    if ($pathCmd -and $pathCmd.Source) {
        $candidates = @($pathCmd.Source) + $candidates
    }

    foreach ($exe in $candidates) {
        if (-not $exe -or -not (Test-Path $exe)) { continue }
        $sdks = & $exe --list-sdks 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($sdks | Out-String))) {
            return $exe
        }
    }

    return $null
}

function Publish-NativeBootstrap {
    param(
        [Parameter(Mandatory = $true)][string] $DotNetExe,
        [Parameter(Mandatory = $true)][string] $ProjectPath,
        [Parameter(Mandatory = $true)][string] $OutputDir,
        [string[]] $ExtraPublishArgs = @()
    )

    if (Test-Path -LiteralPath $OutputDir) {
        Remove-Item -LiteralPath $OutputDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

    & $DotNetExe publish $ProjectPath `
        -c Release `
        -r win-x64 `
        --self-contained false `
        -p:DebugType=None `
        -o $OutputDir `
        @ExtraPublishArgs

    if ($LASTEXITCODE -ne 0) {
        throw "Native bootstrap EXE build failed (output: $OutputDir)."
    }
}

$dotnetExe = Resolve-DotNetExe
if (-not $dotnetExe) {
    throw @"
No usable .NET SDK dotnet.exe was found.

Common cause on 64-bit Windows: PATH resolves `dotnet` to the x86 host
(`Program Files (x86)\dotnet`) which may have runtimes but no SDKs, while the SDK is installed under:
  C:\Program Files\dotnet\dotnet.exe

Fix options:
  1) Prefer x64 dotnet on PATH (put `C:\Program Files\dotnet\` before `C:\Program Files (x86)\dotnet\`)
  2) Or install/repair .NET 8 SDK:
       winget install --id Microsoft.DotNet.SDK.8 --exact

Verify:
  & `"$env:ProgramFiles\dotnet\dotnet.exe`" --list-sdks
"@
}

Write-Host "Using dotnet: $dotnetExe"

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

Write-Host "Removing previous installer outputs (fresh build)..."
foreach ($p in @($FinalReleaseExe, $FinalReleaseSha256, $FinalDevExe, $FinalDevSha256)) {
    if (Test-Path -LiteralPath $p) {
        Remove-Item -LiteralPath $p -Force
    }
}

foreach ($d in @($NativeOutRelease, $NativeOutDev)) {
    if (Test-Path -LiteralPath $d) {
        Remove-Item -LiteralPath $d -Recurse -Force
    }
}

Write-Host "Publishing release bootstrap (GlanceRF main ZIP)..."
Publish-NativeBootstrap -DotNetExe $dotnetExe -ProjectPath $NativeProject -OutputDir $NativeOutRelease

$PublishedReleaseExe = Join-Path $NativeOutRelease "GlanceRF-Install-Windows.exe"
if (-not (Test-Path -LiteralPath $PublishedReleaseExe)) {
    throw "Published EXE was not generated: $PublishedReleaseExe"
}

Copy-Item $PublishedReleaseExe $FinalReleaseExe -Force

Write-Host "Publishing dev bootstrap (GlanceRF_Dev main ZIP)..."
Publish-NativeBootstrap -DotNetExe $dotnetExe -ProjectPath $NativeProject -OutputDir $NativeOutDev -ExtraPublishArgs @("-p:BootstrapVariant=Dev")

$PublishedDevExe = Join-Path $NativeOutDev "GlanceRF-Dev-Install-Windows.exe"
if (-not (Test-Path -LiteralPath $PublishedDevExe)) {
    throw "Published dev EXE was not generated: $PublishedDevExe"
}

Copy-Item $PublishedDevExe $FinalDevExe -Force

Write-Host "Writing SHA256 checksums..."
$git = Get-GitDescribe

$publishedReleaseMeta = New-Sha256Sidecar -FilePath $PublishedReleaseExe
$finalReleaseMeta = New-Sha256Sidecar -FilePath $FinalReleaseExe
$publishedDevMeta = New-Sha256Sidecar -FilePath $PublishedDevExe
$finalDevMeta = New-Sha256Sidecar -FilePath $FinalDevExe

$releasePath = Join-Path $OutputDir "RELEASE-CHECKSUMS.txt"
Write-ReleaseChecksums -OutPath $releasePath -GitDescribe $git -Entries @(
    [pscustomobject]@{ Name = $publishedReleaseMeta.FileName; Path = $PublishedReleaseExe; Hash = $publishedReleaseMeta.Hash; Sidecar = $publishedReleaseMeta.Sidecar },
    [pscustomobject]@{ Name = $finalReleaseMeta.FileName; Path = $FinalReleaseExe; Hash = $finalReleaseMeta.Hash; Sidecar = $finalReleaseMeta.Sidecar },
    [pscustomobject]@{ Name = $publishedDevMeta.FileName; Path = $PublishedDevExe; Hash = $publishedDevMeta.Hash; Sidecar = $publishedDevMeta.Sidecar },
    [pscustomobject]@{ Name = $finalDevMeta.FileName; Path = $FinalDevExe; Hash = $finalDevMeta.Hash; Sidecar = $finalDevMeta.Sidecar }
)

Write-Host ""
Write-Host "Completed."
Write-Host "Release EXE: $FinalReleaseExe"
Write-Host "Release SHA256: $($finalReleaseMeta.Hash)"
Write-Host "Dev EXE: $FinalDevExe"
Write-Host "Dev SHA256: $($finalDevMeta.Hash)"
Write-Host "Checksum summary: $releasePath"
Write-Host ""
Write-Host "Move the built EXEs to GlanceRF_Web\installers\ (or wherever they need to be published) manually."
