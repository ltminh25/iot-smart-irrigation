import React, { useState } from 'react';
import { Table, Badge, Button, Select, Space } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { commandsApi } from '../api/commands';
import { devicesApi } from '../api/devices';

export const CommandHistory: React.FC = () => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | undefined>(undefined);

  const { data: devices } = useQuery({
    queryKey: ['devices'],
    queryFn: devicesApi.list,
  });

  const { data: commands, isLoading, refetch } = useQuery({
    queryKey: ['commands', selectedDeviceId],
    queryFn: () => commandsApi.list(selectedDeviceId || 0), // Nếu API cần device_id, có thể gửi null or 0 tùy backend. Ở đây dùng 0 giả định là tất cả hoặc cần handle lại bên api
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

  const columns = [
    { title: 'Mã lệnh', dataIndex: 'command_id', key: 'command_id' },
    { title: 'Thiết bị ID', dataIndex: 'device_id', key: 'device_id' },
    { title: 'Hành động', dataIndex: 'action', key: 'action' },
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
      render: (val: string) => dayjs(val).format('DD/MM/YYYY HH:mm:ss')
    },
    { 
      title: 'Thời gian thực thi', 
      dataIndex: 'executed_at', 
      key: 'executed_at',
      render: (val: string) => val ? dayjs(val).format('DD/MM/YYYY HH:mm:ss') : '-'
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
