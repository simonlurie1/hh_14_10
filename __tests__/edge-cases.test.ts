/**
 * Edge cases that try to break the fixed flows.
 * Tests marked `todo` document a known break that is NOT fixed yet (they run, but don't fail the suite).
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeServer, makeStore, rs, FakeServer, sleep, DAY_MS } from './helpers';
import { fetchReadings, syncFromMonitor, addReading, setRange } from '../src/store/readingsSlice';
import { selectReadingsByDay } from '../src/store/selectors';
import { readingsApi } from '../src/api/readingsApi';
import { bpMonitor } from '../src/device/bpMonitor';
import { localDayKey } from '../src/utils/dates';
import { validateReadingInput } from '../src/utils/bp';
import { RangeKey } from '../src/types';

let fs: FakeServer;
beforeEach(() => {
  fs = installFakeServer();
});
afterEach(() => {
  fs.restore();
  delete (readingsApi as any).timeoutMs;
});

const dupes = (ids: unknown[]) => ids.filter((id, i) => id && ids.indexOf(id) !== i);
const within = (store: any, range: RangeKey) => {
  const days = { '7d': 7, '30d': 30, '90d': 90 }[range];
  const oldest = Math.min(...rs(store).items.map((r: any) => Date.parse(r.takenAt)));
  return Date.now() - oldest <= days * DAY_MS + 60_000;
};
/** Replace what the cuff "sends" for one sync. */
async function syncWith(store: any, deviceReadings: any[]) {
  const orig = bpMonitor.sync;
  bpMonitor.sync = async () => deviceReadings.map((r) => ({ ...r }));
  try {
    return await store.dispatch(syncFromMonitor());
  } finally {
    bpMonitor.sync = orig;
  }
}
const cuffReading = (id: string, minutesAgo = 1, bp = { systolic: 128, diastolic: 82, pulse: 70 }) => ({
  deviceReadingId: id,
  ...bp,
  takenAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
});

// ───────────────────────── Fetch / range tabs ─────────────────────────

test('E1 hammering the tabs (7d,30d,90d,7d,30d) ends on 30d data and not loading', async () => {
  const store = makeStore();
  const ps: Promise<unknown>[] = [];
  for (const r of ['7d', '30d', '90d', '7d', '30d'] as RangeKey[]) {
    store.dispatch(setRange(r));
    ps.push(store.dispatch(fetchReadings(r)));
    await sleep(1);
  }
  await Promise.all(ps);
  assert.equal(rs(store).range, '30d');
  assert.equal(rs(store).loadedRange, '30d');
  assert.equal(rs(store).status, 'succeeded');
  assert.ok(within(store, '30d'));
  assert.ok(rs(store).items.length > 0);
});

test('E2 7d -> 90d -> back to 7d before 90d arrives: 7d stays visible, late 90d is ignored', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  store.dispatch(setRange('90d'));
  const slow = store.dispatch(fetchReadings('90d'));
  store.dispatch(setRange('7d')); // the screen's effect dispatches the 7d fetch right away
  const back = store.dispatch(fetchReadings('7d'));
  assert.notEqual(rs(store).status, 'loading', 'loader shown although 7d data is still valid');
  await Promise.all([slow, back]);
  assert.equal(rs(store).loadedRange, '7d');
  assert.ok(within(store, '7d'));
});

test('E3 a new range that fails to load shows an error, not the previous tab’s data', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  store.dispatch(setRange('90d'));
  fs.failGets = 1;
  await store.dispatch(fetchReadings('90d'));
  assert.equal(rs(store).status, 'failed');
  assert.notEqual(rs(store).loadedRange, rs(store).range, 'screen would label 7d data as 90d');
  store.dispatch(setRange('7d'));
  await store.dispatch(fetchReadings('7d'));
  assert.equal(rs(store).status, 'succeeded');
  assert.equal(rs(store).error, null);
});

test('E4 a late FAILURE of an old request does not override a newer success', async () => {
  const store = makeStore();
  const { mockServer } = require('../src/api/mockServer');
  const fake = mockServer.getReadings;
  let call = 0;
  mockServer.getReadings = async (range: RangeKey) => {
    if (++call === 1) {
      await sleep(40);
      throw new Error('Network request failed (503)'); // the OLD request fails, late
    }
    return fake(range);
  };
  const old = store.dispatch(fetchReadings('7d'));
  await sleep(2);
  await store.dispatch(fetchReadings('7d'));
  await old;
  assert.equal(rs(store).status, 'succeeded');
  assert.equal(rs(store).error, null);
});

test('E5 an empty account (server returns []) is a success with an empty list', async () => {
  fs.db = [];
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  assert.equal(rs(store).status, 'succeeded');
  assert.deepEqual(selectReadingsByDay(store.getState() as any), []);
});

test('E6 server sends the SAME reading twice (same id): shown once', async () => {
  fs.db.push({ ...fs.db[0] });
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  assert.ok(rs(store).items.some((r: any) => r.id === fs.db[0].id), 'test setup: the duplicated reading must be in the list');
  assert.deepEqual(dupes(rs(store).items.map((r: any) => r.id)), [], 'duplicate React keys in the list');
});

test('E7 server already holds a duplicate device reading (2 ids, same deviceReadingId): shown once', async () => {
  const r = fs.db.find((x) => Date.now() - Date.parse(x.takenAt) < 2 * DAY_MS);
  fs.db.push({ ...r, id: 'srv-dup-of-' + r.id });
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  assert.deepEqual(dupes(rs(store).items.map((x: any) => x.deviceReadingId)), []);
});

test('E8 array with junk entries (null, numbers, strings) keeps only the valid readings', async () => {
  const good = fs.db.filter((x) => Date.now() - Date.parse(x.takenAt) < 7 * DAY_MS);
  fs.respondWith = [null, 42, 'x', {}, ...good];
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  assert.equal(rs(store).status, 'succeeded');
  assert.equal(rs(store).items.length, good.length);
});

test('E9 20,000 readings: grouping stays fast (< 300ms)', async () => {
  const base = Date.now();
  fs.respondWith = Array.from({ length: 20_000 }, (_, i) => ({
    id: 'big-' + i,
    systolic: 120,
    diastolic: 80,
    pulse: 70,
    takenAt: new Date(base - i * 6 * 60_000).toISOString(),
    source: 'monitor',
  }));
  const store = makeStore();
  store.dispatch(setRange('90d'));
  await store.dispatch(fetchReadings('90d'));
  assert.equal(rs(store).items.length, 20_000);
  const t = performance.now();
  const groups = selectReadingsByDay(store.getState() as any);
  const ms = performance.now() - t;
  assert.ok(groups.length > 0);
  assert.ok(ms < 300, `took ${ms.toFixed(0)}ms`);
});

// ───────────────────────── Dates / time zones ─────────────────────────

test('E10 DST end in Israel (Oct 25 2026): 00:30 and 22:30 local are the same day', () => {
  assert.equal(localDayKey('2026-10-24T21:30:00.000Z'), '2026-10-25'); // 00:30 IDT (+3)
  assert.equal(localDayKey('2026-10-25T20:30:00.000Z'), '2026-10-25'); // 22:30 IST (+2)
  assert.equal(localDayKey('2026-10-25T22:30:00.000Z'), '2026-10-26'); // 00:30 next day
});

test('E11 the user travels (time zone changes while the app is open): days regroup on the next refresh', async () => {
  const store = makeStore();
  fs.db = [{ id: 'tz', systolic: 120, diastolic: 75, pulse: 70, takenAt: new Date(Date.now() - DAY_MS).toISOString().slice(0, 11) + '22:30:00.000Z', source: 'manual' }];
  await store.dispatch(fetchReadings('7d'));
  const inIsrael = selectReadingsByDay(store.getState() as any)[0].day;
  process.env.TZ = 'America/New_York';
  try {
    // Grouping is memoized on the list, so it updates with the next refresh (the 20s poll), not instantly.
    await store.dispatch(fetchReadings('7d'));
    const inNY = selectReadingsByDay(store.getState() as any)[0].day;
    assert.notEqual(inNY, inIsrael, 'still grouped by the old time zone');
  } finally {
    process.env.TZ = 'Asia/Jerusalem';
  }
});

// ───────────────────────── Sync ─────────────────────────

test('E12 the cuff sends the same reading twice in one batch: uploaded once', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  const r = cuffReading('cuff-batch-dup');
  await syncWith(store, [r, r]);
  assert.equal(fs.posts.filter((p) => p.deviceReadingId === 'cuff-batch-dup').length, 1);
});

test('E13 one of three uploads fails: the other two are saved, the failed one uploads next sync', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  const batch = [cuffReading('cuff-p1', 3), cuffReading('cuff-p2', 2), cuffReading('cuff-p3', 1)];
  fs.failPosts = 1; // first POST fails
  await syncWith(store, batch);
  assert.match(String(rs(store).syncError), /1 reading/);
  assert.equal(fs.db.filter((x) => String(x.deviceReadingId).startsWith('cuff-p')).length, 2);
  await syncWith(store, batch);
  assert.equal(rs(store).syncError, null);
  const onServer = fs.db.filter((x) => String(x.deviceReadingId).startsWith('cuff-p')).map((x) => x.deviceReadingId);
  assert.deepEqual(onServer.sort(), ['cuff-p1', 'cuff-p2', 'cuff-p3']);
});

test('E14 the cuff still holds a reading OLDER than the loaded 7 days: it is not uploaded again', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  const old = fs.db.find((x) => Date.now() - Date.parse(x.takenAt) > 9 * DAY_MS && x.deviceReadingId);
  const { id, source, ...fromCuff } = old;
  await syncWith(store, [fromCuff]);
  assert.equal(fs.posts.length, 0, `re-uploaded ${old.deviceReadingId} -> duplicate on the server`);
});

test('E15 upload times out but the server DID save it: the next sync must not create a duplicate', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  (readingsApi as any).timeoutMs = 20;
  fs.postDelay = 60; // server is slow: client gives up, server still saves
  const r = cuffReading('cuff-slow');
  await syncWith(store, [r]);
  await sleep(80);
  fs.postDelay = 1;
  await syncWith(store, [r]);
  assert.equal(fs.db.filter((x) => x.deviceReadingId === 'cuff-slow').length, 1, 'duplicate on the server');
});

test('E16 sync while the server is down before the first load: clear error, then recovers', async () => {
  const store = makeStore();
  fs.failGets = 1;
  await syncWith(store, [cuffReading('cuff-offline')]);
  assert.equal(rs(store).syncing, false);
  assert.ok(rs(store).syncError, 'no error shown');
  await syncWith(store, [cuffReading('cuff-offline')]);
  assert.equal(fs.db.filter((x) => x.deviceReadingId === 'cuff-offline').length, 1);
});

test('E17 the cuff reports an impossible value (0/0): it is not uploaded as a real reading', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  await syncWith(store, [cuffReading('cuff-err', 1, { systolic: 0, diastolic: 0, pulse: 0 }), cuffReading('cuff-ok', 2)]);
  assert.equal(fs.posts.filter((p) => p.deviceReadingId === 'cuff-err').length, 0, 'a 0/0 cuff error was saved as a reading');
  assert.equal(fs.posts.filter((p) => p.deviceReadingId === 'cuff-ok').length, 1, 'the valid reading in the same sync must still upload');
  assert.match(String(rs(store).syncError), /failed measurement/, 'the user is not told');
});

test('E18 the cuff returns junk instead of a list: sync fails cleanly, no crash', async () => {
  const store = makeStore();
  const orig = bpMonitor.sync;
  (bpMonitor as any).sync = async () => null;
  try {
    await store.dispatch(syncFromMonitor());
  } finally {
    bpMonitor.sync = orig;
  }
  assert.equal(rs(store).syncing, false);
  assert.ok(rs(store).syncError);
});

test('E19 a sync that finishes while a refresh is in flight is not wiped by that refresh', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  fs.delay['7d'] = 50;
  const refresh = store.dispatch(fetchReadings('7d'));
  await sleep(2);
  await syncWith(store, [cuffReading('cuff-during-refresh')]);
  await refresh;
  assert.ok(rs(store).items.some((x: any) => x.deviceReadingId === 'cuff-during-refresh'));
});

// ───────────────────────── Manual save ─────────────────────────

test('E20 validation boundaries', () => {
  const ok = (s: number, d: number, p: number) => validateReadingInput({ systolic: s, diastolic: d, pulse: p }) === null;
  assert.ok(ok(60, 30, 30), 'lowest valid');
  assert.ok(ok(260, 160, 220), 'highest valid');
  assert.ok(!ok(261, 80, 70));
  assert.ok(!ok(59, 40, 70));
  assert.ok(!ok(120, 120, 70), 'SYS == DIA');
  assert.ok(!ok(120.5, 80, 70), 'decimal');
  assert.ok(!ok(Infinity, 80, 70));
  assert.ok(!ok(120, 80, 221));
});

test('E21 save fails (server down), then a retry succeeds and adds exactly one reading', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  const before = rs(store).items.length;
  fs.failPosts = 1;
  const r1: any = await store.dispatch(addReading({ systolic: 131, diastolic: 81, pulse: 71 }));
  assert.equal(r1.type, addReading.rejected.type);
  assert.equal(rs(store).saving, false);
  assert.ok(rs(store).saveError);
  const r2: any = await store.dispatch(addReading({ systolic: 131, diastolic: 81, pulse: 71 }));
  assert.equal(r2.type, addReading.fulfilled.type);
  assert.equal(rs(store).items.length, before + 1);
  assert.equal(rs(store).saveError, null);
});

test('E22 two saves one after another (not a double tap) are both accepted', async () => {
  const store = makeStore();
  await store.dispatch(addReading({ systolic: 121, diastolic: 79, pulse: 70 }));
  await store.dispatch(addReading({ systolic: 122, diastolic: 78, pulse: 70 }));
  assert.equal(fs.posts.length, 2);
});

test('E23 save times out but the server DID save it: retrying must not create a duplicate', { todo: 'KNOWN BREAK: needs a server idempotency key' }, async () => {
  const store = makeStore();
  (readingsApi as any).timeoutMs = 20;
  fs.postDelay = 60;
  await store.dispatch(addReading({ systolic: 140, diastolic: 90, pulse: 75 }));
  await sleep(80);
  fs.postDelay = 1;
  await store.dispatch(addReading({ systolic: 140, diastolic: 90, pulse: 75 }));
  assert.equal(fs.db.filter((x) => x.source === 'manual' && x.systolic === 140).length, 1, 'duplicate on the server');
});

test('E24 a reading saved while its tab is still loading is shown once loading finishes', async () => {
  const store = makeStore();
  fs.delay['90d'] = 40;
  store.dispatch(setRange('90d'));
  const load = store.dispatch(fetchReadings('90d'));
  await sleep(2);
  await store.dispatch(addReading({ systolic: 135, diastolic: 85, pulse: 72 }));
  await load;
  assert.equal(rs(store).loadedRange, '90d');
  assert.ok(rs(store).items.some((x: any) => x.systolic === 135 && x.source === 'manual'));
});
