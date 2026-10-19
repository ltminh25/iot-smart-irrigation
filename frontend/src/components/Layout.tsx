import React, { useMemo, useState } from 'react';
import { Layout as AntLayout, Menu, Button, Badge, Avatar, Tooltip } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  DesktopOutlined,
  AlertOutlined,
  HistoryOutlined,
  UserOutlined,
  LogoutOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../store/authStore';
import '../App.css';

const { Header, Sider, Content } = AntLayout;

interface Props {
  children: React.ReactNode;
}

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/devices': 'Quản lý thiết bị',
  '/alerts': 'Cảnh báo',
  '/commands': 'Lịch sử điều khiển',
  '/users': 'Quản lý người dùng',
};

export const Layout: React.FC<Props> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = useMemo(() => {
    const items = [
      { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
      { key: '/devices', icon: <DesktopOutlined />, label: 'Thiết bị' },
      { key: '/alerts', icon: <AlertOutlined />, label: 'Cảnh báo' },
      { key: '/commands', icon: <HistoryOutlined />, label: 'Lịch sử lệnh' },
    ];

    if (user?.role === 'admin') {
      items.push({ key: '/users', icon: <UserOutlined />, label: 'Người dùng' });
    }

    return items;
  }, [user?.role]);

  const selectedKey = location.pathname.startsWith('/devices/')
    ? '/devices'
    : (pageTitles[location.pathname] ? location.pathname : '/');
  const pageTitle = location.pathname.startsWith('/devices/')
    ? 'Chi tiết thiết bị'
    : (pageTitles[location.pathname] ?? 'Smart Irrigation');

  return (
    <AntLayout className="app-layout" style={{ minHeight: '100vh' }}>
      <Sider
        className="app-sider"
        width={248}
        breakpoint="lg"
        collapsedWidth={80}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
      >
        <div className="app-brand">
          <div className="app-brand-mark"><ExperimentOutlined /></div>
          {!collapsed && (
            <div className="app-brand-copy">
              <div className="app-brand-title">SMART IRRIGATION</div>
              <div className="app-brand-subtitle">IoT Plant Care System</div>
            </div>
          )}
        </div>
        <Menu
          className="app-menu"
          theme="dark"
          selectedKeys={[selectedKey]}
          mode="inline"
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>

      <AntLayout>
        <Header className="app-header">
          <div className="app-header-title">
            <div className="app-header-eyebrow">Smart Plant Care System</div>
            <div className="app-header-heading">{pageTitle}</div>
          </div>

          <div className="app-header-user">
            <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#e0f2e8', color: '#176644' }} />
            <div className="app-user-copy">
              <span className="app-user-name">{user?.username || 'Người dùng'}</span>
              <span className="app-user-role">{user?.role || 'member'}</span>
            </div>
            <Badge
              color={user?.role === 'admin' ? '#20845a' : '#8a9b91'}
              text={user?.role === 'admin' ? 'Admin' : 'Member'}
            />
            <Tooltip title="Đăng xuất">
              <Button
                type="text"
                icon={<LogoutOutlined />}
                onClick={handleLogout}
                aria-label="Đăng xuất"
              >
                <span className="logout-label">Đăng xuất</span>
              </Button>
            </Tooltip>
          </div>
        </Header>

        <Content className="app-content">{children}</Content>
      </AntLayout>
    </AntLayout>
  );
};
