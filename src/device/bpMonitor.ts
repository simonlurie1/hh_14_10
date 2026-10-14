/**
 * Simulated Bluetooth blood pressure monitor. Treat this as "the hardware" —
 * its behavior is realistic and is NOT one of the bugs.
 *
 * How the real device behaves:
 *  - It keeps its last 5 readings in memory.
 *  - Every time the app connects and syncs, it sends ALL readings in memory,
 *    including ones it already sent in previous syncs.
 *  - Every reading has a stable `deviceReadingId`.
 */
import { latestServerReadings } from '../api/mockServer';
import { Reading } from '../types';

export type DeviceReading = Omit<Reading, 'id' | 'source'>;

const MEMORY_SIZE = 5;
let memory: DeviceReading[] | null = null;
let counter = 0;

function initMemory(): DeviceReading[] {
  // The device still holds the newest readings that were already uploaded before.
  return latestServerReadings(3).map(({ id, source, ...rest }) => rest);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const bpMonitor = {
  /** The user just took a measurement on the cuff. */
  takeMeasurement() {
    if (!memory) memory = initMemory();
    counter++;
    memory.unshift({
      deviceReadingId: `cuff-${Date.now()}-${counter}`,
      systolic: Math.round(115 + Math.random() * 45),
      diastolic: Math.round(70 + Math.random() * 25),
      pulse: Math.round(60 + Math.random() * 30),
      takenAt: new Date().toISOString(),
    });
    memory = memory.slice(0, MEMORY_SIZE);
  },

  /** Connect over "Bluetooth" and download everything in memory. */
  async sync(): Promise<DeviceReading[]> {
    if (!memory) memory = initMemory();
    await sleep(700);
    return memory.map((r) => ({ ...r }));
  },
};
