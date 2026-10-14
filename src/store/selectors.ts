import type { RootState } from './index';
import { Reading } from '../types';

export interface DayGroup {
  day: string; // "YYYY-MM-DD"
  readings: Reading[];
}

export const selectRange = (state: RootState) => state.readings.range;
export const selectStatus = (state: RootState) => state.readings.status;
export const selectError = (state: RootState) => state.readings.error;
export const selectSyncing = (state: RootState) => state.readings.syncing;
export const selectLastSyncedAt = (state: RootState) => state.readings.lastSyncedAt;

/** Newest first, grouped by day. */
export const selectReadingsByDay = (state: RootState): DayGroup[] => {
  const sorted = state.readings.items
    .slice()
    .sort((a, b) => new Date(b.takenAt).getDate() - new Date(a.takenAt).getDate());

  const groups: Record<string, Reading[]> = {};
  for (const reading of sorted) {
    const day = reading.takenAt.slice(0, 10);
    if (!groups[day]) groups[day] = [];
    groups[day].push(reading);
  }

  return Object.keys(groups).map((day) => ({ day, readings: groups[day] }));
};

export const selectAllReadings = (state: RootState) => state.readings.items;
