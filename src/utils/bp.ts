import { BpCategory, Reading } from '../types';

/**
 * Blood pressure categories (simplified from the AHA guidelines):
 *  - Normal:   systolic < 120 AND diastolic < 80
 *  - Elevated: systolic 120–129 AND diastolic < 80
 *  - High:     systolic >= 130 OR diastolic >= 80
 */
export function getBpCategory(reading: Pick<Reading, 'systolic' | 'diastolic'>): BpCategory {
  const { systolic, diastolic } = reading;
  if (systolic >= 130 || diastolic >= 80) return 'high';
  if (systolic >= 120) return 'elevated';
  return 'normal';
}

export const CATEGORY_COLORS: Record<BpCategory, string> = {
  normal: '#2e9e5b',
  elevated: '#e0a100',
  high: '#c0392b',
};

export const CATEGORY_LABELS: Record<BpCategory, string> = {
  normal: 'Normal',
  elevated: 'Elevated',
  high: 'High',
};

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export interface ReadingInput {
  systolic: number;
  diastolic: number;
  pulse: number;
}

/** Plausible ranges for a home BP cuff. Returns a user-facing error, or null if the input is valid. */
export function validateReadingInput({ systolic, diastolic, pulse }: ReadingInput): string | null {
  const whole = (n: number) => Number.isInteger(n);
  if (!whole(systolic) || !whole(diastolic) || !whole(pulse)) return 'Please fill in SYS, DIA and pulse as whole numbers.';
  if (systolic < 60 || systolic > 260) return 'Systolic (top number) should be between 60 and 260.';
  if (diastolic < 30 || diastolic > 160) return 'Diastolic (bottom number) should be between 30 and 160.';
  if (systolic <= diastolic) return 'Systolic (top number) must be higher than diastolic.';
  if (pulse < 30 || pulse > 220) return 'Pulse should be between 30 and 220.';
  return null;
}

/** Guards against malformed records coming from the server. */
export function isValidReading(value: unknown): value is Reading {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  const num = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  return (
    typeof r.id === 'string' &&
    typeof r.takenAt === 'string' &&
    !isNaN(Date.parse(r.takenAt)) &&
    num(r.systolic) &&
    num(r.diastolic) &&
    num(r.pulse)
  );
}
