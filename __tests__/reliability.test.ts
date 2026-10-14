/** P1 — reliability: errors, loading state, races, server lost. */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeServer, makeStore, rs, FakeServer, sleep } from './helpers';
import { fetchReadings, syncFromMonitor, addReading } from '../src/store/readingsSlice';
import { readingsApi } from '../src/api/readingsApi';
import { bpMonitor } from '../src/device/bpMonitor';

let fs: FakeServer;
beforeEach(() => {
  fs = installFakeServer();
});
afterEach(() => fs.restore());

test('#10 a failed load stops loading and exposes an error (no endless spinner)', async () => {
  const store = makeStore();
  fs.failGets = 1;
  await store.dispatch(fetchReadings('7d'));
  assert.notEqual(rs(store).status, 'loading', 'stuck on "Loading readings…"');
  assert.equal(rs(store).status, 'failed');
  assert.match(String(rs(store).error), /503|failed/i);
});

test('#10b a failed refresh keeps the readings already on screen and recovers on retry', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  const count = rs(store).items.length;
  fs.failGets = 1;
  await store.dispatch(fetchReadings('7d'));
  assert.equal(rs(store).items.length, count, 'readings were lost on a failed refresh');
  assert.ok(rs(store).error, 'error not reported');
  await store.dispatch(fetchReadings('7d'));
  assert.equal(rs(store).status, 'succeeded');
  assert.equal(rs(store).error, null, 'error not cleared after a successful retry');
});

test('#11 auto-refresh can be stopped (no leaked intervals)', async () => {
  let polling: any;
  try {
    polling = require('../src/utils/polling');
  } catch {
    assert.fail('no stoppable polling helper (src/utils/polling) — ReadingsScreen leaks setInterval');
  }
  let calls = 0;
  const stop = polling.startPolling(() => calls++, 15);
  await sleep(50);
  assert.ok(calls >= 2, `expected the poll to run, ran ${calls}x`);
  stop();
  const atStop = calls;
  await sleep(50);
  assert.equal(calls, atStop, 'polling kept running after stop()');
});

test('#12 a background refresh does not flash the full-screen loader', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  const p = store.dispatch(fetchReadings('7d'));
  assert.notEqual(rs(store).status, 'loading', 'list replaced by "Loading…" during a background refresh');
  await p;
});

test('#13 a failed save is reported (rejected) and nothing is added', async () => {
  const store = makeStore();
  fs.failPosts = 1;
  const res: any = await store.dispatch(addReading({ systolic: 120, diastolic: 80, pulse: 70 }));
  assert.equal(res.type, addReading.rejected.type);
  assert.equal(rs(store).items.length, 0);
  assert.equal(rs(store).saving, false, 'Save button stays disabled after a failure');
});

test('#14 tapping Sync repeatedly while syncing starts only one sync', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  const orig = bpMonitor.sync;
  let calls = 0;
  bpMonitor.sync = async () => {
    calls++;
    return orig();
  };
  try {
    await Promise.all([store.dispatch(syncFromMonitor()), store.dispatch(syncFromMonitor()), store.dispatch(syncFromMonitor())]);
  } finally {
    bpMonitor.sync = orig;
  }
  assert.equal(calls, 1, `${calls} syncs ran at the same time`);
});

test('#14b a failed sync is reported to the user', async () => {
  const store = makeStore();
  const orig = bpMonitor.sync;
  bpMonitor.sync = async () => {
    throw new Error('Bluetooth connection lost');
  };
  try {
    await store.dispatch(syncFromMonitor());
  } finally {
    bpMonitor.sync = orig;
  }
  assert.equal(rs(store).syncing, false);
  assert.match(String(rs(store).syncError), /bluetooth/i, 'sync error is swallowed');
});

test('#15 server lost (no answer): the request times out instead of loading forever', async () => {
  const store = makeStore();
  fs.hang = true;
  (readingsApi as any).timeoutMs = 30;
  try {
    store.dispatch(fetchReadings('7d'));
    await sleep(120);
  } finally {
    delete (readingsApi as any).timeoutMs;
  }
  assert.equal(rs(store).status, 'failed', 'still loading with no timeout');
  assert.match(String(rs(store).error), /time/i);
});

test('#16 server lost during sync: readings stay on the cuff list and upload on the next sync', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  bpMonitor.takeMeasurement();
  fs.failPosts = 100;
  await store.dispatch(syncFromMonitor());
  fs.failPosts = 0;
  await store.dispatch(syncFromMonitor());
  await store.dispatch(fetchReadings('7d'));
  const cuffOnServer = fs.db.filter((r) => String(r.deviceReadingId).startsWith('cuff-'));
  assert.ok(cuffOnServer.length >= 1, 'reading taken while offline never reached the server');
  const ids = rs(store).items.map((r: any) => r.deviceReadingId).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, 'duplicates after offline -> online sync');
});
