/**
 * Chaos run against the REAL mock server (real latency 0.4–2.9s, every 4th GET fails with 503,
 * random order). Random, overlapping user actions; afterwards the app must be consistent.
 * Seeded, so a failure can be replayed with the same seed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStore, rs, sleep, DAY_MS } from './helpers';
import { fetchReadings, syncFromMonitor, addReading, setRange } from '../src/store/readingsSlice';
import { selectReadingsByDay } from '../src/store/selectors';
import { latestServerReadings } from '../src/api/mockServer';
import { bpMonitor } from '../src/device/bpMonitor';
import { RangeKey, RANGE_DAYS } from '../src/types';

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

// Extra seeds: CHAOS_SEEDS=1,2,3 npm test
const SEEDS = (process.env.CHAOS_SEEDS ?? "7,2026").split(",").map(Number);

for (const seed of SEEDS) {
  test(`chaos seed=${seed}: 40 random overlapping actions leave the app consistent`, { timeout: 120_000 }, async () => {
    const rand = rng(seed);
    const store = makeStore();
    const inFlight: Promise<unknown>[] = [];
    const savedIds: string[] = [];
    const ranges: RangeKey[] = ['7d', '30d', '90d'];
    const log: string[] = [];

    for (let step = 0; step < 40; step++) {
      const x = rand();
      if (x < 0.3) {
        const r = ranges[Math.floor(rand() * 3)];
        log.push(`tab ${r}`);
        store.dispatch(setRange(r));
        inFlight.push(store.dispatch(fetchReadings(r)));
      } else if (x < 0.45) {
        log.push('poll');
        inFlight.push(store.dispatch(fetchReadings(rs(store).range)));
      } else if (x < 0.6) {
        log.push('measure');
        bpMonitor.takeMeasurement();
      } else if (x < 0.8) {
        log.push('sync');
        inFlight.push(store.dispatch(syncFromMonitor()));
      } else {
        const valid = rand() < 0.7;
        const input = valid
          ? { systolic: 110 + Math.floor(rand() * 50), diastolic: 65 + Math.floor(rand() * 25), pulse: 60 + Math.floor(rand() * 30) }
          : { systolic: NaN, diastolic: 80, pulse: 70 };
        log.push(valid ? 'save' : 'save(invalid)');
        inFlight.push(
          store.dispatch(addReading(input)).then((a: any) => {
            if (a.type === addReading.fulfilled.type) savedIds.push(a.payload.id);
          })
        );
      }
      await sleep(Math.floor(rand() * 250));
    }
    await Promise.all(inFlight);

    // Final state of the current tab: retry like the user would (the server fails every 4th request).
    for (let i = 0; i < 4 && rs(store).loadedRange !== rs(store).range; i++) {
      await store.dispatch(fetchReadings(rs(store).range));
    }
    // One last sync + refresh so everything measured is uploaded and visible.
    await store.dispatch(syncFromMonitor());
    for (let i = 0; i < 4; i++) {
      const a: any = await store.dispatch(fetchReadings(rs(store).range));
      if (a.type === fetchReadings.fulfilled.type) break;
    }

    const s = rs(store);
    const ctx = `seed ${seed}: ${log.join(', ')}`;
    assert.equal(s.syncing, false, ctx);
    assert.equal(s.saving, false, ctx);
    assert.equal(s.refreshing, false, ctx);
    assert.equal(s.status, 'succeeded', ctx);
    assert.equal(s.loadedRange, s.range, ctx);

    const ids = s.items.map((r: any) => r.id);
    const devIds = s.items.map((r: any) => r.deviceReadingId).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, 'duplicate ids on screen — ' + ctx);
    assert.equal(new Set(devIds).size, devIds.length, 'duplicate device readings on screen — ' + ctx);

    const from = Date.now() - RANGE_DAYS[s.range as RangeKey] * DAY_MS - 60_000;
    assert.ok(s.items.every((r: any) => Date.parse(r.takenAt) >= from), `readings outside the ${s.range} tab — ${ctx}`);

    for (const id of savedIds) assert.ok(ids.includes(id), `saved reading ${id} missing — ${ctx}`);

    const serverDev = latestServerReadings(1e6).map((r) => r.deviceReadingId);
    assert.equal(new Set(serverDev).size, serverDev.length, 'duplicate device readings on the SERVER — ' + ctx);

    const flat = selectReadingsByDay(store.getState() as any).flatMap((g) => g.readings.map((r) => Date.parse(r.takenAt)));
    assert.ok(flat.every((t, i) => i === 0 || t <= flat[i - 1]), 'list out of order — ' + ctx);
  });
}
