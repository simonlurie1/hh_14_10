import { BpCategory, Reading } from '../types';

/**
 * Blood pressure categories (simplified from the AHA guidelines):
 *  - Normal:   systolic < 120 AND diastolic < 80
 *  - Elevated: systolic 120–129 AND diastolic < 80
 *  - High:     systolic >= 130 OR diastolic >= 80
 */
export function getBpCategory(reading: Pick<Reading, 'systolic' | 'diastolic'>): BpCategory {
  const { systolic, diastolic } = reading;
  if (systolic >= 130 && diastolic >= 80) return 'high';
  if (systolic >= 120 && diastolic < 80) return 'elevated';
  return 'normal';
}

export const CATEGORY_COLORS: Record<BpCategory, string> = {
  normal: '#2e9e5b',
  elevated: '#e0a100',
  high: '#d64545',
};

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}
