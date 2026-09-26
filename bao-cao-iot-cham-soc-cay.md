# BÁO CÁO ĐỒ ÁN KẾT THÚC HỌC PHẦN
## Học phần: IoT và ứng dụng
## Đề tài: Hệ thống IoT Chăm sóc cây tự động (Smart Plant Care System)

---

## 1. Thông tin nhóm và bảng phân công công việc

| Thành viên | MSSV | Vai trò kỹ thuật | Cảm biến/Actuator phụ trách | Phần hệ thống lõi phụ trách |
|---|---|---|---|---|
| A | ... | Firmware + Backend Auth | Ánh sáng (BH1750/LDR) + mái che (servo) | Authentication, phân quyền theo vai trò |
| B | ... | Firmware + Backend Device | Độ ẩm đất + bơm tưới (relay) | Quản lý vòng đời thiết bị |
| C | ... | Firmware + Backend Rule Engine | Nhiệt độ – độ ẩm không khí (DHT22/SHT31) | Rule engine cảnh báo, lịch sử alert |
| D | ... | Firmware + Frontend | Cảm biến mưa | Dashboard tổng thể, lịch sử lệnh điều khiển |

Mỗi thành viên chịu trách nhiệm toàn bộ luồng dữ liệu của module mình: cảm biến → firmware → MQTT → backend → lưu trữ → hiển thị, để đảm bảo có thể giải thích và bảo vệ độc lập phần việc khi vấn đáp.

---

## 2. Tóm tắt đồ án

Hệ thống IoT giám sát và chăm sóc cây tự động, tích hợp 4 loại cảm biến (ánh sáng, độ ẩm đất, nhiệt độ – độ ẩm không khí, mưa) và 2 cơ cấu chấp hành (mái che, bơm tưới). Hệ thống có backend quản lý người dùng/thiết bị đầy đủ, giao tiếp qua giao thức MQTT, dashboard web hiển thị dữ liệu thời gian thực, cơ chế cảnh báo theo ngưỡng, và các biện pháp bảo mật cơ bản (xác thực JWT, phân quyền theo vai trò, mã hóa mật khẩu).

---

## 3. Giới thiệu bài toán

### 3.1. Bối cảnh và vấn đề cần giải quyết

Người trồng cây tại nhà, ban công, hoặc quy mô nhà kính nhỏ thường gặp khó khăn:
- Không có mặt thường xuyên để tưới cây đúng thời điểm (đất khô nhưng không biết).
- Cây bị cháy nắng vào giờ nắng gắt do không kịp che chắn.
- Tưới cây sai thời điểm (ví dụ tưới khi trời sắp mưa, hoặc tưới khi nhiệt độ quá cao gây sốc nhiệt cho rễ) làm giảm hiệu quả chăm sóc, lãng phí nước.
- Không có dữ liệu lịch sử để đánh giá điều kiện sống của cây theo thời gian.

### 3.2. Đối tượng sử dụng và các bên liên quan

- **Người trồng cây tại nhà / chủ sở hữu thiết bị**: theo dõi và điều khiển cây của mình.
- **Quản trị viên hệ thống**: quản lý toàn bộ người dùng, thiết bị, cấu hình hệ thống.
- **Người xem (viewer)**: được chia sẻ quyền xem (ví dụ thành viên gia đình), không có quyền điều khiển.

### 3.3. Mục tiêu của hệ thống

- Tự động hoá việc tưới nước và che nắng dựa trên dữ liệu cảm biến thời gian thực.
- Cảnh báo sớm khi điều kiện môi trường bất thường (khô hạn kéo dài, nhiệt độ/độ ẩm không khí cao dễ sinh nấm mốc, hết nước trong bình chứa).
- Cho phép giám sát và điều khiển từ xa qua giao diện web.
- Lưu trữ lịch sử dữ liệu để người dùng đánh giá xu hướng chăm sóc cây.

### 3.4. Phạm vi triển khai

- Quy mô nguyên mẫu: 1 node thiết bị chính (có thể mở rộng nhiều node theo khu vực đặt cây), sử dụng ESP32.
- Áp dụng cho không gian nhỏ: ban công, sân thượng, nhà kính mini.
- Không bao gồm tưới tiêu quy mô nông nghiệp lớn hoặc điều khiển đa vùng phức tạp.

### 3.5. Các kịch bản sử dụng chính (Use Case)

1. Người dùng đăng ký tài khoản và đăng nhập hệ thống.
2. Chủ thiết bị đăng ký (onboarding) một node ESP32 mới vào hệ thống.
3. Thiết bị gửi dữ liệu cảm biến định kỳ về backend.
4. Hệ thống tự động ra quyết định tưới/che dựa trên luật đã cấu hình.
5. Người dùng xem dashboard thời gian thực và lịch sử dữ liệu.
6. Người dùng gửi lệnh điều khiển thủ công (bật bơm, đóng/mở mái che).
7. Hệ thống phát hiện thiết bị offline và cảnh báo.
8. Hệ thống sinh cảnh báo khi vượt ngưỡng (đất quá khô, hết nước, nhiệt độ/độ ẩm không khí bất thường).
9. Quản trị viên khóa hoặc decommission một thiết bị.
10. Người xem chỉ được xem dữ liệu, không thể gửi lệnh điều khiển (kiểm thử phân quyền).

### 3.6. Yêu cầu chức năng

- Thu thập dữ liệu từ 4 loại cảm biến.
- Điều khiển 2 loại cơ cấu chấp hành.
- Quản lý người dùng, vai trò, quyền.
- Quản lý vòng đời thiết bị đầy đủ.
- Lưu trữ và truy vấn dữ liệu telemetry theo thời gian.
- Sinh cảnh báo theo ngưỡng và lưu lịch sử.
- Giao diện dashboard, cấu hình, điều khiển, lịch sử.

### 3.7. Yêu cầu phi chức năng

- Độ trễ từ cảm biến đến dashboard: mục tiêu dưới 3 giây trong điều kiện mạng ổn định.
- Độ trễ lệnh điều khiển: dưới 2 giây.
- Hệ thống phải tự động kết nối lại khi mất mạng.
- Hệ thống chịu được tối thiểu 1 node hoạt động liên tục 24 giờ không lỗi nghiêm trọng.
- Giao diện phải hiển thị đúng trạng thái thiết bị (online/offline) trong vòng 30 giây kể từ khi mất kết nối (dựa trên heartbeat timeout).

### 3.8. Ràng buộc

- **Chi phí**: linh kiện phổ thông, giá rẻ (ESP32, DHT22, cảm biến độ ẩm đất capacitive, module mưa, servo SG90, relay 5V, máy bơm mini).
- **Thiết bị**: 1 board ESP32 cho mỗi node.
- **Năng lượng**: cấp nguồn qua adapter 5V, không yêu cầu pin/năng lượng mặt trời trong phạm vi nguyên mẫu.
- **Mạng**: Wi-Fi nội bộ (2.4GHz), broker MQTT có thể host cục bộ hoặc cloud miễn phí (ví dụ HiveMQ Cloud, hoặc Mosquitto tự triển khai qua Docker).
- **Độ trễ**: chấp nhận độ trễ mạng LAN/Wi-Fi thông thường.
- **Độ tin cậy**: dữ liệu telemetry có thể mất một vài bản tin do mất kết nối tạm thời, không yêu cầu đảm bảo 100%.
- **An toàn**: không đấu nối trực tiếp điện lưới; bơm nước dùng relay cách ly, nguồn DC thấp áp.
- **Quyền riêng tư**: không thu thập hình ảnh/âm thanh, chỉ dữ liệu môi trường; dữ liệu tài khoản người dùng được bảo vệ theo cơ chế xác thực.

### 3.9. Tiêu chí đánh giá thành công

- Demo được đầy đủ luồng dữ liệu đầu cuối: cảm biến → backend → dashboard → cảnh báo/điều khiển.
- Hệ thống tự động tưới/che đúng theo luật đã định nghĩa trong điều kiện thực tế.
- Có đầy đủ chức năng quản lý người dùng, thiết bị, bảo mật theo yêu cầu bắt buộc của đề bài.
- Vượt qua tối thiểu 2 kịch bản kiểm thử bảo mật.

### 3.10. Vì sao cần giải pháp IoT thay vì ứng dụng web/phần mềm quản lý thông thường

Bài toán đòi hỏi thu thập dữ liệu vật lý (ánh sáng, độ ẩm đất, nhiệt độ, mưa) theo thời gian thực từ môi trường thực và phản hồi lại bằng hành động vật lý (tưới nước, che nắng) mà không cần con người can thiệp trực tiếp. Một ứng dụng phần mềm thuần túy không thể đọc cảm biến vật lý hay điều khiển cơ cấu chấp hành — cần có thiết bị nhúng kết nối mạng, giao thức truyền dữ liệu thời gian thực (MQTT) và backend xử lý luồng dữ liệu liên tục, đây chính là đặc trưng của một hệ thống IoT.

---

## 4. Kiến trúc hệ thống tổng thể

### 4.1. Sơ đồ kiến trúc (mô tả dạng khối)

```
┌─────────────────────────┐
│      ESP32 Node          │
│  - Cảm biến ánh sáng     │
│  - Cảm biến độ ẩm đất    │
│  - Cảm biến nhiệt/ẩm KK  │
│  - Cảm biến mưa          │
│  - Servo (mái che)       │
│  - Relay + Bơm nước      │
└────────────┬─────────────┘
             │ MQTT (Wi-Fi/TLS)
             ▼
┌─────────────────────────┐
│      MQTT Broker          │
│   (Mosquitto / HiveMQ)   │
└────────────┬─────────────┘
             │ Subscribe/Publish
             ▼
┌─────────────────────────┐
│        Backend API        │
│  - Auth & phân quyền      │
│  - Quản lý thiết bị        │
│  - Xử lý telemetry         │
│  - Rule engine cảnh báo    │
│  - Lịch sử lệnh điều khiển │
└────────────┬─────────────┘
             │ REST/HTTPS + WebSocket
             ▼
┌─────────────────────────┐
│     Cơ sở dữ liệu          │
│  (PostgreSQL/MySQL)       │
└────────────┬─────────────┘
             │
             ▼
┌─────────────────────────┐
│    Frontend Web/App       │
│  - Dashboard thời gian thực│
│  - Quản lý thiết bị/user   │
│  - Xem lịch sử, cảnh báo   │
│  - Điều khiển thủ công     │
└─────────────────────────┘
```

### 4.2. Các lớp trong hệ thống

| Lớp | Thành phần | Công nghệ đề xuất |
|---|---|---|
| Thiết bị | ESP32 + cảm biến + actuator | C++ (Arduino Framework / ESP-IDF) |
| Kết nối | MQTT qua Wi-Fi | Mosquitto (self-host Docker) hoặc HiveMQ Cloud free tier |
| Gateway/Edge | Không bắt buộc ở quy mô này | — |
| Backend | REST API + xử lý MQTT subscriber | Node.js (Express/NestJS) hoặc Spring Boot |
| Dữ liệu | Lưu trữ telemetry + user + device | PostgreSQL (kèm bảng time-series đơn giản) |
| Ứng dụng | Giao diện quản lý | React.js + WebSocket (Socket.IO) cho realtime |

> **Giải thích lựa chọn**: Nhóm chọn MQTT vì đây là giao thức publish/subscribe nhẹ, phù hợp thiết bị nhúng tài nguyên hạn chế và cần độ trễ thấp cho cảnh báo/điều khiển thời gian thực — phù hợp hơn HTTP polling vốn tốn tài nguyên và có độ trễ cao hơn khi cần cập nhật liên tục. WebSocket được dùng thêm giữa backend và frontend để đẩy dữ liệu realtime lên dashboard mà không cần client polling liên tục.

---

## 5. Thiết kế phần cứng

### 5.1. Danh sách linh kiện

| STT | Linh kiện | Số lượng | Vai trò |
|---|---|---|---|
| 1 | ESP32 DevKit v1 | 1 | Bộ xử lý trung tâm node |
| 2 | Cảm biến ánh sáng BH1750 (I2C) hoặc quang trở LDR | 1 | Đo cường độ ánh sáng (lux) |
| 3 | Cảm biến độ ẩm đất Capacitive Soil Moisture v1.2 | 1 | Đo độ ẩm đất |
| 4 | Cảm biến nhiệt độ – độ ẩm không khí DHT22 (hoặc SHT31) | 1 | Đo nhiệt độ, độ ẩm không khí |
| 5 | Module cảm biến mưa (rain sensor board + LM393) | 1 | Phát hiện mưa |
| 6 | Servo SG90 | 1 | Kéo/thu mái che |
| 7 | Relay module 1 kênh 5V | 1 | Đóng/ngắt nguồn máy bơm |
| 8 | Máy bơm nước mini DC 5V/12V | 1 | Bơm nước tưới cây |
| 9 | Cảm biến mực nước (float switch hoặc water level sensor) | 1 (tùy chọn nhưng khuyến nghị) | Tránh bơm chạy khô |
| 10 | Nguồn adapter 5V/2A (và nguồn riêng cho bơm nếu 12V) | 1–2 | Cấp nguồn hệ thống |
| 11 | Breadboard, dây jumper, hộp đựng | - | Lắp ráp, bảo vệ mạch |

### 5.2. Sơ đồ kết nối (mô tả chân)

| Cảm biến/Actuator | Chân ESP32 | Ghi chú |
|---|---|---|
| BH1750 (SDA/SCL) | GPIO21 (SDA), GPIO22 (SCL) | Giao tiếp I2C |
| Soil Moisture (Analog OUT) | GPIO34 (ADC) | Đọc giá trị tương tự |
| DHT22 (Data) | GPIO4 | Giao tiếp 1-wire |
| Rain sensor (Digital/Analog OUT) | GPIO35 (ADC) hoặc GPIO25 (Digital) | Tùy loại module |
| Servo (Signal) | GPIO18 (PWM) | Điều khiển góc mái che |
| Relay (IN) | GPIO19 | Điều khiển bật/tắt bơm |
| Float switch (nếu có) | GPIO26 | Digital input |

> Lưu ý an toàn: relay điều khiển bơm phải dùng module có cách ly quang (opto-isolator), nguồn bơm tách biệt với nguồn logic ESP32 để tránh nhiễu và rủi ro điện áp ngược.

---

## 6. Thiết kế giao thức và luồng dữ liệu (MQTT)

### 6.1. Cấu trúc topic

```
plant/{deviceId}/telemetry/light      → dữ liệu ánh sáng (lux)
plant/{deviceId}/telemetry/soil       → độ ẩm đất (%)
plant/{deviceId}/telemetry/air        → nhiệt độ (°C) + độ ẩm không khí (%)
plant/{deviceId}/telemetry/rain       → trạng thái mưa (bool)
plant/{deviceId}/telemetry/waterlevel → mực nước bình chứa (bool/%)
plant/{deviceId}/status               → heartbeat / online-offline
plant/{deviceId}/cmd/curtain          → lệnh điều khiển mái che (open/close)
plant/{deviceId}/cmd/pump             → lệnh điều khiển bơm (on/off, duration)
plant/{deviceId}/ack                  → phản hồi xác nhận đã thực hiện lệnh
```

### 6.2. Cấu trúc payload (JSON)

**Telemetry (thiết bị → backend):**
```json
{
  "deviceId": "esp32-plant-001",
  "timestamp": "2026-09-06T10:15:30Z",
  "type": "soil",
  "value": 28.5,
  "unit": "%"
}
```

**Lệnh điều khiển (backend → thiết bị):**
```json
{
  "commandId": "cmd-000123",
  "deviceId": "esp32-plant-001",
  "action": "pump_on",
  "duration": 5000,
  "issuedBy": "user-001",
  "timestamp": "2026-09-06T10:16:00Z"
}
```

**Phản hồi xác nhận (thiết bị → backend):**
```json
{
  "commandId": "cmd-000123",
  "deviceId": "esp32-plant-001",
  "status": "executed",
  "timestamp": "2026-09-06T10:16:02Z"
}
```

**Heartbeat:**
```json
{
  "deviceId": "esp32-plant-001",
  "status": "online",
  "uptime": 3600,
  "firmwareVersion": "1.0.0",
  "timestamp": "2026-09-06T10:16:30Z"
}
```

### 6.3. Cơ chế xác nhận và độ tin cậy

- **QoS**: sử dụng QoS 1 cho telemetry và lệnh điều khiển (đảm bảo gửi ít nhất một lần), chấp nhận khả năng trùng lặp.
- **Xử lý trùng lặp**: mỗi lệnh điều khiển có `commandId` duy nhất; backend kiểm tra `commandId` đã xử lý hay chưa trước khi ghi log lệnh mới.
- **Timeout & retry**: nếu backend không nhận `ack` trong 5 giây, gửi lại lệnh tối đa 3 lần, sau đó đánh dấu lệnh thất bại.
- **Phát hiện online/offline**: thiết bị gửi heartbeat mỗi 15 giây; backend đánh dấu offline nếu không nhận heartbeat trong 30 giây (Last Will and Testament của MQTT cũng được cấu hình để broker tự động publish trạng thái offline khi thiết bị mất kết nối đột ngột).
- **Timestamp và đơn vị đo**: mọi bản tin telemetry đều có `timestamp` (ISO8601, UTC) và `unit` rõ ràng để tránh sai lệch khi tổng hợp dữ liệu.

### 6.4. Luồng dữ liệu

**Chiều thiết bị → backend:**
`Cảm biến đọc giá trị → ESP32 đóng gói JSON → Publish MQTT → Broker → Backend subscribe → Validate dữ liệu → Lưu DB → Đánh giá rule engine → (nếu cần) sinh lệnh điều khiển hoặc cảnh báo → Đẩy realtime qua WebSocket tới Frontend`

**Chiều backend → thiết bị:**
`Người dùng bấm nút điều khiển trên Frontend → Backend kiểm tra quyền → Publish lệnh lên topic cmd → ESP32 subscribe nhận lệnh → Thực thi (bật bơm/đóng mái che) → Publish ack → Backend cập nhật lịch sử lệnh → Đẩy trạng thái mới về Frontend`

---

## 7. Thiết kế cơ sở dữ liệu (ERD mô tả bảng)

| Bảng | Trường chính | Mô tả |
|---|---|---|
| `users` | id, username, password_hash, email, role, status, created_at | Quản lý tài khoản người dùng |
| `roles` | id, name (admin, owner, viewer) | Vai trò hệ thống |
| `devices` | id, device_uid, name, owner_id, location, status, firmware_version, api_key, created_at | Thông tin thiết bị và trạng thái vòng đời |
| `device_lifecycle_log` | id, device_id, from_state, to_state, changed_by, timestamp | Lịch sử chuyển trạng thái thiết bị |
| `telemetry` | id, device_id, sensor_type, value, unit, timestamp | Dữ liệu cảm biến theo thời gian |
| `commands` | id, command_id, device_id, action, payload, issued_by, status, issued_at, executed_at | Lịch sử lệnh điều khiển và kết quả |
| `alerts` | id, device_id, rule_id, message, severity, status (open/acknowledged/resolved), created_at | Cảnh báo hệ thống |
| `alert_rules` | id, sensor_type, condition, threshold, action, enabled | Cấu hình ngưỡng cảnh báo |
| `audit_log` | id, user_id, action, target, timestamp | Ghi log thao tác quan trọng |

**Quan hệ chính:**
- 1 user → nhiều device (owner_id)
- 1 device → nhiều telemetry, nhiều command, nhiều alert
- 1 alert_rule → nhiều alert được sinh ra

---

## 8. Thiết kế Backend

### 8.1. Nhóm chức năng quản lý người dùng

- Đăng ký / đăng nhập (JWT access token + refresh token).
- Đổi mật khẩu, cập nhật thông tin cá nhân.
- Quản lý trạng thái tài khoản (active/locked).
- Phân quyền theo 3 vai trò:
  - **Admin**: toàn quyền quản lý user, device, cấu hình luật cảnh báo.
  - **Owner**: quản lý thiết bị mình sở hữu, xem dữ liệu, gửi lệnh điều khiển.
  - **Viewer**: chỉ xem dữ liệu và cảnh báo, không có quyền điều khiển.

### 8.2. Quản lý vòng đời thiết bị

Trạng thái thiết bị:
```
Registered → Provisioned → Active → Offline/Fault → Maintenance → Decommissioned
```

| Trạng thái | Mô tả | Sự kiện chuyển trạng thái |
|---|---|---|
| Registered | Thiết bị mới được admin/owner tạo bản ghi trong hệ thống | Tạo mới qua API |
| Provisioned | Đã cấp `device_uid` và `api_key` cho thiết bị | Sau khi cấu hình firmware với key |
| Active | Thiết bị đã kết nối và gửi dữ liệu thành công | Nhận heartbeat đầu tiên |
| Offline/Fault | Mất kết nối quá thời gian timeout hoặc báo lỗi cảm biến | Heartbeat timeout / lỗi từ thiết bị |
| Maintenance | Admin/owner tạm khóa để bảo trì | Thao tác thủ công |
| Decommissioned | Ngừng sử dụng, thu hồi quyền kết nối | Thao tác thủ công, api_key bị vô hiệu hóa |

### 8.3. Quản lý dữ liệu IoT

- API tiếp nhận qua MQTT subscriber nội bộ trong backend (không expose endpoint public cho thiết bị publish trực tiếp qua HTTP).
- Validate: kiểm tra `device_uid` tồn tại và đang active, giá trị nằm trong khoảng hợp lệ (ví dụ độ ẩm 0–100%, nhiệt độ -10–60°C), reject nếu sai định dạng.
- Lưu trữ theo thời gian (timestamp index trên bảng `telemetry`).
- API truy vấn: lọc theo `device_id`, khoảng thời gian, loại cảm biến; hỗ trợ tổng hợp (trung bình, min/max theo giờ/ngày).
- Xuất dữ liệu CSV theo khoảng thời gian được chọn.

### 8.4. Giám sát và cảnh báo (Rule Engine)

Ví dụ luật cảnh báo (bảng `alert_rules`):

| Điều kiện | Hành động hệ thống |
|---|---|
| Ánh sáng > ngưỡng cao (VD 10000 lux) | Gửi lệnh đóng mái che + ghi log |
| Trời mưa = true | Gửi lệnh mở mái che, hủy lệnh tưới đang chờ |
| Độ ẩm đất < 30% AND nhiệt độ < 35°C AND không mưa AND mực nước đủ | Gửi lệnh bật bơm 5 giây |
| Độ ẩm đất < 30% AND nhiệt độ ≥ 35°C | Sinh cảnh báo "chờ tưới do nhiệt độ cao", không tưới |
| Mực nước bình = thấp | Sinh cảnh báo "cần châm nước", chặn lệnh bật bơm |
| Nhiệt độ > 30°C AND độ ẩm không khí > 80% kéo dài > 30 phút | Sinh cảnh báo "nguy cơ nấm mốc" |
| Không nhận heartbeat > 30 giây | Đánh dấu thiết bị offline, sinh cảnh báo |

Cảnh báo được lưu vào bảng `alerts` với trạng thái `open`, người dùng có quyền `acknowledge` hoặc `resolve` qua giao diện.

### 8.5. Điều khiển thiết bị

- Frontend gửi request điều khiển → Backend kiểm tra JWT + vai trò (owner/admin) + quyền sở hữu thiết bị.
- Backend publish lệnh MQTT kèm `commandId`.
- Ghi bản ghi vào bảng `commands` với trạng thái `pending`.
- Khi nhận `ack` từ thiết bị, cập nhật trạng thái `executed` hoặc `failed`.

### 8.6. Kiến trúc API (mô tả nhóm endpoint)

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
PUT    /api/users/me/password

GET    /api/devices
POST   /api/devices                  (đăng ký thiết bị mới)
PUT    /api/devices/{id}/status      (kích hoạt/khóa/decommission)
PUT    /api/devices/{id}/config      (cấu hình ngưỡng)

GET    /api/telemetry?deviceId=&from=&to=&type=
GET    /api/telemetry/latest?deviceId=

POST   /api/commands                 (gửi lệnh điều khiển)
GET    /api/commands?deviceId=

GET    /api/alerts?deviceId=&status=
PUT    /api/alerts/{id}/acknowledge
PUT    /api/alerts/{id}/resolve

GET    /api/audit-log                (chỉ admin)
```

---

## 9. Thiết kế Frontend

### 9.1. Các màn hình chính

| Màn hình | Chức năng |
|---|---|
| Đăng nhập/Đăng ký | Xác thực người dùng |
| Dashboard tổng quan | Hiển thị realtime 4 chỉ số cảm biến, trạng thái online/offline, cảnh báo đang mở |
| Chi tiết thiết bị | Biểu đồ lịch sử theo từng loại cảm biến, nút điều khiển thủ công (bơm/mái che) |
| Quản lý thiết bị | Danh sách thiết bị, trạng thái vòng đời, thao tác kích hoạt/khóa/decommission (owner/admin) |
| Quản lý người dùng | CRUD user, gán vai trò (chỉ admin) |
| Cảnh báo | Danh sách cảnh báo, filter theo trạng thái, nút acknowledge/resolve |
| Lịch sử lệnh điều khiển | Xem log lệnh đã gửi, trạng thái thực thi |

### 9.2. Công nghệ đề xuất

- **React.js** cho giao diện web (component hóa theo từng loại cảm biến/biểu đồ).
- **Socket.IO / WebSocket** để nhận dữ liệu realtime từ backend, tránh polling liên tục.
- **Chart.js hoặc Recharts** để vẽ biểu đồ lịch sử độ ẩm/ánh sáng/nhiệt độ theo thời gian.
- Giao diện phân quyền: ẩn/hiện nút điều khiển tùy vai trò, nhưng **quyền phải được kiểm tra ở backend**, không chỉ ẩn trên UI.

---

## 10. Thiết kế bảo mật

| Nguyên tắc | Cách áp dụng trong hệ thống |
|---|---|
| Băm mật khẩu | Sử dụng bcrypt/argon2, không lưu plaintext |
| Xác thực API | JWT access token (hết hạn ngắn) + refresh token |
| Kiểm tra quyền ở backend | Middleware kiểm tra vai trò + quyền sở hữu thiết bị trên mọi endpoint nhạy cảm |
| Định danh riêng cho thiết bị | Mỗi ESP32 có `device_uid` + `api_key`/MQTT credential riêng, không dùng chung |
| Không commit secret | `.env` chứa DB credential, JWT secret, MQTT broker credential; có `.env.example` không chứa giá trị thật |
| Validate input | Kiểm tra định dạng, khoảng giá trị hợp lệ của telemetry và payload API |
| Khóa/thu hồi thiết bị | Chuyển trạng thái Decommissioned → vô hiệu hóa `api_key`, broker từ chối kết nối |
| Audit log | Ghi log các thao tác: đăng nhập, đổi quyền, khóa thiết bị, gửi lệnh điều khiển |
| Mã hóa kết nối | HTTPS cho API, TLS cho kết nối MQTT (mqtts://) nếu broker hỗ trợ |
| Quyền riêng tư dữ liệu | Chỉ thu thập dữ liệu môi trường (không có camera/vị trí cá nhân); dữ liệu user chỉ dùng cho mục đích vận hành hệ thống |

### 10.1. Kịch bản kiểm thử bảo mật (tối thiểu 2)

1. **Viewer cố gắng gửi lệnh điều khiển bơm** → Backend trả về lỗi 403 Forbidden do middleware kiểm tra vai trò.
2. **Thiết bị đã bị decommission cố gắng publish dữ liệu** → Backend/broker từ chối do `api_key` đã bị vô hiệu hóa; dữ liệu không được ghi vào DB.
3. (Tùy chọn thêm) **Gửi token JWT hết hạn/không hợp lệ** → API trả về 401 Unauthorized.
4. (Tùy chọn thêm) **Owner A cố truy vấn dữ liệu thiết bị của Owner B** → Backend kiểm tra `owner_id` và trả về 403.

---

## 11. Ma trận vai trò và quyền (RBAC)

| Chức năng | Admin | Owner | Viewer |
|---|:---:|:---:|:---:|
| Quản lý user | ✔ | ✘ | ✘ |
| Đăng ký thiết bị mới | ✔ | ✔ | ✘ |
| Xem dữ liệu thiết bị của mình | ✔ | ✔ | ✔ |
| Xem dữ liệu thiết bị của người khác | ✔ | ✘ | ✘ |
| Gửi lệnh điều khiển | ✔ | ✔ | ✘ |
| Cấu hình ngưỡng cảnh báo | ✔ | ✔ (thiết bị của mình) | ✘ |
| Khóa/decommission thiết bị | ✔ | ✔ (thiết bị của mình) | ✘ |
| Xem audit log | ✔ | ✘ | ✘ |

---

## 12. Mô hình các mối đe dọa chính và biện pháp kiểm soát

| Mối đe dọa | Biện pháp kiểm soát |
|---|---|
| Giả mạo thiết bị publish dữ liệu sai | Mỗi thiết bị có `api_key`/credential MQTT riêng, broker xác thực trước khi cho publish |
| Chiếm quyền tài khoản qua brute-force | Giới hạn số lần đăng nhập sai, khóa tạm tài khoản |
| Lộ secret trên GitHub | Dùng `.env` + `.gitignore`, review trước khi commit |
| Truy cập trái phép dữ liệu thiết bị người khác | Kiểm tra `owner_id` ở mọi API endpoint liên quan đến device |
| Replay lệnh điều khiển cũ | `commandId` duy nhất, backend kiểm tra đã xử lý hay chưa |
| Thiết bị bị đánh cắp/thất lạc | Chức năng decommission thu hồi quyền kết nối ngay lập tức |
| Dữ liệu cảm biến bất thường do lỗi phần cứng | Validate khoảng giá trị hợp lệ trước khi lưu, sinh cảnh báo "device fault" |

---

## 13. Sequence Diagram (mô tả 2 quy trình quan trọng)

### 13.1. Quy trình tự động tưới cây

```
ESP32          Broker MQTT         Backend             DB           Frontend
  |--telemetry(soil)--->|                |                |               |
  |                     |--forward------>|                |               |
  |                     |                |--validate----->|               |
  |                     |                |--save--------->|               |
  |                     |                |--eval rule     |               |
  |                     |                |  (soil<30% &   |               |
  |                     |                |   temp<35°C &  |               |
  |                     |                |   no rain)     |               |
  |                     |<--cmd(pump_on)-|                |               |
  |<--cmd(pump_on)------|                |                |               |
  |--execute pump-------|                |                |               |
  |--ack(executed)----->|--forward------>|--update cmd--->|               |
  |                     |                |----------------|--push ws----->|
```

### 13.2. Quy trình đăng nhập và điều khiển thủ công

```
Frontend           Backend              DB              Broker         ESP32
  |--login(user,pw)-->|                  |                |               |
  |                    |--verify hash---->|                |               |
  |<--JWT token--------|                  |                |               |
  |--cmd(curtain,close, token)-->|        |                |               |
  |                    |--check role/own->|                |               |
  |                    |--publish cmd------------------->|               |
  |                    |                  |                |--execute----->|
  |                    |<--ack---------------------------|<--ack---------|
  |                    |--save cmd log--->|                |               |
  |<--status updated---|                  |                |               |
```

---

## 14. Kế hoạch kiểm thử

### 14.1. Kiểm thử chức năng

| Quy trình | Cách kiểm thử | Kết quả mong đợi |
|---|---|---|
| Đăng nhập và phân quyền | Đăng nhập bằng 3 vai trò khác nhau | Mỗi vai trò thấy đúng menu/chức năng được phép |
| Đăng ký, kích hoạt thiết bị | Tạo thiết bị mới, nạp `api_key` vào firmware | Thiết bị chuyển từ Registered → Active |
| Gửi telemetry | Quan sát log MQTT và DB | Dữ liệu 4 loại cảm biến được lưu đúng định dạng |
| Dashboard cập nhật realtime | Thay đổi giá trị cảm biến (ví dụ che LDR) | Dashboard cập nhật trong vài giây |
| Gửi và xác nhận lệnh điều khiển | Bấm nút bật bơm trên UI | Bơm chạy thực tế, trạng thái lệnh chuyển "executed" |
| Phát hiện thiết bị offline | Ngắt Wi-Fi của ESP32 | Trạng thái chuyển Offline sau ~30s, sinh cảnh báo |
| Sinh và xử lý cảnh báo | Làm khô đất giả lập | Cảnh báo xuất hiện, có thể acknowledge |
| Khóa/ngừng sử dụng thiết bị | Admin decommission thiết bị | Thiết bị không thể publish dữ liệu nữa |

### 14.2. Kiểm thử phi chức năng

| Chỉ tiêu | Phương pháp đo | Ghi nhận |
|---|---|---|
| Độ trễ cảm biến → dashboard | Đo timestamp lúc đọc cảm biến vs. lúc hiển thị trên UI | Ghi bảng số liệu trung bình sau nhiều lần đo |
| Độ trễ lệnh điều khiển | Đo từ lúc bấm nút đến lúc `ack` nhận về | Ghi bảng số liệu |
| Tỷ lệ mất bản tin | So sánh số bản tin publish và số bản tin backend nhận trong 1 giờ | Tính phần trăm |
| Khả năng phục hồi sau mất mạng | Ngắt Wi-Fi 1 phút rồi bật lại | Ghi nhận thời gian ESP32 tự kết nối lại |
| Độ ổn định | Chạy liên tục 24 giờ | Ghi nhận số lần lỗi/crash |

---

## 15. Cấu trúc thư mục repository (theo yêu cầu đề bài)

```
plant-care-iot/
├── README.md
├── firmware/           # Code ESP32 (Arduino/PlatformIO)
├── backend/             # API, MQTT subscriber, rule engine
├── frontend/            # React web app
├── database/            # Schema, migration, seed data
├── deployment/          # Docker Compose (backend + DB + broker)
├── hardware/             # Sơ đồ nối dây, danh sách linh kiện, ảnh prototype
├── tests/                # Test case chức năng và phi chức năng
├── docs/                 # Báo cáo, slide, sơ đồ thiết kế
└── .env.example          # Danh sách biến môi trường (không chứa giá trị thật)
```

**Biến môi trường mẫu (`.env.example`):**
```
DB_HOST=
DB_PORT=
DB_NAME=
DB_USER=
DB_PASSWORD=
JWT_SECRET=
MQTT_BROKER_URL=
MQTT_USERNAME=
MQTT_PASSWORD=
```

---

## 16. Hạn chế và hướng phát triển

**Hạn chế của nguyên mẫu hiện tại:**
- Chỉ triển khai 1 node thiết bị vật lý, chưa kiểm thử ở quy mô nhiều node đồng thời.
- Rule engine sử dụng ngưỡng cố định, chưa có khả năng tự học/tối ưu theo loại cây cụ thể.
- Chưa có cơ chế đồng bộ dữ liệu khi thiết bị mất mạng dài hạn (chỉ mất dữ liệu trong thời gian offline).

**Hướng phát triển (ngoài phạm vi đồ án này):**
- Bổ sung cập nhật firmware từ xa (OTA).
- Tích hợp AI dự báo nhu cầu tưới dựa trên dữ liệu lịch sử.
- Mở rộng nhiều node theo khu vực, dùng gateway tổng hợp.
- Bổ sung tiết kiệm năng lượng cho node (deep sleep giữa các chu kỳ đọc cảm biến).

*(Ghi chú: các hướng trên thuộc phần chức năng nâng cao, không nằm trong phạm vi triển khai bắt buộc của đồ án này theo yêu cầu đã thống nhất.)*

---

## 17. Kết luận

Hệ thống Smart Plant Care đáp ứng đầy đủ các yêu cầu bắt buộc của đề bài: có thiết bị vật lý hoạt động thực tế với 4 loại cảm biến và 2 cơ cấu chấp hành, sử dụng giao thức MQTT chuẩn cho IoT, có backend quản lý người dùng và vòng đời thiết bị hoàn chỉnh, có cơ chế giám sát/cảnh báo, giao diện web đầy đủ chức năng, và áp dụng các nguyên tắc bảo mật cơ bản. Kiến trúc được thiết kế để mỗi thành viên trong nhóm 4 người đảm nhận một luồng dữ liệu trọn vẹn (từ cảm biến đến giao diện), thuận tiện cho việc phân công, đánh giá đóng góp cá nhân và bảo vệ đồ án.

---

## 18. Tài liệu tham khảo

*(Nhóm bổ sung các tài liệu cụ thể đã tham khảo: datasheet cảm biến, tài liệu thư viện Arduino, tài liệu MQTT protocol, tài liệu framework backend/frontend đã sử dụng...)*
