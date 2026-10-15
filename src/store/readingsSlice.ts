import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { readingsApi } from '../api/readingsApi';
import { bpMonitor, DeviceReading } from '../device/bpMonitor';
import { Reading, RangeKey, RANGE_DAYS } from '../types';
import { ReadingInput, validateReadingInput } from '../utils/bp';

type Status = 'idle' | 'loading' | 'succeeded' | 'failed';

export interface ReadingsState {
  items: Reading[];
  /** The range the user selected (tab). */
  range: RangeKey;
  /** The range `items` currently belong to (null until the first successful load). */
  loadedRange: RangeKey | null;
  status: Status;
  /** True while a background refresh of already-loaded data is running. */
  refreshing: boolean;
  error: string | null;

  /** Only the latest fetch may write to the list (older responses are stale). */
  currentRequestId: string | null;
  /** Value of `mutationSeq` when the current fetch started. */
  currentFetchSeq: number;
  /** Increments on every local write (manual save / uploaded sync). */
  mutationSeq: number;
  /** Readings written locally -> the mutationSeq they were written at. Lets a refresh that
   *  started earlier keep them instead of wiping them. */
  localWrites: Record<string, number>;

  syncing: boolean;
  syncError: string | null;
  lastSyncedAt: string | null;

  saving: boolean;
  saveError: string | null;
}

const initialState: ReadingsState = {
  items: [],
  range: '7d',
  loadedRange: null,
  status: 'idle',
  refreshing: false,
  error: null,
  currentRequestId: null,
  currentFetchSeq: 0,
  mutationSeq: 0,
  localWrites: {},
  syncing: false,
  syncError: null,
  lastSyncedAt: null,
  saving: false,
  saveError: null,
};

type ThunkState = { readings: ReadingsState };

/** Works for thrown Errors and for RTK's serialized `action.error`. */
const errorMessage = (e: unknown, fallback: string): string => {
  const message = (e as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message ? message : fallback;
};

export const fetchReadings = createAsyncThunk('readings/fetch', async (range: RangeKey) => {
  return readingsApi.fetchReadings(range);
});

export interface SyncResult {
  uploaded: Reading[];
  /** Cuff readings the server already had (e.g. an upload that timed out but was saved). */
  alreadyOnServer: Reading[];
  failedCount: number;
  uploadError: string | null;
  /** Readings older than the server can be asked about (> 90 days): not uploaded. */
  tooOldCount: number;
  /** Implausible cuff values (e.g. 0/0 from a failed measurement): not uploaded. */
  invalidCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGES_BY_SIZE: RangeKey[] = ['7d', '30d', '90d'];

/** Smallest range that still contains a reading taken `ageMs` ago (null if older than 90 days). */
function rangeCovering(ageMs: number): RangeKey | null {
  return RANGES_BY_SIZE.find((r) => ageMs <= RANGE_DAYS[r] * DAY_MS - 60_000) ?? null;
}

/**
 * Sync = read the cuff, then UPLOAD readings the server doesn't have yet.
 * The cuff re-sends its whole memory every time, so readings are de-duplicated by
 * their stable `deviceReadingId`.
 *
 * The screen only holds the selected range, and an upload that timed out may still have
 * been saved, so before uploading we ask the SERVER which of the new readings it already
 * has, looking back as far as the oldest one. Readings that fail to upload are retried on
 * the next sync (they are still in the cuff's memory and still unknown to the server).
 */
export const syncFromMonitor = createAsyncThunk<SyncResult, void, { state: ThunkState }>(
  'readings/syncFromMonitor',
  async (_, { getState }) => {
    const deviceReadings = await bpMonitor.sync();
    if (!Array.isArray(deviceReadings)) throw new Error('The cuff sent an unexpected response. Please sync again.');

    // 1. New to this screen? (also de-duplicates within one batch)
    const state = getState().readings;
    const seen = new Set(state.items.map((r) => r.deviceReadingId).filter(Boolean) as string[]);
    const fresh = deviceReadings.filter((r) => {
      if (!r?.deviceReadingId || seen.has(r.deviceReadingId)) return false;
      seen.add(r.deviceReadingId);
      return true;
    });

    // 2. Plausible? A failed cuff measurement (e.g. 0/0) is not saved as a real reading.
    const isPlausible = (r: DeviceReading) =>
      !isNaN(Date.parse(r.takenAt)) &&
      validateReadingInput({ systolic: r.systolic, diastolic: r.diastolic, pulse: r.pulse }) === null;
    const candidates = fresh.filter(isPlausible);
    const invalidCount = fresh.length - candidates.length;

    const empty: SyncResult = { uploaded: [], alreadyOnServer: [], failedCount: 0, uploadError: null, tooOldCount: 0, invalidCount };
    if (candidates.length === 0) return empty;

    // 3. New to the server? Ask it, looking back to the oldest candidate.
    const now = Date.now();
    const checkable = candidates.filter((r) => rangeCovering(now - Date.parse(r.takenAt)) !== null);
    const tooOldCount = candidates.length - checkable.length;
    if (checkable.length === 0) return { ...empty, tooOldCount };
    const oldestAge = Math.max(...checkable.map((r) => now - Date.parse(r.takenAt)));
    const onServer = await readingsApi.fetchReadings(rangeCovering(oldestAge)!);
    const serverByDeviceId = new Map(onServer.filter((r) => r.deviceReadingId).map((r) => [r.deviceReadingId!, r]));
    const alreadyOnServer = checkable.map((r) => serverByDeviceId.get(r.deviceReadingId!)).filter(Boolean) as Reading[];
    const toUpload = checkable.filter((r) => !serverByDeviceId.has(r.deviceReadingId!));

    // 4. Upload the rest.
    const uploaded: Reading[] = [];
    let failedCount = 0;
    let uploadError: string | null = null;
    for (const reading of toUpload) {
      try {
        uploaded.push(await readingsApi.addReading({ ...reading, source: 'monitor' }));
      } catch (e) {
        failedCount++;
        uploadError = errorMessage(e, 'Upload failed');
      }
    }
    return { uploaded, alreadyOnServer, failedCount, uploadError, tooOldCount, invalidCount };
  },
  { condition: (_, { getState }) => !getState().readings.syncing }
);

export const addReading = createAsyncThunk<Reading, ReadingInput, { state: ThunkState; rejectValue: string }>(
  'readings/add',
  async (input, { rejectWithValue }) => {
    const invalid = validateReadingInput(input);
    if (invalid) return rejectWithValue(invalid);
    return readingsApi.addReading({
      ...input,
      takenAt: new Date().toISOString(),
      source: 'manual',
    });
  },
  // Blocks double-taps: a second Save while one is in flight is ignored.
  { condition: (_, { getState }) => !getState().readings.saving }
);

/** Insert a reading unless it's already there (same id or same device reading). */
function upsertLocal(state: ReadingsState, reading: Reading) {
  const exists = state.items.some(
    (r) => r.id === reading.id || (!!reading.deviceReadingId && r.deviceReadingId === reading.deviceReadingId)
  );
  if (exists) return;
  state.items.push(reading);
  state.mutationSeq++;
  state.localWrites[reading.id] = state.mutationSeq;
}

const readingsSlice = createSlice({
  name: 'readings',
  initialState,
  reducers: {
    setRange(state, action: PayloadAction<RangeKey>) {
      state.range = action.payload;
    },
    clearSyncError(state) {
      state.syncError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchReadings.pending, (state, action) => {
        state.currentRequestId = action.meta.requestId;
        state.currentFetchSeq = state.mutationSeq;
        if (state.loadedRange === action.meta.arg) {
          // Background refresh: keep showing the list, no full-screen loader.
          state.refreshing = true;
          // e.g. 7d -> 90d -> back to 7d before 90d arrived: 7d data is still valid.
          if (state.status === 'loading') state.status = 'succeeded';
        } else {
          state.status = 'loading';
          state.error = null;
        }
      })
      .addCase(fetchReadings.fulfilled, (state, action) => {
        // Ignore stale responses (an older request, or one for a range the user left).
        if (action.meta.requestId !== state.currentRequestId || action.meta.arg !== state.range) return;

        const fromServer = action.payload;
        const serverIds = new Set(fromServer.map((r) => r.id));
        const serverDeviceIds = new Set(fromServer.map((r) => r.deviceReadingId).filter(Boolean));
        // Keep readings written after this request started that the server snapshot doesn't include yet.
        const newerLocal = state.items.filter(
          (r) =>
            (state.localWrites[r.id] ?? 0) > state.currentFetchSeq &&
            !serverIds.has(r.id) &&
            !(r.deviceReadingId && serverDeviceIds.has(r.deviceReadingId))
        );
        state.items = [...fromServer, ...newerLocal];

        const keep: Record<string, number> = {};
        newerLocal.forEach((r) => (keep[r.id] = state.localWrites[r.id]));
        state.localWrites = keep;

        state.loadedRange = action.meta.arg;
        state.status = 'succeeded';
        state.refreshing = false;
        state.error = null;
        state.currentRequestId = null;
      })
      .addCase(fetchReadings.rejected, (state, action) => {
        if (action.meta.requestId !== state.currentRequestId) return;
        // Keep whatever is on screen; report the error so the UI can offer a retry.
        state.status = 'failed';
        state.refreshing = false;
        state.error = errorMessage(action.error, 'Could not load readings.');
        state.currentRequestId = null;
      })

      .addCase(syncFromMonitor.pending, (state) => {
        state.syncing = true;
        state.syncError = null;
      })
      .addCase(syncFromMonitor.fulfilled, (state, action) => {
        state.syncing = false;
        state.lastSyncedAt = new Date().toISOString();
        action.payload.uploaded.forEach((r) => upsertLocal(state, r));
        action.payload.alreadyOnServer.forEach((r) => upsertLocal(state, r));
        const { failedCount, uploadError, invalidCount } = action.payload;
        const messages: string[] = [];
        if (failedCount) {
          messages.push(
            `${failedCount} reading(s) could not be uploaded (${uploadError}). They are still on the cuff and will upload on the next sync.`
          );
        }
        if (invalidCount) {
          messages.push(`${invalidCount} reading(s) from the cuff looked like a failed measurement and were skipped. Please measure again.`);
        }
        state.syncError = messages.length ? messages.join(' ') : null;
      })
      .addCase(syncFromMonitor.rejected, (state, action) => {
        state.syncing = false;
        state.syncError = errorMessage(action.error, 'Sync failed.');
      })

      .addCase(addReading.pending, (state) => {
        state.saving = true;
        state.saveError = null;
      })
      .addCase(addReading.fulfilled, (state, action) => {
        state.saving = false;
        upsertLocal(state, action.payload);
      })
      .addCase(addReading.rejected, (state, action) => {
        state.saving = false;
        state.saveError = action.payload ?? errorMessage(action.error, 'Could not save the reading.');
      });
  },
});

export const { setRange, clearSyncError } = readingsSlice.actions;
export default readingsSlice.reducer;
