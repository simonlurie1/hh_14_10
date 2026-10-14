import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Reading } from '../types';
import { average, getBpCategory } from '../utils/bp';

interface Props {
  readings: Reading[];
}

export function SummaryCard({ readings }: Props) {
  const summary = useMemo(
    () => ({
      systolic: average(readings.map((r) => r.systolic)),
      diastolic: average(readings.map((r) => r.diastolic)),
      pulse: average(readings.map((r) => r.pulse)),
      high: readings.filter((r) => getBpCategory(r) === 'high').length,
    }),
    [readings]
  );
  const empty = readings.length === 0;

  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={
        empty
          ? 'Average: no readings in this range'
          : `Average ${summary.systolic} over ${summary.diastolic}, pulse ${summary.pulse}. ${readings.length} readings, ${summary.high} high.`
      }
    >
      <Text style={styles.title}>Average</Text>
      <Text style={styles.big}>{empty ? '–/–' : `${summary.systolic}/${summary.diastolic}`}</Text>
      <Text style={styles.sub}>
        {empty ? 'No readings in this range' : `Pulse ${summary.pulse} · ${readings.length} readings · ${summary.high} high`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { margin: 16, padding: 16, borderRadius: 12, backgroundColor: '#fff5f5' },
  title: { fontSize: 13, color: '#595959', textTransform: 'uppercase' },
  big: { fontSize: 34, fontWeight: '700', color: '#222', marginVertical: 4 },
  sub: { fontSize: 13, color: '#555' },
});
