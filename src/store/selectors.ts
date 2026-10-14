import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './index';
import { Reading } from '../types';
import { localDayKey } from '../utils/dates';

export interface DayGroup {
  day: string; // "YYYY-MM-DD" in the user's local time zone
  readings: Reading[];
}

export const selectRange = (state: RootState) => state.readings.range;
export const selectLoadedRange = (state: RootState) => state.readings.loadedRange;
export const selectStatus = (state: RootState) => state.readings.status;
export const selectRefreshing = (state: RootState) => state.readings.refreshing;
export const selectError = (state: RootState) => state.readings.error;
export const selectSyncing = (state: RootState) => state.readings.syncing;
export const selectSyncError = (state: RootState) => state.readings.syncError;
export const selectLastSyncedAt = (state: RootState) => state.readings.lastSyncedAt;
export const selectSaving = (state: RootState) => state.readings.saving;
export const selectAllReadings = (state: RootState) => state.readings.items;

/** Newest first, grouped by LOCAL day. Memoized: same items -> same array (no needless re-renders). */
export const selectReadingsByDay = createSelector([selectAllReadings], (items): DayGroup[] => {
  const sorted = items
    .map((reading) => ({ reading, time: Date.parse(reading.takenAt) }))
    .filter((x) => !isNaN(x.time))
    .sort((a, b) => b.time - a.time);

  const groups = new Map<string, Reading[]>();
  for (const { reading } of sorted) {
    const day = localDayKey(reading.takenAt)!;
    const group = groups.get(day);
    if (group) group.push(reading);
    else groups.set(day, [reading]);
  }
  return Array.from(groups, ([day, readings]) => ({ day, readings }));
});
