# Hướng dẫn chi tiết: Thêm & test một chức năng IoT
## Ví dụ mẫu: Cảm biến độ ẩm đất (Soil Moisture)

> Tài liệu này hướng dẫn **end-to-end** từ lắp mạch → nạp code ESP32 → backend → frontend → kiểm thử trên app.  
> Sau khi hiểu quy trình này, bạn có thể áp dụng tương tự cho mọi cảm biến/chức năng khác.

---

## Tổng quan luồng dữ liệu

```
[Cảm biến đất] ──ADC──> [ESP32] ──MQTT──> [Broker HiveMQ]
                                                │
                                    [Backend FastAPI subscribe]
                                                │
                              ┌─────────────────┼─────────────────┐
                         [Lưu DB]         [Rule Engine]     [WebSocket]
                                               │                  │
                                      [Sinh alert/lệnh]    [Frontend]
                                                                   │
                                                          [Dashboard realtime]
```

---

## BƯỚC 1 — Lắp mạch phần cứng

### Linh kiện cần có
| Linh kiện | Số lượng |
|-----------|----------|
| ESP32 DevKit V1 | 1 |
| Module cảm biến độ ẩm đất (capacitive hoặc resistive) | 1 |
| Dây jumper đực–cái | 4 |
| Breadboard | 1 |
| Cáp USB nạp code | 1 |

### Sơ đồ nối dây

```
Cảm biến độ ẩm đất          ESP32 DevKit V1
┌─────────────────┐          ┌────────────────┐
│  VCC  ──────────┼──────────┼── 3.3V (hoặc 5V pin nếu cảm biến yêu cầu)
│  GND  ──────────┼──────────┼── GND          │
│  AOUT ──────────┼──────────┼── GPIO 34 (ADC)│  ← chân analog output
│  DOUT ──────────┼──  (tuỳ chọn, không dùng ở ví dụ này)
└─────────────────┘          └────────────────┘
```

> **⚠️ Lưu ý chân ADC của ESP32:**
> - Chỉ dùng **ADC1**: GPIO 32, 33, 34, 35, 36, 39.
> - **Tránh ADC2** (GPIO 0, 2, 4, 12–15, 25–27) vì bị xung đột khi Wi-Fi bật.
> - GPIO 34 là **input-only**, không có pull-up/down nội — phù hợp đọc cảm biến.

### Ảnh minh hoạ sơ đồ (mô tả dạng text)

```
          ┌──────────────────────────────────┐
          │          ESP32 DevKit V1          │
          │                                  │
  3.3V ───┤ 3V3                        GND   ├─── GND (cảm biến)
          │                                  │
A_OUT ────┤ GPIO34                           │
          │                                  │
          └──────────────────────────────────┘
              ↑
        (dây cam từ chân AOUT cảm biến)
```

---

## BƯỚC 2 — Cài đặt môi trường lập trình ESP32

### 2.1 Cài Arduino IDE
1. Tải tại: https://www.arduino.cc/en/software
2. Mở **File → Preferences → Additional Board Manager URLs**, thêm:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. **Tools → Board → Boards Manager** → tìm `esp32` → cài **esp32 by Espressif Systems**.

### 2.2 Cài thư viện cần thiết
Mở **Tools → Manage Libraries**, tìm và cài:
- **PubSubClient** (by Nick O'Leary) — MQTT client
- **ArduinoJson** (by Benoit Blanchon) — serialize JSON

### 2.3 Chọn board
**Tools → Board → ESP32 Arduino → ESP32 Dev Module**

---

## BƯỚC 3 — Code ESP32 (firmware)

Tạo file `soil_sensor.ino` với nội dung sau:

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ─── CẤU HÌNH ───────────────────────────────────────────
const char* WIFI_SSID     = "TEN_WIFI_CUA_BAN";
const char* WIFI_PASSWORD = "MAT_KHAU_WIFI";

const char* MQTT_BROKER   = "broker.hivemq.com";  // broker public (dev)
const int   MQTT_PORT     = 1883;
const char* MQTT_CLIENT_ID = "esp32-plant-001";   // phải trùng với device_uid trong DB

// ─── CHÂN GPIO ──────────────────────────────────────────
const int SOIL_PIN = 34;    // chân ADC đọc cảm biến đất

// ─── ĐỊA CHỈ MQTT TOPIC ─────────────────────────────────
// Format: plant/{device_uid}/telemetry/{sensor_type}
const char* TOPIC_SOIL   = "plant/esp32-plant-001/telemetry/soil";
const char* TOPIC_STATUS = "plant/esp32-plant-001/status";
const char* TOPIC_CMD    = "plant/esp32-plant-001/cmd/#";  // nhận mọi lệnh
const char* TOPIC_ACK    = "plant/esp32-plant-001/ack";

// ─── HIỆU CHỈNH CẢM BIẾN ────────────────────────────────
// Đo giá trị ADC thực tế: đặt vào không khí → AIR_VALUE, nhúng vào nước → WATER_VALUE
const int AIR_VALUE   = 3200;   // ADC khi đất khô / không khí
const int WATER_VALUE = 1200;   // ADC khi ngập nước

// ─── KHAI BÁO ───────────────────────────────────────────
WiFiClient espClient;
PubSubClient mqttClient(espClient);

unsigned long lastSendTime   = 0;
unsigned long lastHeartbeat  = 0;
const long SEND_INTERVAL     = 10000;  // gửi telemetry mỗi 10 giây
const long HEARTBEAT_INTERVAL = 15000; // heartbeat mỗi 15 giây

// ─── HÀM ĐỌC CẢM BIẾN ───────────────────────────────────
float readSoilMoisture() {
  // Lấy trung bình 10 lần đọc để giảm nhiễu
  long sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(SOIL_PIN);
    delay(10);
  }
  int rawValue = sum / 10;

  // Chuyển đổi về phần trăm (0–100%)
  float percent = map(rawValue, AIR_VALUE, WATER_VALUE, 0, 100);
  percent = constrain(percent, 0.0, 100.0);  // giới hạn 0–100

  Serial.printf("[SOIL] Raw ADC: %d → Độ ẩm: %.1f%%\n", rawValue, percent);
  return percent;
}

// ─── KẾT NỐI WiFi ───────────────────────────────────────
void connectWiFi() {
  Serial.print("Kết nối WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\nWiFi OK. IP: %s\n", WiFi.localIP().toString().c_str());
}

// ─── CALLBACK KHI NHẬN LỆNH TỪ BACKEND ─────────────────
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String topicStr = String(topic);
  String payloadStr = "";
  for (unsigned int i = 0; i < length; i++) {
    payloadStr += (char)payload[i];
  }

  Serial.printf("[MQTT] Nhận topic: %s\n[MQTT] Payload: %s\n", topic, payloadStr.c_str());

  // Parse JSON
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, payloadStr) != DeserializationError::Ok) {
    Serial.println("[MQTT] Lỗi parse JSON lệnh!");
    return;
  }

  String commandId = doc["command_id"] | "";
  String action    = doc["action"]     | "";

  // Xử lý lệnh bơm
  if (topicStr.endsWith("/cmd/pump")) {
    if (action == "pump_on") {
      int duration = doc["duration"] | 5000;
      Serial.printf("[ACT] Bật bơm %d ms\n", duration);
      // TODO: digitalWrite(RELAY_PIN, HIGH); delay(duration); digitalWrite(RELAY_PIN, LOW);

      // Gửi ACK về backend
      sendAck(commandId, "executed");
    } else if (action == "pump_off") {
      Serial.println("[ACT] Tắt bơm");
      // TODO: digitalWrite(RELAY_PIN, LOW);
      sendAck(commandId, "executed");
    }
  }

  // Xử lý lệnh mái che
  if (topicStr.endsWith("/cmd/curtain")) {
    if (action == "curtain_open") {
      Serial.println("[ACT] Mở mái che");
      // TODO: myServo.write(0);
      sendAck(commandId, "executed");
    } else if (action == "curtain_close") {
      Serial.println("[ACT] Đóng mái che");
      // TODO: myServo.write(90);
      sendAck(commandId, "executed");
    }
  }
}

// ─── GỬI ACK SAU KHI THỰC THI LỆNH ─────────────────────
void sendAck(String commandId, String status) {
  StaticJsonDocument<128> doc;
  doc["command_id"] = commandId;
  doc["status"]     = status;
  doc["timestamp"]  = millis();

  char buffer[128];
  serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_ACK, buffer, true);
  Serial.printf("[MQTT] Đã gửi ACK: %s\n", buffer);
}

// ─── KẾT NỐI MQTT ───────────────────────────────────────
void connectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Kết nối MQTT...");
    if (mqttClient.connect(MQTT_CLIENT_ID)) {
      Serial.println("OK!");
      mqttClient.subscribe(TOPIC_CMD, 1);  // QoS = 1
    } else {
      Serial.printf("Thất bại, rc=%d. Thử lại sau 3s\n", mqttClient.state());
      delay(3000);
    }
  }
}

// ─── GỬI DỮ LIỆU TELEMETRY ──────────────────────────────
void publishTelemetry() {
  float soilMoisture = readSoilMoisture();

  // Tạo JSON theo đúng format backend expect
  StaticJsonDocument<128> doc;
  doc["deviceId"]  = MQTT_CLIENT_ID;
  doc["type"]      = "soil";
  doc["value"]     = soilMoisture;
  doc["unit"]      = "%";
  doc["timestamp"] = millis();  // hoặc dùng NTP timestamp nếu có

  char buffer[128];
  serializeJson(doc, buffer);

  bool ok = mqttClient.publish(TOPIC_SOIL, buffer, false);  // QoS 0 ở đây, dùng true cho QoS 1
  if (ok) {
    Serial.printf("[MQTT] Gửi soil → %s\n", buffer);
  } else {
    Serial.println("[MQTT] Gửi thất bại!");
  }
}

// ─── GỬI HEARTBEAT ──────────────────────────────────────
void publishHeartbeat() {
  StaticJsonDocument<64> doc;
  doc["deviceId"] = MQTT_CLIENT_ID;
  doc["status"]   = "online";

  char buffer[64];
  serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_STATUS, buffer);
}

// ─── SETUP & LOOP ────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("=== Smart Plant Care ESP32 ===");

  connectWiFi();

  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  mqttClient.setKeepAlive(60);

  connectMQTT();
}

void loop() {
  // Giữ kết nối MQTT
  if (!mqttClient.connected()) {
    connectMQTT();
  }
  mqttClient.loop();

  unsigned long now = millis();

  // Gửi telemetry định kỳ
  if (now - lastSendTime >= SEND_INTERVAL) {
    lastSendTime = now;
    publishTelemetry();
  }

  // Gửi heartbeat định kỳ
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = now;
    publishHeartbeat();
  }
}
```

### 3.1 Hiệu chỉnh cảm biến (Calibration)

Trước khi dùng, cần đo giá trị ADC thực tế của cảm biến bạn đang có:

```cpp
// Sketch tạm để đo calibration — nạp riêng, xem Serial Monitor
void setup() { Serial.begin(115200); }
void loop() {
  Serial.printf("ADC Raw: %d\n", analogRead(34));
  delay(500);
}
```

1. Chạy sketch trên, mở Serial Monitor (115200 baud)
2. Để cảm biến trong **không khí** → ghi giá trị → đó là `AIR_VALUE`
3. Nhúng cảm biến vào **ly nước** → ghi giá trị → đó là `WATER_VALUE`
4. Điền 2 giá trị đó vào code chính

### 3.2 Nạp code vào ESP32

1. Kết nối ESP32 qua USB
2. **Tools → Port** → chọn COM port của ESP32 (ví dụ `COM5`)
3. Nhấn nút **Upload** (→)
4. Khi Serial Monitor in `WiFi OK` và `Kết nối MQTT...OK!` là thành công

---

## BƯỚC 4 — Backend nhận dữ liệu (code đã có sẵn)

Backend đã được cấu hình để nhận dữ liệu qua MQTT. Xem lại luồng xử lý:

### 4.1 MQTT Client subscribe ([`mqtt_client.py`](../backend/app/services/mqtt_client.py))

```python
# Trong on_connect — đã subscribe sẵn tất cả telemetry
client.subscribe("plant/+/telemetry/+")  # + là wildcard (bất kỳ device_uid / sensor_type)
client.subscribe("plant/+/status")
client.subscribe("plant/+/ack")
```

### 4.2 Xử lý khi nhận soil telemetry ([`mqtt_client.py`](../backend/app/services/mqtt_client.py))

```python
def handle_telemetry(self, db, device, sensor_type, payload):
    data  = json.loads(payload)
    value = float(data.get("value", 0))

    # 1. Lưu vào bảng telemetry
    telemetry = Telemetry(
        device_id   = device.id,
        sensor_type = sensor_type,   # "soil"
        value       = value,          # ví dụ: 28.5
        unit        = data.get("unit") # "%"
    )
    db.add(telemetry)
    db.commit()

    # 2. Gọi Rule Engine kiểm tra ngưỡng
    rule_engine.evaluate(db, device.id, telemetry)

    # 3. Broadcast realtime qua WebSocket đến tất cả client đang xem device này
    manager.broadcast(str(device.id), {
        "type": "telemetry",
        "data": {
            "sensor_type": "soil",
            "value":       value,
            "timestamp":   telemetry.timestamp.isoformat()
        }
    })
```

### 4.3 Rule Engine tự động tưới ([`rule_engine.py`](../backend/app/services/rule_engine.py))

```python
# Luật 3: Đất khô → bật bơm (nếu điều kiện cho phép)
if sensor_type == 'soil' and value < 30:
    air_temp   = get_latest('air_temp')   # nhiệt độ hiện tại
    rain       = get_latest('rain')       # có mưa không?
    waterlevel = get_latest('waterlevel') # mực nước bình chứa

    if air_temp < 35 and rain == 0 and waterlevel > 0:
        # Đủ điều kiện → tự động bật bơm 5 giây
        command_service.create_and_send_command(
            db        = db,
            device_id = device_id,
            action    = 'pump_on',
            payload   = json.dumps({"duration": 5000}),
            issued_by_user_id = None  # lệnh tự động
        )
    elif air_temp >= 35:
        # Nhiệt độ cao → chỉ cảnh báo, không tưới
        self._create_alert(db, device_id, "Chờ tưới do nhiệt độ cao", "warning")
```

### 4.4 REST API kiểm tra dữ liệu ([`telemetry.py`](../backend/app/routers/v1/telemetry.py))

```python
# GET /api/v1/telemetry?device_id=1&sensor_type=soil&limit=50
@router.get("", response_model=List[TelemetryResponse])
def get_telemetry(device_id: int, sensor_type: Optional[str] = None, limit: int = 100, ...):
    query = db.query(Telemetry).filter(Telemetry.device_id == device_id)
    if sensor_type:
        query = query.filter(Telemetry.sensor_type == sensor_type)
    return query.order_by(Telemetry.timestamp.desc()).limit(limit).all()

# GET /api/v1/telemetry/latest?device_id=1
# → Trả về giá trị mới nhất của từng loại cảm biến
```

### 4.5 Thêm device vào DB (nếu chưa có)

Thiết bị `esp32-plant-001` trong ESP32 code phải tồn tại trong DB. Đăng ký qua API:

```bash
# 1. Login lấy token
curl -X POST http://localhost:8001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'

# 2. Tạo device với device_uid khớp với MQTT_CLIENT_ID trong ESP32
curl -X POST http://localhost:8001/api/v1/devices \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{"name": "Cây cảnh phòng khách", "location": "Phòng khách"}'

# → Sẽ nhận device_uid kiểu "esp32-plant-xxxxxx"
# Cập nhật MQTT_CLIENT_ID trong code ESP32 cho khớp!
```

> **⚠️ Quan trọng:** `MQTT_CLIENT_ID` trong ESP32 (và MQTT topic) **phải khớp** với `device_uid` trong DB.

---

## BƯỚC 5 — Frontend hiển thị dữ liệu (code đã có sẵn)

### 5.1 API gọi dữ liệu ([`telemetry.ts`](../frontend/src/api/telemetry.ts))

```typescript
// Lấy giá trị mới nhất của tất cả cảm biến
export const telemetryApi = {
  latest: (device_id: number) =>
    api.get<Record<string, Telemetry>>('/telemetry/latest', { params: { device_id } })
       .then(res => res.data),

  list: (params: { device_id: number; type?: string; limit?: number }) =>
    api.get<Telemetry[]>('/telemetry', { params }).then(res => res.data),
};
```

### 5.2 WebSocket nhận realtime ([`useWebSocket.ts`](../frontend/src/hooks/useWebSocket.ts))

```typescript
// Hook kết nối WebSocket theo device_id
export const useWebSocket = (deviceId: number | null) => {
  const [lastMessage, setLastMessage] = useState<any>(null);

  useEffect(() => {
    const ws = new WebSocket(
      `ws://localhost:8001/ws/devices/${deviceId}?token=${localStorage.getItem('access_token')}`
    );

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setLastMessage(data);
      // data có dạng: { type: "telemetry", data: { sensor_type: "soil", value: 28.5 } }
    };

    // Auto-reconnect sau 3s nếu mất kết nối
    ws.onclose = () => setTimeout(() => /* reconnect */, 3000);
  }, [deviceId]);

  return { lastMessage };
};
```

### 5.3 Dashboard cập nhật realtime ([`Dashboard.tsx`](../frontend/src/pages/Dashboard.tsx))

```tsx
// Nhận message WebSocket và cập nhật state
const { lastMessage } = useWebSocket(selectedDeviceId);
const [realtimeTelemetry, setRealtimeTelemetry] = useState<Record<string, any>>({});

useEffect(() => {
  if (!lastMessage) return;

  if (lastMessage.type === 'telemetry') {
    // Cập nhật đúng sensor tương ứng
    setRealtimeTelemetry(prev => ({
      ...prev,
      [lastMessage.data.sensor_type]: lastMessage.data
      // soil: { value: 28.5, timestamp: "2026-09-26T12:00:00" }
    }));
  }
}, [lastMessage]);

// Render card độ ẩm đất
<SensorCard
  title="Độ ẩm đất"
  value={realtimeTelemetry['soil']?.value ?? '--'}
  unit="%"
  icon={<ExperimentOutlined />}
  color="#8c4356"
/>
```

### 5.4 Biểu đồ lịch sử ([`DeviceDetail.tsx`](../frontend/src/pages/DeviceDetail.tsx))

```tsx
// Lấy 100 bản ghi gần nhất của sensor soil
const { data: soilHistory } = useQuery({
  queryKey: ['telemetry', deviceId, 'soil'],
  queryFn: () => telemetryApi.list({
    device_id : Number(deviceId),
    type      : 'soil',
    limit     : 100,
  }),
});

// Vẽ biểu đồ Recharts
<TelemetryChart data={soilHistory ?? []} sensorType="soil" />
```

---

## BƯỚC 6 — Thao tác trên App để nhận dữ liệu

### 6.1 Đăng nhập

1. Mở trình duyệt: **http://localhost:5173**
2. Nhập `admin` / `admin123` → nhấn **Đăng nhập**

### 6.2 Đăng ký thiết bị

1. Vào menu **Devices** → nhấn **Thêm thiết bị**
2. Điền `Tên thiết bị` (vd: "Cây cảnh phòng khách"), `Vị trí` (vd: "Phòng khách")
3. Nhấn **Tạo** → hệ thống sinh `device_uid` (vd: `esp32-plant-a15wpk`)
4. **Copy `device_uid`** này → cập nhật vào biến `MQTT_CLIENT_ID` trong code ESP32
5. Nạp lại code vào ESP32

### 6.3 Kiểm tra thiết bị active

Sau khi ESP32 gửi telemetry đầu tiên:
- Trạng thái thiết bị trong Devices list sẽ chuyển từ **REGISTERED** → **ACTIVE** (badge xanh)
- Nếu sau 30 giây không có heartbeat → chuyển **OFFLINE** (badge đỏ)

### 6.4 Xem dữ liệu realtime trên Dashboard

1. Vào **Dashboard**
2. Chọn thiết bị vừa đăng ký trong dropdown
3. Badge **WS Connected** sẽ xanh nếu WebSocket kết nối thành công
4. Card **Độ ẩm đất** cập nhật mỗi khi ESP32 gửi dữ liệu (mỗi 10 giây)

### 6.5 Xem biểu đồ lịch sử

1. Trong danh sách Devices → click **Chi tiết** trên thiết bị
2. Trang DeviceDetail hiện biểu đồ LineChart lịch sử theo thời gian
3. Chọn khoảng thời gian bằng date range picker

### 6.6 Xem và xử lý cảnh báo

Khi độ ẩm đất < 30%:
1. Backend tự sinh Alert → hiển thị trong panel Alerts (Dashboard + trang Alerts)
2. Click **Acknowledge** để xác nhận đã biết
3. Click **Resolve** sau khi tưới xong

---

## BƯỚC 7 — Kiểm thử (Test)

### 7.1 Test nhanh bằng MQTT Client (không cần ESP32)

Cài **MQTT Explorer** (https://mqtt-explorer.com/) hoặc dùng CLI:

```bash
# Cài mosquitto-clients (Windows: tải từ mosquitto.org)
# Gửi giả lập dữ liệu soil về backend

mosquitto_pub \
  -h broker.hivemq.com \
  -p 1883 \
  -t "plant/esp32-plant-a15wpk/telemetry/soil" \
  -m '{"deviceId":"esp32-plant-a15wpk","type":"soil","value":25.0,"unit":"%"}' \
  -q 1
```

**Kết quả mong đợi:**
- Backend log: `Received telemetry: soil = 25.0%`
- Dashboard cập nhật card Độ ẩm đất → 25%
- Vì 25 < 30 → Rule Engine kích hoạt → sinh alert hoặc gửi lệnh bơm
- Alert xuất hiện trong trang Alerts

### 7.2 Test API trực tiếp (Swagger UI)

Mở http://localhost:8001/docs

1. **POST /api/v1/auth/login** → lấy `access_token`
2. Click **Authorize** → nhập `Bearer <access_token>`
3. **GET /api/v1/telemetry/latest?device_id=1** → xem giá trị mới nhất
4. **GET /api/v1/alerts?device_id=1&status=open** → xem cảnh báo

### 7.3 Test gửi lệnh thủ công

```bash
# Gửi lệnh bật bơm thủ công qua API
curl -X POST http://localhost:8001/api/v1/commands \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{"device_id": 1, "action": "pump_on"}'
```

**Trên Serial Monitor ESP32** sẽ in:
```
[MQTT] Nhận topic: plant/esp32-plant-001/cmd/pump
[MQTT] Payload: {"command_id":"cmd-abc123","action":"pump_on","duration":5000}
[ACT] Bật bơm 5000 ms
[MQTT] Đã gửi ACK: {"command_id":"cmd-abc123","status":"executed"}
```

### 7.4 Test kiểm tra rule engine (không cần phần cứng)

```bash
# Gửi nhiều giá trị soil thấp liên tiếp để kích hoạt rule
for i in 20 22 18 15; do
  mosquitto_pub -h broker.hivemq.com -t "plant/esp32-plant-a15wpk/telemetry/soil" \
    -m "{\"value\":$i,\"unit\":\"%\"}" -q 1
  sleep 2
done
```

---

## BƯỚC 8 — Quy trình thêm cảm biến mới (checklist)

Khi muốn thêm cảm biến mới (ví dụ: cảm biến ánh sáng BH1750), làm theo thứ tự:

```
✅ 1. Lắp dây theo datasheet cảm biến
✅ 2. Code ESP32: đọc giá trị, publish topic plant/{uid}/telemetry/light
✅ 3. Kiểm tra topic + payload bằng MQTT Explorer trước
✅ 4. Backend: sensor_type mới được nhận tự động (không cần sửa backend)
       Nếu muốn validate giá trị → thêm trong handle_telemetry()
✅ 5. Rule Engine: thêm luật mới nếu cần tự động hoá
✅ 6. Frontend Dashboard: thêm <SensorCard> mới
✅ 7. Frontend DeviceDetail: thêm tab/chart cho sensor mới
✅ 8. Test bằng MQTT Explorer không cần ESP32
✅ 9. Test end-to-end với phần cứng thật
```

---

## Tóm tắt các giá trị quan trọng

| Thông số | Giá trị |
|----------|---------|
| MQTT Broker (dev) | `broker.hivemq.com:1883` |
| Format topic | `plant/{device_uid}/telemetry/{sensor_type}` |
| Format payload | `{"deviceId":"...", "value":28.5, "unit":"%"}` |
| Sensor types hợp lệ | `light`, `soil`, `air_temp`, `air_humidity`, `rain`, `waterlevel` |
| Ngưỡng đất khô | `< 30%` → kích hoạt rule engine |
| Heartbeat interval | mỗi 15 giây từ ESP32 |
| Offline threshold | không heartbeat > 30 giây |
| Backend URL | http://localhost:8001 |
| Frontend URL | http://localhost:5173 |
| WebSocket URL | `ws://localhost:8001/ws/devices/{device_id}?token=...` |
