# Hệ thống đo độ ẩm đất + tưới cây bằng ESP8266

> Tài liệu mô tả phần cứng đã lắp thực tế. Mọi thông tin dưới đây là **hiện trạng đã đấu dây xong**, dùng làm ngữ cảnh để hỗ trợ viết code, gỡ lỗi hoặc mở rộng.

## 1. Mục tiêu

- Đọc độ ẩm đất từ cảm biến (analog) qua ESP8266.
- Bật/tắt máy bơm nước từ xa (qua WiFi) thông qua relay.
- Cho phép mở rộng: tự tưới theo ngưỡng, MQTT, ghi log.

## 2. Linh kiện

| # | Linh kiện | Vai trò | Ghi chú |
|---|---|---|---|
| 1 | ESP8266 (loại NodeMCU, chân ký hiệu D1, D5, A0, 3V, 5V/VU, G) | Vi điều khiển, WiFi | Cấp nguồn qua USB. Chân A0 là ADC duy nhất, dải 0–3.3V trên board dev |
| 2 | Cảm biến độ ẩm đất (điện trở/điện dung) | Đo độ ẩm | Nối với bộ khuếch đại |
| 3 | Module khuếch đại (dạng LM393, có chân VCC, GND, AO, có thể có DO) | Chuyển tín hiệu cảm biến thành áp analog | Dùng chân **AO** (analog) |
| 4 | Module relay 1 kênh (VCC, GND, IN; đầu ra COM, NO, NC) | Công tắc đóng/ngắt mạch bơm | Điều khiển bằng chân IN |
| 5 | Máy bơm nước mini DC 6V | Tưới nước | Cấp bởi pin 6V riêng |
| 6 | Pin / nguồn 6V | Cấp điện **chỉ cho bơm** | Không nối vào ESP |
| 7 | Diode 1N4007 (khuyến nghị, chưa chắc đã lắp) | Chống xung ngược khi relay ngắt bơm | Song song với bơm, vạch bạc về phía (+) bơm |

## 3. Bảng đấu dây

### 3.1 Mạch tín hiệu (do ESP cấp nguồn)

| Từ | Chân | Đến ESP8266 | Ghi chú |
|---|---|---|---|
| Khuếch đại | VCC | **3V** (3V3) | Cấp 3.3V để AO không vượt 3.3V, bảo vệ chân A0 |
| Khuếch đại | GND | **G** (GND, cạnh chân 3V) | |
| Khuếch đại | AO | **A0** | Đọc analog 0–1023 |
| Relay | VCC | **5V** (chân VU/VIN, 5V từ USB) | Module relay cần 5V |
| Relay | GND | **G** (GND, nằm giữa A0 và chân 5V) | |
| Relay | IN | **D5** (GPIO14) | Chân điều khiển relay |

### 3.2 Mạch công suất (bơm) — độc lập với ESP

| Từ | Đến | Ghi chú |
|---|---|---|
| Pin 6V **(+)** | Relay **COM** | |
| Relay **NO** | Bơm **(+)** | NO = thường hở, bơm mặc định tắt |
| Bơm **(−)** | Pin 6V **(−)** | Không đi qua relay |
| Relay **NC** | để trống | Không dùng |

## 4. Sơ đồ

```
            USB 5V
              │
        ┌─────┴─────────────────────┐
        │         ESP8266           │
        │                           │
        │  3V ───────────┐          │
        │  G  ─────────┐ │          │
        │  A0 ───────┐ │ │          │
        │            │ │ │          │
        │  5V(VU) ───┼─┼─┼──┐       │
        │  G  ───────┼─┼─┼──┼──┐    │
        │  D5 ───────┼─┼─┼──┼──┼─┐  │
        └────────────┼─┼─┼──┼──┼─┼──┘
                     │ │ │  │  │ │
              AO ◄───┘ │ │  │  │ │
             GND ◄─────┘ │  │  │ │      ┌───────────────┐
             VCC ◄───────┘  │  │ │      │ Cảm biến độ ẩm│
        [Khuếch đại LM393]──┼──┼─┼──────┤ (nối vào mạch │
                            │  │ │      │  khuếch đại)  │
                  VCC ◄─────┘  │ │      └───────────────┘
                  GND ◄────────┘ │
                  IN  ◄──────────┘
                [Module relay]
                  COM ◄──── Pin 6V (+)
                  NO  ────► Bơm (+)
                  NC  (trống)

        Pin 6V (−) ─────────► Bơm (−)
```

Hai miền điện tách biệt:

- **Miền ESP (3.3V/5V USB):** ESP, khuếch đại, phần cuộn/điều khiển của relay.
- **Miền bơm (6V pin):** pin 6V, tiếp điểm relay (COM/NO), bơm. **Không có dây nào từ miền này vào ESP**, kể cả GND. Relay có tiếp điểm khô nên cách ly hai miền, không cần nối GND chung.

## 5. Logic điều khiển

- Chân `D5` (GPIO14) → `IN` của relay.
- Module relay thường **kích mức thấp (active LOW)**: `D5 = LOW` → relay đóng (COM–NO thông) → bơm chạy; `D5 = HIGH` → bơm tắt. Nếu thực tế ngược lại, đổi `RELAY_ACTIVE_LOW` trong code.
- Cảm biến: `analogRead(A0)` trả 0–1023. Giá trị **lớn = khô, nhỏ = ướt** (thường gặp với module LM393, cần xác nhận khi hiệu chuẩn).
  - `ADC_DRY`: giá trị khi để cảm biến ngoài không khí.
  - `ADC_WET`: giá trị khi nhúng nước.
  - `%độ ẩm = map(raw, ADC_DRY, ADC_WET, 0, 100)`.

## 6. Phần mềm kèm theo

File: `soil_pump_test/soil_pump_test.ino` (Arduino IDE, board ESP8266, thư viện `ESP8266WiFi`, `ESP8266WebServer`).

| Giao diện | Lệnh | Tác dụng |
|---|---|---|
| Web | `GET /` | Trang nút bấm bật/tắt + hiển thị độ ẩm |
| Web | `GET /status` | JSON: `raw`, `moisture`, `pump`, `max_pump_ms` |
| Web | `GET /pump?on=1` / `on=0` | Bật / tắt bơm |
| Serial 115200 | `1` / `0` / `s` | Bật / tắt / in trạng thái |

Tính năng an toàn trong code:

- Bơm luôn **tắt** khi khởi động.
- Bơm **tự tắt sau 10 giây** (`MAX_PUMP_MS`) để tránh chạy khô hoặc tràn nước.

## 7. Ràng buộc và lưu ý quan trọng

1. **Không cấp nguồn bơm từ chân 5V/3V3 của ESP.** Bơm ăn dòng lớn (hàng trăm mA, cao hơn lúc khởi động), dễ làm ESP sụt áp/reset/hỏng.
2. **Không cấp 5V cho khuếch đại** khi AO nối trực tiếp A0: AO có thể vượt 3.3V và hại chân ADC.
3. ESP8266 chỉ có **1 chân ADC**. Muốn thêm nhiều cảm biến cần mux (CD74HC4067) hoặc ADS1115 qua I2C.
4. Tránh dùng D3 (GPIO0), D4 (GPIO2), D8 (GPIO15) cho relay vì là chân boot, relay có thể nhảy khi khởi động.
5. **Không để bơm chạy khô.**
6. Nếu bơm đổi sang nguồn điện áp khác (ví dụ 12V), chỉ thay pin và bơm; sơ đồ relay giữ nguyên, kiểm tra thêm dòng chịu tải của relay.

## 8. Thông tin chưa xác nhận (AI đọc tài liệu nên hỏi lại nếu cần)

- Tên chính xác của board ESP8266 (NodeMCU v1/v3, Wemos D1 mini…). Tài liệu giả định chân ký hiệu kiểu NodeMCU.
- Module khuếch đại có đúng LM393 và loại cảm biến (điện trở hay điện dung).
- Relay kích mức thấp hay cao (xác định bằng thử thực tế).
- Diode chống xung ngược đã được lắp hay chưa.
- Dòng định mức của bơm 6V.

## 9. Quy trình chạy thử an toàn

1. **Hở dây (+) bơm khỏi NO** (hoặc chưa cắm pin), chỉ cắm ESP qua USB, nạp code.
2. Mở Serial Monitor (115200), lấy IP, kiểm tra `raw` thay đổi khi nhúng cảm biến vào nước, ghi lại `ADC_DRY`/`ADC_WET`.
3. Gọi `/pump?on=1` và `/pump?on=0`, nghe relay "tách", kiểm tra chiều logic.
4. Nối lại dây bơm, thả bơm vào nước rồi mới bật.
5. Nếu nóng, khét hoặc ESP reset liên tục: rút nguồn ngay và kiểm tra dây.
