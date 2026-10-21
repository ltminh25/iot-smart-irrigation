import { api } from '../services/api';
import type { Telemetry } from '../types';

export interface TelemetryListParams {
  device_id: number;
  from?: string;
  to?: string;
  type?: string;
  limit?: number;
}

export interface TelemetryExportParams {
  device_id: number;
  from: string;
  to: string;
}

export const telemetryApi = {
  // Map the frontend-friendly names to the query parameters used by FastAPI.
  list: (params: TelemetryListParams) => {
    const { from, to, type, ...rest } = params;
    return api.get<Telemetry[]>('/telemetry', {
      params: {
        ...rest,
        from_date: from,
        to_date: to,
        sensor_type: type,
      },
    }).then(res => res.data);
  },
  latest: (device_id: number) =>
    api.get<Record<string, Telemetry>>('/telemetry/latest', { params: { device_id } }).then(res => res.data),
  export: (params: TelemetryExportParams) => {
    const { from, to, ...rest } = params;
    return api.get('/telemetry/export', {
      params: { ...rest, from_date: from, to_date: to },
      responseType: 'blob',
    }).then(res => res.data);
  },
};
