import { BleManager, Device, State, Characteristic } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid, Linking } from 'react-native';
import {
  BLE_SERVICE_UUID,
  BLE_NAV_STATE_CHAR_UUID,
  BLE_DEVICE_EVENT_CHAR_UUID,
} from '../constants/config';
import { encodeNavState, decodeDeviceEvent, NavState, DeviceEvent } from '../constants/ble';

// Singleton BLE manager
const manager = new BleManager();

let connectedDevice: Device | null = null;

// ── Permissions & Bluetooth Power ───────────────────────────────────────────

export async function requestBLEPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const grants = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ]);
  return Object.values(grants).every(g => g === PermissionsAndroid.RESULTS.GRANTED);
}

export async function enableBluetooth(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await manager.enable();
      return true;
    }
    return true;
  } catch (e) {
    try {
      if (Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
      }
    } catch {}
    return false;
  }
}

export async function disableBluetooth(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await manager.disable();
      return true;
    }
    return true;
  } catch (e) {
    return false;
  }
}

export async function getBluetoothState(): Promise<State> {
  return await manager.state();
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
  const seenIds = new Set<string>();
  manager.startDeviceScan(
    null,
    { allowDuplicates: false },
    (err, device) => {
      if (err) { onError(err); return; }
      if (device && device.name && !seenIds.has(device.id)) {
        seenIds.add(device.id);
        // Prioritize BeeLine devices or accept named devices
        onDeviceFound(device);
      }
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
  
  try {
    connectedDevice = await device.connect({ timeout: 10000 });
    connectedDevice = await connectedDevice.discoverAllServicesAndCharacteristics();

    // Negotiate higher MTU on Android so 60-128 byte vector map packets transmit in a single write
    if (Platform.OS === 'android') {
      try {
        connectedDevice = await connectedDevice.requestMTU(185);
        console.log('[BLE] Negotiated MTU 185 successfully');
      } catch (e) {
        console.warn('[BLE] MTU request failed, proceeding with default MTU:', e);
      }
    }

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
  } catch (err) {
    connectedDevice = null;
    throw err;
  }
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
