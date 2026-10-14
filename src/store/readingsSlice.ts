import { createAsyncThunk, createSlice, nanoid, PayloadAction } from '@reduxjs/toolkit';
import { readingsApi } from '../api/readingsApi';
import { bpMonitor } from '../device/bpMonitor';
import { Reading, RangeKey } from '../types';

type Status = 'idle' | 'loading' | 'succeeded' | 'failed';

interface ReadingsState {
  items: Reading[];
  range: RangeKey;
  status: Status;
  error: string | null;
  syncing: boolean;
  lastSyncedAt: string | null;
}

const initialState: ReadingsState = {
  items: [],
  range: '7d',
  status: 'idle',
  error: null,
  syncing: false,
  lastSyncedAt: null,
};

export const fetchReadings = createAsyncThunk('readings/fetch', async (range: RangeKey) => {
  return readingsApi.fetchReadings(range);
});

export const syncFromMonitor = createAsyncThunk('readings/syncFromMonitor', async () => {
  return bpMonitor.sync();
});

export const addReading = createAsyncThunk(
  'readings/add',
  async (input: { systolic: number; diastolic: number; pulse: number }) => {
    return readingsApi.addReading({
      ...input,
      takenAt: new Date().toISOString(),
      source: 'manual',
    });
  }
);

const readingsSlice = createSlice({
  name: 'readings',
  initialState,
  reducers: {
    setRange(state, action: PayloadAction<RangeKey>) {
      state.range = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchReadings.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchReadings.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload;
      })

      .addCase(syncFromMonitor.pending, (state) => {
        state.syncing = true;
      })
      .addCase(syncFromMonitor.fulfilled, (state, action) => {
        state.syncing = false;
        state.lastSyncedAt = new Date().toISOString();
        action.payload.forEach((deviceReading) => {
          state.items.push({ ...deviceReading, id: nanoid(), source: 'monitor' });
        });
      })
      .addCase(syncFromMonitor.rejected, (state) => {
        state.syncing = false;
      })

      .addCase(addReading.fulfilled, (state, action) => {
        state.items.push(action.payload);
      });
  },
});

export const { setRange } = readingsSlice.actions;
export default readingsSlice.reducer;
