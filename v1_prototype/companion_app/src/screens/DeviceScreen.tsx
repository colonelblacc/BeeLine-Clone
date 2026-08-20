import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { Device } from 'react-native-ble-plx';
import { useNavStore } from '../store/navStore';
import { COLORS } from '../constants/config';
import { scanForDevices, connectToDevice, disconnectDevice, requestBLEPermissions, onBLEStateChange } from '../services/ble';
import { BLEStatusDot } from '../components/BLEStatusDot';

export function DeviceScreen() {
  const { bleConnected, connectedDeviceName, setBLEConnected } = useNavStore();
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectingTo, setConnectingTo] = useState<string | null>(null);

  const [adapterState, setAdapterState] = useState<string>('Unknown');

  useEffect(() => {
    const unsub = onBLEStateChange((state) => {
      setAdapterState(state);
      if (state === 'PoweredOn' && !bleConnected) {
        startScan();
      } else {
        setScanning(false);
      }
    });
    return () => unsub();
  }, [bleConnected]);

  const startScan = async () => {
    const perm = await requestBLEPermissions();
    if (!perm) return;
    
    setScanning(true);
    setDevices([]);
    
    const stop = scanForDevices((device) => {
      setDevices(prev => {
        if (!prev.find(d => d.id === device.id)) return [...prev, device];
        return prev;
      });
    }, console.error);

    // Stop scan after 10 seconds
    setTimeout(() => {
      stop();
      setScanning(false);
    }, 10000);
  };

  const handleConnect = async (device: Device) => {
    setConnectingTo(device.id);
    try {
      await connectToDevice(
        device,
        () => setBLEConnected(false),
        (event) => {
          console.log('Button pressed on device:', event);
          // E.g. skip waypoint, recalculate route, etc.
        }
      );
      setBLEConnected(true, device, device.name ?? 'BeeLine Device');
    } catch (e) {
      console.error(e);
    } finally {
      setConnectingTo(null);
    }
  };

  const handleDisconnect = async () => {
    await disconnectDevice();
    setBLEConnected(false);
    startScan();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Device</Text>

      {bleConnected ? (
        <View style={styles.connectedCard}>
          <View style={styles.row}>
            <BLEStatusDot />
            <Text style={styles.deviceName}>{connectedDeviceName}</Text>
          </View>
          <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
            <Text style={styles.disconnectText}>Unpair</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.scanRow}>
            <Text style={styles.subtitle}>Nearby Devices</Text>
            {scanning ? (
              <ActivityIndicator color={COLORS.accent} size="small" />
            ) : (
              <TouchableOpacity onPress={startScan} disabled={adapterState !== 'PoweredOn'}>
                <Text style={[styles.rescanText, adapterState !== 'PoweredOn' && { color: COLORS.textMuted }]}>
                  {adapterState === 'PoweredOn' ? 'Scan Again' : 'Bluetooth Off'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={devices}
            keyExtractor={d => d.id}
            contentContainerStyle={{ gap: 10 }}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.deviceCard} 
                onPress={() => handleConnect(item)}
                disabled={connectingTo !== null}
              >
                <Text style={styles.deviceName}>{item.name ?? 'Unknown Device'}</Text>
                {connectingTo === item.id ? (
                  <ActivityIndicator color={COLORS.text} size="small" />
                ) : (
                  <Text style={styles.connectText}>Connect</Text>
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              !scanning ? (
                <Text style={styles.emptyText}>
                  {adapterState === 'PoweredOn' 
                    ? 'No devices found. Make sure they are powered on.' 
                    : 'Please turn on Bluetooth to scan for devices.'}
                </Text>
              ) : null
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 20, paddingTop: 60 },
  title: { color: COLORS.text, fontSize: 32, fontWeight: 'bold', marginBottom: 30 },
  subtitle: { color: COLORS.textMuted, fontSize: 18, fontWeight: '600' },
  scanRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  rescanText: { color: COLORS.accent, fontWeight: '600' },
  deviceCard: {
    backgroundColor: COLORS.surface,
    padding: 20,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  connectedCard: {
    backgroundColor: COLORS.surfaceElevated,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  deviceName: { color: COLORS.text, fontSize: 18, fontWeight: 'bold' },
  connectText: { color: COLORS.accent, fontWeight: 'bold' },
  disconnectBtn: {
    backgroundColor: COLORS.surface,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  disconnectText: { color: COLORS.danger, fontWeight: 'bold' },
  emptyText: { color: COLORS.textMuted, textAlign: 'center', marginTop: 50 },
});
