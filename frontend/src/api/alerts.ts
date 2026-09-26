import { api } from '../services/api';
import type { Alert } from '../types';

export const alertsApi = {
  list: (params?: {device_id?: number; status?: string}) => 
    api.get<Alert[]>('/alerts', {params}).then(res => res.data),
  acknowledge: (id: number) => api.put(`/alerts/${id}/acknowledge`).then(res => res.data),
  resolve: (id: number) => api.put(`/alerts/${id}/resolve`).then(res => res.data),
};
