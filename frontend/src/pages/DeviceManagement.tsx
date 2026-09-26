import React, { useState } from 'react';
import { Table, Button, Badge, Modal, Form, Input, message, Dropdown, Menu } from 'antd';
import { PlusOutlined, MoreOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { devicesApi } from '../api/devices';
import { useAuthStore } from '../store/authStore';

export const DeviceManagement: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();

  const { data: devices, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: devicesApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (values: any) => devicesApi.create(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      message.success('Thêm thiết bị thành công');
      setIsModalVisible(false);
      form.resetFields();
    },
    onError: () => message.error('Lỗi khi thêm thiết bị'),
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
    createMutation.mutate(values);
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'active': return 'success';
      case 'offline': return 'error';
      case 'maintenance': return 'warning';
      default: return 'default';
    }
  };

  const columns = [
    { title: 'UID', dataIndex: 'device_uid', key: 'device_uid' },
    { title: 'Tên', dataIndex: 'name', key: 'name' },
    { title: 'Chủ sở hữu ID', dataIndex: 'owner_id', key: 'owner_id' },
    { 
      title: 'Trạng thái', 
      dataIndex: 'status', 
      key: 'status',
      render: (status: string) => <Badge status={getStatusColor(status) as any} text={status.toUpperCase()} />
    },
    { 
      title: 'Last Heartbeat', 
      dataIndex: 'last_heartbeat_at', 
      key: 'last_heartbeat_at',
      render: (val: string) => val ? dayjs(val).format('DD/MM/YYYY HH:mm:ss') : 'N/A'
    },
    {
      title: 'Hành động',
      key: 'action',
      render: (_: any, record: any) => {
        const isOwnerOrAdmin = user?.role === 'admin' || user?.id === record.owner_id;
        const menu = (
          <Menu>
            <Menu.Item key="1" onClick={() => navigate(`/devices/${record.id}`)}>
              Chi tiết
            </Menu.Item>
            {isOwnerOrAdmin && (
              <>
                <Menu.Item key="2" onClick={() => updateStatusMutation.mutate({ id: record.id, status: 'maintenance' })}>
                  Bảo trì
                </Menu.Item>
                <Menu.Item key="3" onClick={() => updateStatusMutation.mutate({ id: record.id, status: 'decommissioned' })}>
                  Hủy kích hoạt
                </Menu.Item>
              </>
            )}
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>Quản lý thiết bị</h2>
        {(user?.role === 'admin' || user?.role === 'user') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalVisible(true)}>
            Thêm thiết bị
          </Button>
        )}
      </div>

      <Table columns={columns} dataSource={devices} rowKey="id" loading={isLoading} />

      <Modal
        title="Thêm thiết bị mới"
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
      >
        <Form form={form} onFinish={handleCreate} layout="vertical">
          <Form.Item name="name" label="Tên thiết bị" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="location" label="Vị trí">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
