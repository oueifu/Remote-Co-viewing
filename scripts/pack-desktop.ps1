# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Q Credit

$ErrorActionPreference = "Stop"

$Version = "0.9.0-beta.1"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ReleaseDir = Join-Path $ProjectRoot "release"
$DistName = "SyncCinema-v$Version-win-x64"
$TargetDir = Join-Path $ReleaseDir $DistName
$ZipFile = Join-Path $ReleaseDir "$DistName.zip"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Building Desktop Release: $DistName" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

if (Test-Path $TargetDir) {
    Write-Host "Cleaning existing build directory: $TargetDir"
    Remove-Item -Path $TargetDir -Recurse -Force
}
if (Test-Path $ZipFile) {
    Remove-Item -Path $ZipFile -Force
}

New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null

$FilesToCopy = @(
    "server.js",
    "mpv-client.js",
    "package.json",
    "package-lock.json",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "README.md",
    ".env.example",
    "双击运行.bat"
)

foreach ($file in $FilesToCopy) {
    $src = Join-Path $ProjectRoot $file
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $TargetDir $file) -Force
    }
}

$DirsToCopy = @("public", "electron", "node_modules")
foreach ($dir in $DirsToCopy) {
    $src = Join-Path $ProjectRoot $dir
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $TargetDir $dir) -Recurse -Force
    }
}

Write-Host "Packaging release zip archive..." -ForegroundColor Yellow
Compress-Archive -Path "$TargetDir\*" -DestinationPath $ZipFile -Force

$ZipSizeMb = [math]::Round(((Get-Item $ZipFile).Length / 1MB), 2)
Write-Host "==========================================" -ForegroundColor Green
Write-Host " Build Complete!" -ForegroundColor Green
Write-Host " Output Directory: $TargetDir" -ForegroundColor Green
Write-Host " Release Archive:  $ZipFile ($ZipSizeMb MB)" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
