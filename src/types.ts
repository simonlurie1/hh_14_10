export type ReadingSource = 'monitor' | 'manual';

export interface Reading {
  id: string;
  /** ID assigned by the BP monitor (only for readings that came from the device) */
  deviceReadingId?: string;
  systolic: number;
  diastolic: number;
  pulse: number;
  /** ISO-8601 timestamp in UTC, e.g. "2026-10-14T21:40:00.000Z" */
  takenAt: string;
  source: ReadingSource;
}

export type RangeKey = '7d' | '30d' | '90d';

export const RANGE_DAYS: Record<RangeKey, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export type BpCategory = 'normal' | 'elevated' | 'high';
