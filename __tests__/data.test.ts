/** P0 — data is wrong, lost or duplicated. */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeServer, makeStore, rs, localDay, DAY_MS, FakeServer, sleep } from './helpers';
import { fetchReadings, syncFromMonitor, addReading, setRange } from '../src/store/readingsSlice';
import { selectReadingsByDay } from '../src/store/selectors';
import { getBpCategory } from '../src/utils/bp';
import { bpMonitor } from '../src/device/bpMonitor';

let fs: FakeServer;
beforeEach(() => {
  fs = installFakeServer();
});
afterEach(() => fs.restore());

const deviceIds = (items: any[]) => items.filter((r) => r.deviceReadingId).map((r) => r.deviceReadingId);
const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);

test('#1 synced cuff readings are saved to the server and survive the next refresh', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  bpMonitor.takeMeasurement();
  await store.dispatch(syncFromMonitor());

  const cuffOnScreen = rs(store).items.filter((r: any) => String(r.deviceReadingId).startsWith('cuff-'));
  assert.ok(cuffOnScreen.length >= 1, 'new cuff reading should appear after sync');

  await store.dispatch(fetchReadings('7d')); // the 20s poll / tab switch
  const after = rs(store).items.map((r: any) => r.deviceReadingId);
  for (const r of cuffOnScreen) {
    assert.ok(after.includes(r.deviceReadingId), `cuff reading ${r.deviceReadingId} disappeared after refresh`);
  }
  assert.ok(fs.posts.some((p) => String(p.deviceReadingId).startsWith('cuff-')), 'cuff reading was never POSTed');
});

test('#2 syncing several times never duplicates readings (on screen or on the server)', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  const before = rs(store).items.length;
  bpMonitor.takeMeasurement();
  await store.dispatch(syncFromMonitor());
  await store.dispatch(syncFromMonitor());
  await store.dispatch(syncFromMonitor());

  const ids = deviceIds(rs(store).items);
  assert.deepEqual(dupes(ids), [], 'duplicate deviceReadingIds on screen');
  assert.equal(rs(store).items.length, before + 1, 'exactly one new reading expected after one measurement');
  assert.deepEqual(dupes(deviceIds(fs.db)), [], 'duplicate deviceReadingIds on the server');
});

test('#2b syncing before the first load does not re-upload readings the server already has', async () => {
  const store = makeStore();
  await store.dispatch(syncFromMonitor());
  assert.deepEqual(
    fs.posts.filter((p) => !String(p.deviceReadingId).startsWith('cuff-')).map((p) => p.deviceReadingId),
    [],
    'readings already on the server were uploaded again'
  );
  assert.deepEqual(dupes(deviceIds(rs(store).items)), []);
});

test('#3 switching 90d -> 7d quickly shows only 7 days (slow 90d response is ignored)', async () => {
  const store = makeStore();
  store.dispatch(setRange('90d'));
  const slow = store.dispatch(fetchReadings('90d'));
  await sleep(1);
  store.dispatch(setRange('7d'));
  const fast = store.dispatch(fetchReadings('7d'));
  await Promise.all([slow, fast]);

  assert.equal(rs(store).range, '7d');
  const oldest = Math.min(...rs(store).items.map((r: any) => Date.parse(r.takenAt)));
  assert.ok(Date.now() - oldest <= 7 * DAY_MS + 60_000, `7d tab shows a reading from ${((Date.now() - oldest) / DAY_MS).toFixed(1)} days ago`);
});

test('#3b an older response for the same range never overwrites a newer one', async () => {
  const store = makeStore();
  fs.delay['7d'] = 40;
  const first = store.dispatch(fetchReadings('7d'));
  await sleep(5);
  fs.db.push({ id: 'srv-new', deviceReadingId: 'dev-new', systolic: 121, diastolic: 79, pulse: 70, takenAt: new Date().toISOString(), source: 'monitor' });
  fs.delay['7d'] = 5;
  const second = store.dispatch(fetchReadings('7d'));
  await Promise.all([first, second]);
  assert.ok(rs(store).items.some((r: any) => r.id === 'srv-new'), 'stale response replaced fresher data');
});

test('#4 blood-pressure category follows the AHA rule (high if SYS>=130 OR DIA>=80)', () => {
  const cases: [number, number, string][] = [
    [150, 75, 'high'],
    [125, 85, 'high'],
    [190, 60, 'high'],
    [130, 80, 'high'],
    [129, 79, 'elevated'],
    [120, 70, 'elevated'],
    [119, 79, 'normal'],
  ];
  for (const [systolic, diastolic, expected] of cases) {
    assert.equal(getBpCategory({ systolic, diastolic }), expected, `${systolic}/${diastolic}`);
  }
});

test('#5 a reading just after midnight is grouped under the LOCAL day', async () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(0, 45, 0, 0); // yesterday 00:45 Israel time = 21:45Z the day before
  const late = new Date(d);
  late.setHours(23, 30, 0, 0);
  fs.db = [
    { id: 'a', systolic: 120, diastolic: 75, pulse: 70, takenAt: d.toISOString(), source: 'manual' },
    { id: 'b', systolic: 120, diastolic: 75, pulse: 70, takenAt: late.toISOString(), source: 'manual' },
  ];
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  const groups = selectReadingsByDay(store.getState() as any);
  assert.equal(groups.length, 1, 'both readings are on the same local day');
  assert.equal(groups[0].day, localDay(d.toISOString()));
});

test('#6 readings are sorted newest first, and days are in order (also across months)', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('90d'));
  const groups = selectReadingsByDay(store.getState() as any);
  const days = groups.map((g) => g.day);
  assert.deepEqual(days, [...days].sort().reverse(), 'day headers out of order');
  const flat = groups.flatMap((g) => g.readings.map((r) => Date.parse(r.takenAt)));
  for (let i = 1; i < flat.length; i++) {
    assert.ok(flat[i] <= flat[i - 1], `row ${i} is newer than the row above it`);
  }
});

test('#7 invalid manual readings are rejected and never sent to the server', async () => {
  const store = makeStore();
  const bad = [
    { systolic: NaN, diastolic: NaN, pulse: NaN }, // empty form
    { systolic: 400, diastolic: 80, pulse: 70 },
    { systolic: 80, diastolic: 120, pulse: 70 }, // SYS below DIA
    { systolic: 120, diastolic: 80, pulse: 0 },
  ];
  for (const input of bad) {
    const res: any = await store.dispatch(addReading(input));
    assert.equal(res.type, addReading.rejected.type, `accepted ${JSON.stringify(input)}`);
  }
  assert.equal(fs.posts.length, 0, 'invalid reading was POSTed');
  assert.equal(rs(store).items.length, 0);

  const ok: any = await store.dispatch(addReading({ systolic: 120, diastolic: 80, pulse: 70 }));
  assert.equal(ok.type, addReading.fulfilled.type, 'a valid reading must still be accepted');
});

test('#8 tapping Save twice creates only one reading', async () => {
  const store = makeStore();
  await Promise.all([
    store.dispatch(addReading({ systolic: 120, diastolic: 80, pulse: 70 })),
    store.dispatch(addReading({ systolic: 120, diastolic: 80, pulse: 70 })),
  ]);
  assert.equal(fs.posts.length, 1, 'two POSTs were sent');
  assert.equal(rs(store).items.filter((r: any) => r.source === 'manual').length, 1);
});

test('#9 a reading saved while a refresh is in flight is not wiped by that refresh', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  fs.delay['7d'] = 40;
  const refresh = store.dispatch(fetchReadings('7d')); // server snapshot taken now
  await sleep(2);
  await store.dispatch(addReading({ systolic: 133, diastolic: 77, pulse: 71 }));
  await refresh;
  assert.ok(
    rs(store).items.some((r: any) => r.source === 'manual' && r.systolic === 133),
    'manual reading vanished after the in-flight refresh completed'
  );
});
