import React, { useState } from 'react';
import { Table, Badge, Button, Select, Space, Tabs, Card, Tag } from 'antd';
import { ReloadOutlined, HistoryOutlined, AlertOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { commandsApi } from '../api/commands';
import { alertsApi } from '../api/alerts';
import { devicesApi } from '../api/devices';
import { formatLocalTime } from '../utils/date';

export const HistoryPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | undefined>(undefined);
  const [alertTab, setAlertTab] = useState<string>('all');

  const { data: devices } = useQuery({
    queryKey: ['devices'],
    queryFn: devicesApi.list,
  });

  const { data: commands, isLoading: isLoadingCommands, refetch: refetchCommands } = useQuery({
    queryKey: ['commands', selectedDeviceId],
    queryFn: () => commandsApi.list(selectedDeviceId),
    refetchInterval: 10000,
  });

  const { data: alerts, isLoading: isLoadingAlerts, refetch: refetchAlerts } = useQuery({
    queryKey: ['alerts', selectedDeviceId, alertTab],
    queryFn: () => alertsApi.list({
      device_id: selectedDeviceId,
      status: alertTab !== 'all' ? alertTab : undefined,
    }),
    refetchInterval: 10000,
  });

  const ackMutation = useMutation({
    mutationFn: (id: number) => alertsApi.acknowledge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) => alertsApi.resolve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'executed': return 'success';
      case 'failed': return 'error';
      case 'pending': return 'processing';
      default: return 'default';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge status="error" text="NGHIÊM TRỌNG" />;
      case 'warning': return <Badge status="warning" text="CẢNH BÁO" />;
      case 'info': return <Badge status="processing" text="THÔNG TIN" />;
      default: return <Badge status="default" text={severity?.toUpperCase()} />;
    }
  };

  const getActionTag = (action: string, actionName?: string) => {
    switch (action) {
      case 'pump_on':
        return <Tag color="green">{actionName || 'Bật máy bơm (5s)'}</Tag>;
      case 'pump_off':
        return <Tag color="volcano">{actionName || 'Tắt máy bơm'}</Tag>;
      case 'curtain_open':
        return <Tag color="blue">{actionName || 'Mở mái che (60°)'}</Tag>;
      case 'curtain_close':
        return <Tag color="orange">{actionName || 'Đóng mái che (120°)'}</Tag>;
      default:
        return <Tag color="cyan">{actionName || action}</Tag>;
    }
  };

  const commandColumns = [
    { title: 'Mã lệnh', dataIndex: 'command_id', key: 'command_id' },
    {
      title: 'Thiết bị',
      dataIndex: 'device_id',
      key: 'device_id',
      render: (devId: number) => {
        const dev = devices?.find(d => d.id === devId);
        return dev ? `${dev.name} (${dev.device_uid})` : `Thiết bị #${devId}`;
      }
    },
    { 
      title: 'Tên thao tác', 
      dataIndex: 'action', 
      key: 'action',
      render: (act: string, record: any) => (
        <Space direction="vertical" size={2}>
          {getActionTag(act, record.action_name)}
          <span style={{ fontSize: 11, color: '#8c8c8c' }}>{act}</span>
        </Space>
      )
    },
    { 
      title: 'Tài khoản (Username)',
      dataIndex: 'username',
      key: 'username',
      render: (username: string | null, record: any) => {
        if (username) {
          const color = username === 'admin' ? 'purple' : 'geekblue';
          return (
            <Tag color={color} icon={<UserOutlined />}>
              <b>{username}</b>
            </Tag>
          );
        }
        if (record.issued_by) {
          return (
            <Tag color="cyan" icon={<UserOutlined />}>
              User #{record.issued_by}
            </Tag>
          );
        }
        return <Tag color="default">🤖 Tự động (Hệ thống)</Tag>;
      }
    },
    { 
      title: 'Trạng thái', 
      dataIndex: 'status', 
      key: 'status',
      render: (val: string) => <Badge status={getStatusColor(val) as any} text={val.toUpperCase()} />
    },
    { 
      title: 'Thời gian gửi', 
      dataIndex: 'issued_at', 
      key: 'issued_at',
      render: (val: string) => formatLocalTime(val, 'DD/MM/YYYY HH:mm:ss')
    },
    { 
      title: 'Thời gian thực thi', 
      dataIndex: 'executed_at', 
      key: 'executed_at',
      render: (val: string) => val ? formatLocalTime(val, 'DD/MM/YYYY HH:mm:ss') : '-'
    },
    { title: 'Thử lại', dataIndex: 'retry_count', key: 'retry_count' },
  ];

  const alertColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 70 },
    { 
      title: 'Mức độ', 
      dataIndex: 'severity', 
      key: 'severity',
      render: (val: string) => getSeverityBadge(val)
    },
    {
      title: 'Thiết bị',
      dataIndex: 'device_id',
      key: 'device_id',
      render: (devId: number) => {
        const dev = devices?.find(d => d.id === devId);
        return dev ? `${dev.name}` : `#${devId}`;
      }
    },
    { title: 'Nội dung thông báo', dataIndex: 'message', key: 'message' },
    { 
      title: 'Trạng thái', 
      dataIndex: 'status', 
      key: 'status',
      render: (val: string) => {
        const color = val === 'resolved' ? 'green' : val === 'acknowledged' ? 'gold' : 'red';
        return <Tag color={color}>{val.toUpperCase()}</Tag>;
      }
    },
    { 
      title: 'Thời gian', 
      dataIndex: 'created_at', 
      key: 'created_at',
      render: (val: string) => formatLocalTime(val, 'DD/MM/YYYY HH:mm:ss')
    },
    {
      title: 'Xử lý',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          {record.status === 'open' && (
            <Button size="small" onClick={() => ackMutation.mutate(record.id)}>Xác nhận</Button>
          )}
          {(record.status === 'open' || record.status === 'acknowledged') && (
            <Button size="small" type="primary" onClick={() => resolveMutation.mutate(record.id)}>Giải quyết</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ color: '#888' }}>Xem toàn bộ lịch sử điều khiển lệnh và danh sách cảnh báo</span>
        <Space>
          <Select
            style={{ width: 240 }}
            placeholder="Tất cả thiết bị"
            allowClear
            value={selectedDeviceId}
            onChange={setSelectedDeviceId}
            options={devices?.map(d => ({ label: `${d.name} (${d.device_uid})`, value: d.id }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => { refetchCommands(); refetchAlerts(); }}>Làm mới</Button>
        </Space>
      </div>

      <Card>
        <Tabs
          defaultActiveKey="commands"
          items={[
            {
              key: 'commands',
              label: (
                <span>
                  <HistoryOutlined /> Lịch sử điều khiển
                </span>
              ),
              children: (
                <Table 
                  columns={commandColumns} 
                  dataSource={commands || []} 
                  rowKey="id" 
                  loading={isLoadingCommands}
                  pagination={{ pageSize: 10 }}
                />
              ),
            },
            {
              key: 'alerts',
              label: (
                <span>
                  <AlertOutlined /> Lịch sử cảnh báo
                </span>
              ),
              children: (
                <div>
                  <Tabs
                    activeKey={alertTab}
                    onChange={setAlertTab}
                    items={[
                      { key: 'all', label: 'Tất cả' },
                      { key: 'open', label: 'Đang mở (Open)' },
                      { key: 'acknowledged', label: 'Đã xác nhận' },
                      { key: 'resolved', label: 'Đã giải quyết' },
                    ]}
                    style={{ marginBottom: 12 }}
                  />
                  <Table 
                    columns={alertColumns} 
                    dataSource={alerts || []} 
                    rowKey="id" 
                    loading={isLoadingAlerts}
                    pagination={{ pageSize: 10 }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};
export default HistoryPage;
