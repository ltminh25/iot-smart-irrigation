import { create } from 'zustand';
import type { User } from '../types';

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setUser: (user: User) => void;
  setAccessToken: (token: string) => void;
  login: (accessToken: string, refreshToken: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const getStoredToken = (key: string) => localStorage.getItem(key);

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  accessToken: getStoredToken('access_token'),
  refreshToken: getStoredToken('refresh_token'),
  isAuthenticated: !!getStoredToken('access_token'),
  setUser: (user) => set({ user }),
  setAccessToken: (token) => {
    localStorage.setItem('access_token', token);
    set({ accessToken: token, isAuthenticated: !!token });
  },
  login: (accessToken, refreshToken, user) => {
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    set({
      accessToken,
      refreshToken,
      user,
      isAuthenticated: true,
    });
  },
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },
}));
