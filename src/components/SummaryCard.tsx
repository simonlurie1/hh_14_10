import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Reading } from '../types';
import { average, getBpCategory } from '../utils/bp';

interface Props {
  readings: Reading[];
}

export function SummaryCard({ readings }: Props) {
  const avgSystolic = average(readings.map((r) => r.systolic));
  const avgDiastolic = average(readings.map((r) => r.diastolic));
  const avgPulse = average(readings.map((r) => r.pulse));
  const highCount = readings.filter((r) => getBpCategory(r) === 'high').length;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Average</Text>
      <Text style={styles.big}>
        {avgSystolic}/{avgDiastolic}
      </Text>
      <Text style={styles.sub}>
        Pulse {avgPulse} · {readings.length} readings · {highCount} high
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { margin: 16, padding: 16, borderRadius: 12, backgroundColor: '#fff5f5' },
  title: { fontSize: 13, color: '#888', textTransform: 'uppercase' },
  big: { fontSize: 34, fontWeight: '700', color: '#222', marginVertical: 4 },
  sub: { fontSize: 13, color: '#666' },
});
