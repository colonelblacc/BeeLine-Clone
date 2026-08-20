#!/usr/bin/env pwsh
# ============================================================
#  BeeLine Companion App — Auto Debug Pipeline
#  Usage: .\debug.ps1 [options]
#  Options:
#    -Rebuild     Force a full Gradle rebuild before launching
#    -LogLevel    Logcat filter level: V, D, I, W, E (default: V)
#    -NoLaunch    Start Metro + logcat only, don't launch the app
# ============================================================
param(
    [switch]$Rebuild,
    [string]$LogLevel = "V",
    [switch]$NoLaunch
)

# ── Config ───────────────────────────────────────────────────
$PACKAGE     = "com.anonymous.companion_app"
$ACTIVITY    = "$PACKAGE/.MainActivity"
$METRO_PORT  = 8081
$SCRIPT_DIR  = $PSScriptRoot

# ── Colours ──────────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "`n▶  $msg" -ForegroundColor Cyan   }
function Write-OK    { param($msg) Write-Host "✅  $msg" -ForegroundColor Green  }
function Write-Warn  { param($msg) Write-Host "⚠️   $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "❌  $msg" -ForegroundColor Red    }
function Write-Info  { param($msg) Write-Host "   $msg"  -ForegroundColor Gray   }

# ── Banner ───────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║   BeeLine Companion — Debug Pipeline     ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

# ────────────────────────────────────────────────────────────
# STEP 1 — Check ADB is available
# ────────────────────────────────────────────────────────────
Write-Step "Checking ADB..."
try {
    $null = Get-Command adb -ErrorAction Stop
    Write-OK "ADB found: $(adb version | Select-Object -First 1)"
} catch {
    Write-Fail "ADB not found in PATH. Install Android Platform Tools."
    exit 1
}

# ────────────────────────────────────────────────────────────
# STEP 2 — Wait for device
# ────────────────────────────────────────────────────────────
Write-Step "Waiting for Android device..."
$maxWait = 30
$waited  = 0
while ($waited -lt $maxWait) {
    $rawDevices = adb devices 2>&1 | Select-String -Pattern "\tdevice$"
    if ($rawDevices) { break }
    Write-Info "No device yet... retrying in 2s ($waited/$maxWait s)"
    Start-Sleep -Seconds 2
    $waited += 2
}

$rawDevices = adb devices 2>&1 | Select-String -Pattern "\tdevice$"
if (-not $rawDevices) {
    Write-Fail "No authorized device found after $maxWait seconds."
    Write-Warn "Make sure: USB Debugging is ON, cable is plugged in, and 'Allow' was tapped on the phone."
    exit 1
}

# Parse device serial
$DEVICE_SERIAL = ($rawDevices | Select-Object -First 1).ToString().Split("`t")[0].Trim()
Write-OK "Device connected: $DEVICE_SERIAL"

# Show device model
$model = adb -s $DEVICE_SERIAL shell getprop ro.product.model 2>&1
Write-Info "Model: $model"

# Check for unauthorised
$unauth = adb devices | Select-String "unauthorized"
if ($unauth) {
    Write-Warn "Some devices are unauthorized — check phone for 'Allow USB debugging?' prompt."
}

# ────────────────────────────────────────────────────────────
# STEP 3 — Port forwarding (ADB reverse)
# ────────────────────────────────────────────────────────────
Write-Step "Setting up port forwarding (device → Metro :$METRO_PORT)..."
adb -s $DEVICE_SERIAL reverse "tcp:$METRO_PORT" "tcp:$METRO_PORT" | Out-Null
Write-OK "Port $METRO_PORT forwarded"

# ────────────────────────────────────────────────────────────
# STEP 4 — Kill stale Metro instances
# ────────────────────────────────────────────────────────────
Write-Step "Checking for stale Metro process on port $METRO_PORT..."
$stale = Get-NetTCPConnection -LocalPort $METRO_PORT -ErrorAction SilentlyContinue
if ($stale) {
    $stalePid = ($stale | Select-Object -First 1).OwningProcess
    Write-Warn "Killing stale process PID $stalePid on port $METRO_PORT"
    Stop-Process -Id $stalePid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# ────────────────────────────────────────────────────────────
# STEP 5 — Optional Gradle rebuild
# ────────────────────────────────────────────────────────────
if ($Rebuild) {
    Write-Step "Running full Gradle build (this takes a few minutes)..."
    Push-Location $SCRIPT_DIR
    $buildResult = npx expo run:android 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Build failed!"
        $buildResult | Select-String -Pattern "error|FAILED|Exception" | ForEach-Object { Write-Host $_ -ForegroundColor Red }
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-OK "Build & install complete"
}

# ────────────────────────────────────────────────────────────
# STEP 6 — Start Metro bundler in a new window
# ────────────────────────────────────────────────────────────
Write-Step "Starting Metro bundler on port $METRO_PORT..."
$metroCmd = "cd '$SCRIPT_DIR'; npx expo start --port $METRO_PORT"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $metroCmd -WindowStyle Normal
Start-Sleep -Seconds 3
Write-OK "Metro window launched"

# ────────────────────────────────────────────────────────────
# STEP 7 — Launch app on device
# ────────────────────────────────────────────────────────────
if (-not $NoLaunch) {
    Write-Step "Launching $PACKAGE on device..."
    adb -s $DEVICE_SERIAL shell am force-stop $PACKAGE 2>&1 | Out-Null
    Start-Sleep -Seconds 1
    adb -s $DEVICE_SERIAL shell am start -n $ACTIVITY 2>&1 | Out-Null
    Write-OK "App launched"
}

# ────────────────────────────────────────────────────────────
# STEP 8 — Live Logcat (filtered, colour-coded)
# ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor DarkCyan
Write-Host "  📡 Live Logcat  (Ctrl+C to stop)             " -ForegroundColor DarkCyan
Write-Host "  Filters: ReactNativeJS · ReactNative · BLE   " -ForegroundColor DarkCyan
Write-Host "═══════════════════════════════════════════════" -ForegroundColor DarkCyan
Write-Host ""

# Clear old logs then stream
adb -s $DEVICE_SERIAL logcat -c 2>&1 | Out-Null
Start-Sleep -Milliseconds 500

adb -s $DEVICE_SERIAL logcat ReactNativeJS:$LogLevel ReactNative:$LogLevel BluetoothGatt:W BtGatt.GattService:W *:S 2>&1 | ForEach-Object {
    $line = $_

    # Colour-code by level
    if      ($line -match "\bE\b.*:") { Write-Host $line -ForegroundColor Red    }
    elseif  ($line -match "\bW\b.*:") { Write-Host $line -ForegroundColor Yellow }
    elseif  ($line -match "console\.error|Error:|WARN")    { Write-Host $line -ForegroundColor Red    }
    elseif  ($line -match "console\.warn")  { Write-Host $line -ForegroundColor Yellow }
    elseif  ($line -match "console\.log")   { Write-Host $line -ForegroundColor White  }
    elseif  ($line -match "BLE|Bluetooth|GATT")            { Write-Host $line -ForegroundColor Cyan   }
    else    { Write-Host $line -ForegroundColor DarkGray }
}
