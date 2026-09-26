import { api } from '../services/api';

export const authApi = {
  register: (data: {username: string; password: string; email?: string}) => 
    api.post('/auth/register', data),
  login: (data: {username: string; password: string}) => 
    api.post<{access_token:string; refresh_token:string; token_type:string}>('/auth/login', data),
  refresh: (refreshToken: string) => 
    api.post<{access_token:string}>('/auth/refresh', {refresh_token: refreshToken}),
  changePassword: (data: {old_password:string; new_password:string}) => 
    api.put('/users/me/password', data),
};
