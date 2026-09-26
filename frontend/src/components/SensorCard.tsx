import React from 'react';
import { Card, Statistic } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

interface Props {
  title: string;
  value: number | string;
  unit?: string;
  icon?: React.ReactNode;
  color?: string;
  trend?: 'up' | 'down' | 'none';
}

export const SensorCard: React.FC<Props> = ({ title, value, unit, icon, color = '#3f8600', trend = 'none' }) => {
  return (
    <Card>
      <Statistic
        title={title}
        value={value}
        precision={typeof value === 'number' && !Number.isInteger(value) ? 2 : 0}
        valueStyle={{ color }}
        prefix={
          <>
            {trend === 'up' && <ArrowUpOutlined style={{ fontSize: 16 }} />}
            {trend === 'down' && <ArrowDownOutlined style={{ fontSize: 16 }} />}
            {icon && <span style={{ marginLeft: 8, marginRight: 8 }}>{icon}</span>}
          </>
        }
        suffix={unit}
      />
    </Card>
  );
};
