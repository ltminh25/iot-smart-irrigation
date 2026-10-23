import React, { useEffect, useState } from 'react';
import { Row, Col, Select, Badge, Card, List, Button, message, Space, Typography, Tag } from 'antd';
import { BulbOutlined, ExperimentOutlined,ThunderboltOutlined } from '@ant-design/icons';
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
      const esp8266Device = devices.find(d => d.device_uid === 'esp8266-plant-01');
      setSelectedDeviceId(esp8266Device ? esp8266Device.id : devices[0].id);
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
  const [lastCmdStatus, setLastCmdStatus] = useState<string>('');

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
      } else if (lastMessage.type === 'command_ack') {
        setLastCmdStatus(`${lastMessage.data.action}: ${lastMessage.data.status.toUpperCase()}`);
      }
    }
  }, [lastMessage, refetchAlerts]);

  const handleCommand = async (action: string, label: string) => {
    if (!selectedDeviceId) return;
    try {
      await commandsApi.send({ device_id: selectedDeviceId, action });
      message.success(`Đã gửi lệnh: ${label} (${action})`);
    } catch (error) {
      message.error(`Lỗi gửi lệnh: ${label}`);
    }
  };

  const selectedDevice = devices?.find(d => d.id === selectedDeviceId);
  const currentStatus = deviceStatus || selectedDevice?.status || 'offline';
  const canControl = user?.role === 'admin' || (user?.role === 'owner' && (selectedDevice?.owner_id === user?.id || selectedDevice?.device_uid === 'esp8266-plant-01'));

  const soilValue = realtimeTelemetry['soil']?.value ?? 0;
  const lightValue = realtimeTelemetry['light']?.value ?? 0;

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <h2 style={{ margin: 0 }}>Dashboard Giám Sát & Điều Khiển (ESP8266)</h2>
          <Typography.Text type="secondary">
            Phần cứng: Cảm biến độ ẩm đất (A0) + Ánh sáng BH1750 (D1/D2) + Relay Bơm (D5) + Servo Mái che (D6)
          </Typography.Text>
        </Col>
        <Col>
          <Space>
            <Badge status={currentStatus === 'active' ? 'success' : 'error'} text={currentStatus.toUpperCase()} />
            <Badge status={isConnected ? 'success' : 'default'} text={isConnected ? 'WS Connected' : 'WS Disconnected'} />
            <Select
              style={{ width: 260 }}
              placeholder="Chọn thiết bị"
              value={selectedDeviceId}
              onChange={setSelectedDeviceId}
              options={devices?.map(d => ({ label: `${d.name} (${d.device_uid})`, value: d.id }))}
            />
          </Space>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={12}>
          <SensorCard 
            title="Độ ẩm đất (A0 - LM393)" 
            value={soilValue} 
            unit="%" 
            icon={<ExperimentOutlined />} 
            color={soilValue < 30 ? '#f5222d' : '#52c41a'} 
          />
          <div style={{ marginTop: 8 }}>
            {soilValue < 30 ? (
              <Tag color="error">Đất khô (&lt; 30%) - Tự động bật bơm 5s</Tag>
            ) : (
              <Tag color="success">Độ ẩm đất ổn định (≥ 30%)</Tag>
            )}
          </div>
        </Col>
        <Col xs={24} sm={12} md={12}>
          <SensorCard 
            title="Cường độ ánh sáng (BH1750 - I2C 0x23)" 
            value={lightValue} 
            unit="lux" 
            icon={<BulbOutlined />} 
            color={lightValue > 7500 ? '#fa541c' : '#faad14'} 
          />
          <div style={{ marginTop: 8 }}>
            {lightValue > 7500 ? (
              <Tag color="warning">Nắng gắt (&gt; 7500 lux) - Tự động đóng mái che (120°)</Tag>
            ) : (
              <Tag color="processing">Ánh sáng bình thường (≤ 7500 lux)</Tag>
            )}
          </div>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} md={14}>
          <Card
            title={<Space><ThunderboltOutlined /> Điều khiển thủ công (Bơm &amp; Servo Mái che)</Space>}
            extra={!canControl ? <Tag color="red">Chế độ Chỉ xem (Viewer)</Tag> : (lastCmdStatus && <Tag color="blue">{lastCmdStatus}</Tag>)}
          >
            <Space size="middle" wrap>
              <Button type="primary" onClick={() => handleCommand('pump_on', 'Bật bơm 5s')} disabled={!canControl}>
                Bật bơm (5s) [D5]
              </Button>
              <Button danger onClick={() => handleCommand('pump_off', 'Tắt bơm')} disabled={!canControl}>
                Tắt bơm [D5]
              </Button>
              <Button type="default" onClick={() => handleCommand('curtain_open', 'Mở mái che 60°')} disabled={!canControl}>
                Mở mái che (60°) [D6]
              </Button>
              <Button type="default" onClick={() => handleCommand('curtain_close', 'Đóng mái che 120°')} disabled={!canControl}>
                Đóng mái che (120°) [D6]
              </Button>
            </Space>
            <div style={{ marginTop: 16 }}>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                • <b>Relay Bơm (D5)</b>: Dùng cơ chế thả nổi (Bật: OUTPUT + LOW, Tắt: INPUT) bảo vệ opto 5V.<br />
                • <b>Servo Mái che (D6)</b>: Mở góc 60°, Đóng góc 120°, tự động <code>detach()</code> sau 650ms để chống rung &amp; sụt áp.
              </Typography.Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title="Cảnh báo đang mở (Alerts)">
            <List
              dataSource={alerts || []}
              renderItem={(alert) => (
                <List.Item>
                  <Typography.Text type={alert.severity === 'critical' ? 'danger' : 'warning'}>
                    [{alert.severity.toUpperCase()}]
                  </Typography.Text>{' '}
                  {alert.message}
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
