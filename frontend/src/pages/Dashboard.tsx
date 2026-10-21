import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Empty, List, message, Row, Select, Space, Tag, Typography } from 'antd';
import { ExperimentOutlined, ReloadOutlined, CloudOutlined, BulbOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { devicesApi } from '../api/devices';
import { telemetryApi } from '../api/telemetry';
import { alertsApi } from '../api/alerts';
import { commandsApi } from '../api/commands';
import { SensorCard } from '../components/SensorCard';
import { TelemetryChart } from '../components/TelemetryChart';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAuthStore } from '../store/authStore';
import type { Command, Telemetry } from '../types';

interface SensorReading { value: number; timestamp?: string; unit?: string; }
const statusLabel: Record<string, string> = {
  registered: 'Đã đăng ký', provisioned: 'Đã cấu hình', active: 'Đang hoạt động',
  offline: 'Ngoại tuyến', fault: 'Có lỗi', maintenance: 'Bảo trì', decommissioned: 'Đã ngừng',
};
const commandLabel = (status: string) => {
  if (status === 'executed') return <Tag color="success">Đã xác nhận thực thi</Tag>;
  if (status === 'failed') return <Tag color="error">Thất bại</Tag>;
  if (status === 'pending') return <Tag color="processing">Đang chờ ACK</Tag>;
  return <Tag>{status}</Tag>;
};

export const Dashboard: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [realtimeTelemetry, setRealtimeTelemetry] = useState<Record<string, SensorReading>>({});
  const [sendingAction, setSendingAction] = useState<string | null>(null);

  const { data: devices = [], isLoading: devicesLoading, isError: devicesError, refetch: refetchDevices } = useQuery({
    queryKey: ['devices'], queryFn: devicesApi.list,
  });

  useEffect(() => {
    if (devices.length && (selectedDeviceId === null || !devices.some(device => device.id === selectedDeviceId))) {
      setSelectedDeviceId(devices[0].id);
    }
    if (!devices.length) setSelectedDeviceId(null);
  }, [devices, selectedDeviceId]);

  useEffect(() => { setRealtimeTelemetry({}); }, [selectedDeviceId]);

  const { data: latestTelemetry = {}, isLoading: telemetryLoading } = useQuery<Record<string, SensorReading>>({
    queryKey: ['telemetry', 'latest', selectedDeviceId],
    queryFn: () => telemetryApi.latest(selectedDeviceId!), enabled: selectedDeviceId !== null,
    refetchInterval: 15000,
  });
  useEffect(() => { setRealtimeTelemetry(previous => ({ ...latestTelemetry, ...previous })); }, [latestTelemetry]);

  const { data: soilHistory = [], isLoading: historyLoading } = useQuery<Telemetry[]>({
    queryKey: ['telemetry-history', selectedDeviceId, 'soil'],
    queryFn: () => telemetryApi.list({ device_id: selectedDeviceId!, type: 'soil', limit: 100 }),
    enabled: selectedDeviceId !== null, refetchInterval: 15000,
  });
  const { data: alerts = [], refetch: refetchAlerts } = useQuery({
    queryKey: ['alerts', selectedDeviceId, 'open'],
    queryFn: () => alertsApi.list({ device_id: selectedDeviceId!, status: 'open' }),
    enabled: selectedDeviceId !== null, refetchInterval: 30000,
  });
  const { data: commands = [], refetch: refetchCommands } = useQuery<Command[]>({
    queryKey: ['commands', selectedDeviceId], queryFn: () => commandsApi.list(selectedDeviceId!),
    enabled: selectedDeviceId !== null && (user?.role === 'admin' || user?.role === 'owner'),
    refetchInterval: query => query.state.data?.some(command => command.status === 'pending') ? 3000 : 10000,
  });
  const { lastMessage, isConnected } = useWebSocket(selectedDeviceId);

  useEffect(() => {
    if (!lastMessage) return;
    const data = lastMessage.data as { sensor_type?: string; value?: number; timestamp?: string; unit?: string };
    if (lastMessage.type === 'telemetry' && data.sensor_type && typeof data.value === 'number') {
      setRealtimeTelemetry(previous => ({ ...previous, [data.sensor_type!]: { value: data.value!, timestamp: data.timestamp, unit: data.unit } }));
      if (data.sensor_type === 'soil') void queryClient.invalidateQueries({ queryKey: ['telemetry-history', selectedDeviceId, 'soil'] });
    } else if (lastMessage.type === 'alert') {
      void refetchAlerts();
    } else if (lastMessage.type === 'command_status') {
      void refetchCommands();
    }
  }, [lastMessage, queryClient, selectedDeviceId, refetchAlerts, refetchCommands]);

  const selectedDevice = devices.find(device => device.id === selectedDeviceId);
  const sensorValues = useMemo(() => ({ ...latestTelemetry, ...realtimeTelemetry }), [latestTelemetry, realtimeTelemetry]);
  const canControl = (user?.role === 'admin' || user?.role === 'owner') &&
    (user?.role === 'admin' || selectedDevice?.owner_id === user?.id);

  const handlePumpCommand = async (action: 'pump_on' | 'pump_off') => {
    if (selectedDeviceId === null) return;
    setSendingAction(action);
    try {
      const command = await commandsApi.send({ device_id: selectedDeviceId, action });
      await queryClient.invalidateQueries({ queryKey: ['commands', selectedDeviceId] });
      if (command.status === 'executed') message.success('Thiết bị đã xác nhận thực thi lệnh.');
      else if (command.status === 'failed') message.error('Thiết bị báo lệnh thất bại.');
      else message.info('Đã gửi yêu cầu. Hệ thống đang chờ ACK từ thiết bị; chưa xác nhận bơm đã chạy.');
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.error(detail || 'Không gửi được lệnh. Hãy kiểm tra quyền, Backend và kết nối MQTT.');
    } finally { setSendingAction(null); }
  };

  if (devicesError) return <Alert type="error" showIcon message="Không tải được thiết bị" description="Kiểm tra Backend tại cổng 8001 và đăng nhập lại nếu phiên làm việc đã hết hạn." />;

  const status = selectedDevice?.status || 'offline';
  const soilValue = sensorValues.soil?.value;
  const soilDry = typeof soilValue === 'number' && soilValue < 30;
  const recentCommands = [...commands].sort((a, b) => +new Date(b.issued_at) - +new Date(a.issued_at)).slice(0, 5);

  return (
    <div className="dashboard-page">
      <Row justify="space-between" align="middle" gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col><Typography.Title level={3} style={{ margin: 0 }}>Tổng quan giám sát</Typography.Title><Typography.Text type="secondary">Theo dõi độ ẩm đất và điều khiển máy bơm</Typography.Text></Col>
        <Col><Space wrap>
          <Badge status={status === 'active' ? 'success' : status === 'offline' ? 'error' : 'default'} text={statusLabel[status] || status} />
          <Badge status={isConnected ? 'success' : 'error'} text={isConnected ? 'Realtime đang kết nối' : 'Realtime mất kết nối'} />
          <Select style={{ minWidth: 220 }} placeholder="Chọn thiết bị" loading={devicesLoading} value={selectedDeviceId ?? undefined}
            onChange={setSelectedDeviceId} options={devices.map(device => ({ label: `${device.name} · ${device.device_uid}`, value: device.id }))}
            notFoundContent="Chưa có thiết bị" />
          <Button icon={<ReloadOutlined />} onClick={() => { void refetchDevices(); void queryClient.invalidateQueries({ queryKey: ['telemetry'] }); }}>Làm mới</Button>
        </Space></Col>
      </Row>

      {!devicesLoading && devices.length === 0 && <Card><Empty description="Tài khoản chưa có thiết bị. Vào mục Thiết bị để đăng ký hoặc liên hệ quản trị viên." /></Card>}
      {soilDry && <Alert style={{ marginBottom: 16 }} type="warning" showIcon message="Độ ẩm đất thấp" description={`Độ ẩm hiện tại ${soilValue}% thấp hơn ngưỡng tham khảo 30%. Hãy kiểm tra cây và quy tắc tưới tự động.`} />}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}><SensorCard title="Độ ẩm đất" value={typeof soilValue === 'number' ? soilValue : '—'} unit="%" icon={<ExperimentOutlined />} color={soilDry ? '#cf1322' : '#20845a'} /></Col>
        <Col xs={24} sm={12} lg={6}><SensorCard title="Ánh sáng" value={typeof sensorValues.light?.value === 'number' ? sensorValues.light.value : '—'} unit="lux" icon={<BulbOutlined />} color="#d48806" /></Col>
        <Col xs={24} sm={12} lg={6}><SensorCard title="Nhiệt độ" value={typeof sensorValues.air_temp?.value === 'number' ? sensorValues.air_temp.value : '—'} unit="°C" icon={<CloudOutlined />} color="#cf1322" /></Col>
        <Col xs={24} sm={12} lg={6}><SensorCard title="Độ ẩm không khí" value={typeof sensorValues.air_humidity?.value === 'number' ? sensorValues.air_humidity.value : '—'} unit="%" icon={<CloudOutlined />} color="#1677ff" /></Col>
      </Row>
      {telemetryLoading && selectedDeviceId !== null && <Typography.Text type="secondary">Đang tải số đo cảm biến...</Typography.Text>}
      {soilValue !== undefined && sensorValues.soil?.timestamp && <Typography.Text type="secondary">Số đo đất gần nhất: {dayjs(sensorValues.soil.timestamp).format('DD/MM/YYYY HH:mm:ss')}</Typography.Text>}

      <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
        <Col xs={24} xl={15}><Card title="Lịch sử độ ẩm đất" extra={<Button type="link" onClick={() => void queryClient.invalidateQueries({ queryKey: ['telemetry-history', selectedDeviceId, 'soil'] })}>Cập nhật biểu đồ</Button>}>
          <div aria-busy={historyLoading}><TelemetryChart data={soilHistory} sensorType="soil" height={280} /></div>
        </Card></Col>
        <Col xs={24} xl={9}><Card title="Điều khiển máy bơm" extra={!canControl && <Tag color="default">Chỉ xem</Tag>}>
          <Typography.Paragraph type="secondary">Lệnh chỉ được xem là hoàn tất khi Backend nhận ACK từ thiết bị.</Typography.Paragraph>
          <Space wrap>
            <Button type="primary" loading={sendingAction === 'pump_on'} onClick={() => void handlePumpCommand('pump_on')} disabled={!canControl || status !== 'active' || sendingAction !== null}>Bật bơm</Button>
            <Button danger loading={sendingAction === 'pump_off'} onClick={() => void handlePumpCommand('pump_off')} disabled={!canControl || status !== 'active' || sendingAction !== null}>Tắt bơm</Button>
          </Space>
          {status !== 'active' && <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>Thiết bị chưa ở trạng thái hoạt động; điều khiển đang bị khóa.</Typography.Paragraph>}
        </Card></Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
        <Col xs={24} lg={12}><Card title="Cảnh báo đang mở"><List dataSource={alerts} locale={{ emptyText: 'Không có cảnh báo đang mở' }} renderItem={alert => <List.Item><Space align="start"><Tag color={alert.severity === 'critical' ? 'red' : alert.severity === 'warning' ? 'orange' : 'blue'}>{alert.severity.toUpperCase()}</Tag><span>{alert.message}</span></Space></List.Item>} /></Card></Col>
        <Col xs={24} lg={12}><Card title="Trạng thái lệnh gần đây" extra={<Button type="link" onClick={() => void refetchCommands()}>Cập nhật</Button>}><List dataSource={recentCommands} locale={{ emptyText: 'Chưa có lệnh hoặc tài khoản chỉ có quyền xem' }} renderItem={command => <List.Item><List.Item.Meta title={command.action} description={`Mã lệnh: ${command.command_id}`} />{commandLabel(command.status)}</List.Item>} /></Card></Col>
      </Row>
    </div>
  );
};
