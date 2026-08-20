import { BleManager, Device, State, Characteristic } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import {
  BLE_SERVICE_UUID,
  BLE_NAV_STATE_CHAR_UUID,
  BLE_DEVICE_EVENT_CHAR_UUID,
} from '../constants/config';
import { encodeNavState, decodeDeviceEvent, NavState, DeviceEvent } from '../constants/ble';

// Singleton BLE manager
const manager = new BleManager();

let connectedDevice: Device | null = null;

// ── Permissions ───────────────────────────────────────────────────────────────

export async function requestBLEPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const grants = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ]);
  return Object.values(grants).every(g => g === PermissionsAndroid.RESULTS.GRANTED);
}

// ── Scan ──────────────────────────────────────────────────────────────────────

export function onBLEStateChange(callback: (state: State) => void) {
  const subscription = manager.onStateChange(callback, true);
  return () => subscription.remove();
}

export function scanForDevices(
  onDeviceFound: (device: Device) => void,
  onError: (err: Error) => void,
): () => void {
  manager.startDeviceScan(
    null, // null = scan for ALL devices (useful for debugging/proving it works)
    { allowDuplicates: false },
    (err, device) => {
      if (err) { onError(err); return; }
      if (device && device.name) onDeviceFound(device);
    },
  );
  return () => manager.stopDeviceScan();
}

// ── Connect ───────────────────────────────────────────────────────────────────

export async function connectToDevice(
  device: Device,
  onDisconnect: () => void,
  onDeviceEvent: (event: DeviceEvent) => void,
): Promise<void> {
  manager.stopDeviceScan();
  connectedDevice = await device.connect();
  connectedDevice = await connectedDevice.discoverAllServicesAndCharacteristics();

  // Listen for disconnection
  connectedDevice.onDisconnected(() => {
    connectedDevice = null;
    onDisconnect();
  });

  // Subscribe to device_event notifications (button presses from device)
  connectedDevice.monitorCharacteristicForService(
    BLE_SERVICE_UUID,
    BLE_DEVICE_EVENT_CHAR_UUID,
    (err, char) => {
      if (err || !char?.value) return;
      try { onDeviceEvent(decodeDeviceEvent(char.value)); } catch {}
    },
  );
}

// ── Write nav_state ───────────────────────────────────────────────────────────

export async function writeNavState(state: NavState): Promise<void> {
  if (!connectedDevice) return;
  const encoded = encodeNavState(state);
  await connectedDevice.writeCharacteristicWithoutResponseForService(
    BLE_SERVICE_UUID,
    BLE_NAV_STATE_CHAR_UUID,
    encoded,
  );
}

// ── Disconnect ────────────────────────────────────────────────────────────────

export async function disconnectDevice(): Promise<void> {
  if (connectedDevice) {
    await connectedDevice.cancelConnection();
    connectedDevice = null;
  }
}

export function isConnected(): boolean {
  return connectedDevice !== null;
}
