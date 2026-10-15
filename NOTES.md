# Heart Readings: notes

All the problems below are fixed except one (E23, which needs the server). Every fix has a test that fails on the original code and passes now.

`npm test` runs 55 tests: 54 pass, 0 fail, and 1 is marked `todo` (E23). It takes about 30 seconds, because the chaos test talks to the real mock server.

## How I ranked problems

1. **Data the user (or their doctor) sees is wrong, lost or duplicated.** This is a health app, so a wrong number is the worst outcome.
2. **Reliability:** stuck screens, silent failures, races, and what happens when the server is lost.
3. **Crashes on bad data.** The cause is rare, but the user loses the whole screen.
4. **Performance.**
5. **Privacy.**
6. **UI/UX and accessibility.**

## Problems found and fixed

### P0: data wrong, lost or duplicated

| # | Problem | Root cause | Fix |
|---|---|---|---|
| 1 | Synced cuff readings disappeared at the next refresh | Sync only added them on screen. They were never uploaded, and every fetch replaced the list. | Sync uploads new readings to the server. |
| 2 | Sync showed readings 2–3 times | The cuff re-sends its whole memory on every sync, and each copy got a new `nanoid`. | Readings are de-duplicated by the stable `deviceReadingId`, also within one batch. |
| E14 | Cuff readings older than the loaded tab were uploaded again on every sync, making server duplicates | The duplicate check only used what was on screen. | Before uploading, sync asks the server, looking back to the oldest cuff reading (7d → 30d → 90d). |
| E15 | An upload that timed out but was saved got uploaded again | Same root cause as E14. | Same server check. |
| 3 | The 7d tab showed 90 days of data | Whichever response arrived last won. | Only the latest request for the selected tab may write the list. |
| 4 | 150/75 showed as "elevated" | The "high" rule used `&&` instead of `\|\|`. | `systolic >= 130 \|\| diastolic >= 80`. |
| 5 | A reading taken just after midnight showed under the previous day | Days were grouped by the UTC date. | Days are grouped by the local date. |
| 6 | The order looked random | The sort compared `getDate()`, the day of the month. | Sort by timestamp, newest first. |
| 7 | An empty or absurd manual entry was saved (NaN/NaN) | No validation. | Plausible ranges, whole numbers only, SYS > DIA. |
| E17 | A cuff error such as 0/0 was saved as a real reading | Cuff readings weren't validated. | The same validation as manual entry. Skipped readings are reported to the user. |
| 8 | Tapping Save twice created two readings | No in-flight guard. | A thunk `condition` ignores the second tap, and the button is disabled while saving. |
| 9 | A reading saved during a refresh vanished when that refresh finished | The refresh replaced the whole list. | Local writes made after a refresh started are kept. |
| E6/E7 | A duplicate already on the server was shown twice | The fetched list wasn't de-duplicated. | De-duplicated by id and by `deviceReadingId`. |
| — | On web, the form saved `1e2` as 100 and `0x78` as 120 | The input was parsed with `Number()`. | `parseWholeNumber` accepts only 1–3 plain digits. |

### P1: reliability, races, server lost

| # | Problem | Fix |
|---|---|---|
| 10 | A failed request left "Loading readings…" on screen forever (the mock server fails every 4th request) | The `rejected` handler sets status `failed` with the error and shows a Try again button. Data already on screen is kept. |
| 11 | `setInterval` was never cleared, so intervals stacked up on every tab change | A `startPolling` helper with the effect's cleanup. Polls are skipped while the app is in the background. |
| 12 | Every poll flashed the full-screen loader | A background refresh keeps the list and sets `refreshing`. |
| 13 | A failed Save was silent, and the form was cleared anyway | The error is shown, and the form clears only after the server confirms the save. |
| 14 | Sync could run several times at once, and its errors were swallowed | A thunk `condition` allows one sync at a time, and `syncError` is shown to the user. |
| 15 | A server that never answers meant loading forever | A 15-second timeout. |
| 16 | Readings taken while offline were lost | They stay on the cuff, are retried on the next sync, and aren't duplicated. |
| E26 | The newest response arrives for a tab the user left: the data was dropped, but status stayed `loading` | Status and the current request are cleared. This was hardening; in the app the next request always cleared it. |

### Crashes

| # | Problem | Fix |
|---|---|---|
| 17 | A 200 response that isn't a list (`null`, an object, an HTML login page) crashed the screen | The response must be an array, otherwise the app shows an error. An `ErrorBoundary` was added as a last line of defence. |
| 18 | One malformed reading (missing date or values) crashed the whole list | Malformed readings are skipped, and the date helpers handle invalid dates. |

### Performance, privacy, accessibility

| # | Problem | Fix |
|---|---|---|
| 19 | The selector built a new array every time, so the whole screen re-rendered on every action | `createSelector`. |
| — | 90 days rendered about 550 rows in a `ScrollView`, and tapping a row re-rendered all of them | A `SectionList` (virtualized), `React.memo` rows, id keys instead of index keys. |
| 20 | Full health data was written to the console | Logs contain only counts and timings. |
| — | Category was shown by color only; buttons and fields had no labels; status changes weren't announced; text contrast was low | The category is shown as text, roles, labels and states were added, live regions announce status changes, and contrast is higher. |

## How I verified

1. **Tests written before the fixes.** Node's built-in test runner, with no new dependencies. A fast, deterministic fake replaces the mock server, seeded with the same history, and the time zone is pinned to Asia/Jerusalem. On the original code 26 of 27 failed; on the fixed code all pass. One test, #2b, passed on both because the original code never uploads anything; it guards the fix.
2. **Edge-case suite** (`edge-cases.test.ts`):
   - rapid tab switching, late successes and late failures;
   - empty and junk responses;
   - 20,000 readings;
   - daylight-saving time and changing time zone;
   - partial upload failures and timeouts;
   - validation boundaries.
3. **Chaos test** (`chaos.test.ts`): 40 random, overlapping user actions against the **real** mock server, with real latency and every 4th request failing. Afterwards it checks:
   - nothing is stuck loading;
   - there are no duplicates on screen or on the server;
   - every reading belongs to the selected tab;
   - every saved reading is present;
   - the list is sorted.

   The suite runs 2 seeds; another 8 were run by hand (`CHAOS_SEEDS=1,2,3 npm test`).
4. **Tests that test the right thing.** Every fix's test was also run against the code before that fix to confirm it fails. This caught two tests (#6 and E6) that were passing on an empty list. They were fixed, and E6 turned out to be a real break.
5. **In the running app** (`expo start --web`):
   - 1 measurement plus 3 syncs went from 41 to 42 readings (before the fix, 2 syncs with no measurement took it from 41 to 47);
   - the new reading survives a refresh;
   - 90d → 7d shows only 7 days;
   - the 00:45 reading is under the right day;
   - 150/75 shows High;
   - an empty Save shows an error;
   - screen-reader labels are present.

## Still open: E23, a duplicate after a save that timed out

If a manual Save times out after the server already stored it, and the user taps Save again, the server gets two copies. The client can't tell "not saved" from "saved but the answer was lost". Sync no longer has this problem (E15), because cuff readings carry a stable `deviceReadingId` that the app checks against the server. Manual readings have no such ID.

**Proposed design: an idempotency key.**

- The client generates a `clientRequestId` (a UUID) when the user taps Save, and keeps the same ID for every retry of that same entry until the server confirms it.
- `POST /readings` with a header `Idempotency-Key: <clientRequestId>`. If the server has already seen that key, it returns the existing reading instead of creating a new one.
- The server needs a unique index on `(user_id, idempotency_key)`, kept for at least 24 hours.

A client-only stopgap would work with this mock: it stores extra fields. The client could send `clientRequestId` in the body and, before a retry, check whether a reading with that ID already exists. A real backend should own this, so I recorded it as a `todo` test rather than building the workaround.

## What I'd do next

- **Offline-first:** keep readings and a pending-upload queue on the device (AsyncStorage or SQLite), so a reading taken offline is visible immediately and survives an app restart.
- **Server-side guarantees:** a unique constraint on `deviceReadingId` per user, and E23's idempotency key. The client de-duplication then becomes a second layer instead of the only one.
- **Component tests** with React Native Testing Library for the UI-only fixes: form clearing, disabled buttons, the error banner and Retry, accessibility labels. They are verified by hand today.
- **Pagination** for long ranges instead of loading 90 days at once.
- **Fetch range from state:** make `fetchReadings` read the selected tab from the store, so a response can never be for a different tab than the one that triggered it.
- **Monitoring:** count timeouts, 5xx errors, skipped malformed readings and skipped cuff readings (counts only, no health data).
