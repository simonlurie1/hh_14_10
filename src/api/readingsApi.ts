import { mockServer } from './mockServer';
import { Reading, RangeKey } from '../types';
import { isValidReading } from '../utils/bp';

const DEFAULT_TIMEOUT_MS = 15_000;

/** Dev-only request log. Never logs reading values: they are health data. */
function log(message: string) {
  const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
  if (dev !== false) console.log(`[api] ${message}`);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export const readingsApi = {
  /** Request timeout; overridable in tests. */
  timeoutMs: DEFAULT_TIMEOUT_MS as number | undefined,

  async fetchReadings(range: RangeKey): Promise<Reading[]> {
    const started = Date.now();
    log(`GET /readings?range=${range}`);
    const data: unknown = await withTimeout(
      mockServer.getReadings(range),
      readingsApi.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      'Loading readings timed out. Check your connection.'
    );
    if (!Array.isArray(data)) {
      throw new Error('Unexpected response from the server.');
    }
    const readings = data.filter(isValidReading);
    const skipped = data.length - readings.length;
    log(`GET /readings?range=${range} -> ${readings.length} readings${skipped ? `, ${skipped} malformed skipped` : ''} (${Date.now() - started}ms)`);
    return readings;
  },

  async addReading(input: Omit<Reading, 'id'>): Promise<Reading> {
    log(`POST /readings (${input.source})`);
    const saved: unknown = await withTimeout(
      mockServer.postReading(input),
      readingsApi.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      'Saving timed out. Check your connection.'
    );
    if (!isValidReading(saved)) throw new Error('Unexpected response from the server.');
    return saved;
  },
};
