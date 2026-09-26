import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';
import type { Telemetry } from '../types';

interface Props {
  data: Telemetry[];
  sensorType: string;
  height?: number;
}

export const TelemetryChart: React.FC<Props> = ({ data, sensorType, height = 300 }) => {
  const chartData = data.map(item => ({
    ...item,
    formattedTime: dayjs(item.timestamp).format('HH:mm'),
  }));

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

  return (
    <div style={{ height, width: '100%' }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="formattedTime" />
          <YAxis />
          <Tooltip labelFormatter={(label) => `Time: ${label}`} />
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke={getColor(sensorType)} 
            activeDot={{ r: 8 }} 
            name={sensorType}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
