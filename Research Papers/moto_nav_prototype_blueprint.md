# Motorcycle nav display — prototype blueprint

Target hardware: Waveshare ESP32-S3-Touch-LCD-1.46B (412×412 round display, QMI8658 IMU, BLE 5)

---

## 1. System architecture

```
┌────────────────────────────┐          BLE GATT           ┌─────────────────────────────────┐
│  Phone (companion app)      │ ──────────────────────────► │  ESP32-S3-Touch-LCD-1.46B         │
│                              │   notify: nav_state          │                                   │
│  - GPS                      │ ◄────────────────────────── │  - NimBLE peripheral               │
│  - Mapbox Navigation SDK    │   write:  device_event        │  - LVGL v9 renderer                │
│  - Detects route changes    │                              │  - QMI8658 IMU (accel + gyro)      │
│  - BLE central role         │                              │  - Capacitive touch + 2 buttons     │
└────────────────────────────┘                              └─────────────────────────────────┘
```

The phone owns all map/GPS logic. The device never sees coordinates — only the
already-decided result (turn type, distance, speed limit). The device owns the
button/touch input and reports it back the same way.

---

## 2. Hardware module map

| Component | Source | Status |
|---|---|---|
| MCU | ESP32-S3R8, onboard | Ready |
| Display | 412×412 round IPS, QSPI, onboard | Ready |
| Touch | Capacitive, I2C, onboard | Ready |
| IMU | QMI8658 (accel + gyro, **no magnetometer**) | Ready, compass mode needs an external mag (e.g. QMC5883L on I2C) if wanted |
| RTC | PCF85063, onboard | Ready |
| Battery management | Onboard, MX1.25 LiPo header | Ready, needs a physical LiPo cell |
| Buttons | PWM + BOOT buttons, onboard | Ready |
| Enclosure / IP67 sealing | — | Not started, out of scope until form factor is frozen |

---

## 3. Data contract — BLE GATT service

Define one custom 128-bit service UUID with two characteristics. Don't reuse a
standard Bluetooth SIG UUID — generate your own (any UUID v4 generator).

**`nav_state`** — notify, phone → device

| Byte | Field | Type | Notes |
|---|---|---|---|
| 0 | turn_type | uint8 | 0=straight, 1=left, 2=right, 3=u-turn, ... |
| 1–2 | distance_m | uint16 | little-endian |
| 3 | speed_limit_kph | uint8 | 0 = no badge shown |
| 4–5 | eta_min | uint16 | little-endian |

**`device_event`** — write, device → phone

| Byte | Field | Type | Notes |
|---|---|---|---|
| 0 | button_id | uint8 | which button |
| 1 | event_type | uint8 | 0=press, 1=long-press |

Keep this minimal at prototype stage — add fields only once the dummy version works end to end.

---

## 4. Firmware architecture

```
Power on → bootloader → app_main() [runs once: init display, init NimBLE, lv_init()]
                                  │
                                  ▼
                  main loop, runs forever
                  ├─ lv_timer_handler() every ~5ms → redraws whatever LVGL marked dirty
                  └─ BLE callback (event-driven, not polled)
                          on nav_state write → parse bytes → call LVGL setters
                          (lv_label_set_text, lv_arc_set_value, etc.)
```

The BLE callback never draws anything itself — it only calls setters, which flag
objects dirty. The next `lv_timer_handler()` tick does the actual redraw.

---

## 5. Companion app responsibilities (build last)

- GPS + Mapbox Navigation SDK — calculates route, detects when distance-to-turn changes
- BLE central role — connects to the device, writes `nav_state` on meaningful change (not every GPS tick — e.g. once a second or once distance crosses a threshold)
- Reads `device_event` notifications for button presses

Stack: React Native or Flutter, `react-native-ble-plx` / `flutter_blue_plus`.

---

## 6. No-hardware test roadmap

Each stage proves one slice of the system before the next adds complexity. Real
BLE radio is only testable once the physical board exists — there's no way to
simulate it in a browser sandbox.

| Stage | Tool | Proves | Needs real hardware? |
|---|---|---|---|
| 0 | sim.lvgl.io (browser) | Setter call → dirty flag → redraw mechanism | No |
| 1 | Wokwi (ESP32-S3) + Serial Monitor as BLE stand-in | Parse incoming bytes → call LVGL setter | No |
| 2 | Wokwi + GC9A01 round display | Approximate visual layout (note: 240×240 SPI, not your panel's 412×412 QSPI — logic only, not pixel-exact) | No |
| 3 | Merge 0+1+2 into real Arduino/ESP-IDF C firmware | Full firmware logic compiles and runs, still fed via Serial | No |
| 4 | Physical board, flash Waveshare's demo first | Display/touch/IMU drivers work out of the box | Yes |
| 5 | Physical board + your firmware, swap Serial stand-in for real NimBLE GATT server | Real BLE peripheral functions | Yes |
| 6 | nRF Connect app (phone) → manual characteristic writes | End-to-end: real BLE write → real screen update | Yes |
| 7 | Replace nRF Connect with the real companion app | Full system, phone GPS to display | Yes |

---

## 7. Open decisions

- Exact GATT UUIDs — generate and lock these before stage 5
- Whether compass mode is in scope (drives the external magnetometer decision)
- Enclosure / IP67 approach — separate workstream, not blocking firmware work
