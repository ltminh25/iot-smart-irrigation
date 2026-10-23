# Tài liệu Mô tả Cập nhật Hệ thống theo Mạch Phần cứng Thực tế (ESP8266)

> Tài liệu này tổng hợp toàn bộ các chỉnh sửa trên **Firmware ESP8266**, **Backend FastAPI**, và **Frontend React** để đồng bộ với hiện trạng đấu dây thực tế trong [`HARDWARE_10_18.md`](./HARDWARE_10_18.md) và yêu cầu đề tài trong [`bao-cao-iot-cham-soc-cay.md`](./bao-cao-iot-cham-soc-cay.md).

---

## 1. Tổng quan cấu hình phần cứng thực tế (`esp8266-plant-01`)

| Thành phần | Linh kiện thực tế | Chân ESP8266 NodeMCU | Nguồn cấp | Ghi chú kỹ thuật |
|---|---|---|---|---|
| **Vi điều khiển** | ESP8266 NodeMCU | — | Củ sạc 5V ≥ 1A qua cổng USB | Kết nối WiFi 2.4GHz + MQTT |
| **Cảm biến độ ẩm đất** | Đầu đo + Module LM393 (chân `AO`) | `A0` (ADC 0–3.3V) | `3V` và `G` của ESP | `ADC_DRY = 850`, `ADC_WET = 400` → quy đổi `0–100%` |
| **Cảm biến ánh sáng** | Module BH1750 (GY-302, I2C `0x23`) | `D1` (`GPIO5` - SCL), `D2` (`GPIO4` - SDA) | `3V` và `G` của ESP | Đo cường độ sáng đơn vị `lux` |
| **Điều khiển máy bơm** | Relay 1 kênh 5V + Bơm mini DC 6V | `D5` (`GPIO14` - IN) | Relay: `VU (5V)` & `G`<br>Bơm: Pin 6V độc lập qua `COM`/`NO` | **Cơ chế thả nổi (Floating)**:<br>• Bật: `pinMode(D5, OUTPUT); digitalWrite(D5, LOW);`<br>• Tắt: `pinMode(D5, INPUT);` (đảm bảo opto 5V ngắt hẳn) |
| **Điều khiển mái che** | Servo SG90/MG90S + Tụ 470–1000µF | `D6` (`GPIO12` - PWM) | `VU (5V)` và `G` của ESP | • Mở mái che (`curtain_open`): góc `60°`<br>• Đóng mái che (`curtain_close`): góc `120°`<br>• Tự động `detach()` sau `650ms` để chống rung & sụt áp |

---

## 2. Chi tiết chỉnh sửa Firmware ESP8266 (`sketch_oct8a/sketch_oct8a.ino`)

File đã cập nhật: [`sketch_oct8a/sketch_oct8a.ino`](./sketch_oct8a/sketch_oct8a.ino)

### 2.1. Các thư viện sử dụng
- Có sẵn trong gói cài đặt board ESP8266: `ESP8266WiFi.h`, `ESP8266WebServer.h`, `Wire.h`, `Servo.h`
- Cần cài trong **Arduino IDE → Library Manager**:
  - `BH1750` (tác giả: *Christopher Laws*)
  - `PubSubClient` (tác giả: *Nick O'Leary*)

### 2.2. Các cơ chế an toàn phần cứng đã tích hợp
1. **Chống kẹt Relay 5V trên mạch 3.3V (`setPump`)**:
   - Khi bật bơm: chuyển `D5` sang `OUTPUT` và xuất mức `LOW`.
   - Khi tắt bơm: chuyển `D5` về `INPUT` (thả nổi trở kháng cao) để dòng qua opto-coupler của module relay bằng 0, ngắt tiếp điểm hoàn toàn.
   - Tự động ngắt bơm sau tối đa `MAX_PUMP_MS = 10000` ms (10 giây) hoặc theo thời lượng `duration` nhận từ lệnh MQTT (mặc định 5 giây) để chống chạy khô.
2. **Chống sụt áp và chống rung Servo (`moveCurtain`)**:
   - Giới hạn góc quay trong vùng an toàn `60°` (Mở) và `120°` (Đóng), tránh chạm điểm chết cơ khí `0°`/`180°`.
   - Khi nhận lệnh quay: gọi `curtainServo.attach(D6, 500, 2400)` → `write(góc)` → sau `650ms` tự động gọi `curtainServo.detach()` trong `loop()`.
   - **Khoá chéo nguồn (Interlock)**: Không cho phép bơm và servo hoạt động cùng một thời điểm. Nếu bơm đang chạy mà có lệnh quay servo, hệ thống tự ngắt bơm trước khi quay servo; nếu servo đang quay mà có lệnh bật bơm, hệ thống `detach()` servo ngay.
3. **Kết nối MQTT không chặn (`non-blocking`)**:
   - Nếu mất WiFi hoặc mất kết nối broker MQTT, vòng lặp `loop()` vẫn chạy bình thường, đảm bảo bộ đếm tự tắt bơm an toàn và Web Server cục bộ không bao giờ bị treo.

### 2.3. Cấu trúc MQTT Topic của `esp8266-plant-01`

| Topic | Chiều | Payload JSON mẫu | Chu kỳ / Sự kiện |
|---|---|---|---|
| `plant/esp8266-plant-01/telemetry/soil` | ESP8266 → Backend | `{"deviceId":"esp8266-plant-01","type":"soil","value":45,"raw":647,"unit":"%"}` | Mỗi 5 giây |
| `plant/esp8266-plant-01/telemetry/light` | ESP8266 → Backend | `{"deviceId":"esp8266-plant-01","type":"light","value":1250.5,"unit":"lux"}` | Mỗi 5 giây |
| `plant/esp8266-plant-01/status` | ESP8266 → Backend | `{"deviceId":"esp8266-plant-01","status":"online","uptime":120,"firmwareVersion":"1.0.0"}` | Mỗi 15 giây + LWT (`offline`) |
| `plant/esp8266-plant-01/cmd/pump` | Backend → ESP8266 | `{"command_id":"cmd-a1b2c3d4","action":"pump_on","duration":5000}` | Khi tự động hoặc bấm nút |
| `plant/esp8266-plant-01/cmd/curtain` | Backend → ESP8266 | `{"command_id":"cmd-e5f6g7h8","action":"curtain_close"}` | Khi tự động hoặc bấm nút |
| `plant/esp8266-plant-01/ack` | ESP8266 → Backend | `{"command_id":"cmd-a1b2c3d4","deviceId":"esp8266-plant-01","status":"executed"}` | Ngay sau khi thực thi lệnh |

### 2.4. Giao diện Web cục bộ & Serial Monitor trên ESP8266
Ngoài việc kết nối với Backend/Frontend qua MQTT, ESP8266 vẫn chạy Web Server tại `http://<IP_ESP8266>/`:
- `GET /`: Trang điều khiển trực tiếp hiển thị Độ ẩm đất (`%` + `Raw ADC`), Ánh sáng (`lux`), trạng thái MQTT, nút Bật/Tắt bơm và Mở (`60°`)/Đóng (`120°`) mái che.
- `GET /status`: Trả về JSON đầy đủ trạng thái phần cứng.
- `GET /pump?on=1` hoặc `/pump?on=0`: Bật/tắt bơm trực tiếp.
- `GET /curtain?act=open` hoặc `/curtain?act=close`: Mở/đóng mái che trực tiếp.
- **Lệnh qua Serial (115200 baud)**: Gõ `1` (bật bơm), `0` (tắt bơm), `o` (mở mái che 60°), `c` (đóng mái che 120°), `s` (in JSON trạng thái).

---

## 3. Chi tiết chỉnh sửa Backend FastAPI

| File chỉnh sửa | Nội dung thay đổi |
|---|---|
| [`backend/app/core/database.py`](./backend/app/core/database.py) | Tự động khởi tạo (seed) thiết bị mặc định `esp8266-plant-01` (*"Node Chăm Sóc Cây ESP8266"*) và 4 quy tắc cảnh báo cho cảm biến `soil` và `light` ngay khi khởi động server. |
| [`backend/app/services/rule_engine.py`](./backend/app/services/rule_engine.py) | Cập nhật Rule Engine chỉ xét 2 cảm biến thực tế (`soil` và `light`):<br>• **Luật 1 (`light > 7000 lux`)**: Tự động gửi lệnh `curtain_close` (đóng mái che 120°) + tạo cảnh báo `warning`.<br>• **Luật 2 (`light < 2000 lux`)**: Tự động gửi lệnh `curtain_open` (mở mái che 60°) nếu lệnh mái che gần nhất là đóng.<br>• **Luật 3 (`soil < 30%`)**: Nếu ánh sáng không quá gắt (`≤ 15000 lux`), tự động gửi lệnh `pump_on` (`duration: 5000` ms, có thời gian chờ cooldown 30s). Nếu nắng quá gắt (`> 15000 lux`), tạm hoãn tưới và phát cảnh báo tránh sốc nhiệt.<br>• **Luật 4 (`soil < 15%`)**: Sinh cảnh báo khẩn cấp (`critical`) nhắc kiểm tra nguồn nước và máy bơm. |
| [`backend/app/core/websocket.py`](./backend/app/core/websocket.py) & [`backend/app/main.py`](./backend/app/main.py) | Thêm hàm `manager.broadcast_sync()` dùng `asyncio.run_coroutine_threadsafe` để đẩy dữ liệu từ luồng nền MQTT và APScheduler sang WebSocket tới trình duyệt theo thời gian thực. |
| [`backend/app/services/mqtt_client.py`](./backend/app/services/mqtt_client.py) | Kiểm tra miền giá trị hợp lệ của `soil` (`0–100%`) và `light` (`0–200000 lux`), cập nhật trạng thái thiết bị `active`/`offline` từ bản tin heartbeat/LWT, chuẩn hoá tên lệnh điều khiển và đẩy thông báo ACK qua WebSocket. |
| [`backend/app/services/command_service.py`](./backend/app/services/command_service.py) | Giải nén `payload` JSON (như `{"duration": 5000}`) trực tiếp vào bản tin MQTT và phát sự kiện `command_ack` qua WebSocket khi ESP8266 phản hồi. |
| [`backend/app/routers/v1/telemetry.py`](./backend/app/routers/v1/telemetry.py) | Đồng bộ query params (`from`, `to`, `type`) với Frontend và trả về dữ liệu của 2 cảm biến thực tế `soil`, `light`. |
| [`backend/app/schemas/schemas.py`](./backend/app/schemas/schemas.py) | Bổ sung trường `role` (tên vai trò: `admin`, `owner`, `viewer`) vào `UserResponse` để phân quyền giao diện chính xác. |
| [`backend/tests/test_rule_engine.py`](./backend/tests/test_rule_engine.py) | Cập nhật bộ unit test kiểm thử 4 kịch bản của Rule Engine mới (`pytest` đạt 5/5 PASS). |

---

## 4. Chi tiết chỉnh sửa Frontend React

| File chỉnh sửa | Nội dung thay đổi |
|---|---|
| [`frontend/src/pages/Dashboard.tsx`](./frontend/src/pages/Dashboard.tsx) | • Tự động chọn thiết bị `esp8266-plant-01` khi mở trang.<br>• Chỉ hiển thị **2 thẻ cảm biến thực tế**: **Độ ẩm đất (`A0 - %`)** và **Cường độ ánh sáng (`BH1750 - lux`)**, kèm nhãn trạng thái ngưỡng tự động; ẩn các cảm biến chưa lắp trên mạch.<br>• Chuẩn hoá 4 nút điều khiển gửi đúng mã lệnh: `pump_on` (Bật bơm 5s), `pump_off` (Tắt bơm), `curtain_open` (Mở mái che 60°), `curtain_close` (Đóng mái che 120°).<br>• Hiển thị phản hồi thực thi lệnh (`EXECUTED`) ngay khi nhận ACK từ ESP8266 qua WebSocket. |
| [`frontend/src/pages/DeviceDetail.tsx`](./frontend/src/pages/DeviceDetail.tsx) | • Rút gọn khu vực biểu đồ lịch sử còn 2 tab: **Độ ẩm đất (%) - Chân A0** và **Cường độ ánh sáng (lux) - BH1750 (D1/D2)**.<br>• Bổ sung cụm 4 nút điều khiển thủ công ngay trên thẻ thông tin thiết bị và tự động làm mới bảng lịch sử lệnh. |

---

## 5. Hướng dẫn chạy và kiểm thử toàn trình (End-to-End)

### Bước 1: Nạp code cho ESP8266
1. Mở file [`sketch_oct8a/sketch_oct8a.ino`](./sketch_oct8a/sketch_oct8a.ino) bằng Arduino IDE.
2. Kiểm tra tên WiFi (`WIFI_SSID`) và mật khẩu (`WIFI_PASS`) ở đầu file.
3. Chọn **Tools → Board → NodeMCU 1.0 (ESP-12E Module)** và cổng COM tương ứng, sau đó bấm **Upload**.
4. Mở **Serial Monitor (115200 baud)** để xác nhận:
   - `[I2C] BH1750 (0x23) đã sẵn sàng.`
   - `WiFi đã kết nối! IP cục bộ: ...`
   - `[MQTT] Đang kết nối tới broker.hivemq.com ... THÀNH CÔNG!`

### Bước 2: Khởi động Backend FastAPI
```powershell
cd "E:\Ki 1 nam 4 BTL cac mon\IOT Cham soc cay\backend"
.\venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Bước 3: Khởi động Frontend React
```powershell
cd "E:\Ki 1 nam 4 BTL cac mon\IOT Cham soc cay\frontend"
cmd /c "npm run dev"
```
- Truy cập `http://localhost:5173`, đăng nhập bằng tài khoản mặc định: **`admin` / `admin123`**.
- Thiết bị **`Node Chăm Sóc Cây ESP8266 (esp8266-plant-01)`** sẽ được chọn sẵn, hiển thị trực tiếp Độ ẩm đất & Cường độ ánh sáng từ mạch phần cứng.
