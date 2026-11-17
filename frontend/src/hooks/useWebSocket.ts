import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import type { Alert, Command, Device, Telemetry } from '../types';

export type DeviceMessage =
  | { type: 'telemetry'; data: Telemetry }
  | { type: 'alert'; data: Pick<Alert, 'severity' | 'message'> }
  | { type: 'device_status'; data: { device_id: number; status: Device['status'] } }
  | { type: 'device_lock' }
  | { type: 'command_ack'; data: Pick<Command, 'action' | 'status'> };

export const useWebSocket = (deviceId: number | null, onMessage: (message: DeviceMessage) => void) => {
  const [connectedDeviceId, setConnectedDeviceId] = useState<number | null>(null);
  const { accessToken } = useAuthStore();

  useEffect(() => {
    if (!deviceId || !accessToken) return;

    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let socket: WebSocket;
    
    const connect = () => {
      const latestToken = localStorage.getItem('access_token') || accessToken;
      const wsUrl = `${import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8001'}/ws/devices/${deviceId}?token=${latestToken}`;
      const ws = new WebSocket(wsUrl);
      socket = ws;

      ws.onopen = () => {
        setConnectedDeviceId(deviceId);
      };

      ws.onmessage = (event) => {
        try {
          onMessage(JSON.parse(event.data));
        } catch (e) {
          console.error('Failed to parse WebSocket message', e);
        }
      };

      ws.onclose = () => {
        setConnectedDeviceId(null);
        // Auto-reconnect sau 3s
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.close();
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      socket.onclose = null;
      socket.onmessage = null;
      socket.onopen = null;
      socket.onerror = null;
      socket.close();
      setConnectedDeviceId(null);
    };
  }, [deviceId, accessToken, onMessage]);

  return { isConnected: deviceId !== null && connectedDeviceId === deviceId };
};
