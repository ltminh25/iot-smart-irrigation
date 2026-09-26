import React, { useEffect, useState } from 'react';
import { Row, Col, Select, Badge, Card, List, Button, message, Space, Typography } from 'antd';
import { BulbOutlined, ExperimentOutlined, CloudOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { devicesApi } from '../api/devices';
import { telemetryApi } from '../api/telemetry';
import { alertsApi } from '../api/alerts';
import { commandsApi } from '../api/commands';
import { SensorCard } from '../components/SensorCard';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAuthStore } from '../store/authStore';

export const Dashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);

  const { data: devices } = useQuery({
    queryKey: ['devices'],
    queryFn: devicesApi.list,
  });

  useEffect(() => {
    if (devices && devices.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(devices[0].id);
    }
  }, [devices, selectedDeviceId]);

  const { data: initialTelemetry } = useQuery({
    queryKey: ['telemetry', 'latest', selectedDeviceId],
    queryFn: () => telemetryApi.latest(selectedDeviceId!),
    enabled: !!selectedDeviceId,
  });

  const { data: alerts, refetch: refetchAlerts } = useQuery({
    queryKey: ['alerts', selectedDeviceId],
    queryFn: () => alertsApi.list({ device_id: selectedDeviceId!, status: 'open' }),
    enabled: !!selectedDeviceId,
  });

  const { lastMessage, isConnected } = useWebSocket(selectedDeviceId);
  const [realtimeTelemetry, setRealtimeTelemetry] = useState<Record<string, any>>({});
  const [deviceStatus, setDeviceStatus] = useState<string>('');

  useEffect(() => {
    if (initialTelemetry) {
      setRealtimeTelemetry(initialTelemetry);
    }
  }, [initialTelemetry]);

  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'telemetry') {
        setRealtimeTelemetry(prev => ({
          ...prev,
          [lastMessage.data.sensor_type]: lastMessage.data
        }));
      } else if (lastMessage.type === 'alert') {
        refetchAlerts();
      } else if (lastMessage.type === 'device_status') {
        setDeviceStatus(lastMessage.data.status);
      }
    }
  }, [lastMessage, refetchAlerts]);

  const handleCommand = async (action: string) => {
    if (!selectedDeviceId) return;
    try {
      await commandsApi.send({ device_id: selectedDeviceId, action });
      message.success(`Đã gửi lệnh: ${action}`);
    } catch (error) {
      message.error(`Lỗi gửi lệnh: ${action}`);
    }
  };

  const selectedDevice = devices?.find(d => d.id === selectedDeviceId);
  const currentStatus = deviceStatus || selectedDevice?.status || 'offline';
  const canControl = user?.role === 'admin' || selectedDevice?.owner_id === user?.id;

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <h2>Dashboard</h2>
        </Col>
        <Col>
          <Space>
            <Badge status={currentStatus === 'active' ? 'success' : 'error'} text={currentStatus.toUpperCase()} />
            <Badge status={isConnected ? 'success' : 'default'} text={isConnected ? 'WS Connected' : 'WS Disconnected'} />
            <Select
              style={{ width: 200 }}
              placeholder="Chọn thiết bị"
              value={selectedDeviceId}
              onChange={setSelectedDeviceId}
              options={devices?.map(d => ({ label: d.name, value: d.id }))}
            />
          </Space>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <SensorCard 
            title="Ánh sáng" 
            value={realtimeTelemetry['light']?.value || 0} 
            unit="lux" 
            icon={<BulbOutlined />} 
            color="#faad14" 
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <SensorCard 
            title="Độ ẩm đất" 
            value={realtimeTelemetry['soil']?.value || 0} 
            unit="%" 
            icon={<ExperimentOutlined />} 
            color="#8c4356" 
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <SensorCard 
            title="Nhiệt độ" 
            value={realtimeTelemetry['air_temp']?.value || 0} 
            unit="°C" 
            icon={<CloudOutlined />} 
            color="#f5222d" 
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <SensorCard 
            title="Lượng mưa" 
            value={realtimeTelemetry['rain']?.value || 0} 
            unit="mm" 
            icon={<CloudOutlined />} 
            color="#096dd9" 
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} md={16}>
          <Card title="Quick Controls" extra={!canControl && <span style={{color: 'red'}}>Chỉ xem</span>}>
            <Space size="large" wrap>
              <Button type="primary" onClick={() => handleCommand('PUMP_ON')} disabled={!canControl}>Bật bơm</Button>
              <Button danger onClick={() => handleCommand('PUMP_OFF')} disabled={!canControl}>Tắt bơm</Button>
              <Button type="default" onClick={() => handleCommand('ROOF_OPEN')} disabled={!canControl}>Mở mái che</Button>
              <Button type="default" onClick={() => handleCommand('ROOF_CLOSE')} disabled={!canControl}>Đóng mái che</Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Alerts (Open)">
            <List
              dataSource={alerts || []}
              renderItem={(alert) => (
                <List.Item>
                  <Typography.Text type={alert.severity === 'critical' ? 'danger' : 'warning'}>
                    [{alert.severity.toUpperCase()}]
                  </Typography.Text> {alert.message}
                </List.Item>
              )}
              locale={{ emptyText: 'Không có cảnh báo' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};
