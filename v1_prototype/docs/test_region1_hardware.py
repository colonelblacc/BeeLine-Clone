"""
BeeLine Clone — Region 1 Hardware Test Script
==============================================
Connects directly to "BeeLine-Moto2" over BLE and sends the
exact T-junction right-turn example from the documentation:

Scenario:
  - Rider heading NORTH (0°), 90m to a right turn onto Cut Road
  - Main route: (206,210) → (206,141) → (252,141)
  - Cross-road branch: (206,141) → (206, 91)

Then animates the junction scrolling down toward the rider
(simulating the motorcycle approaching at ~20 km/h).

Serial monitor will show:
  [BLE RX] Turn=2 Dist=90m Speed=50 Pts=3 Branches=1 Street=Cut Road

Run:  python test_region1_hardware.py
"""

import asyncio
import struct
import sys
import math
from bleak import BleakClient, BleakScanner

# ── BLE UUIDs (must match main.cpp) ─────────────────────────────────────────
SERVICE_UUID      = "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d"
NAV_CHAR_UUID     = "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6e"
EVENT_CHAR_UUID   = "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6f"
DEVICE_NAME       = "BeeLine-Moto2"


def build_packet(
    turn_type: int,         # 0=Straight, 1=Left, 2=Right, 3=UTurn, 6=Arrived
    distance_m: int,        # metres to next turn
    speed_kph: int,         # speed limit (0 = hide)
    eta_min: int,           # estimated arrival minutes
    progress_pct: int,      # 0..100 trip progress
    path_points: list,      # [(x, y), ...] screen coordinates (max 8)
    branches: list,         # [(x1,y1,x2,y2), ...] branch vectors (max 3)
    street_name: str = "",  # street name string
    is_metric: bool = True,
) -> bytes:
    """Pack a nav_state telemetry packet matching the ble.ts encodeNavState spec."""
    has_path = len(path_points) >= 2
    flags = 0x01 if is_metric else 0x00
    if has_path:
        flags |= 0x02

    # 12-byte mandatory header
    buf = bytearray()
    buf.append(turn_type & 0xFF)
    buf += struct.pack('<H', distance_m)
    buf.append(speed_kph & 0xFF)
    buf += struct.pack('<H', eta_min)
    buf.append(flags)
    buf.append(max(0, min(100, progress_pct)))
    buf.append(0)   # side_road_y_offset (unused in this test)
    buf.append(0)   # poi_type
    buf.append(0)   # poi_x_rel_m
    buf.append(0)   # poi_y_rel_m

    # Optional vector geometry section
    if has_path:
        pts = path_points[:8]
        brs = branches[:3]
        buf.append(len(pts))
        for (x, y) in pts:
            buf += struct.pack('<hh', int(x), int(y))
        buf.append(len(brs))
        for (x1, y1, x2, y2) in brs:
            buf += struct.pack('<hhhh', int(x1), int(y1), int(x2), int(y2))

    # Optional trailing street name
    if street_name:
        name_bytes = street_name.encode('utf-8')[:31]
        buf += name_bytes

    return bytes(buf)


# ── Test Scenes ──────────────────────────────────────────────────────────────

def make_right_turn_scene(distance_m: int, progress_pct: int):
    """
    The documented example: Rider heading North, right turn onto Cut Road.
    Scale: 1.3 m/px → distance_m px from rider origin (206, 210).
    Junction scrolls from Y=10 (260m) down to Y=190 (26m) toward rider at Y=210.
    """
    M_PER_PX = 1.3
    junction_y = int(210 - (distance_m / M_PER_PX))
    junction_y = max(10, min(205, junction_y))

    exit_arm_len = 46   # ~60m in pixels at 1.3 m/px

    path_points = [
        (206, 210),                          # Rider origin (always fixed)
        (206, junction_y),                   # Junction approach midpoint
        (206 + exit_arm_len, junction_y),    # Exit arm: turn right (East)
    ]

    # Crossing road that continues straight North (rendered as wireframe rails)
    branches = [
        (206, junction_y, 206, max(10, junction_y - 45)),
    ]

    return build_packet(
        turn_type    = 2,           # NAV_TURN_RIGHT
        distance_m   = distance_m,
        speed_kph    = 50,
        eta_min      = 4,
        progress_pct = progress_pct,
        path_points  = path_points,
        branches     = branches,
        street_name  = "Cut Road",
    )


def make_left_turn_scene(distance_m: int, progress_pct: int):
    """
    Step 3 of the debug route: Left turn onto MDR169 (heading North → turn West).
    Junction scrolls toward rider; exit arm goes left (West).
    """
    M_PER_PX = 1.3
    junction_y = int(210 - (distance_m / M_PER_PX))
    junction_y = max(10, min(205, junction_y))

    exit_arm_len = 46

    path_points = [
        (206, 210),
        (206, junction_y),
        (206 - exit_arm_len, junction_y),   # Exit arm: turn left (West)
    ]

    branches = [
        (206, junction_y, 206, max(10, junction_y - 45)),
    ]

    return build_packet(
        turn_type    = 1,           # NAV_TURN_LEFT
        distance_m   = distance_m,
        speed_kph    = 30,
        eta_min      = 3,
        progress_pct = progress_pct,
        path_points  = path_points,
        branches     = branches,
        street_name  = "MDR169",
    )


def make_straight_scene(progress_pct: int):
    """Straight road with no upcoming junction — verify clean polyline."""
    path_points = [
        (206, 210),
        (206, 160),
        (206, 100),
        (206, 40),
    ]
    return build_packet(
        turn_type    = 0,           # NAV_TURN_STRAIGHT
        distance_m   = 500,
        speed_kph    = 70,
        eta_min      = 8,
        progress_pct = progress_pct,
        path_points  = path_points,
        branches     = [],
        street_name  = "NH544",
    )


def make_sweeping_corner_scene(
    turn_progress: float,  # 0.0 (entered turn) -> 1.0 (straightened out on new street)
    is_right: bool,
    street_name: str,
    speed_kph: int,
    eta_min: int,
    progress_pct: int,
):
    """
    Heading-Up Cornering Camera:
    As the motorcycle physically leans into the turn, the street geometry
    smoothly rotates around rider origin (206, 210) by -theta.
    The exit street swings from pointing East (+90°) or West (-90°) into
    the forward heading (0° North). Always produces exactly 6 points!
    """
    cx, cy = 206, 210
    pts = [(cx, cy)]
    road_len = 160

    # rel_deg: 90° (at start) -> 0° (at completion)
    max_deg = 90.0 if is_right else -90.0
    rel_deg = max_deg * (1.0 - turn_progress)

    for step in range(1, 6):
        seg_dist = (step / 5.0) * road_len
        rad = math.radians(rel_deg)
        px = cx + seg_dist * math.sin(rad)
        py = cy - seg_dist * math.cos(rad)
        pts.append((int(px), int(py)))

    # Wireframe side street rotating and sliding past the rider
    branch_y = cy - int(30 * (1.0 - turn_progress)) + int(25 * turn_progress)
    br_rad = math.radians(-max_deg * turn_progress)
    bx1 = cx
    by1 = branch_y
    bx2 = cx + int(65 * math.sin(br_rad))
    by2 = branch_y - int(65 * math.cos(br_rad))
    branches = [(int(bx1), int(by1), int(bx2), int(by2))] if turn_progress < 0.75 else []

    turn_type = (2 if is_right else 1) if turn_progress < 0.6 else 0
    dist_m = max(0, int(20 * (1.0 - turn_progress)))

    return build_packet(
        turn_type    = turn_type,
        distance_m   = dist_m,
        speed_kph    = speed_kph,
        eta_min      = eta_min,
        progress_pct = progress_pct,
        path_points  = pts,
        branches     = branches,
        street_name  = street_name,
    )


def make_arrived_scene():
    """Arrival scene — star icon, 0 distance, 6 points."""
    pts = [(206, 210), (206, 195), (206, 180), (206, 165), (206, 150), (206, 135)]
    return build_packet(
        turn_type    = 6,           # NAV_TURN_ARRIVED
        distance_m   = 0,
        speed_kph    = 0,           # Hide speed badge
        eta_min      = 0,
        progress_pct = 100,
        path_points  = pts,
        branches     = [],
        street_name  = "Foodcafe Caterers",
    )


# ── BLE Connection & Test Runner ─────────────────────────────────────────────

def notification_handler(sender, data: bytearray):
    """Handle device_event notifications (button press from ESP32)."""
    if len(data) >= 2:
        btn = data[0]
        evt = "Long-Press" if data[1] == 1 else "Short-Press"
        print(f"  📡 Device Event: Button {btn} → {evt}")


async def run_tests(client: BleakClient):
    print("\n" + "─" * 60)
    print("  BeeLine-Moto2 CONNECTED — Starting Region 1 Tests")
    print("─" * 60)

    # Subscribe to device event notifications (button presses)
    try:
        await client.start_notify(EVENT_CHAR_UUID, notification_handler)
        print("  ✅ Subscribed to device_event notifications\n")
    except Exception as e:
        print(f"  ⚠️  Could not subscribe to event char: {e}\n")

    print("─" * 60)
    print("  SIMULATION: CONTINUOUS LIVE RIDE (Google Maps Style)")
    print("  Watch the display: road extends behind rider and glides at 50 FPS")
    print("─" * 60)

    # ── STAGE 1: Cruising North on Grand Avenue (Gentle S-Bend ahead) ──────────
    print("\n  [STAGE 1] Cruising North on Grand Avenue (60 km/h)")
    print("            Smooth road curvature sliding down toward rider...")

    for step in range(25):
        offset = step * 3
        # 6-point normalized curvature spline
        path = [
            (206, 210),
            (206 + int(6  * math.sin(step * 0.15)),       max(160, 180 - offset)),
            (206 + int(14 * math.sin(step * 0.2)),        max(120, 140 - offset)),
            (206 + int(20 * math.sin(step * 0.2 + 0.3)),  max(80,  100 - offset)),
            (206 + int(24 * math.sin(step * 0.2 + 0.6)),  max(40,   60 - offset)),
            (206 + int(26 * math.sin(step * 0.2 + 0.9)),  max(10,   20 - offset)),
        ]
        dist = max(100, 350 - step * 10)
        pct  = 15 + int(step * 0.5)

        # Side street crossing on Grand Avenue sliding toward rider
        br_y = int(170 - step * 5)
        branches = [(206, br_y, 120, br_y)] if br_y > 35 and br_y < 195 else []

        pkt  = build_packet(
            turn_type    = 0,
            distance_m   = dist,
            speed_kph    = 60,
            eta_min      = 6,
            progress_pct = pct,
            path_points  = path,
            branches     = branches,
            street_name  = "Grand Avenue",
        )
        await client.write_gatt_char(NAV_CHAR_UUID, pkt, response=False)
        print(f"    → dist={dist:3d}m  progress={pct:2d}%  [Grand Ave]")
        await asyncio.sleep(0.12)

    # ── STAGE 2A: Approaching Right Turn onto Cut Road (110m -> 20m) ──────────
    print("\n  [STAGE 2A] Approaching Right Turn onto Cut Road (50 km/h)")
    print("             Junction slides smoothly toward rider arrow...")

    for dist in range(110, 18, -4):
        junc_y = int(210 - dist / 1.3)
        path = [
            (206, 210),
            (206, int(210 - (210 - junc_y) * 0.5)),
            (206, junc_y),
            (206 + 18, junc_y),
            (206 + 36, junc_y),
            (206 + 54, junc_y),
        ]
        # Wireframe side streets at the junction: left crossing arm and forward through road
        branches = [
            (206, junc_y, 115, junc_y),
            (206, junc_y, 206, max(10, junc_y - 50)),
        ]
        pct = 28 + int((110 - dist) * 0.15)
        pkt = build_packet(
            turn_type    = 2,
            distance_m   = dist,
            speed_kph    = 50,
            eta_min      = 4,
            progress_pct = pct,
            path_points  = path,
            branches     = branches,
            street_name  = "Cut Road",
        )
        await client.write_gatt_char(NAV_CHAR_UUID, pkt, response=False)
        print(f"    → dist={dist:3d}m  junction_y={junc_y:3d}px  progress={pct:2d}%  [Cut Road Approach]")
        await asyncio.sleep(0.12)

    # ── STAGE 2B: Cornering Sweeping Transition (Right Turn Execution) ─────────
    print("\n  [STAGE 2B] SWEEPING THROUGH RIGHT TURN (Heading-Up Rotation)")
    print("             Street rotates 90° into view like Google Maps...")

    corner_steps = 15
    for s in range(corner_steps + 1):
        t = s / float(corner_steps)
        pct = 42 + int(t * 5)
        pkt = make_sweeping_corner_scene(
            turn_progress = t,
            is_right      = True,
            street_name   = "Cut Road",
            speed_kph     = 45,
            eta_min       = 3,
            progress_pct  = pct,
        )
        await client.write_gatt_char(NAV_CHAR_UUID, pkt, response=False)
        deg = int(90 * t)
        print(f"    ↺ Turning Right: {deg:2d}° / 90°  progress={pct:2d}%")
        await asyncio.sleep(0.12)

    # ── STAGE 3: Riding Straight on Cut Road ──────────────────────────────────
    print("\n  [STAGE 3] Turned onto Cut Road — Cruising Smoothly (50 km/h)")
    for step in range(16):
        dist = 220 - step * 10
        path = [
            (206, 210),
            (206, 175),
            (206, 140),
            (206, 105),
            (206, 70),
            (206, 35),
        ]
        # Side street along Cut Road
        br_y = int(175 - step * 8)
        branches = [(206, br_y, 295, br_y)] if br_y > 40 and br_y < 195 else []
        pct = 47 + int(step * 0.8)
        pkt = build_packet(
            turn_type    = 0,
            distance_m   = dist,
            speed_kph    = 50,
            eta_min      = 3,
            progress_pct = pct,
            path_points  = path,
            branches     = branches,
            street_name  = "Cut Road",
        )
        await client.write_gatt_char(NAV_CHAR_UUID, pkt, response=False)
        print(f"    → dist={dist:3d}m  progress={pct:2d}%  [Cut Road]")
        await asyncio.sleep(0.12)

    # ── STAGE 4A: Approaching Left Turn onto MDR169 ────────────────────────────
    print("\n  [STAGE 4A] Approaching Left Turn onto MDR169 (30 km/h)")
    for dist in range(95, 18, -4):
        junc_y = int(210 - dist / 1.3)
        path = [
            (206, 210),
            (206, int(210 - (210 - junc_y) * 0.5)),
            (206, junc_y),
            (206 - 18, junc_y),
            (206 - 36, junc_y),
            (206 - 54, junc_y),
        ]
        # Wireframe side streets at the junction: right crossing arm and forward through road
        branches = [
            (206, junc_y, 295, junc_y),
            (206, junc_y, 206, max(10, junc_y - 50)),
        ]
        pct = 60 + int((95 - dist) * 0.15)
        pkt = build_packet(
            turn_type    = 1,
            distance_m   = dist,
            speed_kph    = 30,
            eta_min      = 2,
            progress_pct = pct,
            path_points  = path,
            branches     = branches,
            street_name  = "MDR169",
        )
        await client.write_gatt_char(NAV_CHAR_UUID, pkt, response=False)
        print(f"    → dist={dist:3d}m  junction_y={junc_y:3d}px  progress={pct:2d}%  [MDR169 Approach]")
        await asyncio.sleep(0.12)

    # ── STAGE 4B: Cornering Sweeping Transition (Left Turn Execution) ──────────
    print("\n  [STAGE 4B] SWEEPING THROUGH LEFT TURN (Heading-Up Rotation)")
    for s in range(corner_steps + 1):
        t = s / float(corner_steps)
        pct = 72 + int(t * 6)
        pkt = make_sweeping_corner_scene(
            turn_progress = t,
            is_right      = False,
            street_name   = "MDR169",
            speed_kph     = 25,
            eta_min       = 1,
            progress_pct  = pct,
        )
        await client.write_gatt_char(NAV_CHAR_UUID, pkt, response=False)
        deg = int(90 * t)
        print(f"    ↺ Turning Left: {deg:2d}° / 90°  progress={pct:2d}%")
        await asyncio.sleep(0.12)

    # ── STAGE 5: Final Approach to Foodcafe Caterers ───────────────────────────
    print("\n  [STAGE 5] Approaching Destination: Foodcafe Caterers")
    for dist in range(60, 0, -10):
        path = [
            (206, 210),
            (206, 180),
            (206, 150),
            (206, 120),
            (206, 90),
            (206, 60),
        ]
        pct  = 80 + int((60 - dist) * 0.3)
        pkt  = build_packet(
            turn_type    = 0,
            distance_m   = dist,
            speed_kph    = 20,
            eta_min      = 1,
            progress_pct = pct,
            path_points  = path,
            branches     = [],
            street_name  = "Foodcafe Caterers",
        )
        await client.write_gatt_char(NAV_CHAR_UUID, pkt, response=False)
        print(f"    → dist={dist:3d}m  progress={pct:2d}%")
        await asyncio.sleep(0.18)

    # ── STAGE 6: Arrival ───────────────────────────────────────────────────────
    print("\n  [STAGE 6] ARRIVED at Destination!")
    for _ in range(5):
        await client.write_gatt_char(NAV_CHAR_UUID, make_arrived_scene(), response=False)
        await asyncio.sleep(0.3)

    print("\n" + "─" * 60)
    print("  CONTINUOUS RIDE SIMULATION FINISHED SUCCESSFULLY! ✅")
    print("─" * 60)

    await client.stop_notify(EVENT_CHAR_UUID)


async def main():
    print(f"\n[*] Scanning for '{DEVICE_NAME}'...")
    device = None
    devices = await BleakScanner.discover(timeout=6.0)
    for d in devices:
        if (d.name and DEVICE_NAME.lower() in d.name.lower()) or (d.address and d.address.upper() == "30:ED:A0:2A:3F:19"):
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
        await run_tests(client)


if __name__ == "__main__":
    asyncio.run(main())
