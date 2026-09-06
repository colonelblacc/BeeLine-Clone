import { Buffer } from 'buffer';

/**
 * BLE packet encode/decode helpers.
 *
 * nav_state characteristic (12+ bytes, phone → device):
 *   [0]    turn_type          uint8   0=straight 1=left 2=right 3=u-turn 4=sl-left 5=sl-right 6=arrived
 *   [1-2]  distance_m         uint16  little-endian, metres to next turn
 *   [3]    speed_limit_kph    uint8   kph (0 = hide badge)
 *   [4-5]  eta_min            uint16  little-endian
 *   [6]    flags              uint8   bit0=useMetric
 *   [7]    trip_progress_pct  uint8   0..100
 *   [8]    side_road_y_offset uint8   0..45 (scroll offset)
 *   [9]    poi_type           uint8   0=none 1=parking 2=fuel 3=ev 4=hazard 5=dest
 *   [10]   poi_x_rel_m        int8    signed, clamped -127..+127 metres
 *   [11]   poi_y_rel_m        int8    signed, clamped -127..+127 metres
 *   [12+]  street_name        utf8    up to 31 bytes, null-terminated on device
 *
 * device_event characteristic (2 bytes, device → phone):
 *   [0]    button_id     uint8
 *   [1]    event_type    uint8   0=press 1=long-press
 */

export type TurnType = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export enum PoiType {
  None = 0,
  Parking = 1,
  Fuel = 2,
  EV = 3,
  Hazard = 4,
  Destination = 5,
  SpeedCamera = 6,
}

export interface MapPoi {
  type: number; // 0=None, 1=Parking, 2=Fuel, 3=EV, 4=Hazard, 5=Destination, 6=SpeedCamera
  xRelM: number;
  yRelM: number;
}

export interface NavState {
  turnType: TurnType;
  distanceM: number;
  speedLimitKph: number;
  etaMin: number;
  useMetric: boolean;
  tripProgressPct?: number;
  sideRoadYOffset?: number;
  sideRoadAngleDeg?: number; // -180°..+180° relative turn/intersection angle
  poi?: MapPoi;
  streetName?: string;
  mapPath?: { x: number; y: number }[]; // Real-world projected 2D waypoints (max 8)
  customPath?: { x: number; y: number }[]; // Alias for mapPath
  sideBranches?: { x1: number; y1: number; x2: number; y2: number }[]; // Real-world side road vectors (max 3)
}

export interface DeviceEvent {
  buttonId: number;
  eventType: 0 | 1; // 0=press, 1=long-press
}

/** Clamp a value to signed int8 range (-127..127) and pack as a byte */
function packInt8(val: number): number {
  const clamped = Math.max(-127, Math.min(127, Math.round(val)));
  return clamped < 0 ? (clamped + 256) : clamped; // two's complement
}

/** Encode NavState into a Base64 string for BLE write */
export function encodeNavState(state: NavState): string {
  const points = (state.customPath || state.mapPath || []).slice(0, 8);
  const hasPath = points.length >= 2;
  const branches = hasPath ? (state.sideBranches || []).slice(0, 3) : [];
  const pathByteLen = hasPath ? 1 + points.length * 4 + 1 + branches.length * 8 : 0;
  const streetNameBytes = state.streetName ? Buffer.from(state.streetName, 'utf8') : new Uint8Array(0);
  const streetLen = Math.min(streetNameBytes.length, 31);

  const totalLen = 12 + pathByteLen + streetLen;
  const buf = new Uint8Array(totalLen);

  buf[0] = state.turnType & 0xff;
  buf[1] = state.distanceM & 0xff;
  buf[2] = (state.distanceM >> 8) & 0xff;
  buf[3] = Math.min(255, state.speedLimitKph) & 0xff;
  buf[4] = state.etaMin & 0xff;
  buf[5] = (state.etaMin >> 8) & 0xff;

  let flags = state.useMetric ? 0x01 : 0x00;
  if (hasPath) flags |= 0x02;
  buf[6] = flags;

  buf[7] = Math.min(100, Math.max(0, state.tripProgressPct || 0)) & 0xff;
  buf[8] = Math.min(45, Math.max(0, state.sideRoadYOffset || 0)) & 0xff;
  buf[9] = (state.poi?.type || 0) & 0xff;
  buf[10] = packInt8(state.poi?.xRelM || 0);
  buf[11] = packInt8(state.poi?.yRelM || 0);

  let offset = 12;
  if (hasPath) {
    buf[offset++] = points.length & 0xff;
    for (const pt of points) {
      const px = Math.max(-200, Math.min(600, Math.round(pt.x)));
      const py = Math.max(-200, Math.min(600, Math.round(pt.y)));
      buf[offset++] = px & 0xff;
      buf[offset++] = (px >> 8) & 0xff;
      buf[offset++] = py & 0xff;
      buf[offset++] = (py >> 8) & 0xff;
    }

    buf[offset++] = branches.length & 0xff;
    for (const b of branches) {
      const x1 = Math.round(b.x1);
      const y1 = Math.round(b.y1);
      const x2 = Math.round(b.x2);
      const y2 = Math.round(b.y2);
      buf[offset++] = x1 & 0xff;
      buf[offset++] = (x1 >> 8) & 0xff;
      buf[offset++] = y1 & 0xff;
      buf[offset++] = (y1 >> 8) & 0xff;
      buf[offset++] = x2 & 0xff;
      buf[offset++] = (x2 >> 8) & 0xff;
      buf[offset++] = y2 & 0xff;
      buf[offset++] = (y2 >> 8) & 0xff;
    }
  }

  if (streetLen > 0) {
    buf.set(streetNameBytes.subarray(0, streetLen), offset);
  }

  return Buffer.from(buf).toString('base64');
}

/**
 * Decode a Base64 nav_state packet back to a human-readable object.
 * Use this to verify what the device will actually receive.
 */
export function decodeNavState(base64: string): Record<string, unknown> {
  const buf = Buffer.from(base64, 'base64');
  const turnTypes = ['Straight', 'Left', 'Right', 'U-Turn', 'Slight Left', 'Slight Right', 'Arrived'];
  const poiTypes  = ['None', 'Parking', 'Fuel', 'EV', 'Hazard', 'Destination', 'SpeedCamera'];

  const poiXRaw = buf[10];
  const poiYRaw = buf[11];
  const poiX = poiXRaw > 127 ? poiXRaw - 256 : poiXRaw; // decode as int8
  const poiY = poiYRaw > 127 ? poiYRaw - 256 : poiYRaw;
  const sideAngleRaw = buf.length > 12 ? buf[12] : 90;
  const sideAngle = sideAngleRaw > 127 ? sideAngleRaw - 256 : sideAngleRaw;
  const pathCount = buf.length > 13 ? buf[13] : 0;

  const points: { x: number; y: number }[] = [];
  let offset = 14;
  for (let i = 0; i < pathCount && offset + 4 <= buf.length; i++) {
    const x = buf[offset] | (buf[offset + 1] << 8);
    const y = buf[offset + 2] | (buf[offset + 3] << 8);
    points.push({ x, y });
    offset += 4;
  }

  const branchCount = buf.length > offset ? buf[offset++] : 0;
  const branches: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < branchCount && offset + 8 <= buf.length; i++) {
    const x1 = buf[offset] | (buf[offset + 1] << 8);
    const y1 = buf[offset + 2] | (buf[offset + 3] << 8);
    const x2 = buf[offset + 4] | (buf[offset + 5] << 8);
    const y2 = buf[offset + 6] | (buf[offset + 7] << 8);
    branches.push({ x1, y1, x2, y2 });
    offset += 8;
  }

  const streetName = buf.length > offset
    ? buf.slice(offset).toString('utf8').replace(/\0.*/, '')
    : '';

  return {
    packetLen:        buf.length,
    turnType:         `${buf[0]} (${turnTypes[buf[0]] ?? 'Unknown'})`,
    distanceM:        buf[1] | (buf[2] << 8),
    speedLimitKph:    buf[3],
    etaMin:           buf[4] | (buf[5] << 8),
    useMetric:        (buf[6] & 0x01) === 1,
    tripProgressPct:  buf[7],
    sideRoadYOffset:  buf[8],
    sideRoadAngleDeg: sideAngle,
    poiType:          `${buf[9]} (${poiTypes[buf[9]] ?? 'Unknown'})`,
    poiXRelM:         poiX,
    poiYRelM:         poiY,
    pathCount,
    mapPath:          points,
    branchCount,
    sideBranches:     branches,
    streetName,
  };
}

/** Decode a Base64 device_event notification from the device */
export function decodeDeviceEvent(base64: string): DeviceEvent {
  const buf = Buffer.from(base64, 'base64');
  return {
    buttonId: buf[0],
    eventType: buf[1] as 0 | 1,
  };
}

/** Human-readable turn direction label */
export const TURN_LABELS: Record<TurnType, string> = {
  0: 'Continue',
  1: 'Turn Left',
  2: 'Turn Right',
  3: 'U-Turn',
  4: 'Slight Left',
  5: 'Slight Right',
  6: 'Arrived at Destination',
};

export const POI_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Parking',
  2: 'Fuel Station',
  3: 'EV Charger',
  4: 'Road Hazard',
  5: 'Destination',
  6: 'Speed Camera',
};

