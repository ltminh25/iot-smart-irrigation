import { api } from '../services/api';
import type { Device, DeviceLifecycleLog } from '../types';

export const devicesApi = {
  list: () => api.get<Device[]>('/devices').then(res => res.data),
  create: (data: Partial<Device>) => api.post<Device>('/devices', data).then(res => res.data),
  get: (id: number) => api.get<Device>(`/devices/${id}`).then(res => res.data),
  updateStatus: (id: number, status: string) => api.put(`/devices/${id}/status`, {status}).then(res => res.data),
  updateConfig: (id: number, data: Partial<Device>) => api.put(`/devices/${id}/config`, data).then(res => res.data),
  getLifecycle: (id: number) => api.get<DeviceLifecycleLog[]>(`/devices/${id}/lifecycle`).then(res => res.data),
};
