import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';

export const useWebSocket = (deviceId: number | null) => {
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const { accessToken } = useAuthStore();

  useEffect(() => {
    if (!deviceId || !accessToken) return;

    let reconnectTimeout: ReturnType<typeof setTimeout>;
    
    const connect = () => {
      const wsUrl = `${import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8000'}/ws/devices/${deviceId}?token=${accessToken}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
        } catch (e) {
          console.error('Failed to parse WebSocket message', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Auto-reconnect sau 3s
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.close();
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [deviceId, accessToken]);

  return { lastMessage, isConnected };
};
