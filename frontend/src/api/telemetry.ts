import { api } from '../services/api';
import type { Telemetry } from '../types';

export const telemetryApi = {
  list: (params: {device_id: number; from?: string; to?: string; type?: string; limit?: number}) =>
    api.get<Telemetry[]>('/telemetry', {params}).then(res => res.data),
  latest: (device_id: number) => 
    api.get<Record<string, Telemetry>>('/telemetry/latest', {params: {device_id}}).then(res => res.data),
  export: (params: {device_id: number; from: string; to: string}) =>
    api.get('/telemetry/export', {params, responseType: 'blob'}).then(res => res.data),
};
