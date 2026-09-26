import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';

import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { DeviceManagement } from './pages/DeviceManagement';
import { DeviceDetail } from './pages/DeviceDetail';
import { UserManagement } from './pages/UserManagement';
import { Alerts } from './pages/Alerts';
import { CommandHistory } from './pages/CommandHistory';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { Layout } from './components/Layout';
import { useAuthStore } from './store/authStore';

const queryClient = new QueryClient();

export const App: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={viVN}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
            
            <Route path="/" element={
              <ProtectedRoute>
                <Layout><Dashboard /></Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/devices" element={
              <ProtectedRoute>
                <Layout><DeviceManagement /></Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/devices/:id" element={
              <ProtectedRoute>
                <Layout><DeviceDetail /></Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/users" element={
              <ProtectedRoute requiredRoles={['admin']}>
                <Layout><UserManagement /></Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/alerts" element={
              <ProtectedRoute>
                <Layout><Alerts /></Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/commands" element={
              <ProtectedRoute>
                <Layout><CommandHistory /></Layout>
              </ProtectedRoute>
            } />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
};

export default App;
