import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavStore } from '../store/navStore';
import { COLORS } from '../constants/config';

export function BLEStatusDot() {
  const bleConnected = useNavStore((state) => state.bleConnected);
  
  return (
    <View style={[styles.dot, { backgroundColor: bleConnected ? COLORS.success : COLORS.textMuted }]} />
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  }
});
