/**
 * Test helpers.
 *
 * - Pins the time zone to Israel (UTC+3) so "local day" bugs reproduce on any machine.
 * - Replaces the mock server's methods with a fast, deterministic fake (no random 503s,
 *   controllable latency/failures), seeded with the same history the real mock generates.
 *   The app code under test is NOT changed: it still calls readingsApi -> mockServer.
 */
process.env.TZ = 'Asia/Jerusalem';

import { configureStore } from '@reduxjs/toolkit';
import readingsReducer from '../src/store/readingsSlice';
import { mockServer, latestServerReadings } from '../src/api/mockServer';
import { Reading, RangeKey, RANGE_DAYS } from '../src/types';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function makeStore() {
  return configureStore({
    reducer: { readings: readingsReducer },
    middleware: (g) => g({ serializableCheck: false, immutableCheck: false }),
  });
}
export type TestStore = ReturnType<typeof makeStore>;

/** Loosely typed view of the slice state, so tests compile before and after the fix. */
export const rs = (store: TestStore): any => (store.getState() as any).readings;

export interface FakeServer {
  db: any[];
  gets: RangeKey[];
  posts: Omit<Reading, 'id'>[];
  delay: Record<RangeKey, number>;
  postDelay: number;
  failGets: number;
  failPosts: number;
  hang: boolean;
  respondWith: unknown;
  restore(): void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function installFakeServer(): FakeServer {
  const orig = { get: mockServer.getReadings, post: mockServer.postReading };
  let n = 0;
  const fs: FakeServer = {
    db: latestServerReadings(100000).map((r) => ({ ...r })),
    gets: [],
    posts: [],
    delay: { '7d': 5, '30d': 10, '90d': 40 },
    postDelay: 5,
    failGets: 0,
    failPosts: 0,
    hang: false,
    respondWith: undefined,
    restore() {
      mockServer.getReadings = orig.get;
      mockServer.postReading = orig.post;
    },
  };

  mockServer.getReadings = async (range: RangeKey) => {
    fs.gets.push(range);
    if (fs.hang) return new Promise<Reading[]>(() => {});
    // Like a real server: the DB is read when the request arrives, the response arrives later.
    const from = Date.now() - RANGE_DAYS[range] * DAY_MS;
    const snapshot = fs.db
      .filter((r) => typeof r.takenAt !== 'string' || Date.parse(r.takenAt) >= from || isNaN(Date.parse(r.takenAt)))
      .map((r) => ({ ...r }));
    await sleep(fs.delay[range]);
    if (fs.failGets > 0) {
      fs.failGets--;
      throw new Error('Network request failed (503)');
    }
    if (fs.respondWith !== undefined) return fs.respondWith as Reading[];
    return shuffle(snapshot);
  };

  mockServer.postReading = async (input: Omit<Reading, 'id'>) => {
    fs.posts.push(input);
    await sleep(fs.postDelay);
    if (fs.failPosts > 0) {
      fs.failPosts--;
      throw new Error('Network request failed (503)');
    }
    const saved = { ...input, id: `srv-test-${++n}` } as Reading;
    fs.db.push(saved);
    return { ...saved };
  };

  return fs;
}

/** "YYYY-MM-DD" of a timestamp in the (pinned) local time zone. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Calls fn and fails the test (instead of crashing the run) if it throws. */
export function noThrow<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e: any) {
    throw new Error(`expected no crash, got ${e?.constructor?.name}: ${e?.message}`);
  }
}
