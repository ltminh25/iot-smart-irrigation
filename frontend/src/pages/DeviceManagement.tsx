import React, { useState } from 'react';
import { Table, Button, Badge, Modal, Form, Input, message, Dropdown, Menu, Typography, Tag, Space, Alert } from 'antd';
import { PlusOutlined, MoreOutlined, CopyOutlined, CheckCircleOutlined, CodeOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { devicesApi } from '../api/devices';
import { useAuthStore } from '../store/authStore';
import type { Device } from '../types';

const { Paragraph, Text } = Typography;

export const DeviceManagement: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [createdDevice, setCreatedDevice] = useState<Device | null>(null);
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false);
  const [form] = Form.useForm();

  const { data: devices, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: devicesApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (values: any) => devicesApi.create(values),
    onSuccess: (data: Device) => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      message.success('Thêm thiết bị thành công!');
      setIsModalVisible(false);
      form.resetFields();
      setCreatedDevice(data);
      setIsSuccessModalVisible(true);
    },
    onError: (err: any) => {
      const errorMsg = err?.response?.data?.detail || 'Lỗi khi thêm thiết bị';
      message.error(errorMsg);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number, status: string }) => devicesApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      message.success('Cập nhật trạng thái thành công');
    },
    onError: () => message.error('Lỗi khi cập nhật trạng thái'),
  });

  const handleCreate = (values: any) => {
    const deviceUid = typeof values.device_uid === 'string' ? values.device_uid.trim() : '';
    createMutation.mutate({
      ...values,
      // Use a frontend-generated ESP8286-prefixed UID so it does not fall back to the backend's old esp32 prefix.
      device_uid: deviceUid || `esp8286-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    });
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'active': return 'success';
      case 'offline': case 'fault': return 'error';
      case 'maintenance': return 'warning';
      case 'provisioned': return 'processing';
      case 'decommissioned': return 'default';
      default: return 'default';
    }
  };

  const columns = [
    { 
      title: 'Mã thiết bị (UID)', 
      dataIndex: 'device_uid', 
      key: 'device_uid',
      render: (uid: string) => (
        <Space>
          <Tag color="blue" style={{ fontFamily: 'monospace', fontSize: 13 }}>{uid}</Tag>
          <Button 
            type="text" 
            size="small" 
            icon={<CopyOutlined />} 
            onClick={() => {
              navigator.clipboard.writeText(uid);
              message.success(`Đã copy mã: ${uid}`);
            }} 
            title="Copy mã thiết bị"
          />
        </Space>
      )
    },
    { title: 'Loại', key: 'device_type', render: () => <Tag color="green">ESP8286</Tag> },
    { title: 'Tên thiết bị', dataIndex: 'name', key: 'name' },
    { title: 'Vị trí', dataIndex: 'location', key: 'location', render: (val: string) => val || 'Chưa đặt' },
    { 
      title: 'Trạng thái', 
      dataIndex: 'status', 
      key: 'status',
      render: (status: string) => <Badge status={getStatusColor(status) as any} text={status?.toUpperCase()} />
    },
    { 
      title: 'Heartbeat cuối', 
      dataIndex: 'last_heartbeat_at', 
      key: 'last_heartbeat_at',
      render: (val: string) => val ? dayjs(val).format('DD/MM/YYYY HH:mm:ss') : 'Chưa có'
    },
    {
      title: 'Hành động',
      key: 'action',
      render: (_: any, record: any) => {
        const isOwnerOrAdmin = user?.role === 'admin' || user?.id === record.owner_id;
        const availableTransitions: Record<string, Array<{ key: string; label: string; status: string; danger?: boolean }>> = {
          registered: [{ key: 'provision', label: 'Đánh dấu đã cấu hình', status: 'provisioned' }, { key: 'decommission', label: 'Ngừng thiết bị', status: 'decommissioned', danger: true }],
          provisioned: [{ key: 'activate', label: 'Kích hoạt thiết bị', status: 'active' }, { key: 'decommission', label: 'Ngừng thiết bị', status: 'decommissioned', danger: true }],
          active: [{ key: 'offline', label: 'Đặt ngoại tuyến', status: 'offline' }, { key: 'fault', label: 'Đánh dấu có lỗi', status: 'fault' }, { key: 'maintenance', label: 'Đưa vào bảo trì', status: 'maintenance' }, { key: 'decommission', label: 'Ngừng thiết bị', status: 'decommissioned', danger: true }],
          offline: [{ key: 'activate', label: 'Kích hoạt lại', status: 'active' }, { key: 'maintenance', label: 'Đưa vào bảo trì', status: 'maintenance' }, { key: 'decommission', label: 'Ngừng thiết bị', status: 'decommissioned', danger: true }],
          fault: [{ key: 'maintenance', label: 'Đưa vào bảo trì', status: 'maintenance' }, { key: 'decommission', label: 'Ngừng thiết bị', status: 'decommissioned', danger: true }],
          maintenance: [{ key: 'activate', label: 'Kích hoạt lại', status: 'active' }, { key: 'decommission', label: 'Ngừng thiết bị', status: 'decommissioned', danger: true }],
          decommissioned: [],
        };
        const menu = (
          <Menu>
            <Menu.Item key="details" onClick={() => navigate(`/devices/${record.id}`)}>
              Xem chi tiết & cảm biến
            </Menu.Item>
            <Menu.Item key="code" onClick={() => {
              setCreatedDevice(record);
              setIsSuccessModalVisible(true);
            }}>
              Xem mã code ESP8286
            </Menu.Item>
            {isOwnerOrAdmin && (availableTransitions[record.status] || []).map(transition => (
              <Menu.Item
                key={transition.key}
                danger={transition.danger}
                onClick={() => updateStatusMutation.mutate({ id: record.id, status: transition.status })}
              >
                {transition.label}
              </Menu.Item>
            ))}
          </Menu>
        );

        return (
          <Dropdown overlay={menu} trigger={['click']}>
            <Button icon={<MoreOutlined />} />
          </Dropdown>
        );
      },
    },
  ];

  const espCodeSnippet = createdDevice ? `// ==========================================
// CODE MẪU THIẾT BỊ ESP8286 KẾT NỐI HỆ THỐNG
// Thiết bị: ${createdDevice.name}
// ==========================================
#include <ESP8266WiFi.h>  // Dùng <WiFi.h> nếu chạy ESP32
#include <PubSubClient.h>

// Đổi nhãn ESP8286 theo yêu cầu giao diện; thư viện Arduino bên dưới dành cho board ESP8266.
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* mqtt_server = "broker.hivemq.com"; // Hoặc IP máy chủ MQTT
const int mqtt_port = 1883;

// ĐỊNH DANH THIẾT BỊ ĐÃ TẠO TRÊN WEB:
#define DEVICE_ID "${createdDevice.device_uid}"

// CÁC TOPIC MQTT THEO CHUẨN ĐỒ ÁN:
const char* topic_soil     = "plant/" DEVICE_ID "/telemetry/soil";
const char* topic_status   = "plant/" DEVICE_ID "/status";
const char* topic_cmd_pump = "plant/" DEVICE_ID "/cmd/pump";
const char* topic_ack      = "plant/" DEVICE_ID "/ack";

WiFiClient espClient;
PubSubClient client(espClient);

void callback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.print("Nhận lệnh từ topic [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(message);

  // Xử lý lệnh bật/tắt bơm hoặc mái che...
  // Sau đó gửi ACK xác nhận đã thực hiện:
  String ackMsg = "{\\"deviceId\\":\\"" DEVICE_ID "\\",\\"status\\":\\"executed\\"}";
  client.publish(topic_ack, ackMsg.c_str());
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Đang kết nối MQTT với Client ID: " DEVICE_ID "...");
    if (client.connect(DEVICE_ID)) {
      Serial.println("Thành công!");
      // Gửi bản tin Online Heartbeat
      String onlineMsg = "{\\"deviceId\\":\\"" DEVICE_ID "\\",\\"status\\":\\"online\\"}";
      client.publish(topic_status, onlineMsg.c_str());
      // Đăng ký nhận lệnh điều khiển
      client.subscribe("plant/" DEVICE_ID "/cmd/#");
    } else {
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi connected!");
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // Ví dụ gửi dữ liệu độ ẩm đất định kỳ:
  static unsigned long lastMsg = 0;
  if (millis() - lastMsg > 10000) {
    lastMsg = millis();
    float soilMoisture = 45.5; // Đọc từ chân Analog A0
    String payload = "{\\"deviceId\\":\\"" DEVICE_ID "\\",\\"type\\":\\"soil\\",\\"value\\":" + String(soilMoisture) + ",\\"unit\\":\\"%\\"}";
    client.publish(topic_soil, payload.c_str());
    Serial.println("Sent telemetry: " + payload);
  }
}` : '';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Quản lý thiết bị IoT</h2>
          <Text type="secondary">Đăng ký và quản lý các node cảm biến ESP8286 trong hệ thống</Text>
        </div>
        {(user?.role === 'admin' || user?.role === 'owner') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalVisible(true)}>
            Thêm thiết bị mới
          </Button>
        )}
      </div>

      <Table columns={columns} dataSource={devices} rowKey="id" loading={isLoading} />

      {/* MODAL THÊM THIẾT BỊ MỚI */}
      <Modal
        title="Thêm thiết bị mới vào hệ thống"
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        okText="Lưu & Tạo mã thiết bị"
        cancelText="Hủy"
      >
        <Form form={form} onFinish={handleCreate} layout="vertical">
          <Form.Item 
            name="name" 
            label="Tên thiết bị" 
            rules={[{ required: true, message: 'Vui lòng nhập tên thiết bị' }]}
            tooltip="Tên gợi nhớ để phân biệt các chậu cây hoặc khu vực chăm sóc"
          >
            <Input placeholder="Ví dụ: ESP8286 - Chậu trầu bà ban công" />
          </Form.Item>

          <Form.Item 
            name="device_uid" 
            label="Mã thiết bị (Device UID - dùng cho ESP8286)" 
            tooltip="Mã định danh duy nhất dùng nạp vào code ESP8286/MQTT. Nếu để trống, hệ thống sẽ tự động tạo một mã duy nhất."
          >
            <Input placeholder="Ví dụ: esp8286-tree-01 (để trống để tự sinh)" />
          </Form.Item>

          <Form.Item 
            name="location" 
            label="Vị trí lắp đặt"
          >
            <Input placeholder="Ví dụ: Ban công tầng 2, Phòng khách" />
          </Form.Item>
        </Form>
      </Modal>

      {/* MODAL KẾT QUẢ VÀ HƯỚNG DẪN IMPORT ESP8286 */}
      <Modal
        title={
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <span>Thiết bị đã được tạo thành công!</span>
          </Space>
        }
        open={isSuccessModalVisible}
        onCancel={() => setIsSuccessModalVisible(false)}
        width={750}
        footer={[
          <Button key="close" type="primary" onClick={() => setIsSuccessModalVisible(false)}>
            Đã hiểu, đóng lại
          </Button>
        ]}
      >
        {createdDevice && (
          <div>
            <Alert
              message="Mã thiết bị đã được tạo"
              description="Sao chép mã định danh để cấu hình firmware. Đoạn code bên dưới là mẫu tham khảo; cần thống nhất firmware MQTT với Backend trước khi chạy thiết bị thật."
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <div style={{ background: '#f5f5f5', padding: '12px 16px', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <Text strong>Tên thiết bị: </Text>
                <Text>{createdDevice.name}</Text>
              </div>
              <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text strong>Mã định danh (DEVICE_ID): </Text>
                <Tag color="blue" style={{ fontSize: 14, padding: '2px 8px', fontFamily: 'monospace' }}>
                  {createdDevice.device_uid}
                </Tag>
                <Button 
                  size="small" 
                  icon={<CopyOutlined />} 
                  onClick={() => {
                    navigator.clipboard.writeText(createdDevice.device_uid);
                    message.success('Đã sao chép mã thiết bị!');
                  }}
                >
                  Sao chép mã
                </Button>
              </div>
              {createdDevice.api_key && (
                <div>
                  <Text strong>API Key / Secret: </Text>
                  <Text code copyable>{createdDevice.api_key}</Text>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong><CodeOutlined /> Code mẫu Arduino C++ (thư viện phần cứng ESP8266):</Text>
              <Button 
                type="dashed" 
                icon={<CopyOutlined />} 
                onClick={() => {
                  navigator.clipboard.writeText(espCodeSnippet);
                  message.success('Đã sao chép toàn bộ code Arduino mẫu cho ESP8286!');
                }}
              >
                Sao chép code mẫu
              </Button>
            </div>

            <Paragraph style={{ maxHeight: 280, overflowY: 'auto', background: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 6, fontFamily: 'monospace', fontSize: 12 }}>
              <pre style={{ margin: 0 }}>{espCodeSnippet}</pre>
            </Paragraph>
          </div>
        )}
      </Modal>
    </div>
  );
};

