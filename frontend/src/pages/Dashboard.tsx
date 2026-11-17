import React, { useCallback, useState } from 'react';
import { Row, Col, Select, Badge, Card, List, Button, message, Space, Typography, Tag, notification, Switch, Tooltip, Modal, Tabs, DatePicker } from 'antd';
import { BulbOutlined, ExperimentOutlined, ThunderboltOutlined, LockOutlined, UnlockOutlined, ToolOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { devicesApi } from '../api/devices';
import { telemetryApi } from '../api/telemetry';
import { alertsApi } from '../api/alerts';
import { commandsApi } from '../api/commands';
import { SensorCard } from '../components/SensorCard';
import { TelemetryChart } from '../components/TelemetryChart';
import { useWebSocket } from '../hooks/useWebSocket';
import type { DeviceMessage } from '../hooks/useWebSocket';
import { useAuthStore } from '../store/authStore';
import type { Device, Telemetry } from '../types';

const { RangePicker } = DatePicker;

export const Dashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [requestedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().subtract(1, 'day'), dayjs()]);

  const { data: devices } = useQuery({
    queryKey: ['devices'],
    queryFn: devicesApi.list,
    refetchInterval: 5000,
  });

  const selectedDevice = devices?.find(device => device.id === requestedDeviceId)
    ?? devices?.find(device => device.device_uid === 'esp8266-plant-01')
    ?? devices?.[0];
  const selectedDeviceId = selectedDevice?.id ?? null;

  const { data: realtimeTelemetry } = useQuery({
    queryKey: ['telemetry', 'latest', selectedDeviceId],
    queryFn: () => telemetryApi.latest(selectedDeviceId!),
    enabled: !!selectedDeviceId,
    refetchInterval: 3000,
  });

  const { data: historyTelemetry } = useQuery({
    queryKey: ['telemetry', selectedDeviceId, dateRange[0].toISOString(), dateRange[1].toISOString()],
    queryFn: () => telemetryApi.list({ 
      device_id: selectedDeviceId!, 
      from: dateRange[0].toISOString(), 
      to: dateRange[1].toISOString(),
      limit: 1000
    }),
    enabled: !!selectedDeviceId,
    refetchInterval: 10000,
  });

  const { data: alerts, refetch: refetchAlerts } = useQuery({
    queryKey: ['alerts', selectedDeviceId],
    queryFn: () => alertsApi.list({ device_id: selectedDeviceId!, status: 'open' }),
    enabled: !!selectedDeviceId,
    refetchInterval: 5000,
  });

  const [lastCommand, setLastCommand] = useState<{ deviceId: number | null; label: string } | null>(null);
  const lastCmdStatus = lastCommand?.deviceId === selectedDeviceId ? lastCommand.label : '';

  const updateDeviceStatus = useCallback((deviceId: number, status: string) => {
    queryClient.setQueryData<Device[]>(['devices'], previous =>
      previous?.map(device => device.id === deviceId ? { ...device, status } : device)
    );
    queryClient.invalidateQueries({ queryKey: ['devices'] });
  }, [queryClient]);

  // Toast thông báo (Notification) khi có cảnh báo mới qua WebSocket
  const handleDeviceMessage = useCallback((event: DeviceMessage) => {
    if (event.type === 'telemetry') {
      queryClient.setQueryData<Record<string, Telemetry>>(['telemetry', 'latest', event.data.device_id], prev => ({
        ...prev,
        [event.data.sensor_type]: event.data
      }));
    } else if (event.type === 'alert') {
      refetchAlerts();
      const severity = event.data?.severity || 'warning';
      const msg = event.data?.message || 'Có cảnh báo mới từ thiết bị!';
      if (severity === 'critical') {
        notification.error({
          message: '⚠️ CẢNH BÁO KHẨN CẤP',
          description: msg,
          placement: 'topRight',
          duration: 6,
        });
      } else {
        notification.warning({
          message: '🔔 Cảnh báo hệ thống',
          description: msg,
          placement: 'topRight',
          duration: 5,
        });
      }
    } else if (event.type === 'device_status') {
      updateDeviceStatus(event.data.device_id, event.data.status);
    } else if (event.type === 'device_lock') {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    } else if (event.type === 'command_ack') {
      setLastCommand({ deviceId: selectedDeviceId, label: `${event.data.action}: ${event.data.status.toUpperCase()}` });
    }
  }, [selectedDeviceId, refetchAlerts, queryClient, updateDeviceStatus]);
  const { isConnected } = useWebSocket(selectedDeviceId, handleDeviceMessage);

  const currentStatus = selectedDevice?.status || 'offline';
  const isMaintenance = currentStatus === 'maintenance';
  const isDecommissioned = currentStatus === 'decommissioned';
  const isAdmin = user?.role === 'admin';
  const isStaff = user?.role === 'viewer';
  
  // Khi bảo trì, chỉ admin có quyền điều khiển.
  const canOperateDevice = !!selectedDevice && !isDecommissioned && (isAdmin || !isMaintenance);

  const lockMutation = useMutation({
    mutationFn: (data: { pump_locked?: boolean; curtain_locked?: boolean }) => 
      devicesApi.updateLock(selectedDeviceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      message.success('Cập nhật trạng thái khóa thiết bị thành công');
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.detail || 'Lỗi cập nhật khóa');
    }
  });

  const maintenanceMutation = useMutation({
    mutationFn: (nextStatus: string) => devicesApi.updateStatus(selectedDeviceId!, nextStatus),
    onSuccess: (updated) => {
      updateDeviceStatus(updated.id, updated.status);
      message.success(`Đã chuyển chế độ: ${updated.status.toUpperCase()}`);
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.detail || 'Lỗi cập nhật chế độ bảo trì');
    }
  });

  const handleCommand = async (action: string, label: string) => {
    if (!selectedDeviceId || !canOperateDevice) return;
    try {
      await commandsApi.send({ device_id: selectedDeviceId, action });
      message.success(`Đã gửi lệnh: ${label} (${action})`);
    } catch (error: any) {
      const errDetail = error?.response?.data?.detail;
      if (error?.response?.status === 403) {
        Modal.error({
          title: 'Quyền bị từ chối (403 Forbidden)',
          content: errDetail || 'Thiết bị này đã bị Admin khóa hoặc đang trong chế độ bảo trì. Bạn không thể điều khiển.',
        });
      } else {
        message.error(`Lỗi gửi lệnh: ${errDetail || label}`);
      }
    }
  };

  const handleExport = async () => {
    if (!selectedDeviceId) return;
    try {
      const blob = await telemetryApi.export({
        device_id: selectedDeviceId,
        from: dateRange[0].toISOString(),
        to: dateRange[1].toISOString(),
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `telemetry_${selectedDeviceId}_${dayjs().format('YYYYMMDD')}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      message.error('Export thất bại');
    }
  };

  const soilValue = realtimeTelemetry?.soil?.value ?? 0;
  const lightValue = realtimeTelemetry?.light?.value ?? 0;

  const isPumpLockedForStaff = isStaff && !!selectedDevice?.pump_locked;
  const isCurtainLockedForStaff = isStaff && !!selectedDevice?.curtain_locked;

  const getTelemetryByType = (type: string) => historyTelemetry?.filter(t => t.sensor_type === type) || [];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col>
          <h2 style={{ margin: 0 }}>Dashboard Giám Sát & Điều Khiển (ESP8266)</h2>
          <Typography.Text type="secondary">
            Phần cứng: Cảm biến độ ẩm đất (A0) + Ánh sáng BH1750 (D1/D2) + Relay Bơm (D5) + Servo Mái che (D6)
          </Typography.Text>
        </Col>
        <Col>
          <Space wrap align="center">
            {/* Nút Bật/Tắt Chế độ bảo trì */}
            {(isAdmin || user?.id === selectedDevice?.owner_id) && selectedDevice && (
              <Tooltip title={isMaintenance ? 'Tắt bảo trì để kích hoạt thiết bị' : 'Bật bảo trì để tạm khóa điều khiển nhân viên'}>
                <Space style={{ background: '#fff', padding: '4px 10px', borderRadius: 6, border: '1px solid #d9d9d9' }}>
                  <ToolOutlined style={{ color: isMaintenance ? '#fa8c16' : '#8c8c8c' }} />
                  <Typography.Text style={{ fontSize: 13 }}>Bảo trì:</Typography.Text>
                  <Switch
                    checked={isMaintenance}
                    disabled={isDecommissioned}
                    loading={maintenanceMutation.isPending}
                    onChange={(checked) => maintenanceMutation.mutate(checked ? 'maintenance' : 'active')}
                  />
                </Space>
              </Tooltip>
            )}

            <Badge 
              status={currentStatus === 'active' ? 'success' : currentStatus === 'maintenance' ? 'warning' : 'error'} 
              text={currentStatus.toUpperCase()} 
            />
            <Badge status={isConnected ? 'success' : 'default'} text={isConnected ? 'WS Connected' : 'WS Disconnected'} />
            <Select
              style={{ width: 260 }}
              placeholder="Chọn thiết bị"
              value={selectedDeviceId}
              onChange={(id) => {
                setSelectedDeviceId(id);
                queryClient.invalidateQueries({ queryKey: ['devices'] });
              }}
              options={devices?.map(d => ({ label: `${d.name} (${d.device_uid})`, value: d.id }))}
            />
          </Space>
        </Col>
      </Row>

      {/* Thông báo chế độ bảo trì nếu đang bảo trì */}
      {isMaintenance && (
        <Card style={{ marginBottom: 16, background: '#fffbe6', borderColor: '#ffe58f' }}>
          <Space>
            <ToolOutlined style={{ fontSize: 20, color: '#fa8c16' }} />
            <div>
              <Typography.Text strong style={{ color: '#d46b08' }}>
                Thiết bị đang trong CHẾ ĐỘ BẢO TRÌ (Maintenance Mode)
              </Typography.Text>
              <div style={{ color: '#873800', fontSize: 13 }}>
                Nhân viên (Staff) sẽ không thể gửi lệnh điều khiển bơm hoặc mái che trong thời gian bảo trì. Chỉ Admin mới có thể thao tác.
              </div>
            </div>
          </Space>
        </Card>
      )}

      {/* 2 CARD CẢM BIẾN REALTIME */}
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

      {/* BẢNG ĐIỀU KHIỂN & CẢNH BÁO */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} md={14}>
          <Card
            title={
              <Space>
                <ThunderboltOutlined />
                <span>Điều khiển máy bơm &amp; Mái che</span>
              </Space>
            }
            extra={
              <Space>
                {lastCmdStatus && <Tag color="blue">{lastCmdStatus}</Tag>}
                {isStaff && <Tag color="cyan">Vai trò: Nhân viên (Staff)</Tag>}
              </Space>
            }
          >
            {/* KHU VỰC KHÓA DÀNH CHO ADMIN */}
            {isAdmin && selectedDevice && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fafafa', borderRadius: 8, border: '1px dashed #d9d9d9' }}>
                <Typography.Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
                  🔒 Phân quyền khóa thiết bị đối với Nhân viên (Staff / Viewer):
                </Typography.Text>
                <Space size="large" wrap>
                  <Space>
                    <span>Máy bơm:</span>
                    <Button 
                      size="small" 
                      type={selectedDevice.pump_locked ? 'primary' : 'default'}
                      danger={selectedDevice.pump_locked}
                      icon={selectedDevice.pump_locked ? <LockOutlined /> : <UnlockOutlined />}
                      loading={lockMutation.isPending}
                      onClick={() => lockMutation.mutate({ pump_locked: !selectedDevice.pump_locked })}
                    >
                      {selectedDevice.pump_locked ? 'Đang Khóa Bơm (Nhấn để Mở)' : 'Đang Mở Bơm (Nhấn để Khóa)'}
                    </Button>
                  </Space>
                  <Space>
                    <span>Mái che:</span>
                    <Button 
                      size="small" 
                      type={selectedDevice.curtain_locked ? 'primary' : 'default'}
                      danger={selectedDevice.curtain_locked}
                      icon={selectedDevice.curtain_locked ? <LockOutlined /> : <UnlockOutlined />}
                      loading={lockMutation.isPending}
                      onClick={() => lockMutation.mutate({ curtain_locked: !selectedDevice.curtain_locked })}
                    >
                      {selectedDevice.curtain_locked ? 'Đang Khóa Mái Che (Nhấn để Mở)' : 'Đang Mở Mái Che (Nhấn để Khóa)'}
                    </Button>
                  </Space>
                </Space>
              </div>
            )}

            {/* CẢNH BÁO KHÓA CHO STAFF */}
            {isStaff && (
              <div style={{ marginBottom: 12 }}>
                {selectedDevice?.pump_locked ? (
                  <Tag color="error" icon={<LockOutlined />}>Máy bơm: Admin đang KHÓA đối với nhân viên</Tag>
                ) : (
                  <Tag color="success" icon={<UnlockOutlined />}>Máy bơm: Được phép điều khiển</Tag>
                )}
                {selectedDevice?.curtain_locked ? (
                  <Tag color="error" icon={<LockOutlined />}>Mái che: Admin đang KHÓA đối với nhân viên</Tag>
                ) : (
                  <Tag color="success" icon={<UnlockOutlined />}>Mái che: Được phép điều khiển</Tag>
                )}
              </div>
            )}

            {/* CÁC NÚT ĐIỀU KHIỂN BƠM & MÁI CHE */}
            <Space size="middle" wrap>
              <Tooltip title={isPumpLockedForStaff ? 'Admin đã khóa máy bơm đối với nhân viên' : ''}>
                <Button 
                  type="primary" 
                  onClick={() => handleCommand('pump_on', 'Bật bơm 5s')} 
                  disabled={!canOperateDevice || isPumpLockedForStaff}
                >
                  Bật bơm (5s) [D5]
                </Button>
              </Tooltip>

              <Tooltip title={isPumpLockedForStaff ? 'Admin đã khóa máy bơm đối với nhân viên' : ''}>
                <Button 
                  danger 
                  onClick={() => handleCommand('pump_off', 'Tắt bơm')} 
                  disabled={!canOperateDevice || isPumpLockedForStaff}
                >
                  Tắt bơm [D5]
                </Button>
              </Tooltip>

              <Tooltip title={isCurtainLockedForStaff ? 'Admin đã khóa mái che đối với nhân viên' : ''}>
                <Button 
                  type="default" 
                  onClick={() => handleCommand('curtain_open', 'Mở mái che 60°')} 
                  disabled={!canOperateDevice || isCurtainLockedForStaff}
                >
                  Mở mái che (60°) [D6]
                </Button>
              </Tooltip>

              <Tooltip title={isCurtainLockedForStaff ? 'Admin đã khóa mái che đối với nhân viên' : ''}>
                <Button 
                  type="default" 
                  onClick={() => handleCommand('curtain_close', 'Đóng mái che 120°')} 
                  disabled={!canOperateDevice || isCurtainLockedForStaff}
                >
                  Đóng mái che (120°) [D6]
                </Button>
              </Tooltip>
            </Space>

            <div style={{ marginTop: 16 }}>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                • <b>Relay Bơm (D5)</b>: Dùng cơ chế thả nổi (Bật: OUTPUT + LOW, Tắt: INPUT) bảo vệ opto 5V.<br />
                • <b>Servo Mái che (D6)</b>: Mở góc 60°, Đóng góc 120°, tự động <code>detach()</code> sau 650ms để chống rung &amp; sụt áp.
              </Typography.Text>
            </div>
          </Card>
        </Col>

        {/* DANH SÁCH CẢNH BÁO ĐANG MỞ */}
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

      {/* BIỂU ĐỒ NẰM NGAY TRÊN DASHBOARD TRANG CHỦ */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col span={24}>
          <Card 
            title="Biểu đồ đo lường lịch sử (Độ ẩm đất & Cường độ ánh sáng BH1750)" 
            extra={
              <Space wrap>
                <RangePicker 
                  value={dateRange} 
                  onChange={(dates) => { if (dates && dates[0] && dates[1]) setDateRange([dates[0], dates[1]]); }} 
                  showTime 
                />
                <Button icon={<DownloadOutlined />} onClick={handleExport}>Xuất CSV</Button>
              </Space>
            }
          >
            <Tabs
              defaultActiveKey="soil"
              items={[
                {
                  key: 'soil',
                  label: 'Độ ẩm đất (%) - Chân A0',
                  children: <TelemetryChart data={getTelemetryByType('soil')} sensorType="soil" height={280} />,
                },
                {
                  key: 'light',
                  label: 'Cường độ ánh sáng (lux) - BH1750 (D1/D2)',
                  children: <TelemetryChart data={getTelemetryByType('light')} sensorType="light" height={280} />,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};
export default Dashboard;
