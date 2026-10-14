/**
 * Fake backend. Treat this file as "the server" — you can read it to understand
 * the API's behavior, but the bugs you are looking for are in the app code.
 *
 * Behavior (like a real network):
 *  - Bigger ranges are slower to load (more data).
 *  - Requests sometimes fail.
 *  - The server returns readings in no particular order.
 */
import { Reading, RangeKey, RANGE_DAYS } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

// Small seeded PRNG so the generated history is the same on every launch.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateHistory(): Reading[] {
  const rand = mulberry32(42);
  const now = Date.now();
  const readings: Reading[] = [];
  // Local "hours of day" users typically measure at. Note the late-night ones.
  const hoursOfDay = [6.5, 8, 12.25, 14, 18.5, 21, 23.5, 0.75];

  for (let day = 0; day < 95; day++) {
    for (const hour of hoursOfDay) {
      if (rand() < 0.25) continue; // users skip some measurements
      const dayStart = new Date(now - day * DAY_MS);
      dayStart.setHours(0, 0, 0, 0);
      const takenAt = new Date(dayStart.getTime() + hour * 60 * 60 * 1000);
      if (takenAt.getTime() > now) continue;

      const systolic = Math.round(110 + rand() * 50);
      const diastolic = Math.round(65 + rand() * 30);
      readings.push({
        id: `srv-${day}-${hour}`,
        deviceReadingId: `dev-${day}-${hour}`,
        systolic,
        diastolic,
        pulse: Math.round(58 + rand() * 35),
        takenAt: takenAt.toISOString(),
        source: 'monitor',
      });
    }
  }
  return readings;
}

const db: Reading[] = generateHistory();
let requestCount = 0;

const LATENCY_MS: Record<RangeKey, number> = {
  '7d': 400,
  '30d': 1200,
  '90d': 2600,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const mockServer = {
  async getReadings(range: RangeKey): Promise<Reading[]> {
    requestCount++;
    const thisRequest = requestCount;
    await sleep(LATENCY_MS[range] + Math.random() * 300);

    if (thisRequest % 4 === 0) {
      throw new Error('Network request failed (503)');
    }

    const from = Date.now() - RANGE_DAYS[range] * DAY_MS;
    return shuffled(db.filter((r) => new Date(r.takenAt).getTime() >= from));
  },

  async postReading(input: Omit<Reading, 'id'>): Promise<Reading> {
    await sleep(800);
    const saved: Reading = { ...input, id: `srv-${Date.now()}-${Math.floor(Math.random() * 1e6)}` };
    db.push(saved);
    return saved;
  },
};

/** Used by the simulated BP monitor: the device still has the newest readings in its memory. */
export function latestServerReadings(count: number): Reading[] {
  return [...db]
    .filter((r) => r.source === 'monitor')
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
    .slice(0, count);
}
