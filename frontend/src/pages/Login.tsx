import React, { useState } from 'react';
import { Form, Input, Button, Card, message, Typography, Space } from 'antd';
import { UserOutlined, LockOutlined, ExperimentOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth';
import { usersApi } from '../api/users';
import { useAuthStore } from '../store/authStore';
import '../App.css';

const { Title, Text } = Typography;

export const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuthStore();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const authRes = await authApi.login(values);
      localStorage.setItem('access_token', authRes.data.access_token);
      if (authRes.data.refresh_token) localStorage.setItem('refresh_token', authRes.data.refresh_token);
      const user = await usersApi.me();
      login(authRes.data.access_token, authRes.data.refresh_token, user);
      message.success('Đăng nhập thành công');
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (error) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('auth_user');
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.error(detail || 'Đăng nhập thất bại. Kiểm tra tài khoản, mật khẩu và trạng thái Backend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <Card className="login-card" bordered={false}>
        <div className="login-brand-mark"><ExperimentOutlined /></div>
        <Space direction="vertical" size={4} className="login-heading">
          <Title level={3}>Smart Irrigation</Title>
          <Text type="secondary">Hệ thống IoT giám sát độ ẩm đất và tưới cây thông minh</Text>
        </Space>
        <div className="login-divider" />
        <Title level={5}>Đăng nhập hệ thống</Title>
        <Form name="login_form" onFinish={onFinish} layout="vertical" requiredMark={false}>
          <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập' }]}>
            <Input prefix={<UserOutlined />} placeholder="Nhập username" size="large" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Nhập mật khẩu" size="large" autoComplete="current-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>Đăng nhập</Button>
          </Form.Item>
        </Form>
        <Text className="login-footnote">Theo dõi thiết bị · Dữ liệu cảm biến · Điều khiển máy bơm</Text>
      </Card>
    </main>
  );
};
