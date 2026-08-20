import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../constants/config';

type RouteType = 'Fast' | 'Fun' | 'Compass';

interface Props {
  selected: RouteType;
  onSelect: (type: RouteType) => void;
}

export function RouteTypeSelector({ selected, onSelect }: Props) {
  const options: RouteType[] = ['Fast', 'Fun', 'Compass'];
  
  return (
    <View style={styles.container}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          style={[styles.pill, selected === opt && styles.pillActive]}
          onPress={() => onSelect(opt)}
        >
          <Text style={[styles.text, selected === opt && styles.textActive]}>{opt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB', // Light gray background like screenshot
    borderRadius: 20,
    padding: 4,
    marginVertical: 10,
  },
  pill: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 16,
  },
  pillActive: {
    backgroundColor: '#3B82F6', // Bold blue
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  text: {
    color: '#6B7280', // Gray text
    fontWeight: '600',
  },
  textActive: {
    color: '#FFFFFF', // White text
    fontWeight: 'bold',
  },
});
