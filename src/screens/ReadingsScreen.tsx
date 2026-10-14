import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useAppDispatch, useAppSelector } from '../store';
import { fetchReadings, setRange, syncFromMonitor } from '../store/readingsSlice';
import {
  selectAllReadings,
  selectLastSyncedAt,
  selectRange,
  selectReadingsByDay,
  selectStatus,
  selectSyncing,
} from '../store/selectors';
import { bpMonitor } from '../device/bpMonitor';
import { ReadingRow } from '../components/ReadingRow';
import { RangeTabs } from '../components/RangeTabs';
import { SummaryCard } from '../components/SummaryCard';
import { AddReadingForm } from '../components/AddReadingForm';
import { formatDayLabel, formatTime } from '../utils/dates';

const REFRESH_INTERVAL_MS = 20_000;

export function ReadingsScreen() {
  const dispatch = useAppDispatch();
  const range = useAppSelector(selectRange);
  const status = useAppSelector(selectStatus);
  const syncing = useAppSelector(selectSyncing);
  const lastSyncedAt = useAppSelector(selectLastSyncedAt);
  const allReadings = useAppSelector(selectAllReadings);
  const groups = useAppSelector(selectReadingsByDay);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchReadings(range));

    // keep the list fresh while the screen is open
    setInterval(() => {
      dispatch(fetchReadings(range));
    }, REFRESH_INTERVAL_MS);
  }, [range]);

  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.header}>My readings</Text>

      <RangeTabs value={range} onChange={(r) => dispatch(setRange(r))} />

      <SummaryCard readings={allReadings} />

      <View style={styles.monitorRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => bpMonitor.takeMeasurement()}>
          <Text style={styles.secondaryText}>🩺 Measure on cuff</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => dispatch(syncFromMonitor())}>
          <Text style={styles.secondaryText}>{syncing ? 'Syncing…' : '🔄 Sync monitor'}</Text>
        </TouchableOpacity>
      </View>
      {lastSyncedAt && <Text style={styles.syncNote}>Last synced at {formatTime(lastSyncedAt)}</Text>}

      <AddReadingForm />

      {status === 'loading' && (
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading readings…</Text>
        </View>
      )}

      {status !== 'loading' && groups.length === 0 && (
        <Text style={styles.empty}>No readings yet. Take your first measurement!</Text>
      )}

      {groups.map((group, index) => (
        <View key={index}>
          <Text style={styles.dayHeader}>{formatDayLabel(group.day)}</Text>
          {group.readings.map((reading, i) => (
            <ReadingRow
              key={i}
              reading={reading}
              isSelected={reading.id === selectedId}
              onPress={(id) => setSelectedId(id)}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  header: { fontSize: 28, fontWeight: '700', marginHorizontal: 16, marginTop: 8 },
  monitorRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16 },
  secondaryButton: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  secondaryText: { fontWeight: '600', color: '#333' },
  syncNote: { fontSize: 12, color: '#888', marginHorizontal: 16, marginTop: 4 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  loadingText: { color: '#666' },
  empty: { textAlign: 'center', color: '#888', padding: 32 },
  dayHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    backgroundColor: '#fafafa',
    paddingHorizontal: 16,
    paddingVertical: 6,
    textTransform: 'uppercase',
  },
});
