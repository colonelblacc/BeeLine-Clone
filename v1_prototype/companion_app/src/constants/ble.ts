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

export interface NavState {
  turnType: TurnType;
  distanceM: number;
  speedLimitKph: number;
  etaMin: number;
  useMetric: boolean;
}

export interface DeviceEvent {
  buttonId: number;
  eventType: 0 | 1; // 0=press, 1=long-press
}

/** Encode NavState into a 7-byte Base64 string for BLE write */
export function encodeNavState(state: NavState): string {
  const buf = new Uint8Array(7);
  buf[0] = state.turnType & 0xff;
  buf[1] = state.distanceM & 0xff;
  buf[2] = (state.distanceM >> 8) & 0xff;
  buf[3] = state.speedLimitKph & 0xff;
  buf[4] = state.etaMin & 0xff;
  buf[5] = (state.etaMin >> 8) & 0xff;
  buf[6] = state.useMetric ? 1 : 0;
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
