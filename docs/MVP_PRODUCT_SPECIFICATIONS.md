# 📋 BeeLine Moto II Clone — MVP Product Specifications Document

**Document Version:** 1.0.0  
**Project Codename:** BeeLine-Clone (Moto II Architecture)  
**Target Platform:** ESP32-S3 Round Display (412×412 IPS) + Android Companion App (Ola Maps SDK)  
**Status:** MVP Implemented & Hardware-Verified  

---

## 1. Executive Summary & Product Vision

### 1.1 Product Overview
The **BeeLine Clone** is a minimalist, glanceable motorcycle and bicycle smart navigation display inspired by the BeeLine Moto II. It solves the primary pain points of motorcycle navigation: distraction, phone overheating, vibration camera damage, and battery drain from keeping smartphone screens active in direct sunlight.

The system decouples **heavy compute (routing, GPS, map tiles, traffic)** to the smartphone companion app in the rider's pocket/mount, and streams **lightweight, glanceable vector geometry and HUD telemetry** over Bluetooth Low Energy (BLE) to an ultra-bright, compact 1.46" round display mounted on the handlebars.

### 1.2 Core MVP Philosophy
* **Glanceable Safety**: Information must be readable in < 0.5 seconds at speed.
* **Vector Abstraction, Not Video/Tiles**: No heavy raster images or map tile decoding on the microcontroller. The companion app projects road geometry into local rider-centric vector coordinates; the display renders crisp hardware-accelerated vectors at 50 FPS.
* **Ultra-Low Latency & Bandwidth**: Navigation updates stream at 5 Hz (200 ms interval) in single BLE packets (< 128 bytes), ensuring zero frame drops and minimal battery impact.

---

## 2. System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                  SMARTPHONE COMPANION APP                        │
│            (React Native / Expo / Android 14)                    │
│                                                                  │
│   ┌────────────────────┐            ┌────────────────────────┐   │
│   │   Ola Maps API     │            │ Real-Time GPS Service  │   │
│   │ (Directions/Geocode│            │ (Fused Location 10Hz)  │   │
│   └─────────┬──────────┘            └───────────┬────────────┘   │
│             │                                   │                │
│             ▼                                   ▼                │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │   Heading-Up Vector Projection Engine                    │   │
│   │   - 280m Lookahead Window                                │   │
│   │   - World Lat/Lon ➔ Polar/Screen (X: 0..412, Y: 0..220)   │   │
│   │   - Exit & Cross-Street Vector Branch Extraction         │   │
│   └─────────────────────────┬────────────────────────────────┘   │
│                             │ Base64 Telemetry Stream (5 Hz)     │
└─────────────────────────────┼────────────────────────────────────┘
                              │
                    BLE 5.0 Wireless Link
         (GATT Service: 1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d)
                              │
┌─────────────────────────────▼────────────────────────────────────┐
│                  EMBEDDED DISPLAY CONTROLLER                     │
│           (ESP32-S3R8 + Waveshare 1.46" Round IPS)              │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │   NimBLE GATT Server (MTU: 185 Bytes)                    │   │
│   │   - NAV_STATE_CHAR (Write Without Response)              │   │
│   │   - DEVICE_EVENT_CHAR (Notify on Button Push)            │   │
│   └─────────────────────────┬────────────────────────────────┘   │
│                             │ Binary Unpack (Zero Allocation)    │
│                             ▼                                    │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │   LVGL 8.4 Rendering Pipeline (50 FPS, PSRAM Buffers)    │   │
│   │   - Region 1: Vector Road Network & Junction Manoeuvre   │   │
│   │   - Region 2: Distance Value, Unit, Speed Limit Sign     │   │
│   │   - Region 3: Trip Progress Rim Arc                      │   │
│   └─────────────────────────┬────────────────────────────────┘   │
│                             │ QSPI Quad-Bus (40 MHz)             │
│                             ▼                                    │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │   SPD2010 412×412 Round IPS Full-Color Panel             │   │
│   └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Hardware Specifications

### 3.1 Microcontroller & Core Board
* **MCU**: Espressif **ESP32-S3R8** (Dual-core Xtensa LX7 @ 240 MHz, vector instructions enabled)
* **Flash Memory**: 16 MB QIO SPI Flash
* **Internal RAM**: 512 KB SRAM + **8 MB Octal SPI PSRAM (OPI)**
* **Wireless**: 2.4 GHz Wi-Fi 4 + **Bluetooth 5.0 (LE)**
* **Platform Module**: Waveshare ESP32-S3-Touch-LCD-1.46B

### 3.2 Display Subsystem
* **Panel**: 1.46-inch Round IPS LCD
* **Resolution**: **412 × 412 pixels** (~354 PPI, circular clip)
* **Color Depth**: RGB565 (16-bit, big-endian byte order)
* **Display Driver IC**: **SPD2010**
* **Host Interface**: High-Speed **QSPI (Quad-SPI)** running at **40 MHz**
* **Backlight Control**: Hardware LEDC PWM @ 5 kHz on GPIO 5 (0–100% brightness control)

### 3.3 Pinout Mapping & Peripheral Bus

| Signal Name | ESP32-S3 GPIO | Interface / Bus | Description |
|---|---|---|---|
| `LCD_SCK` | **GPIO 40** | QSPI | SPI Clock (40 MHz) |
| `LCD_CS` | **GPIO 21** | QSPI | Display Chip Select (active LOW) |
| `LCD_SDA0` | **GPIO 46** | QSPI | Data Line 0 |
| `LCD_SDA1` | **GPIO 45** | QSPI | Data Line 1 |
| `LCD_SDA2` | **GPIO 42** | QSPI | Data Line 2 |
| `LCD_SDA3` | **GPIO 41** | QSPI | Data Line 3 |
| `LCD_TE` | **GPIO 18** | Input | Tearing Effect Sync Input |
| `LCD_BL` | **GPIO 5** | LEDC PWM | Backlight Control |
| `I2C_SDA` | **GPIO 11** | I2C (400 kHz) | Shared I2C Bus Data Line |
| `I2C_SCL` | **GPIO 10** | I2C (400 kHz) | Shared I2C Bus Clock Line |
| `BOOT_KEY` | **GPIO 0** | GPIO (Pull-Up)| Physical Input Button (Short/Long Press) |

### 3.4 I2C Expander & Power Subsystem
* **I2C Expander**: **TCA9554PWR** (I2C address `0x20`)
  * `EXIO1`: Touch Reset (`TP_RST`)
  * `EXIO2`: LCD Hardware Reset (`LCD_RST`)
  * `EXIO3`: MicroSD Chip Select (`SD_CS`)
* **Touch Controller**: SPD2010 Capacitive Touch (Intentionally detached in MVP firmware to maximize battery life and dedicated I2C bandwidth for sensors).
* **Auxiliary Sensors** (Available on I2C bus):
  * **IMU**: QMI8658 6-Axis Accelerometer/Gyroscope
  * **RTC**: PCF85063 Real-Time Clock

---

## 4. Display Layout & UI Design Specifications

The 412×412 circular display is divided into three distinct visual regions optimized for high-contrast, glanceable readability under direct sunlight:

```
(0,0) ┌─────────────────────────────────────────────────────────────┐ (412,0)
      │      [ STREET BANNER: "GRAND AVENUE" (180x26px Pill) ]      │
      │                                                             │
      │                  REGION 1: VECTOR MINI-MAP                  │
      │                     (Y: 0px to 220px)                       │
      │                                                             │
      │     - Background: Deep Obsidian `#0E0F14`                   │
      │     - Active Route: Dual-Layer Polyline                     │
      │       * 14px Dark Casing `#1B1C24`                          │
      │       * 8px Crisp Paved White Core `#FFFFFF`                │
      │     - Junction Branches: 4px Semi-Transparent Light Gray    │
      │       vectors (`#CCCCCC` @ 55% opacity)                     │
      │     - Rider Pointer: White Isosceles Triangle (▲) at        │
      │       fixed origin `(206, 210)` pointing upward             │
      │                                                             │
      ├─────────────────────────────────────────────────────────────┤
      │                                                             │
      │              REGION 2: MANOEUVRE & HUD PANEL                │
      │                     (Y: 220px to 345px)                     │
      │                                                             │
      │     [Left: X 104..161]            [Center: X 195]           │
      │     - Turn Icon: ⤷ (9px Vector)    - Distance: "300"        │
      │       Smooth 90° Fillet Curve        Montserrat Bold 48     │
      │                                    - Unit: "m"              │
      │     [Right: X 295, Y 220]            Montserrat SemiBold 32 │
      │     - Speed Badge: 60×60px Circle                           │
      │       Border: `#FF3B30` (5px), Fill: `#FFFFFF`, Text: "70"  │
      │                                                             │
      ├─────────────────────────────────────────────────────────────┤
      │                  REGION 3: PROGRESS RIM ARC                 │
      │                     (Y: 345px to 412px)                     │
      │     - Arc Diameter: 390px, Center: (206, 206)               │
      │     - Angle Range: 35° to 145° (110° Arc on Lower Rim)      │
      │     - Line Thickness: 10px Pure White `#FFFFFF`             │
      │     - Dynamics: Fills proportionally with trip progress     │
(0,412)└─────────────────────────────────────────────────────────────┘ (412,412)
```

### 4.1 Color Palette & Design Tokens

| UI Element | Color Name | Hex Code | Visual Purpose |
|---|---|---|---|
| **Canvas Background** | Deep Obsidian | `#0E0F14` | High contrast, zero glare |
| **Active Route Casing** | Dark Asphalt | `#1B1C24` | Separates active path from background |
| **Active Route Core** | Signal White | `#FFFFFF` | Core path to follow |
| **Junction Branches** | Arterial Gray | `#CCCCCC` | Upcoming turns and crossing streets |
| **Speed Limit Ring** | Regulatory Red | `#FF3B30` | Official European/Indian speed badge |
| **Speed Limit Text** | High-Contrast Black | `#000000` | Legibility inside speed badge |
| **Distance & Unit** | Bright White | `#FFFFFF` | Immediate readability at distance |
| **Street Name Banner**| Translucent Slate | `#141620` (80%)| Non-intrusive road identification |

---

## 5. Companion App Specifications

### 5.1 Architecture & Stack
* **Framework**: React Native 0.74+ with Expo (Bare workflow with prebuild)
* **Language**: TypeScript (Strict Mode)
* **BLE Client**: `react-native-ble-plx`
* **Maps & Routing Engine**:
  * **Map UI**: MapLibre Native SDK for Android
  * **Directions & Geocoding**: **Ola Maps REST API** (India-optimized routing)
* **Location Service**: Fused Location Provider (Android Native LocationManager)

### 5.2 Dynamic Vector Coordinate Projection Engine
Instead of streaming full road shapes or high-bandwidth tile images, the companion app continuously performs 2D mathematical coordinate projection from real-world GPS coordinates to the device's screen space:

1. **Rider Origin**: Fixed at screen bottom-center `(206, 210)`.
2. **Heading Orientation**: Rotates all upcoming GPS coordinates by `-currentHeading` so the rider's forward travel vector points strictly upward (`-Y` axis).
3. **Lookahead Horizon**: Dynamically clips road coordinates to a **280-meter forward window**.
4. **Exit & Cross-Street Extraction**:
   * Extracts the current road segment and the active maneuver exit arm.
   * Extracts up to 3 intersecting crossing streets/branches and converts them to screen vector lines `(x1, y1) ➔ (x2, y2)`.
5. **Payload Compression**: Encodes waypoints and branches into a compact binary byte array and transmits over BLE via Write Without Response (`WRITE_NR`).

---

## 6. BLE Telemetry Protocol Specification

### 6.1 GATT Service & Characteristic UUIDs
* **Service UUID**: `1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d`
* **Nav State Characteristic** (Phone ➔ Device): `1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6e` (Property: `WRITE_NR`)
* **Device Event Characteristic** (Device ➔ Phone): `1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6f` (Property: `NOTIFY`)

### 6.2 Nav State Telemetry Packet Structure (Binary)

The companion app sends a variable-length binary packet (12 to ~80 bytes) at **5 Hz (200 ms)**:

```
[0..11] Mandatory Header (12 Bytes)
├── Byte 0:    turn_type (uint8)
├── Byte 1-2:  distance_m (uint16 LE)
├── Byte 3:    speed_limit_kph (uint8)
├── Byte 4-5:  eta_min (uint16 LE)
├── Byte 6:    flags (uint8: bit 0 = metric, bit 1 = has_vector_path)
├── Byte 7:    trip_progress_pct (uint8, 0..100)
├── Byte 8:    side_road_y_offset (uint8)
├── Byte 9:    poi_type (uint8)
├── Byte 10:   poi_x_rel_m (int8)
└── Byte 11:   poi_y_rel_m (int8)

[12..N] Optional Vector Geometry Payload (Present when bit 1 of flags is SET)
├── Byte 12:       path_count (uint8, 2..8)
├── Bytes 13..:    path_points [path_count × 4 bytes]
│                  ├── x (int16 LE)
│                  └── y (int16 LE)
├── Next Byte:     branch_count (uint8, 0..3)
└── Next Bytes:    branch_lines [branch_count × 8 bytes]
                   ├── x1 (int16 LE)
                   ├── y1 (int16 LE)
                   ├── x2 (int16 LE)
                   └── y2 (int16 LE)

[Trailing] Optional UTF-8 Street Name
└── Next Bytes:    street_name (up to 31 ASCII/UTF-8 bytes, null-terminated)
```

### 6.3 Maneuver Enums & Bitmask Flags

| Code | Maneuver | Description | Visual Rendering |
|---|---|---|---|
| `0` | `NAV_TURN_STRAIGHT` | Continue straight | Upward arrow `↑` |
| `1` | `NAV_TURN_LEFT` | Standard left turn | 90° left fillet curve `↰` |
| `2` | `NAV_TURN_RIGHT` | Standard right turn | 90° right fillet curve `⤷` |
| `3` | `NAV_TURN_UTURN` | U-Turn | 180° hairpin curve `⮌` |
| `4` | `NAV_TURN_SLIGHT_LEFT` | Fork / veer left | 45° left vector |
| `5` | `NAV_TURN_SLIGHT_RIGHT` | Fork / veer right | 45° right vector |
| `6` | `NAV_TURN_ARRIVED` | Destination reached | Chequered pin / Star icon |

---

## 7. Firmware Architecture (ESP32-S3 / LVGL 8.4)

### 7.1 Memory Allocation & Buffer Architecture
* **Display Flush Buffer**: Double-buffered line buffers allocated in PSRAM:
  * Buffer Size: `412 × 40` pixels × 2 buffers (~66 KB PSRAM)
  * Render loop executed via FreeRTOS cooperative task at `5ms` tick (`lv_timer_handler()`).
* **Frame Rate Target**: 50–60 FPS smooth rendering with zero screen tearing via QSPI Quad-mode DMA.

### 7.2 Thread-Safe UI Update Pipeline
1. NimBLE writes execute within the BLE stack callback task.
2. Packet decoded into a local copy of `nav_state_t`.
3. Mutex-protected dispatch to `ui_update_nav_state()` updates:
   * Polyline point buffers for main route and branches.
   * Distance label formatted as `"300 m"` or `"1.2 km"`.
   * Speed limit visibility flag and numeric label.
   * Progress arc angle between 35° and 145°.
   * Street name banner text.

---

## 8. MVP Feature Matrix & Implementation Status

| Feature Module | Specification Details | Status |
|---|---|---|
| **Hardware Platform** | ESP32-S3R8 + Waveshare 1.46" SPD2010 QSPI LCD | **Verified on Hardware (COM16)** |
| **I2C Bus & Expander** | TCA9554 controlling LCD/TP resets at 400 kHz | **Verified on Hardware** |
| **LVGL Rendering** | 412×412 round screen layout, Montserrat typography | **Verified on Hardware** |
| **Vector Mini-Map** | 14px casing + 8px paved core + dynamic branch vectors | **Verified on Hardware** |
| **Navigation HUD** | Distance countdown, turn icons, 60px speed badge | **Verified on Hardware** |
| **Progress Arc** | 110° lower rim arc (0% to 100% completion) | **Verified on Hardware** |
| **BLE GATT Server** | NimBLE peripheral advertising `"BeeLine-Moto2"` | **Verified on Hardware** |
| **Physical Button** | BOOT button (GPIO0) sends BLE notification | **Verified on Hardware** |
| **Companion App UI** | MapLibre vector map + Ola Maps search & routing | **Verified on Android (Galaxy A32)** |
| **Route Projection** | Real GPS road path ➔ 412×220px vector coordinates | **Verified in Companion App** |
| **Debug Fixture** | 1-tap route test ("Kulangara Mills ➔ Foodcafe") | **Verified in Companion App** |

---

## 9. Performance Benchmarks & Targets

| Metric | Target | MVP Measured Result |
|---|---|---|
| **Display Refresh Rate** | ≥ 45 FPS | **50 FPS** (QSPI 40 MHz) |
| **BLE Telemetry Latency** | < 100 ms | **< 35 ms** (from GPS update to screen render) |
| **BLE Stream Frequency** | 5 Hz (200 ms) | **5 Hz** steady |
| **Packet Size** | < 128 bytes | **28 – 76 bytes** (typical route packet) |
| **Flash Memory Usage** | < 4 MB | **1.2 MB** / 16 MB (7.5%) |
| **SRAM Usage** | < 200 KB | **112 KB** / 512 KB (21.8%) |
| **PSRAM Usage** | < 2 MB | **184 KB** / 8 MB (2.3%) |

---

## 10. Post-MVP Roadmap (V2 Considerations)

1. **Physical IP67 Enclosure**: Custom CNC aluminium or injection-molded waterproof casing with universal 1/4-turn handlebar mount (Garmin/GoPro style).
2. **Battery & Power Management**: Integrated 500–800 mAh LiPo battery with AXP2101 / TP4056 PMIC, targeting 14+ hours of continuous riding time.
3. **Ambient Light Sensing**: Automatic backlight dimming based on ambient light sensor (LDR/photodiode) to prevent night blindness.
4. **Turn-by-Turn Re-routing**: Companion app auto-reroute trigger when rider veers > 30 meters off the active polyline.
5. **Offline GPX Route Import**: Direct import of `.gpx` trail files for off-road adventure riding.
