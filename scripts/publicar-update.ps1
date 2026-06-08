# ============================================================
# publicar-update.ps1
# Automatiza la publicacion de una nueva version del POS
# Uso: .\scripts\publicar-update.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Sistema POS - Publicador de Updates  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Leer version actual
$pkg = Get-Content "package.json" | ConvertFrom-Json
$version = $pkg.version
Write-Host "Version actual en package.json: " -NoNewline
Write-Host $version -ForegroundColor Yellow
Write-Host ""

$nueva = Read-Host "Nueva version (ej: 1.0.1) [Enter para mantener $version]"
if ([string]::IsNullOrWhiteSpace($nueva)) {
  $nueva = $version
}

# Actualizar version en package.json
$pkgJson = Get-Content "package.json" -Raw
$pkgJson = $pkgJson -replace '"version": "[^"]*"', "`"version`": `"$nueva`""
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText("package.json", $pkgJson, $utf8NoBom)
Write-Host "Version actualizada a $nueva en package.json (sin BOM)" -ForegroundColor Green

# Build del Next.js
Write-Host ""
Write-Host ">>> Compilando Next.js..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Error en next build" -ForegroundColor Red; exit 1 }

# Build del instalador con electron-builder
Write-Host ""
Write-Host ">>> Generando instalador de Windows..." -ForegroundColor Cyan
npx electron-builder --win --publish never
if ($LASTEXITCODE -ne 0) { Write-Host "Error en electron-builder" -ForegroundColor Red; exit 1 }

# Buscar archivos generados
$distDir = Join-Path $root "dist-installer"
$exeFile = Get-ChildItem $distDir -Filter "*.exe" | Where-Object { $_.Name -notlike "*Uninstall*" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$ymlFile = Get-ChildItem $distDir -Filter "latest.yml" | Select-Object -First 1

if (-not $exeFile) { Write-Host "No se encontro el .exe en dist-installer/" -ForegroundColor Red; exit 1 }
if (-not $ymlFile) { Write-Host "No se encontro latest.yml en dist-installer/" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Archivos generados:" -ForegroundColor Green
Write-Host "  $($exeFile.FullName) ($([math]::Round($exeFile.Length/1MB, 1)) MB)"
Write-Host "  $($ymlFile.FullName)"

# Copiar a carpeta updates/
$updatesDir = Join-Path $root "updates"
if (-not (Test-Path $updatesDir)) { New-Item -ItemType Directory -Path $updatesDir | Out-Null }

# Limpiar versiones antiguas del instalador
Get-ChildItem $updatesDir -Filter "*.exe" | Remove-Item -Force
Get-ChildItem $updatesDir -Filter "*.blockmap" | Remove-Item -Force

Copy-Item $exeFile.FullName -Destination $updatesDir -Force
Copy-Item $ymlFile.FullName -Destination $updatesDir -Force

# Copiar blockmap si existe
$blockmapFile = Get-ChildItem $distDir -Filter "*.blockmap" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($blockmapFile) {
  Copy-Item $blockmapFile.FullName -Destination $updatesDir -Force
  Write-Host "  $($blockmapFile.Name) (blockmap para actualizacion diferencial)"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Listo! Version $nueva publicada en updates/" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Contenido de updates/:" -ForegroundColor Cyan
Get-ChildItem $updatesDir | Format-Table Name, @{L='Tamano';E={[math]::Round($_.Length/1KB,1)+"KB"}}, LastWriteTime -AutoSize

Write-Host ""
$iniciar = Read-Host "Iniciar servidor de actualizaciones ahora? (s/N)"
if ($iniciar -eq "s" -or $iniciar -eq "S") {
  Write-Host ""
  Write-Host "Servidor iniciado. Clientes deben apuntar a:" -ForegroundColor Cyan
  
  # Obtener IP local
  $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" } | Select-Object -First 1).IPAddress
  Write-Host "  http://${ip}:3457" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Presiona Ctrl+C para detener el servidor" -ForegroundColor Gray
  node update-server.js
}
