import React, { useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { usersApi } from '../api/users';

export const UserManagement: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (values: any) => usersApi.create(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      message.success('Tạo user thành công');
      setIsModalVisible(false);
      form.resetFields();
    },
    onError: () => message.error('Lỗi khi tạo user'),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number, role: string }) => usersApi.updateRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      message.success('Cập nhật role thành công');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number, status: string }) => usersApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      message.success('Cập nhật trạng thái thành công');
    },
  });

  const columns = [
    { title: 'Username', dataIndex: 'username', key: 'username' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { 
      title: 'Role', 
      dataIndex: 'role', 
      key: 'role',
      render: (role: string, record: any) => (
        <Select 
          value={role} 
          onChange={(val) => updateRoleMutation.mutate({ id: record.id, role: val })}
          style={{ width: 120 }}
        >
          <Select.Option value="admin">Admin</Select.Option>
          <Select.Option value="user">User</Select.Option>
        </Select>
      )
    },
    { 
      title: 'Trạng thái', 
      dataIndex: 'status', 
      key: 'status',
      render: (status: string, record: any) => (
        <Switch 
          checked={status === 'active'}
          onChange={(checked) => updateStatusMutation.mutate({ id: record.id, status: checked ? 'active' : 'inactive' })}
          checkedChildren="Active"
          unCheckedChildren="Inactive"
        />
      )
    },
    { 
      title: 'Ngày tạo', 
      dataIndex: 'created_at', 
      key: 'created_at',
      render: (val: string) => dayjs(val).format('DD/MM/YYYY')
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>Quản lý người dùng</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalVisible(true)}>
          Tạo user
        </Button>
      </div>

      <Table columns={columns} dataSource={users} rowKey="id" loading={isLoading} />

      <Modal
        title="Tạo User"
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
      >
        <Form form={form} onFinish={(values) => createMutation.mutate(values)} layout="vertical">
          <Form.Item name="username" label="Username" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input type="email" />
          </Form.Item>
          <Form.Item name="role" label="Role" initialValue="user">
            <Select>
              <Select.Option value="admin">Admin</Select.Option>
              <Select.Option value="user">User</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
