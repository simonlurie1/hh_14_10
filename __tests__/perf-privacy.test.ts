/** Performance and privacy. */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeServer, makeStore, FakeServer } from './helpers';
import { fetchReadings, addReading, setRange } from '../src/store/readingsSlice';
import { selectReadingsByDay } from '../src/store/selectors';

let fs: FakeServer;
beforeEach(() => {
  fs = installFakeServer();
});
afterEach(() => fs.restore());

test('#19 selectReadingsByDay is memoized (no re-render of the whole screen on every action)', async () => {
  const store = makeStore();
  await store.dispatch(fetchReadings('7d'));
  const a = selectReadingsByDay(store.getState() as any);
  const b = selectReadingsByDay(store.getState() as any);
  assert.equal(a, b, 'same state returned a new array');
  store.dispatch(setRange('7d')); // unrelated to items
  const c = selectReadingsByDay(store.getState() as any);
  assert.equal(a, c, 'unrelated action produced a new array');
});

test('#20 health data (BP values) is never written to the console', async () => {
  const logged: string[] = [];
  const methods = ['log', 'info', 'debug', 'warn'] as const;
  const orig = methods.map((m) => console[m]);
  methods.forEach((m) => {
    console[m] = (...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
  });
  try {
    const store = makeStore();
    await store.dispatch(fetchReadings('7d'));
    await store.dispatch(addReading({ systolic: 137, diastolic: 88, pulse: 66 }));
  } finally {
    methods.forEach((m, i) => (console[m] = orig[i]));
  }
  const all = logged.join('\n');
  assert.doesNotMatch(all, /systolic|diastolic|"pulse"/, 'reading payloads are logged');
  assert.doesNotMatch(all, /\b137\b/, 'a BP value appears in the logs');
});
