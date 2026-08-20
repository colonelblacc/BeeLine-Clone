import { Buffer } from 'buffer';

/**
 * BLE packet encode/decode helpers.
 *
 * nav_state characteristic (7 bytes, phone → device):
 *   [0]    turn_type     uint8   0=straight 1=left 2=right 3=u-turn
 *   [1-2]  distance_m    uint16  little-endian, metres to next turn
 *   [3]    speed_limit   uint8   kph (0 = hide badge)
 *   [4-5]  eta_min       uint16  little-endian
 *   [6]    flags         uint8   bit 0 = useMetric
 *
 * device_event characteristic (2 bytes, device → phone):
 *   [0]    button_id     uint8
 *   [1]    event_type    uint8   0=press 1=long-press
 */

export type TurnType = 0 | 1 | 2 | 3;

export interface MapPoi {
  type: number; // 0=None, 1=Parking, 2=Fuel, 3=EV, 4=Hazard, 5=Destination
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
  poi?: MapPoi;
  streetName?: string;
}

export interface DeviceEvent {
  buttonId: number;
  eventType: 0 | 1; // 0=press, 1=long-press
}

/** Encode NavState into a Base64 string for BLE write */
export function encodeNavState(state: NavState): string {
  const streetNameBytes = state.streetName ? Buffer.from(state.streetName, 'utf8') : new Uint8Array(0);
  const totalLen = 12 + Math.min(streetNameBytes.length, 31);
  const buf = new Uint8Array(totalLen);
  
  buf[0] = state.turnType & 0xff;
  buf[1] = state.distanceM & 0xff;
  buf[2] = (state.distanceM >> 8) & 0xff;
  buf[3] = state.speedLimitKph & 0xff;
  buf[4] = state.etaMin & 0xff;
  buf[5] = (state.etaMin >> 8) & 0xff;
  buf[6] = state.useMetric ? 1 : 0;
  buf[7] = (state.tripProgressPct || 0) & 0xff;
  buf[8] = (state.sideRoadYOffset || 0) & 0xff;
  buf[9] = (state.poi?.type || 0) & 0xff;
  buf[10] = (state.poi?.xRelM || 0) & 0xff;
  buf[11] = (state.poi?.yRelM || 0) & 0xff;
  
  if (streetNameBytes.length > 0) {
    buf.set(streetNameBytes.subarray(0, 31), 12);
  }
  
  return Buffer.from(buf).toString('base64');
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
};
