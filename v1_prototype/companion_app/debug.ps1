# ============================================================
#  BeeLine Companion App - Auto Debug Pipeline
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

# Config
$PACKAGE     = "com.anonymous.companion_app"
$ACTIVITY    = "$PACKAGE/.MainActivity"
$METRO_PORT  = 8081
$SCRIPT_DIR  = $PSScriptRoot

function Write-Step  { param($msg) Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "[FAIL] $msg" -ForegroundColor Red }
function Write-Info  { param($msg) Write-Host "   $msg" -ForegroundColor Gray }

Write-Host ""
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "   BeeLine Companion - Debug Pipeline     " -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host ""

# STEP 1: Check ADB
Write-Step "Checking ADB..."
try {
    $null = Get-Command adb -ErrorAction Stop
    $adbVer = (adb version | Select-Object -First 1)
    Write-OK "ADB found: $adbVer"
} catch {
    Write-Fail "ADB not found in PATH. Install Android Platform Tools."
    exit 1
}

# STEP 2: Check Device
Write-Step "Checking Android device..."
$maxWait = 10
$waited  = 0
while ($waited -lt $maxWait) {
    $rawDevices = adb devices 2>&1 | Select-String -Pattern "`tdevice$"
    if ($rawDevices) { break }
    Write-Info "Waiting for device... ($waited/$maxWait s)"
    Start-Sleep -Seconds 2
    $waited += 2
}

$rawDevices = adb devices 2>&1 | Select-String -Pattern "`tdevice$"
if (-not $rawDevices) {
    Write-Fail "No authorized device found."
    Write-Warn "Make sure: USB Debugging is ON and cable is plugged in."
    exit 1
}

$DEVICE_SERIAL = ($rawDevices | Select-Object -First 1).ToString().Split("`t")[0].Trim()
Write-OK "Device connected: $DEVICE_SERIAL"

$model = adb -s $DEVICE_SERIAL shell getprop ro.product.model 2>&1
Write-Info "Model: $model"

# STEP 3: Port forwarding
Write-Step "Setting up port forwarding (device -> Metro :$METRO_PORT)..."
adb -s $DEVICE_SERIAL reverse "tcp:$METRO_PORT" "tcp:$METRO_PORT" | Out-Null
Write-OK "Port $METRO_PORT forwarded"

# STEP 4: Check Metro Port
Write-Step "Checking for stale Metro process on port $METRO_PORT..."
$stale = Get-NetTCPConnection -LocalPort $METRO_PORT -ErrorAction SilentlyContinue
if ($stale) {
    $stalePid = ($stale | Select-Object -First 1).OwningProcess
    Write-Warn "Stopping stale process PID $stalePid on port $METRO_PORT"
    Stop-Process -Id $stalePid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# STEP 5: Optional Gradle rebuild
if ($Rebuild) {
    Write-Step "Running Gradle build..."
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

# STEP 6: Start Metro bundler
Write-Step "Starting Metro bundler on port $METRO_PORT..."
$metroCmd = "cd '$SCRIPT_DIR'; npx expo start --port $METRO_PORT"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $metroCmd -WindowStyle Normal
Start-Sleep -Seconds 3
Write-OK "Metro window launched"

# STEP 7: Launch app on device
if (-not $NoLaunch) {
    Write-Step "Launching $PACKAGE on device..."
    adb -s $DEVICE_SERIAL shell am force-stop $PACKAGE 2>&1 | Out-Null
    Start-Sleep -Seconds 1
    adb -s $DEVICE_SERIAL shell am start -n $ACTIVITY 2>&1 | Out-Null
    Write-OK "App launched"
}

# STEP 8: Logcat
Write-Host ""
Write-Host "===============================================" -ForegroundColor DarkCyan
Write-Host "  Live Logcat Stream (Ctrl+C to stop)         " -ForegroundColor DarkCyan
Write-Host "===============================================" -ForegroundColor DarkCyan
Write-Host ""

adb -s $DEVICE_SERIAL logcat -c 2>&1 | Out-Null
Start-Sleep -Milliseconds 500

adb -s $DEVICE_SERIAL logcat ReactNativeJS:$LogLevel ReactNative:$LogLevel BluetoothGatt:W BtGatt.GattService:W *:S 2>&1 | ForEach-Object {
    $line = $_
    if ($line -match "\bE\b.*:") { Write-Host $line -ForegroundColor Red }
    elseif ($line -match "\bW\b.*:") { Write-Host $line -ForegroundColor Yellow }
    elseif ($line -match "console\.error|Error:|WARN") { Write-Host $line -ForegroundColor Red }
    elseif ($line -match "console\.warn") { Write-Host $line -ForegroundColor Yellow }
    elseif ($line -match "console\.log") { Write-Host $line -ForegroundColor White }
    elseif ($line -match "BLE|Bluetooth|GATT") { Write-Host $line -ForegroundColor Cyan }
    else { Write-Host $line -ForegroundColor DarkGray }
}
