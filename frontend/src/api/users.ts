import { api } from '../services/api';
import type { User } from '../types';

export const usersApi = {
  me: () => api.get<User>('/users/me').then(res => res.data),
  list: () => api.get<User[]>('/users').then(res => res.data),
  create: (data: {username:string; password:string; email?:string; role?:string}) => 
    api.post<User>('/users', data).then(res => res.data),
  updateRole: (id: number, role: string) => api.put(`/users/${id}/role`, {role}).then(res => res.data),
  updateStatus: (id: number, status: string) => api.put(`/users/${id}/status`, {status}).then(res => res.data),
};
