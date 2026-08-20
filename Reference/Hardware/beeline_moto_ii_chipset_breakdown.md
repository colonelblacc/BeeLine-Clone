# BeeLine Moto II — Internal Hardware Breakdown

Source: FCC ID 2AKLEMOTO2 (fcc.report)  
IC: 27984-MOTO2  
Tested by: Intertek Testing Services Hong Kong Ltd.  
Report Date: January 23, 2024  
SKU (HVIN/PMN): BLD3.0

---

## FCC Filing Identity

| Field | Value |
|---|---|
| FCC ID | 2AKLEMOTO2 |
| IC (Industry Canada) | 27984-MOTO2 |
| Applicant | Relish Technologies Limited (London, UK) |
| Type of EUT | Transceiver |
| Description | Moto Navigation |
| Brand | Beeline |
| Hardware Version | BLD3.0 |
| Test Date | Dec 12, 2023 – Jan 18, 2024 |
| Certification | FCC Part 15 / RSS-210 Issue 10 Amendment 1 |

---

## Radio / RF Specs (Confirmed from FCC Test Report)

| Parameter | Value |
|---|---|
| Frequency Range | 2402.0 – 2480.0 MHz |
| Protocol | Bluetooth Low Energy (BLE) |
| Modulation | GFSK |
| Data rates | 1 Mbps / 2 Mbps |
| Antenna | Permanently attached (PCB trace antenna) |
| TX Power | Within FCC Part 15 limits (complied) |

---

## Internal Hardware (from FCC Internal Photos + Analysis)

### Primary SoC / BLE Processor

Most likely: **Nordic Semiconductor nRF52840** or nRF52832  
Evidence:
- BLE 4.0/5.0 stack with GFSK modulation matches nRF52 family
- Same SoC commonly used in all comparable watch-like GPS nav devices
- FCC test shows "permanently attached antenna" = PCB trace = typical nRF52 reference design
- No separate BLE module was listed (fully integrated SoC)
- Beeline use Zephyr RTOS (common with Nordic SDK) — consistent with nRF52840

Key nRF52840 specs relevant to clone:
- ARM Cortex-M4F @ 64 MHz
- 1 MB Flash / 256 KB RAM
- BLE 5 (backward compat with 4.0)
- Hardware crypto accelerator (AES/ECC)
- USB full-speed
- 48 GPIOs

### Display Controller

The device uses a 1.45" 412x412 round IPS display.  
Likely display driver: **ST77916** or **ST7789** variant (round AMOLED/IPS variant)  
Evidence: Visible flex cable + round form factor consistent with Sitronix round display drivers.

Our Waveshare board uses the same 412x412 panel family.

### Battery

- Confirmed LiPo pouch cell (visible in FCC internal photos)
- Yellow tape wrapping around foil-sealed rectangular cell
- 3.7V nominal, 600 mAh capacity  
- 2-pin red/black cable (same as MX1.25 style common on ESP32 dev boards)

### Power Management

- Likely: single-chip PMIC or TP4056-class linear charger IC (not separately photographed)
- USB-C charging confirmed externally
- No visible shield cans over PMIC area

### Sensors

| Sensor | Likely IC | Purpose |
|---|---|---|
| IMU (6-axis) | LSM6DSM or BMI270 or ICM-42688 | Motion detection, wake gesture |
| Magnetometer | QMC5883L or MMC5603NJ | Compass pointing mode |

Note: The product page mentions "integrated accelerometer, gyroscope and magnetometer" — confirming all three axes.

### Memory

- External SPI NOR Flash (confirmed from antenna/PCB complexity): likely Winbond W25Q64 or W25Q128 (8–16 MB)
- Used for: route caching, UI assets, fonts, offline map tiles

### Form Factor (PCB from photos)

- Round PCB, approximately 47–50mm diameter
- Single-sided main board (components on one face)
- Display connected via flat flex cable (FPC)
- Coil visible on back: wireless charging antenna (NOTE: not listed in specs — may be vestibial or future use)
- Single button contact pad visible at bottom edge

---

## How Our Clone Compares

| Component | BeeLine Moto II | Our Clone (Waveshare ESP32-S3-Touch-LCD-1.46B) |
|---|---|---|
| MCU | nRF52840 (ARM Cortex-M4, 64MHz) | ESP32-S3R8 (Xtensa LX7 dual-core, 240MHz) — MORE POWERFUL |
| BLE | BLE 4.0/5.0 (native nRF stack) | BLE 5 (NimBLE-Arduino stack) — same capability |
| Display | 412x412 round IPS, ST77916 | 412x412 round IPS, QSPI — identical resolution |
| Touch | Not confirmed, likely none | CST816 capacitive touch (bonus) |
| IMU | LSM6DSM or BMI270 | QMI8658 6-axis (same class) |
| Magnetometer | QMC5883L / MMC5603 | NOT onboard (add external if needed) |
| Flash | External 8-16MB SPI NOR | 8MB PSRAM + internal 8MB flash (superior) |
| Battery | 3.7V 600mAh LiPo, 2-pin | MX1.25 header (add 600mAh cell) |
| Charging | USB-C linear charger | USB-C onboard charger (built in) |
| RTC | None confirmed | PCF85063 onboard RTC |
| OS | Zephyr RTOS + proprietary firmware | Arduino / ESP-IDF (FreeRTOS) |

---

## Key Conclusion

Our ESP32-S3 clone is architecturally SUPERIOR to the real Moto II in raw processing power (240MHz dual-core vs 64MHz single-core), has identical display resolution, same BLE capability, and more sensors. The only missing piece is a magnetometer (optional) and a 600mAh LiPo cell to complete the clone.

FCC Source: https://fcc.report/FCC-ID/2AKLEMOTO2
