import { api } from '../services/api';
import type { User } from '../types';

type ApiUser = Omit<User, 'role'> & {
  role?: string | { id?: number; name?: string } | null;
  role_name?: string;
  role_id?: number;
};

const normalizeUser = (raw: ApiUser): User => {
  const roleFromApi = typeof raw.role === 'string' ? raw.role : raw.role?.name;
  // Fallback for older API versions where only role_id was returned.
  const roleFromId = raw.role_id === 1 ? 'admin' : raw.role_id === 2 ? 'owner' : raw.role_id === 3 ? 'viewer' : 'viewer';
  return {
    ...raw,
    role: roleFromApi || raw.role_name || roleFromId,
  } as User;
};

export const usersApi = {
  me: async () => normalizeUser((await api.get<ApiUser>('/users/me')).data),
  list: async () => (await api.get<ApiUser[]>('/users')).data.map(normalizeUser),
  create: async (data: {username:string; password:string; email?:string; role?:string}) =>
    normalizeUser((await api.post<ApiUser>('/users', data)).data),
  updateRole: (id: number, role: string) => api.put(`/users/${id}/role`, {role}).then(res => res.data),
  updateStatus: (id: number, status: string) => api.put(`/users/${id}/status`, {status}).then(res => res.data),
};
