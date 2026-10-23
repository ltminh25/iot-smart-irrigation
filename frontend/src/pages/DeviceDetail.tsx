import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Descriptions, Row, Col, DatePicker, Button, Table, Tabs, message, Space, Tag } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { devicesApi } from '../api/devices';
import { telemetryApi } from '../api/telemetry';
import { commandsApi } from '../api/commands';
import { TelemetryChart } from '../components/TelemetryChart';
import { useAuthStore } from '../store/authStore';

const { RangePicker } = DatePicker;

export const DeviceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const deviceId = parseInt(id || '0');
  const { user } = useAuthStore();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().subtract(1, 'day'), dayjs()]);

  const { data: device } = useQuery({
    queryKey: ['device', deviceId],
    queryFn: () => devicesApi.get(deviceId),
    enabled: !!deviceId,
  });

  const { data: telemetry } = useQuery({
    queryKey: ['telemetry', deviceId, dateRange[0].toISOString(), dateRange[1].toISOString()],
    queryFn: () => telemetryApi.list({ 
      device_id: deviceId, 
      from: dateRange[0].toISOString(), 
      to: dateRange[1].toISOString(),
      limit: 1000
    }),
    enabled: !!deviceId,
  });

  const { data: commands, refetch: refetchCommands } = useQuery({
    queryKey: ['commands', deviceId],
    queryFn: () => commandsApi.list(deviceId),
    enabled: !!deviceId,
  });

  const { data: lifecycle } = useQuery({
    queryKey: ['lifecycle', deviceId],
    queryFn: () => devicesApi.getLifecycle(deviceId),
    enabled: !!deviceId,
  });

  const canControl = user?.role === 'admin' || (user?.role === 'owner' && (device?.owner_id === user?.id || device?.device_uid === 'esp8266-plant-01'));

  const handleCommand = async (action: string, label: string) => {
    if (!deviceId) return;
    try {
      await commandsApi.send({ device_id: deviceId, action });
      message.success(`Đã gửi lệnh: ${label}`);
      refetchCommands();
    } catch (error) {
      message.error(`Lỗi gửi lệnh: ${label}`);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await telemetryApi.export({
        device_id: deviceId,
        from: dateRange[0].toISOString(),
        to: dateRange[1].toISOString(),
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `telemetry_${deviceId}_${dayjs().format('YYYYMMDD')}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      message.error('Export thất bại');
    }
  };

  const commandColumns = [
    { title: 'ID', dataIndex: 'command_id', key: 'command_id' },
    { title: 'Lệnh', dataIndex: 'action', key: 'action' },
    { 
      title: 'Trạng thái', 
      dataIndex: 'status', 
      key: 'status',
      render: (val: string) => (
        <Tag color={val === 'executed' ? 'green' : val === 'pending' ? 'blue' : 'red'}>
          {val.toUpperCase()}
        </Tag>
      )
    },
    { title: 'Thời gian gửi', dataIndex: 'issued_at', key: 'issued_at', render: (val: string) => dayjs(val).format('DD/MM/YYYY HH:mm:ss') },
  ];

  const lifecycleColumns = [
    { title: 'Từ', dataIndex: 'from_state', key: 'from_state' },
    { title: 'Sang', dataIndex: 'to_state', key: 'to_state' },
    { title: 'Thời gian', dataIndex: 'timestamp', key: 'timestamp', render: (val: string) => dayjs(val).format('DD/MM/YYYY HH:mm:ss') },
  ];

  const getTelemetryByType = (type: string) => telemetry?.filter(t => t.sensor_type === type) || [];

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card
            title="Thông tin thiết bị & Điều khiển"
            extra={
              <Space wrap>
                <Button type="primary" size="small" onClick={() => handleCommand('pump_on', 'Bật bơm (5s)')} disabled={!canControl}>
                  Bật bơm (5s)
                </Button>
                <Button danger size="small" onClick={() => handleCommand('pump_off', 'Tắt bơm')} disabled={!canControl}>
                  Tắt bơm
                </Button>
                <Button size="small" onClick={() => handleCommand('curtain_open', 'Mở mái che (60°)')} disabled={!canControl}>
                  Mở mái che (60°)
                </Button>
                <Button size="small" onClick={() => handleCommand('curtain_close', 'Đóng mái che (120°)')} disabled={!canControl}>
                  Đóng mái che (120°)
                </Button>
              </Space>
            }
          >
            <Descriptions bordered column={{ xxl: 4, xl: 3, lg: 3, md: 3, sm: 2, xs: 1 }}>
              <Descriptions.Item label="Tên">{device?.name}</Descriptions.Item>
              <Descriptions.Item label="UID">{device?.device_uid}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái">{device?.status}</Descriptions.Item>
              <Descriptions.Item label="Vị trí">{device?.location}</Descriptions.Item>
              <Descriptions.Item label="Firmware">{device?.firmware_version || '1.0.0'}</Descriptions.Item>
              <Descriptions.Item label="API Key">
                {user?.role === 'admin' || user?.id === device?.owner_id ? device?.api_key : '***'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col span={24}>
          <Card 
            title="Biểu đồ đo lường (Độ ẩm đất & Ánh sáng BH1750)" 
            extra={
              <div style={{ display: 'flex', gap: 16 }}>
                <RangePicker 
                  value={dateRange} 
                  onChange={(dates) => { if(dates && dates[0] && dates[1]) setDateRange([dates[0], dates[1]]) }} 
                  showTime 
                />
                <Button icon={<DownloadOutlined />} onClick={handleExport}>Export CSV</Button>
              </div>
            }
          >
            <Tabs
              defaultActiveKey="soil"
              items={[
                {
                  key: 'soil',
                  label: 'Độ ẩm đất (%) - Chân A0',
                  children: <TelemetryChart data={getTelemetryByType('soil')} sensorType="soil" />,
                },
                {
                  key: 'light',
                  label: 'Cường độ ánh sáng (lux) - BH1750 (D1/D2)',
                  children: <TelemetryChart data={getTelemetryByType('light')} sensorType="light" />,
                },
              ]}
            />
          </Card>
        </Col>

        <Col span={12}>
          <Card title="Lịch sử lệnh điều khiển">
            <Table dataSource={commands} columns={commandColumns} rowKey="id" size="small" pagination={{ pageSize: 5 }} />
          </Card>
        </Col>

        <Col span={12}>
          <Card title="Vòng đời thiết bị">
            <Table dataSource={lifecycle} columns={lifecycleColumns} rowKey="id" size="small" pagination={{ pageSize: 5 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};
