import { mockServer } from './mockServer';
import { Reading, RangeKey } from '../types';

export const readingsApi = {
  async fetchReadings(range: RangeKey): Promise<Reading[]> {
    console.log(`[api] GET /readings?range=${range}`);
    const data = await mockServer.getReadings(range);
    console.log('[api] response', JSON.stringify(data));
    return data;
  },

  async addReading(input: Omit<Reading, 'id'>): Promise<Reading> {
    console.log('[api] POST /readings', JSON.stringify(input));
    return mockServer.postReading(input);
  },
};
