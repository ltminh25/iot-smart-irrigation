import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';

export interface DeviceWebSocketMessage {
  type: string;
  data: Record<string, unknown>;
}

export const useWebSocket = (deviceId: number | null) => {
  const [lastMessage, setLastMessage] = useState<DeviceWebSocketMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const { accessToken } = useAuthStore();

  useEffect(() => {
    if (!deviceId || !accessToken) {
      setIsConnected(false);
      setLastMessage(null);
      return;
    }

    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const connect = () => {
      if (disposed) return;

      const baseUrl = (import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8001').replace(/\/$/, '');
      const wsUrl = `${baseUrl}/ws/devices/${deviceId}?token=${encodeURIComponent(accessToken)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!disposed) setIsConnected(true);
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data) as DeviceWebSocketMessage;
          if (!disposed && data && typeof data.type === 'string') setLastMessage(data);
        } catch (error) {
          console.error('Không thể đọc dữ liệu WebSocket:', error);
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (!disposed) {
          setIsConnected(false);
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error('Lỗi WebSocket:', error);
        ws.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      setIsConnected(false);
    };
  }, [deviceId, accessToken]);

  return { lastMessage, isConnected };
};
