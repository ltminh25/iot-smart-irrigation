# Smart Plant Care System 🌱

Hệ thống IoT giám sát và chăm sóc cây tự động.  
Dự án bao gồm 2 phần: **Backend** (Python/FastAPI) và **Frontend** (React 19 + Ant Design).

---

## 🗄️ Database

| Thông tin | Giá trị |
|-----------|---------|
| **Engine** | SQLite (development) |
| **File DB** | `backend/iot_plant_care.db` (tự tạo khi khởi động) |
| **Connection String** | `sqlite:///./iot_plant_care.db` |
| **ORM** | SQLAlchemy (sync) |
| **Cấu hình** | Biến môi trường `DB_URL` trong file `.env` |

> Đặt trong file `backend/.env`:
> ```
> DB_URL=sqlite:///./iot_plant_care.db
> ```

### Chuyển sang PostgreSQL (nếu cần)
```env
DB_URL=postgresql://username:password@localhost:5432/plant_care_db
```

### Các bảng (9 bảng)

| Bảng | Mô tả |
|------|-------|
| `roles` | Vai trò: admin, owner, viewer |
| `users` | Tài khoản người dùng |
| `devices` | Thiết bị IoT (ESP32) |
| `device_lifecycle_log` | Lịch sử chuyển trạng thái thiết bị |
| `telemetry` | Dữ liệu cảm biến (ánh sáng, đất, nhiệt độ, mưa, mực nước) |
| `commands` | Lịch sử lệnh điều khiển (bơm, mái che) |
| `alert_rules` | Quy tắc sinh cảnh báo tự động |
| `alerts` | Danh sách cảnh báo |
| `audit_log` | Nhật ký thao tác nhạy cảm |

> ⚙️ DB và dữ liệu seed (3 roles + tài khoản admin) được tạo **tự động** khi khởi động backend lần đầu.

---

## 🔐 Tài khoản đăng nhập mặc định

| Vai trò | Username | Password | Quyền hạn |
|---------|----------|----------|-----------|
| **Admin** | `admin` | `admin123` | Toàn quyền: quản lý user, mọi thiết bị, audit log |
| *(Tự đăng ký)* | — | — | Role mặc định: `owner` (qua `/api/v1/auth/register`) |

> **⚠️ Lưu ý bảo mật:** Đổi mật khẩu admin ngay sau khi deploy lần đầu qua:
> ```
> PUT /api/v1/users/me/password
> Body: { "old_password": "admin123", "new_password": "<mật khẩu mới>" }
> ```

### Ma trận phân quyền RBAC

| Chức năng | Admin | Owner | Viewer |
|-----------|:-----:|:-----:|:------:|
| Quản lý user | ✅ | ❌ | ❌ |
| Đăng ký thiết bị | ✅ | ✅ | ❌ |
| Xem thiết bị của mình | ✅ | ✅ | ✅ |
| Gửi lệnh điều khiển | ✅ | ✅ (thiết bị của mình) | ❌ |
| Cấu hình ngưỡng cảnh báo | ✅ | ✅ (thiết bị của mình) | ❌ |
| Xem audit log | ✅ | ❌ | ❌ |

---

## ⚙️ Biến môi trường

Tạo file `backend/.env` từ `backend/.env.example`:

```env
# Database
DB_URL=sqlite:///./iot_plant_care.db

# JWT Authentication
JWT_SECRET=your_jwt_secret_key_here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# MQTT Broker (mặc định dùng HiveMQ public broker)
MQTT_BROKER_URL=broker.hivemq.com
MQTT_PORT=1883
MQTT_USERNAME=
MQTT_PASSWORD=

# Bảo mật
MAX_LOGIN_ATTEMPTS=5

# Heartbeat thiết bị
HEARTBEAT_TIMEOUT_SECONDS=30
HEARTBEAT_CHECK_INTERVAL=10
```

Tạo file `frontend/.env` từ `frontend/.env.example`:

```env
VITE_API_BASE_URL=http://localhost:8001/api/v1
VITE_WS_BASE_URL=ws://localhost:8001
```

---

## 1. Cài đặt và chạy Backend (FastAPI)

```bash
cd backend

# Tạo và kích hoạt môi trường ảo
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Cài đặt thư viện
pip install -r requirements.txt

# Copy và chỉnh sửa .env
copy .env.example .env

# Chạy server (port 8001)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

- **API Docs (Swagger):** http://localhost:8001/docs  
- **Redoc:** http://localhost:8001/redoc  
- DB SQLite tự động tạo tại `backend/iot_plant_care.db`

---

## 2. Cài đặt và chạy Frontend (React + Vite)

```bash
cd frontend

# Cài đặt dependencies
npm install

# Copy và chỉnh sửa .env
copy .env.example .env

# Chạy server dev
npm run dev
```

- **Ứng dụng web:** http://localhost:5173  
- Đăng nhập với `admin` / `admin123`

---

## 3. Chạy Tests

```bash
cd backend
.\venv\Scripts\activate
pytest tests/ -v
```

---

## 4. Cấu trúc thư mục

```
plant-care-iot/
├── backend/
│   ├── app/
│   │   ├── core/          # config, database, security, deps, websocket
│   │   ├── models/        # 9 SQLAlchemy models
│   │   ├── schemas/       # Pydantic v2 schemas
│   │   ├── routers/v1/    # auth, users, devices, telemetry, commands, alerts, audit
│   │   └── services/      # mqtt_client, rule_engine, command_service, heartbeat_checker
│   ├── tests/             # unit + integration tests
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/           # auth, devices, telemetry, commands, alerts, users
│   │   ├── auth/          # ProtectedRoute
│   │   ├── components/    # Layout, SensorCard, TelemetryChart
│   │   ├── hooks/         # useWebSocket, useTelemetry
│   │   ├── pages/         # Login, Dashboard, DeviceDetail, DeviceManagement,
│   │   │                  # UserManagement, Alerts, CommandHistory
│   │   ├── store/         # authStore (Zustand)
│   │   └── types/         # TypeScript interfaces
│   ├── package.json
│   └── .env.example
└── README.md
```

---

## 5. MQTT Topics

| Topic | Chiều | Mô tả |
|-------|-------|-------|
| `plant/{deviceId}/telemetry/light` | ESP32 → Backend | Ánh sáng (lux) |
| `plant/{deviceId}/telemetry/soil` | ESP32 → Backend | Độ ẩm đất (%) |
| `plant/{deviceId}/telemetry/air` | ESP32 → Backend | Nhiệt độ + độ ẩm KK |
| `plant/{deviceId}/telemetry/rain` | ESP32 → Backend | Cảm biến mưa (0/1) |
| `plant/{deviceId}/telemetry/waterlevel` | ESP32 → Backend | Mực nước (0=thấp/1=đủ) |
| `plant/{deviceId}/status` | ESP32 → Backend | Heartbeat |
| `plant/{deviceId}/cmd/pump` | Backend → ESP32 | Điều khiển bơm |
| `plant/{deviceId}/cmd/curtain` | Backend → ESP32 | Điều khiển mái che |
| `plant/{deviceId}/ack` | ESP32 → Backend | Xác nhận lệnh |
