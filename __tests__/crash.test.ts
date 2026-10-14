/** Crash edge cases: bad server responses must not take down the screen. */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeServer, makeStore, rs, FakeServer, noThrow } from './helpers';
import { fetchReadings, syncFromMonitor } from '../src/store/readingsSlice';
import { selectReadingsByDay, selectAllReadings } from '../src/store/selectors';
import { formatDayLabel, formatTime } from '../src/utils/dates';

let fs: FakeServer;
beforeEach(() => {
  fs = installFakeServer();
});
afterEach(() => fs.restore());

/** What ReadingsScreen + SummaryCard + ReadingRow do with the state on every render. */
function render(store: any) {
  const groups = selectReadingsByDay(store.getState());
  groups.forEach((g) => {
    formatDayLabel(g.day);
    g.readings.forEach((r) => formatTime(r.takenAt));
  });
  return selectAllReadings(store.getState()).map((r) => r.systolic);
}

for (const [name, body] of [
  ['null', null],
  ['an object instead of an array', { readings: [] }],
  ['an HTML login page (captive Wi-Fi / proxy)', '<html><body>Please sign in</body></html>'],
] as const) {
  test(`#17 a 200 response with ${name} does not crash and shows an error`, async () => {
    const store = makeStore();
    fs.respondWith = body;
    await store.dispatch(fetchReadings('7d'));
    noThrow(() => render(store));
    assert.equal(rs(store).status, 'failed');
    assert.ok(rs(store).error, 'no error shown');
    // and a sync afterwards must not throw inside the reducer
    await store.dispatch(syncFromMonitor());
    noThrow(() => render(store));
  });
}

test('#18 one malformed reading is skipped instead of crashing the whole list', async () => {
  const now = new Date().toISOString();
  fs.db = [
    { id: 'ok', systolic: 120, diastolic: 80, pulse: 70, takenAt: now, source: 'manual' },
    { id: 'no-date', systolic: 120, diastolic: 80, pulse: 70, source: 'manual' },
    { id: 'num-date', systolic: 120, diastolic: 80, pulse: 70, takenAt: 1760000000000, source: 'manual' },
    { id: 'bad-date', systolic: 120, diastolic: 80, pulse: 70, takenAt: 'garbage', source: 'manual' },
    { id: 'no-bp', pulse: 70, takenAt: now, source: 'manual' },
  ];
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  noThrow(() => render(store));
  assert.deepEqual(rs(store).items.map((r: any) => r.id), ['ok']);
});

test('#18b formatTime never prints "NaN:NaN"', () => {
  assert.doesNotMatch(formatTime('garbage'), /NaN/);
});
