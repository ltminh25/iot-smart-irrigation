from fastapi import WebSocket
from typing import Dict, List, Optional
import asyncio

class ConnectionManager:
    def __init__(self):
        # Dictionary map device_id to list of active WebSockets
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.loop: Optional[asyncio.AbstractEventLoop] = None

    async def connect(self, websocket: WebSocket, device_id: str):
        await websocket.accept()
        if device_id not in self.active_connections:
            self.active_connections[device_id] = []
        self.active_connections[device_id].append(websocket)

    def disconnect(self, websocket: WebSocket, device_id: str):
        if device_id in self.active_connections:
            if websocket in self.active_connections[device_id]:
                self.active_connections[device_id].remove(websocket)
            if not self.active_connections[device_id]:
                del self.active_connections[device_id]

    async def broadcast(self, device_id: str, message: dict):
        if device_id in self.active_connections:
            for connection in list(self.active_connections[device_id]):
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

    def broadcast_sync(self, device_id: str, message: dict):
        """Gửi WebSocket an toàn từ cả async context lẫn background thread (MQTT, Scheduler)."""
        try:
            running_loop = asyncio.get_running_loop()
            running_loop.create_task(self.broadcast(str(device_id), message))
            return
        except RuntimeError:
            pass

        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self.broadcast(str(device_id), message), self.loop)

    async def broadcast_all(self, message: dict):
        for device_id, connections in list(self.active_connections.items()):
            for connection in list(connections):
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

manager = ConnectionManager()
