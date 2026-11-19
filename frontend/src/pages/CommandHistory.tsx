import React, { useState } from 'react';
import { Table, Badge, Button, Select, Space, Tag } from 'antd';
import { ReloadOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { commandsApi } from '../api/commands';
import { devicesApi } from '../api/devices';
import { formatLocalTime } from '../utils/date';

export const CommandHistory: React.FC = () => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | undefined>(undefined);

  const { data: devices } = useQuery({
    queryKey: ['devices'],
    queryFn: devicesApi.list,
  });

  const { data: commands, isLoading, refetch } = useQuery({
    queryKey: ['commands', selectedDeviceId],
    queryFn: () => commandsApi.list(selectedDeviceId || 0),
    enabled: selectedDeviceId !== undefined,
  });

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'executed': return 'success';
      case 'failed': return 'error';
      case 'pending': return 'processing';
      default: return 'default';
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

  const columns = [
    { title: 'Mã lệnh', dataIndex: 'command_id', key: 'command_id' },
    { 
      title: 'Thiết bị', 
      dataIndex: 'device_id', 
      key: 'device_id',
      render: (devId: number) => {
        const dev = devices?.find(d => d.id === devId);
        return dev ? `${dev.name}` : `Thiết bị #${devId}`;
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>Lịch sử lệnh</h2>
        <Space>
          <Select
            style={{ width: 200 }}
            placeholder="Lọc theo thiết bị"
            allowClear
            value={selectedDeviceId}
            onChange={setSelectedDeviceId}
            options={devices?.map(d => ({ label: d.name, value: d.id }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
        </Space>
      </div>

      <Table 
        columns={columns} 
        dataSource={selectedDeviceId ? commands : []} // Tạm thời chỉ hiện khi chọn device nếu API yêu cầu
        rowKey="id" 
        loading={isLoading} 
        locale={{ emptyText: !selectedDeviceId ? 'Vui lòng chọn thiết bị' : 'Không có dữ liệu' }}
      />
    </div>
  );
};
