from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.orm import Session
from app.routers.v1 import auth, users, devices, telemetry, commands, alerts, audit
from app.core.websocket import manager
from app.core.security import decode_token
from app.core.database import SessionLocal
from app.models.models import User, Device, Role

router = APIRouter()

router.include_router(auth.router, prefix="/api/v1")
router.include_router(users.router, prefix="/api/v1")
router.include_router(devices.router, prefix="/api/v1")
router.include_router(telemetry.router, prefix="/api/v1")
router.include_router(commands.router, prefix="/api/v1")
router.include_router(alerts.router, prefix="/api/v1")
router.include_router(audit.router, prefix="/api/v1")

@router.websocket("/ws/devices/{device_id}")
async def ws_endpoint(websocket: WebSocket, device_id: int, token: str = Query(...)):
    db = SessionLocal()
    try:
        payload = decode_token(token)
        if not payload:
            await websocket.close(code=1008)
            return
            
        username = payload.get("sub")
        user = db.query(User).filter(User.username == username).first()
        if not user:
            await websocket.close(code=1008)
            return
            
        device = db.query(Device).filter(Device.id == device_id).first()
        if not device:
            await websocket.close(code=1008)
            return
            
        role = db.query(Role).filter(Role.id == user.role_id).first()
        if role.name != "admin" and device.owner_id != user.id:
            await websocket.close(code=1008)
            return
            
        await manager.connect(websocket, str(device_id))
        try:
            while True:
                data = await websocket.receive_text()
        except WebSocketDisconnect:
            manager.disconnect(websocket, str(device_id))
    finally:
        db.close()
