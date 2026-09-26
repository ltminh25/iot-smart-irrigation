import React, { useState } from 'react';
import { Table, Button, Badge, Tabs, message, Space } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { alertsApi } from '../api/alerts';

export const Alerts: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['alerts', activeTab],
    queryFn: () => alertsApi.list(activeTab !== 'all' ? { status: activeTab } : undefined),
    refetchInterval: 30000,
  });

  const ackMutation = useMutation({
    mutationFn: (id: number) => alertsApi.acknowledge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      message.success('Đã xác nhận cảnh báo');
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) => alertsApi.resolve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      message.success('Đã giải quyết cảnh báo');
    },
  });

  const getSeverityColor = (severity: string) => {
    switch(severity) {
      case 'critical': return 'error';
      case 'warning': return 'warning';
      case 'info': return 'processing';
      default: return 'default';
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id' },
    { 
      title: 'Mức độ', 
      dataIndex: 'severity', 
      key: 'severity',
      render: (val: string) => <Badge status={getSeverityColor(val) as any} text={val.toUpperCase()} />
    },
    { title: 'Thiết bị ID', dataIndex: 'device_id', key: 'device_id' },
    { title: 'Tin nhắn', dataIndex: 'message', key: 'message' },
    { 
      title: 'Trạng thái', 
      dataIndex: 'status', 
      key: 'status',
      render: (val: string) => val.toUpperCase()
    },
    { 
      title: 'Thời gian', 
      dataIndex: 'created_at', 
      key: 'created_at',
      render: (val: string) => dayjs(val).format('DD/MM/YYYY HH:mm:ss')
    },
    {
      title: 'Hành động',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          {record.status === 'open' && (
            <Button size="small" onClick={() => ackMutation.mutate(record.id)}>Acknowledge</Button>
          )}
          {(record.status === 'open' || record.status === 'acknowledged') && (
            <Button size="small" type="primary" onClick={() => resolveMutation.mutate(record.id)}>Resolve</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h2>Cảnh báo hệ thống</h2>
      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab}
        items={[
          { key: 'all', label: 'Tất cả' },
          { key: 'open', label: 'Đang mở (Open)' },
          { key: 'acknowledged', label: 'Đã xác nhận (Acknowledged)' },
          { key: 'resolved', label: 'Đã giải quyết (Resolved)' },
        ]}
      />
      <Table columns={columns} dataSource={alerts} rowKey="id" loading={isLoading} />
    </div>
  );
};
