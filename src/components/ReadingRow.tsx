import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Reading } from '../types';
import { CATEGORY_COLORS, CATEGORY_LABELS, getBpCategory } from '../utils/bp';
import { formatTime } from '../utils/dates';

interface Props {
  reading: Reading;
  isSelected: boolean;
  onPress: (id: string) => void;
}

/** Memoized: selecting one row re-renders only the rows whose props changed. */
export const ReadingRow = memo(function ReadingRow({ reading, isSelected, onPress }: Props) {
  const category = getBpCategory(reading);
  const label = CATEGORY_LABELS[category];
  const source = reading.source === 'monitor' ? 'Monitor' : 'Manual';
  const time = formatTime(reading.takenAt);

  return (
    <TouchableOpacity
      onPress={() => onPress(reading.id)}
      style={[styles.row, isSelected && styles.selected]}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${reading.systolic} over ${reading.diastolic}, ${label}. Pulse ${reading.pulse}. ${source}, ${time}`}
    >
      <View style={[styles.dot, { backgroundColor: CATEGORY_COLORS[category] }]} />
      <View style={styles.main}>
        <Text style={styles.value}>
          {reading.systolic}/{reading.diastolic}
          <Text style={[styles.category, { color: CATEGORY_COLORS[category] }]}>  {label}</Text>
        </Text>
        <Text style={styles.meta}>
          Pulse {reading.pulse} · {source}
        </Text>
      </View>
      <Text style={styles.time}>{time}</Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  selected: { backgroundColor: '#eef3ff' },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  main: { flex: 1 },
  value: { fontSize: 18, fontWeight: '600', color: '#222' },
  category: { fontSize: 13, fontWeight: '700' },
  meta: { fontSize: 12, color: '#595959' },
  time: { fontSize: 14, color: '#555' },
});
