import { api } from '../services/api';
import type { Command } from '../types';

export const commandsApi = {
  send: (data: {device_id: number; action: string; payload?: any}) => 
    api.post<Command>('/commands', data).then(res => res.data),
  list: (device_id: number) => 
    api.get<Command[]>('/commands', {params: {device_id}}).then(res => res.data),
};
