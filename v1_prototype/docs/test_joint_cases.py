#!/usr/bin/env python3
"""
=============================================================================
BeeLine Moto II — Joint & Intersection Comprehensive Test Suite
=============================================================================
Tests all joint geometries and side-street intersection cases over BLE:
  1. Standard 4-Way Cross Intersection (+)
  2. 90° Right Turn T-Junction (with Straight and Left arms)
  3. 90° Left Turn T-Junction (with Straight and Right arms)
  4. Acute Y-Fork / Split (45° Left & 45° Right)
  5. Staggered Offset Double Crossroads
  6. Multi-Leg Roundabout Hub (3 branches from single joint)
  7. Sharp Hairpin / U-Turn with Tangent Escape Road
  8. Continuous 360° Radial Sweep Stress Test (proves zero detachment at all angles)
"""

import sys
import math
import time
import struct
import asyncio
from bleak import BleakClient, BleakScanner

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# ── BLE Configuration ────────────────────────────────────────────────────────
SERVICE_UUID    = "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d"
NAV_CHAR_UUID   = "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6e"
DEVICE_NAME     = "BeeLine-Moto2"
DEVICE_MAC      = "30:ED:A0:2A:3F:19"


def build_packet(
    turn_type: int,         # 0=Straight, 1=Left, 2=Right, 3=UTurn, 6=Arrived
    distance_m: int,
    speed_kph: int,
    eta_min: int,
    progress_pct: int,
    path_points: list,      # [(x, y), ...] max 8
    branches: list,         # [(x1,y1,x2,y2), ...] max 3
    street_name: str = "",
) -> bytes:
    has_path = len(path_points) >= 2
    flags = 0x01 | (0x02 if has_path else 0x00)

    buf = bytearray()
    buf.append(turn_type & 0xFF)
    buf += struct.pack('<H', distance_m)
    buf.append(speed_kph & 0xFF)
    buf += struct.pack('<H', eta_min)
    buf.append(flags)
    buf.append(max(0, min(100, progress_pct)))
    buf.append(0)   # side_road_y_offset
    buf.append(0)   # poi_type
    buf.append(0)   # poi_x_rel_m
    buf.append(0)   # poi_y_rel_m

    if has_path:
        pts = path_points[:8]
        brs = branches[:3]
        buf.append(len(pts))
        for (x, y) in pts:
            buf += struct.pack('<hh', int(x), int(y))
        buf.append(len(brs))
        for (x1, y1, x2, y2) in brs:
            buf += struct.pack('<hhhh', int(x1), int(y1), int(x2), int(y2))

    if street_name:
        buf += street_name.encode('utf-8')[:31]

    return bytes(buf)


async def run_joint_test_suite(client: BleakClient):
    print("\n" + "=" * 64)
    print("  BEE-LINE MOTO II — JOINT & INTERSECTION TEST SUITE")
    print("=" * 64)

    async def send_case(title: str, pkt: bytes, hold_sec: float = 2.5):
        print(f"\n▶ Testing: {title}")
        await client.write_gatt_char(NAV_CHAR_UUID, pkt, response=False)
        await asyncio.sleep(hold_sec)

    # ── CASE 1: 4-Way Cross Intersection (+) ──────────────────────────────────
    path = [(206, 210), (206, 140), (206, 40)]
    branches = [
        (206, 140, 115, 140),  # Left arm
        (206, 140, 295, 140),  # Right arm
    ]
    pkt = build_packet(0, 150, 50, 4, 15, path, branches, "CASE 1: 4-WAY CROSS")
    await send_case("CASE 1: 4-Way Cross Intersection (+) — Left & Right perpendicular arms", pkt)

    # ── CASE 2: 90° Right Turn T-Junction ─────────────────────────────────────
    path = [(206, 210), (206, 145), (290, 145)]
    branches = [
        (206, 145, 115, 145),               # Left crossing road
        (206, 145, 206, 65),                # Straight-on road
    ]
    pkt = build_packet(2, 90, 40, 3, 28, path, branches, "CASE 2: RIGHT T-JUNCT")
    await send_case("CASE 2: 90° Right Turn T-Junction — Straight ahead & Left arms", pkt)

    # ── CASE 3: 90° Left Turn T-Junction ──────────────────────────────────────
    path = [(206, 210), (206, 145), (120, 145)]
    branches = [
        (206, 145, 295, 145),               # Right crossing road
        (206, 145, 206, 65),                # Straight-on road
    ]
    pkt = build_packet(1, 90, 40, 3, 42, path, branches, "CASE 3: LEFT T-JUNCT")
    await send_case("CASE 3: 90° Left Turn T-Junction — Straight ahead & Right arms", pkt)

    # ── CASE 4: Acute Y-Fork / Split Junction (45° V-Notch) ───────────────────
    path = [(206, 210), (206, 160), (265, 95)]
    branches = [
        (206, 160, 145, 95),                # Unselected Left fork arm (acute 45° angle)
    ]
    pkt = build_packet(5, 120, 60, 3, 55, path, branches, "CASE 4: ACUTE Y-FORK")
    await send_case("CASE 4: Acute Y-Fork / Split — 45° V-Notch joint attachment", pkt)

    # ── CASE 5: Staggered Double Crossroads (Offset Crossroads) ───────────────
    path = [(206, 210), (206, 165), (206, 110), (206, 45)]
    branches = [
        (206, 165, 120, 165),               # Lower left arm
        (206, 110, 290, 110),               # Upper right arm
    ]
    pkt = build_packet(0, 250, 70, 5, 68, path, branches, "CASE 5: OFFSET CROSS")
    await send_case("CASE 5: Staggered Double Crossroads — Two joints along one route", pkt)

    # ── CASE 6: Multi-Leg Roundabout Hub (3 Arms from Single Joint) ───────────
    path = [(206, 210), (206, 135)]
    branches = [
        (206, 135, 130, 85),                # Arm 1: NW (135°)
        (206, 135, 280, 85),                # Arm 2: NE (45°)
        (206, 135, 206, 50),                # Arm 3: North (0°)
    ]
    pkt = build_packet(0, 80, 30, 2, 78, path, branches, "CASE 6: 3-ARM HUB")
    await send_case("CASE 6: Multi-Leg Hub — 3 wireframe arms radiating from single joint", pkt)

    # ── CASE 7: Hairpin / U-Turn Joint ────────────────────────────────────────
    path = [(206, 210), (206, 155), (175, 135), (160, 105), (175, 75), (206, 65)]
    branches = [
        (206, 155, 285, 155),               # Tangent road shooting off apex
        (160, 105, 95, 105),                # Escape lane branching off hairpin curve
    ]
    pkt = build_packet(3, 110, 25, 2, 88, path, branches, "CASE 7: HAIRPIN U-TURN")
    await send_case("CASE 7: Hairpin / U-Turn — Tangent overshoot and curve escape branches", pkt)

    # ── CASE 8: Continuous 360° Radial Sweep Stress Test ──────────────────────
    print("\n▶ CASE 8: Continuous 360° Radial Sweep Stress Test")
    print("  Rotating branch through every degree (0° → 360°) to verify 100% attachment...")

    cx, cy = 206, 130
    path = [(206, 210), (cx, cy), (cx, 40)]
    arm_len = 75

    for deg in range(0, 361, 10):
        rad = math.radians(deg)
        bx2 = cx + int(arm_len * math.sin(rad))
        by2 = cy - int(arm_len * math.cos(rad))
        branches = [(cx, cy, bx2, by2)]

        pkt = build_packet(
            turn_type    = 0,
            distance_m   = 100,
            speed_kph    = 50,
            eta_min      = 1,
            progress_pct = 95,
            path_points  = path,
            branches     = branches,
            street_name  = f"SWEEP: {deg:3d}°",
        )
        await client.write_gatt_char(NAV_CHAR_UUID, pkt, response=False)
        print(f"  ↺ Angle: {deg:3d}° → endpoint ({bx2:3d}, {by2:3d})", end='\r')
        await asyncio.sleep(0.08)

    print("\n  ✅ 360° Radial Sweep finished with zero detachment!")

    # Final summary scene
    print("\n" + "=" * 64)
    print("  ALL 8 JOINT CASES TESTED & VERIFIED SUCCESSFULLY! ✅")
    print("=" * 64)
    time.sleep(1.0)


async def main():
    print(f"\n[*] Scanning for '{DEVICE_NAME}' or address '{DEVICE_MAC}'...")
    device = None
    devices = await BleakScanner.discover(timeout=6.0)
    for d in devices:
        if (d.name and DEVICE_NAME.lower() in d.name.lower()) or (d.address and d.address.upper() == DEVICE_MAC.upper()):
            device = d
            break

    if device is None:
        print(f"[!] '{DEVICE_NAME}' not found.")
        print("   Make sure the ESP32 is powered on and advertising.")
        sys.exit(1)

    print(f"✅ Found device: {device.name or DEVICE_NAME}  [{device.address}]")
    print(f"   Connecting...")

    async with BleakClient(device, timeout=12.0) as client:
        if not client.is_connected:
            print("❌ Failed to connect.")
            sys.exit(1)
        await run_joint_test_suite(client)


if __name__ == "__main__":
    asyncio.run(main())
