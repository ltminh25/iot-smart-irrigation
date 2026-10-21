import React, { useMemo } from 'react';
import { Empty } from 'antd';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';
import type { Telemetry } from '../types';

interface Props {
  data: Telemetry[];
  sensorType: string;
  height?: number;
}

export const TelemetryChart: React.FC<Props> = ({ data, sensorType, height = 300 }) => {
  const chartData = useMemo(() => [...data]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map(item => ({
      ...item,
      formattedTime: dayjs(item.timestamp).format('DD/MM HH:mm'),
    })), [data]);

  const getColor = (type: string) => {
    switch (type) {
      case 'light': return '#fadb14';
      case 'soil': return '#8c4356';
      case 'air_temp': return '#f5222d';
      case 'air_humidity': return '#1890ff';
      case 'rain': return '#096dd9';
      case 'waterlevel': return '#13c2c2';
      default: return '#8884d8';
    }
  };

  if (chartData.length === 0) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Empty description="Chưa có dữ liệu cảm biến trong khoảng thời gian này" />
    </div>;
  }

  return (
    <div style={{ height, width: '100%' }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="formattedTime" />
          <YAxis />
          <Tooltip labelFormatter={(label) => `Thời gian: ${label}`} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={getColor(sensorType)}
            activeDot={{ r: 6 }}
            name={sensorType}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
