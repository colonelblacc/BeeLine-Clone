# 🔧 BeeLine Clone — Hardware & Firmware Progress

## Platform

| Item | Detail |
|------|--------|
| **MCU** | ESP32-S3R8 (Waveshare ESP32-S3-Touch-LCD-1.46B) |
| **Flash** | 16 MB QIO |
| **PSRAM** | 8 MB OPI |
| **Display** | SPD2010 — 1.46" Round IPS, 412×412, QSPI interface |
| **Touch** | SPD2010 (same chip) — Capacitive, I2C interface |
| **IMU** | QMI8658 — 6-axis (accel + gyro), I2C |
| **RTC** | PCF85063, I2C |
| **GPIO Expander** | TCA9554PWR — I2C, controls LCD_RST / TP_RST / SD_CS |
| **BLE Stack** | NimBLE-Arduino |
| **UI Framework** | LVGL v8 |
| **Build System** | PlatformIO (Arduino framework) |

---

## 📌 Pin Reference (Waveshare ESP32-S3-Touch-LCD-1.46B)

```
Display (QSPI)        ESP32-S3 GPIO
──────────────────────────────────────
LCD_SDA0          →   GPIO 46
LCD_SDA1          →   GPIO 45
LCD_SDA2          →   GPIO 42
LCD_SDA3          →   GPIO 41
LCD_SCK           →   GPIO 40
LCD_CS            →   GPIO 21
LCD_TE (tearing)  →   GPIO 18
LCD_BL (backlight)→   GPIO 5
LCD_RST           →   TCA9554 EXIO2  (via I2C expander at 0x20)

Touch (I2C)
──────────────────────────────────────
TP_SDA            →   GPIO 11  (shared I2C bus)
TP_SCL            →   GPIO 10  (shared I2C bus)
TP_INT            →   GPIO 4
TP_RST            →   TCA9554 EXIO1  (via I2C expander at 0x20)

I2C Bus (shared by Touch + IMU + RTC + GPIO Expander)
──────────────────────────────────────
SDA               →   GPIO 11
SCL               →   GPIO 10

User Button
──────────────────────────────────────
BOOT button       →   GPIO 0   (active LOW, internal pull-up)
```

---

## 🔗 BLE Protocol (Phone ↔ Device) — LOCKED, DO NOT CHANGE

```
Phone  ──WRITE──►  nav_state char  (7 bytes)  ──►  Device renders screen
Phone  ◄─NOTIFY─   device_event char (2 bytes) ◄──  Device button press
```

| Byte | Field | Type | Values |
|------|-------|------|--------|
| 0 | turn_type | uint8 | 0=straight 1=left 2=right 3=u-turn |
| 1–2 | distance_m | uint16 LE | metres to next manoeuvre |
| 3 | speed_limit_kph | uint8 | 0 = hide badge |
| 4–5 | eta_min | uint16 LE | minutes to destination |
| 6 | flags | uint8 | bit 0 = useMetric |

```
SERVICE_UUID:        1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d
NAV_STATE_CHAR:      1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6e  (WRITE_NR)
DEVICE_EVENT_CHAR:   1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6f  (NOTIFY)
```

---

## 🚧 MVP Build Plan — Step by Step

---

### PHASE 0 — Project Setup
- [x] **0.1** Update `platformio.ini` for Waveshare board (16MB Flash, OPI PSRAM, LVGL, NimBLE)
- [x] **0.2** Minimal `main.cpp` boot test
- [x] **0.3** Compile → zero errors ✔
- [ ] **0.4** Flash to hardware & confirm serial output

---

### PHASE 1 — I2C Bus + TCA9554 GPIO Expander
- [x] **1.1** Understand why: LCD_RST & TP_RST routed through TCA9554 (0x20)
- [x] **1.2** Init I2C bus on GPIO10 (SCL) + GPIO11 (SDA) at 400 kHz
- [x] **1.3** I2C bus scanner implemented
- [x] **1.4** Write to TCA9554 to release hardware resets (EXIO1 & EXIO2 HIGH)
- [x] **1.5** Verified build passes ✔

---

### PHASE 2 — SPD2010 Display Basic Init
- [x] **2.1** Understand QSPI bus architecture on ESP32-S3 (GPIO 40, 46, 45, 42, 41, 21)
- [x] **2.2** Create `lib/SPD2010/spd2010.h` and `spd2010.cpp` driver using `esp_lcd`
- [x] **2.3** Add solid fill test function with byte-swapping for RGB565 big-endian display
- [x] **2.4** Verified clean compilation of driver and test loop ✔

---

### PHASE 3 — LVGL Init + First Render (✔ VERIFIED ON PHYSICAL HARDWARE — GOLDEN BASE)
*Goal: LVGL renders graphic elements (yellow ring, text) on the round display*

- [x] **3.1** Update `include/lv_conf.h` (412×412 resolution, 16-bit color, Montserrat fonts)
- [x] **3.2** Implement LVGL display flush callback `lvgl_flush_cb()`
- [x] **3.3** Allocate LVGL draw buffer in SRAM / PSRAM
- [x] **3.4** Call `lv_timer_handler()` in `loop()` every 5ms
- [x] **3.5** Create test UI (outer yellow ring arc, BEELINE title, subtitle)
- [x] **3.6** Updated PlatformIO to Arduino 3.1.1 (ESP-IDF 5.3.2 base) enabling native QSPI `quad_mode`
- [x] **3.7** Fixed Backlight LEDC API and confirmed clean compilation
- [x] **3.8** **Flashed to physical Waveshare ESP32-S3-Touch-LCD-1.46 board via COM16 — Verified display rendering working on hardware ✔**
- [x] **3.9** **Full Multi-Color Inspection Verified: Solid Pure Red, Green, Blue, White, Black & BeeLine UI rendering accurately ✔**

---

### PHASE 4 — Touch Input (DETACHED FROM PROJECT BY DESIGN)
*Note: BeeLine Moto II architecture relies on BLE phone companion & physical buttons. Touch input processing is intentionally detached and disabled in `LVGL_Driver.cpp` to conserve CPU ticks and I2C bus bandwidth.*

- [x] **4.1** Verified SPD2010 touch chip hardware over I2C (0x53)
- [x] **4.2** **Touch input drivers permanently detached and disabled from LVGL pipeline** ✔



---

### PHASE 5 — NimBLE GATT Server
- [ ] **5.1** Init NimBLE alongside display
- [ ] **5.2** Create GATT service & characteristics (`nav_state` & `device_event`)
- [ ] **5.3** Advertise as `"BeeLine Device"`
- [ ] **5.4** Verify discovery with nRF Connect on phone

---

### PHASE 6 — BLE Write → LVGL Update
- [ ] **6.1** Parse 7-byte packet in `onWrite()` and set `g_screen_dirty = true`
- [ ] **6.2** Update LVGL distance label from `loop()`
- [ ] **6.3** Verify live updates from nRF Connect

---

### PHASE 7 — BOOT Button → device_event Notify
- [ ] **7.1** Configure GPIO0 (active LOW with internal pull-up)
- [ ] **7.2** Send `device_event` notification on press
- [ ] **7.3** Verify phone receives notification in nRF Connect

---

### PHASE 8 — BeeLine Moto II Map Abstraction UI Rendering (Modular `ui.h`/`ui.cpp`)
*Goal: Render exact Map Abstraction matching `docs/ui_mockups/Map_UI.jpg` on 412×412 round display*

- [ ] **8.1** **Top 60% Map Abstraction Layer**:
  - Main active route polyline (bold white path showing upcoming turn geometry)
  - Intersecting side-street paths (subtle dim gray lines)
  - Rider position pointer icon (`▲` arrowhead at base of active route)
- [ ] **8.2** **Bottom-Left Manoeuvre & Proximity Panel**:
  - Dynamic turn direction icon (Right `⤷`, Left `↰`, Straight `↑`, U-Turn `↶`)
  - Crisp, large proximity distance typography (`300 m` / `1.2 km`)
- [ ] **8.3** **Bottom-Right Speed Limit Badge**:
  - Circular badge widget with red ring border (`#FF3B30`), white fill (`#FFFFFF`), and bold black speed numbers (`70` / `50`)
- [ ] **8.4** **Bottom Progress Arc**:
  - Curved progress arc widget (`lv_arc`) along lower rim indicating turn proximity / segment completion
- [ ] **8.5** **BLE Connection Overlay**:
  - Status indicator icon when phone BLE disconnects or reconnects

---

### PHASE 9 — Round-Screen Polish & Visual Alignment
- [ ] **9.1** Ensure all widgets stay strictly within 412×412 round IPS bezel boundary
- [ ] **9.2** Verify 1-to-1 visual match against `docs/ui_mockups/Map_UI.jpg`


---

### PHASE 10 — End-to-End Test with Companion App
- [ ] **10.1** Pair real Android companion app with device
- [ ] **10.2** Start live route navigation and observe real-time screen updates
