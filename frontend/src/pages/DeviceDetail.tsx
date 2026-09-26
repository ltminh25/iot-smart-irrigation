import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Descriptions, Row, Col, DatePicker, Button, Table, Tabs, message } from 'antd';
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

  const { data: commands } = useQuery({
    queryKey: ['commands', deviceId],
    queryFn: () => commandsApi.list(deviceId),
    enabled: !!deviceId,
  });

  const { data: lifecycle } = useQuery({
    queryKey: ['lifecycle', deviceId],
    queryFn: () => devicesApi.getLifecycle(deviceId),
    enabled: !!deviceId,
  });

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
    { title: 'Action', dataIndex: 'action', key: 'action' },
    { title: 'Status', dataIndex: 'status', key: 'status' },
    { title: 'Issued At', dataIndex: 'issued_at', key: 'issued_at', render: (val: string) => dayjs(val).format('DD/MM/YYYY HH:mm:ss') },
  ];

  const lifecycleColumns = [
    { title: 'From', dataIndex: 'from_state', key: 'from_state' },
    { title: 'To', dataIndex: 'to_state', key: 'to_state' },
    { title: 'Time', dataIndex: 'timestamp', key: 'timestamp', render: (val: string) => dayjs(val).format('DD/MM/YYYY HH:mm:ss') },
  ];

  const getTelemetryByType = (type: string) => telemetry?.filter(t => t.sensor_type === type) || [];

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title="Thông tin thiết bị">
            <Descriptions bordered column={{ xxl: 4, xl: 3, lg: 3, md: 3, sm: 2, xs: 1 }}>
              <Descriptions.Item label="Tên">{device?.name}</Descriptions.Item>
              <Descriptions.Item label="UID">{device?.device_uid}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái">{device?.status}</Descriptions.Item>
              <Descriptions.Item label="Vị trí">{device?.location}</Descriptions.Item>
              <Descriptions.Item label="Firmware">{device?.firmware_version}</Descriptions.Item>
              <Descriptions.Item label="API Key">
                {user?.role === 'admin' || user?.id === device?.owner_id ? device?.api_key : '***'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col span={24}>
          <Card 
            title="Biểu đồ đo lường" 
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
            <Tabs defaultActiveKey="light">
              <Tabs.TabPane tab="Ánh sáng" key="light">
                <TelemetryChart data={getTelemetryByType('light')} sensorType="light" />
              </Tabs.TabPane>
              <Tabs.TabPane tab="Độ ẩm đất" key="soil">
                <TelemetryChart data={getTelemetryByType('soil')} sensorType="soil" />
              </Tabs.TabPane>
              <Tabs.TabPane tab="Nhiệt độ" key="air_temp">
                <TelemetryChart data={getTelemetryByType('air_temp')} sensorType="air_temp" />
              </Tabs.TabPane>
            </Tabs>
          </Card>
        </Col>

        <Col span={12}>
          <Card title="Lịch sử lệnh">
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
