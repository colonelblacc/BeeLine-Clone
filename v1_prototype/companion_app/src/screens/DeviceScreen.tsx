import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, ScrollView, Switch } from 'react-native';
import { Device } from 'react-native-ble-plx';
import { useNavStore } from '../store/navStore';
import { COLORS } from '../constants/config';
import { 
  scanForDevices, 
  connectToDevice, 
  disconnectDevice, 
  requestBLEPermissions, 
  onBLEStateChange, 
  writeNavState,
  enableBluetooth,
  disableBluetooth 
} from '../services/ble';
import { BLEStatusDot } from '../components/BLEStatusDot';
import { TurnType, PoiType } from '../constants/ble';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

export function DeviceScreen() {
  const { bleConnected, connectedDeviceName, setBLEConnected, useMetric } = useNavStore();
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectingTo, setConnectingTo] = useState<string | null>(null);
  const [adapterState, setAdapterState] = useState<string>('Unknown');
  const [diagFeedback, setDiagFeedback] = useState<string | null>(null);

  const isBluetoothOn = adapterState === 'PoweredOn';

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

  const handleToggleBluetooth = async (enable: boolean) => {
    if (enable) {
      await enableBluetooth();
    } else {
      await disableBluetooth();
      setScanning(false);
      setDevices([]);
    }
  };

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
    if (isBluetoothOn) {
      startScan();
    }
  };

  const sendTestPacket = async (turnType: TurnType, distM: number, speedLimit: number, poiType: PoiType = PoiType.None) => {
    try {
      await writeNavState({
        turnType,
        distanceM: distM,
        speedLimitKph: speedLimit,
        etaMin: 12,
        tripProgressPct: 65,
        streetName: 'TEST TELEMETRY BLVD',
        poi: poiType !== PoiType.None ? { type: poiType, xRelM: 0, yRelM: 100 } : undefined,
        useMetric,
      });
      setDiagFeedback(`Packet sent: Turn ${turnType}, ${distM}m, ${speedLimit} km/h`);
      setTimeout(() => setDiagFeedback(null), 3000);
    } catch (e: any) {
      setDiagFeedback(`Send failed: ${e.message || e}`);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.title}>Your Device</Text>

      {/* Bluetooth Power Toggle Card */}
      <View style={styles.bluetoothToggleCard}>
        <View style={styles.bluetoothLeft}>
          <View style={[styles.bluetoothIconCircle, { backgroundColor: isBluetoothOn ? 'rgba(0, 163, 255, 0.15)' : 'rgba(156, 163, 175, 0.15)' }]}>
            <Ionicons 
              name={isBluetoothOn ? "bluetooth" : "bluetooth-outline"} 
              size={24} 
              color={isBluetoothOn ? COLORS.accent : COLORS.textMuted} 
            />
          </View>
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.bluetoothTitle}>Bluetooth</Text>
            <Text style={styles.bluetoothSubtitle}>
              {isBluetoothOn ? 'Active & ready to connect' : 'Disabled — Tap switch to turn on'}
            </Text>
          </View>
        </View>
        <Switch
          value={isBluetoothOn}
          onValueChange={handleToggleBluetooth}
          trackColor={{ false: '#374151', true: COLORS.accentDim }}
          thumbColor={isBluetoothOn ? COLORS.accent : '#9CA3AF'}
        />
      </View>

      {bleConnected ? (
        <View>
          <View style={styles.connectedCard}>
            <View style={styles.row}>
              <BLEStatusDot />
              <View>
                <Text style={styles.deviceName}>{connectedDeviceName}</Text>
                <Text style={styles.deviceStatusSubtext}>Connected & Synchronized</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
              <Text style={styles.disconnectText}>Unpair</Text>
            </TouchableOpacity>
          </View>

          {/* Device Live Diagnostics Panel */}
          <Text style={styles.sectionHeader}>HARDWARE TELEMETRY TEST</Text>
          <View style={styles.diagCard}>
            <Text style={styles.diagDesc}>
              Tap below to send test telemetry packets directly to your ESP32 display:
            </Text>

            {diagFeedback && (
              <View style={styles.feedbackBanner}>
                <Ionicons name="information-circle" size={16} color="#10B981" style={{ marginRight: 6 }} />
                <Text style={styles.feedbackText}>{diagFeedback}</Text>
              </View>
            )}

            {/* Test Turns */}
            <Text style={styles.diagLabel}>Maneuvers:</Text>
            <View style={styles.btnGrid}>
              <TouchableOpacity style={styles.testBtn} onPress={() => sendTestPacket(0, 500, 50)}>
                <Text style={styles.testBtnText}>↑ Straight</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.testBtn} onPress={() => sendTestPacket(1, 150, 40)}>
                <Text style={styles.testBtnText}>↰ Left (150m)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.testBtn} onPress={() => sendTestPacket(2, 80, 60)}>
                <Text style={styles.testBtnText}>↱ Right (80m)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.testBtn} onPress={() => sendTestPacket(3, 200, 30)}>
                <Text style={styles.testBtnText}>↩ U-Turn</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.testBtn} onPress={() => sendTestPacket(4, 300, 50)}>
                <Text style={styles.testBtnText}>↖ Slight Left</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.testBtn} onPress={() => sendTestPacket(5, 300, 50)}>
                <Text style={styles.testBtnText}>↗ Slight Right</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.testBtn, { backgroundColor: '#FFCF00' }]} onPress={() => sendTestPacket(6, 0, 0)}>
                <Text style={[styles.testBtnText, { color: '#000' }]}>★ Arrived</Text>
              </TouchableOpacity>
            </View>

            {/* Test POIs */}
            <Text style={[styles.diagLabel, { marginTop: 15 }]}>POI & Hazard Badges:</Text>
            <View style={styles.btnGrid}>
              <TouchableOpacity style={[styles.testBtn, { backgroundColor: '#EF4444' }]} onPress={() => sendTestPacket(0, 250, 50, PoiType.Hazard)}>
                <Text style={styles.testBtnText}>⚠️ Hazard</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.testBtn, { backgroundColor: '#F59E0B' }]} onPress={() => sendTestPacket(0, 400, 60, PoiType.SpeedCamera)}>
                <Text style={styles.testBtnText}>📷 Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.testBtn, { backgroundColor: '#10B981' }]} onPress={() => sendTestPacket(0, 800, 50, PoiType.Fuel)}>
                <Text style={styles.testBtnText}>⛽ Fuel</Text>
              </TouchableOpacity>
            </View>
          </View>
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
            scrollEnabled={false}
            contentContainerStyle={{ gap: 10 }}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.deviceCard} 
                onPress={() => handleConnect(item)}
                disabled={connectingTo !== null}
              >
                <View>
                  <Text style={styles.deviceName}>{item.name ?? 'Unknown Device'}</Text>
                  <Text style={styles.deviceStatusSubtext}>{item.id}</Text>
                </View>
                {connectingTo === item.id ? (
                  <ActivityIndicator color={COLORS.text} size="small" />
                ) : (
                  <Text style={styles.connectText}>Connect</Text>
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              !scanning ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {isBluetoothOn 
                      ? 'No BeeLine devices found nearby. Make sure your hardware is powered on.' 
                      : 'Bluetooth is currently turned off on your phone.'}
                  </Text>
                  {!isBluetoothOn && (
                    <TouchableOpacity style={styles.enableBtCtaBtn} onPress={() => enableBluetooth()}>
                      <Ionicons name="bluetooth" size={18} color="#000" style={{ marginRight: 6 }} />
                      <Text style={styles.enableBtCtaText}>Turn On Bluetooth</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null
            }
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 20, paddingTop: 60 },
  title: { color: COLORS.text, fontSize: 32, fontWeight: 'bold', marginBottom: 20 },
  subtitle: { color: COLORS.textMuted, fontSize: 18, fontWeight: '600' },
  scanRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  rescanText: { color: COLORS.accent, fontWeight: '600' },
  bluetoothToggleCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  bluetoothLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  bluetoothIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bluetoothTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  bluetoothSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  sectionHeader: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 20,
    marginBottom: 10,
  },
  deviceCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  connectedCard: {
    backgroundColor: COLORS.surfaceElevated,
    padding: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 15 },
  deviceName: { color: COLORS.text, fontSize: 18, fontWeight: 'bold' },
  deviceStatusSubtext: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  connectText: { color: COLORS.accent, fontWeight: 'bold' },
  disconnectBtn: {
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  disconnectText: { color: COLORS.danger, fontWeight: 'bold' },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
    paddingHorizontal: 20,
  },
  emptyText: { color: COLORS.textMuted, textAlign: 'center', marginBottom: 15, fontSize: 14 },
  enableBtCtaBtn: {
    backgroundColor: '#FFCF00',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  enableBtCtaText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 14,
  },
  diagCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  diagDesc: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginBottom: 12,
  },
  diagLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  btnGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  testBtn: {
    backgroundColor: COLORS.surfaceElevated,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  testBtnText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
  },
  feedbackText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
  },
});

