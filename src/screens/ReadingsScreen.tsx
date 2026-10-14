import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, SectionList, TouchableOpacity, ActivityIndicator, StyleSheet, AppState } from 'react-native';
import { useAppDispatch, useAppSelector } from '../store';
import { fetchReadings, setRange, syncFromMonitor } from '../store/readingsSlice';
import {
  selectAllReadings,
  selectError,
  selectLastSyncedAt,
  selectLoadedRange,
  selectRange,
  selectReadingsByDay,
  selectStatus,
  selectSyncError,
  selectSyncing,
} from '../store/selectors';
import { bpMonitor } from '../device/bpMonitor';
import { ReadingRow } from '../components/ReadingRow';
import { RangeTabs } from '../components/RangeTabs';
import { SummaryCard } from '../components/SummaryCard';
import { AddReadingForm } from '../components/AddReadingForm';
import { formatDayLabel, formatTime } from '../utils/dates';
import { startPolling } from '../utils/polling';
import { Reading } from '../types';

const REFRESH_INTERVAL_MS = 20_000;
const NO_READINGS: Reading[] = [];

export function ReadingsScreen() {
  const dispatch = useAppDispatch();
  const range = useAppSelector(selectRange);
  const loadedRange = useAppSelector(selectLoadedRange);
  const status = useAppSelector(selectStatus);
  const error = useAppSelector(selectError);
  const syncing = useAppSelector(selectSyncing);
  const syncError = useAppSelector(selectSyncError);
  const lastSyncedAt = useAppSelector(selectLastSyncedAt);
  const allReadings = useAppSelector(selectAllReadings);
  const groups = useAppSelector(selectReadingsByDay);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Only show data that belongs to the selected tab.
  const showData = loadedRange === range;
  const readings = showData ? allReadings : NO_READINGS;
  const sections = useMemo(
    () => (showData ? groups.map((g) => ({ key: g.day, title: formatDayLabel(g.day), data: g.readings })) : []),
    [groups, showData]
  );

  useEffect(() => {
    dispatch(fetchReadings(range));
    // Keep the list fresh while the screen is open and the app is in the foreground.
    // The cleanup stops this interval when the range changes or the screen unmounts.
    return startPolling(() => {
      if (AppState.currentState === 'active') dispatch(fetchReadings(range));
    }, REFRESH_INTERVAL_MS);
  }, [dispatch, range]);

  const retry = useCallback(() => dispatch(fetchReadings(range)), [dispatch, range]);
  const onSelect = useCallback((id: string) => setSelectedId(id), []);
  const renderItem = useCallback(
    ({ item }: { item: Reading }) => <ReadingRow reading={item} isSelected={item.id === selectedId} onPress={onSelect} />,
    [selectedId, onSelect]
  );

  const header = (
    <>
      <Text style={styles.header} accessibilityRole="header">
        My readings
      </Text>

      <RangeTabs value={range} onChange={(r) => dispatch(setRange(r))} />

      <SummaryCard readings={readings} />

      <View style={styles.monitorRow}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => bpMonitor.takeMeasurement()}
          accessibilityRole="button"
          accessibilityLabel="Measure on cuff"
        >
          <Text style={styles.secondaryText}>🩺 Measure on cuff</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryButton, syncing && styles.disabled]}
          onPress={() => dispatch(syncFromMonitor())}
          disabled={syncing}
          accessibilityRole="button"
          accessibilityLabel={syncing ? 'Syncing monitor' : 'Sync monitor'}
          accessibilityState={{ disabled: syncing, busy: syncing }}
        >
          <Text style={styles.secondaryText}>{syncing ? 'Syncing…' : '🔄 Sync monitor'}</Text>
        </TouchableOpacity>
      </View>
      <View accessibilityLiveRegion="polite">
        {lastSyncedAt && <Text style={styles.syncNote}>Last synced at {formatTime(lastSyncedAt)}</Text>}
        {syncError && (
          <Text style={styles.errorText} accessibilityRole="alert">
            {syncError}
          </Text>
        )}
      </View>

      <AddReadingForm />

      <View accessibilityLiveRegion="polite">
        {status === 'loading' && (
          <View style={styles.loading}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading readings…</Text>
          </View>
        )}
        {status === 'failed' && error && (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Text style={styles.errorText}>
              {showData ? 'Could not refresh. Showing the last loaded readings. ' : 'Could not load readings. '}
              {error}
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={retry} accessibilityRole="button" accessibilityLabel="Try loading again">
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </>
  );

  return (
    <SectionList
      style={styles.screen}
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      extraData={selectedId}
      renderSectionHeader={({ section }) => (
        <Text style={styles.dayHeader} accessibilityRole="header">
          {section.title}
        </Text>
      )}
      ListHeaderComponent={header}
      ListEmptyComponent={
        showData && status !== 'loading' ? <Text style={styles.empty}>No readings yet. Take your first measurement!</Text> : null
      }
      keyboardShouldPersistTaps="handled"
      initialNumToRender={15}
      windowSize={7}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  header: { fontSize: 28, fontWeight: '700', marginHorizontal: 16, marginTop: 8, color: '#222' },
  monitorRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16 },
  secondaryButton: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#bbb', alignItems: 'center' },
  disabled: { opacity: 0.6 },
  secondaryText: { fontWeight: '600', color: '#333' },
  syncNote: { fontSize: 12, color: '#595959', marginHorizontal: 16, marginTop: 4 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  loadingText: { color: '#555' },
  errorBox: { marginHorizontal: 16, marginVertical: 8, padding: 12, borderRadius: 8, backgroundColor: '#fdecea' },
  errorText: { color: '#b00020', marginHorizontal: 16, marginTop: 4 },
  retryButton: { alignSelf: 'flex-start', marginTop: 8, marginLeft: 16, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: '#b00020' },
  retryText: { color: '#b00020', fontWeight: '700' },
  empty: { textAlign: 'center', color: '#595959', padding: 32 },
  dayHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
    backgroundColor: '#f4f4f4',
    paddingHorizontal: 16,
    paddingVertical: 6,
    textTransform: 'uppercase',
  },
});
