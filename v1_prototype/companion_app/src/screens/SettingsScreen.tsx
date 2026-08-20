import React from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { useNavStore } from '../store/navStore';
import { COLORS } from '../constants/config';
import { disconnectDevice } from '../services/ble';

export function SettingsScreen() {
  const { useMetric, setMetric, bleConnected, connectedDeviceName, setBLEConnected } = useNavStore();

  const handleDisconnect = async () => {
    await disconnectDevice();
    setBLEConnected(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      {/* ── BLE Device Status ─────────────────────────────── */}
      <Text style={styles.sectionHeader}>Device</Text>
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <View style={styles.row}>
            <View style={[styles.statusDot, { backgroundColor: bleConnected ? COLORS.success : COLORS.textMuted }]} />
            <View>
              <Text style={styles.settingName}>
                {bleConnected ? connectedDeviceName || 'Connected' : 'No Device'}
              </Text>
              <Text style={styles.settingDesc}>
                {bleConnected ? 'BLE Connected' : 'Pair from the Device tab'}
              </Text>
            </View>
          </View>
          {bleConnected && (
            <TouchableOpacity onPress={handleDisconnect} style={styles.unpairBtn}>
              <Text style={styles.unpairText}>Unpair</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Units ─────────────────────────────────────────── */}
      <Text style={styles.sectionHeader}>Units</Text>
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingName}>Metric Units</Text>
            <Text style={styles.settingDesc}>Kilometres instead of Miles</Text>
          </View>
          <Switch
            value={useMetric}
            onValueChange={setMetric}
            trackColor={{ false: COLORS.surfaceElevated, true: COLORS.accentDim }}
            thumbColor={useMetric ? COLORS.accent : COLORS.textMuted}
          />
        </View>
      </View>

      {/* ── About ─────────────────────────────────────────── */}
      <Text style={styles.sectionHeader}>About</Text>
      <View style={styles.card}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Version</Text>
          <Text style={styles.infoValue}>1.0.0-prototype</Text>
        </View>
        <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.infoLabel}>BLE Protocol</Text>
          <Text style={styles.infoValue}>GATT v1 (7-byte)</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: 60 },
  title: { color: COLORS.text, fontSize: 32, fontWeight: 'bold', marginBottom: 20, paddingHorizontal: 20 },
  sectionHeader: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: 20,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  settingName: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  settingDesc: { color: COLORS.textMuted, marginTop: 2, fontSize: 13 },
  unpairBtn: {
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  unpairText: { color: COLORS.danger, fontWeight: '600', fontSize: 13 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  infoLabel: { color: COLORS.textMuted, fontSize: 14 },
  infoValue: { color: COLORS.text, fontSize: 14, fontWeight: '500' },
});
