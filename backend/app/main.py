from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.database import init_db
from app.services.mqtt_client import start_mqtt, mqtt_client_instance
from app.services.heartbeat_checker import start_heartbeat_checker, stop_heartbeat_checker
from app.routers.api import router as api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    start_mqtt()
    start_heartbeat_checker()
    
    yield
    
    # Shutdown
    mqtt_client_instance.stop()
    stop_heartbeat_checker()

app = FastAPI(title="Smart Plant Care API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Smart Plant Care IoT API"}
