import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Row, Col, Select, Badge, Card, List, Button, message, Space, Typography, Tag, Switch, Tooltip, Modal, Tabs, DatePicker, Dropdown } from 'antd';
import { BulbOutlined, ExperimentOutlined, ThunderboltOutlined, LockOutlined, UnlockOutlined, ToolOutlined, DownloadOutlined, AlertOutlined } from '@ant-design/icons';
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
import { formatLocalTime } from '../utils/date';

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

  // Quản lý Pop-up Modal cảnh báo theo chuẩn React State
  const [activeAlert, setActiveAlert] = useState<{
    id?: number;
    severity: string;
    message: string;
    created_at?: string;
  } | null>(null);

  const seenAlertsRef = useRef<Set<number>>(new Set());
  const initialAlertsLoadedRef = useRef<boolean>(false);

  const showAlertModal = (alertData: { id?: number; severity: string; message: string; created_at?: string }) => {
    if (alertData.id) {
      seenAlertsRef.current.add(alertData.id);
    }
    setActiveAlert(alertData);
  };

  const resolveAlertMutation = useMutation({
    mutationFn: (alertId: number) => alertsApi.resolve(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      message.success('Đã xác nhận xử lý cảnh báo thành công');
      setActiveAlert(null);
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.detail || 'Lỗi khi xử lý cảnh báo');
    }
  });

  const updateDeviceStatus = useCallback((deviceId: number, status: string) => {
    queryClient.setQueryData<Device[]>(['devices'], previous =>
      previous?.map(device => device.id === deviceId ? { ...device, status } : device)
    );
    queryClient.invalidateQueries({ queryKey: ['devices'] });
  }, [queryClient]);

  // Xử lý WebSocket Realtime
  const handleDeviceMessage = useCallback((event: DeviceMessage) => {
    if (event.type === 'telemetry') {
      queryClient.setQueryData<Record<string, Telemetry>>(['telemetry', 'latest', event.data.device_id], prev => ({
        ...prev,
        [event.data.sensor_type]: event.data
      }));
    } else if (event.type === 'alert') {
      refetchAlerts();
      const alertData = event.data || {};
      showAlertModal(alertData);
    } else if (event.type === 'device_status') {
      updateDeviceStatus(event.data.device_id, event.data.status);
    } else if (event.type === 'device_lock') {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    } else if (event.type === 'command_ack') {
      setLastCommand({ deviceId: selectedDeviceId, label: `${event.data.action}: ${event.data.status.toUpperCase()}` });
    }
  }, [selectedDeviceId, refetchAlerts, queryClient, updateDeviceStatus]);

  const { isConnected } = useWebSocket(selectedDeviceId, handleDeviceMessage);

  // Tự động kiểm tra cảnh báo mới từ polling
  useEffect(() => {
    if (alerts && alerts.length > 0) {
      if (!initialAlertsLoadedRef.current) {
        alerts.forEach(a => seenAlertsRef.current.add(a.id));
        initialAlertsLoadedRef.current = true;
      } else {
        alerts.forEach(a => {
          if (!seenAlertsRef.current.has(a.id)) {
            seenAlertsRef.current.add(a.id);
            showAlertModal(a);
          }
        });
      }
    }
  }, [alerts]);

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
          <h2 style={{ margin: 0 }}>Dashboard Giám Sát & Điều Khiển</h2>
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

      {/* 1. BIỂU ĐỒ NẰM Ở ĐẦU TRANG CHỦ */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col span={24}>
          <Card 
            title="Biểu đồ đo lường lịch sử" 
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

      {/* 2. CÁC CARD CẢM BIẾN REALTIME */}
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

      {/* 3. BẢNG ĐIỀU KHIỂN & CẢNH BÁO */}
      <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
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
          </Card>
        </Col>

        {/* DANH SÁCH CẢNH BÁO ĐANG MỞ (CÓ GIỚI HẠN CHIỀU CAO VÀ CUỘN KHI DÀI) */}
        <Col xs={24} md={10}>
          <Card 
            title={
              <Space>
                <AlertOutlined style={{ color: '#fa8c16' }} />
                <span>Cảnh báo đang mở (Alerts)</span>
                {alerts && alerts.length > 0 && (
                  <Badge count={alerts.length} style={{ backgroundColor: '#f5222d' }} />
                )}
              </Space>
            }
            extra={
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    {
                      key: 'test-critical',
                      label: '🚨 Thử Popup Khẩn cấp (Critical)',
                      onClick: () => showAlertModal({
                        severity: 'critical',
                        message: 'Độ ẩm đất quá thấp (< 15%)! Vui lòng kiểm tra máy bơm và nguồn nước ngay lập tức.',
                      })
                    },
                    {
                      key: 'test-warning',
                      label: '⚠️ Thử Popup Cảnh báo (Warning)',
                      onClick: () => showAlertModal({
                        severity: 'warning',
                        message: 'Cường độ ánh sáng cao (> 7500 lux), hệ thống tự động đóng mái che 120°.',
                      })
                    },
                    {
                      key: 'test-info',
                      label: 'ℹ️ Thử Popup Thông tin (Info)',
                      onClick: () => showAlertModal({
                        severity: 'info',
                        message: 'Hệ thống tưới tự động đã kích hoạt và hoàn tất chu kỳ tưới bảo vệ cây trồng.',
                      })
                    },
                  ]
                }}
              >
                <Button size="small" type="primary" ghost>
                  Thử Pop-up ▾
                </Button>
              </Dropdown>
            }
            bodyStyle={{ maxHeight: 280, overflowY: 'auto', padding: '8px 16px' }}
          >
            <List
              dataSource={alerts || []}
              renderItem={(alert) => {
                const isCritical = alert.severity === 'critical';
                const isWarning = alert.severity === 'warning';
                return (
                  <List.Item
                    style={{ 
                      cursor: 'pointer', 
                      padding: '8px 4px', 
                      borderBottom: '1px solid #f0f0f0',
                      transition: 'background 0.2s' 
                    }}
                    onClick={() => showAlertModal(alert)}
                    actions={[
                      <Button 
                        key="btn-view" 
                        size="small" 
                        type="link"
                        onClick={(e) => {
                          e.stopPropagation();
                          showAlertModal(alert);
                        }}
                      >
                        Pop-up
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space wrap align="center">
                          <Tag color={isCritical ? 'red' : isWarning ? 'orange' : 'blue'} style={{ margin: 0, fontWeight: 'bold' }}>
                            {alert.severity.toUpperCase()}
                          </Tag>
                          <span style={{ fontSize: 13, color: isCritical ? '#cf1322' : isWarning ? '#d46b08' : '#262626' }}>
                            {alert.message}
                          </span>
                        </Space>
                      }
                      description={
                        <span style={{ fontSize: 11, color: '#8c8c8c' }}>
                          {formatLocalTime(alert.created_at, 'HH:mm:ss DD/MM/YYYY')}
                        </span>
                      }
                    />
                  </List.Item>
                );
              }}
              locale={{ emptyText: 'Không có cảnh báo' }}
            />
          </Card>
        </Col>
      </Row>

      {/* POP-UP MODAL CẢNH BÁO THEO MỨC ĐỘ (CHUẨN REACT 19 JSX COMPONENT) */}
      <Modal
        open={!!activeAlert}
        onCancel={() => setActiveAlert(null)}
        width={520}
        destroyOnClose
        title={
          activeAlert?.severity === 'critical' ? (
            <Space>
              <span style={{ color: '#cf1322', fontSize: 16, fontWeight: 'bold' }}>
                🚨 CẢNH BÁO NGUY HIỂM / KHẨN CẤP
              </span>
            </Space>
          ) : activeAlert?.severity === 'warning' ? (
            <Space>
              <span style={{ color: '#d46b08', fontSize: 16, fontWeight: 'bold' }}>
                ⚠️ CẢNH BÁO HỆ THỐNG
              </span>
            </Space>
          ) : (
            <Space>
              <span style={{ color: '#096dd9', fontSize: 16, fontWeight: 'bold' }}>
                ℹ️ THÔNG BÁO THIẾT BỊ
              </span>
            </Space>
          )
        }
        footer={[
          <Button key="close" onClick={() => setActiveAlert(null)}>
            Đóng
          </Button>,
          activeAlert?.id ? (
            <Button
              key="resolve"
              type="primary"
              danger={activeAlert.severity === 'critical'}
              loading={resolveAlertMutation.isPending}
              onClick={() => {
                if (activeAlert.id) {
                  resolveAlertMutation.mutate(activeAlert.id);
                }
              }}
            >
              Xác nhận đã xử lý
            </Button>
          ) : (
            <Button
              key="ack"
              type="primary"
              danger={activeAlert?.severity === 'critical'}
              onClick={() => setActiveAlert(null)}
            >
              Đã hiểu
            </Button>
          ),
        ]}
      >
        {activeAlert && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Tag
                color={activeAlert.severity === 'critical' ? 'red' : activeAlert.severity === 'warning' ? 'orange' : 'blue'}
                style={{ fontWeight: 'bold', fontSize: 12, padding: '2px 8px' }}
              >
                MỨC ĐỘ: {(activeAlert.severity || 'warning').toUpperCase()}
              </Tag>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {formatLocalTime(activeAlert.created_at, 'HH:mm:ss DD/MM/YYYY')}
              </Typography.Text>
            </div>

            <div
              style={{
                padding: '12px 16px',
                background:
                  activeAlert.severity === 'critical'
                    ? '#fff1f0'
                    : activeAlert.severity === 'warning'
                    ? '#fffbe6'
                    : '#e6f7ff',
                border: `1px solid ${
                  activeAlert.severity === 'critical'
                    ? '#ffa39e'
                    : activeAlert.severity === 'warning'
                    ? '#ffe58f'
                    : '#91d5ff'
                }`,
                borderRadius: 8,
                color:
                  activeAlert.severity === 'critical'
                    ? '#a8071a'
                    : activeAlert.severity === 'warning'
                    ? '#ad6800'
                    : '#0050b3',
                fontSize: 14,
                fontWeight: 500,
                lineHeight: 1.6,
              }}
            >
              {activeAlert.message}
            </div>

            {activeAlert.severity === 'critical' && (
              <div
                style={{
                  marginTop: 12,
                  padding: '8px 12px',
                  background: '#fafafa',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#595959',
                }}
              >
                🚨 <b>Khuyến nghị:</b> Kiểm tra ngay nguồn nước, máy bơm hoặc kết nối phần cứng tại vườn cây để bảo vệ cây trồng!
              </div>
            )}
            {activeAlert.severity === 'warning' && (
              <div
                style={{
                  marginTop: 12,
                  padding: '8px 12px',
                  background: '#fafafa',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#595959',
                }}
              >
                ⚡ <b>Ghi chú:</b> Hệ thống IoT có thể đã tự động kích hoạt bảo vệ (đóng mái che hoặc bật bơm). Vui lòng lưu ý theo dõi.
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Dashboard;
