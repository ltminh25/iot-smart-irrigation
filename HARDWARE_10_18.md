# Hệ thống đo độ ẩm đất + ánh sáng + tưới cây bằng ESP8266

> Tài liệu mô tả phần cứng đã lắp thực tế. Mọi thông tin dưới đây là **hiện trạng đã đấu dây**, dùng làm ngữ cảnh để hỗ trợ viết code, gỡ lỗi hoặc mở rộng.

## 1. Mục tiêu

- Đọc độ ẩm đất (analog) và cường độ ánh sáng (lux, I2C) qua ESP8266.
- Bật/tắt máy bơm nước từ xa (qua WiFi) thông qua relay.
- Điều khiển một servo nhỏ (ví dụ che nắng hoặc cần gạt nhẹ; công dụng cụ thể chưa xác định).
- Cho phép mở rộng: tự tưới theo ngưỡng độ ẩm và ánh sáng, MQTT, ghi log.

## 2. Linh kiện

| # | Linh kiện | Vai trò | Ghi chú |
|---|---|---|---|
| 1 | ESP8266 NodeMCU (nhãn chân: A0, G, VU, 3V, D0-D8, RX, TX, VIN...) | Vi điều khiển, WiFi | Cấp nguồn qua cổng USB bằng củ sạc 5V ≥ 1A. A0 là ADC duy nhất, dải 0-3.3V |
| 2 | Cảm biến độ ẩm đất | Đo độ ẩm | Nối với bộ khuếch đại |
| 3 | Module khuếch đại (dạng LM393: VCC, GND, AO) | Chuyển tín hiệu cảm biến thành áp analog | Dùng chân **AO** |
| 4 | Module relay 1 kênh (VCC, GND, IN; COM, NO, NC) | Công tắc đóng/ngắt mạch bơm | Điều khiển bằng chân IN |
| 5 | Máy bơm nước mini DC 6V | Tưới nước | Cấp bởi pin 6V riêng |
| 6 | Pin 6V | Cấp điện **chỉ cho bơm** | Không nối vào ESP |
| 7 | Diode 1N4007 (khuyến nghị, chưa chắc đã lắp) | Chống xung ngược khi relay ngắt bơm | Song song với bơm, vạch bạc về phía (+) bơm |
| 8 | Cảm biến ánh sáng BH1750 (module GY-302, I2C, địa chỉ 0x23) | Đo cường độ sáng (lux) | **Đã kiểm tra chạy được** |
| 9 | Servo nhỏ (SG90 / MG90S) | Chấp hành góc quay 0-180° | Đang lắp; cấp 5V từ chân VU của ESP |
| 10 | Tụ điện phân 470-1000 µF, ≥ 10V | Chống sụt áp khi servo khởi động | Đặt song song nguồn servo, sát đầu cắm servo |

## 3. Bảng đấu dây

Vị trí chân theo bo NodeMCU nhìn từ trên xuống, USB ở dưới.
Cột trái (từ trên): A0, G, VU, S3, S2, S1, SC, S0, SK, G, 3V, EN, RST, G, VIN.
Cột phải (từ trên): D0, D1, D2, D3, D4, 3V, G, D5, D6, D7, D8, RX, TX, G, 3V.

### 3.1 Mạch tín hiệu và cảm biến (do ESP cấp nguồn)

| Từ | Chân | Đến ESP8266 | Ghi chú |
|---|---|---|---|
| Khuếch đại độ ẩm | VCC | **3V** | Cấp 3.3V để AO không vượt 3.3V, bảo vệ chân A0 |
| Khuếch đại độ ẩm | GND | **G** (ngay dưới chân 3V ở giữa cột phải) | |
| Khuếch đại độ ẩm | AO | **A0** | Đọc analog 0-1023 |
| Relay | VCC | **VU** (5V từ USB) | Cột trái, hàng thứ 3 |
| Relay | GND | **G** (cột trái, hàng thứ 2) | |
| Relay | IN | **D5** (GPIO14) | Chân điều khiển relay |
| BH1750 | VCC | **3V** (cuối cột phải) | Module chịu 3-5V, dùng 3.3V |
| BH1750 | GND | **G** (cuối cột phải, trên chân 3V) | |
| BH1750 | SCL | **D1** (GPIO5) | |
| BH1750 | SDA | **D2** (GPIO4) | |
| BH1750 | ADDR | để trống | Địa chỉ 0x23 |

### 3.2 Servo và tụ chống sụt áp (cấp nguồn từ ESP)

| Từ | Dây | Đến ESP8266 | Ghi chú |
|---|---|---|---|
| Servo | Signal (cam/vàng) | **D6** (GPIO12) | Cột phải, hàng thứ 9, ngay dưới D5 |
| Servo | VCC (đỏ) | **VU** (5V) | Chung với VCC của relay |
| Servo | GND (nâu/đen) | **G** | Chung GND với ESP |
| Tụ 470-1000 µF | Chân (+) dài | Dây VCC (đỏ) của servo | Đặt sát đầu cắm servo, đúng cực |
| Tụ 470-1000 µF | Chân (−) có vạch | Dây GND (nâu) của servo | |

Có thể lắp tụ trực tiếp trên breadboard, không cần hàn.

### 3.3 Mạch công suất (bơm), độc lập với ESP

| Từ | Đến | Ghi chú |
|---|---|---|
| Pin 6V **(+)** | Relay **COM** | |
| Relay **NO** | Bơm **(+)** | NO = thường hở, bơm mặc định tắt |
| Bơm **(−)** | Pin 6V **(−)** | Không đi qua relay |
| Relay **NC** | để trống | Không dùng |

## 4. Bản đồ chân ESP8266

| Chân ESP | Thiết bị | Hướng |
|---|---|---|
| A0 | AO khuếch đại độ ẩm | Vào (analog) |
| D1 (GPIO5) | SCL của BH1750 | I2C |
| D2 (GPIO4) | SDA của BH1750 | I2C |
| D5 (GPIO14) | IN của relay | Ra |
| D6 (GPIO12) | Signal của servo | Ra (PWM) |
| VU (5V) | VCC relay, VCC servo | Nguồn |
| 3V | VCC khuếch đại độ ẩm, VCC BH1750 | Nguồn |
| G | GND mọi module, GND servo | Nguồn |

Chân còn trống: D0, D3, D4, D7, D8 (tránh D3, D4, D8 cho tải vì là chân boot).

I2C trong code: `Wire.begin(D2, D1);` (SDA = D2, SCL = D1).

## 5. Hai miền điện

- **Miền ESP (5V từ củ sạc qua USB):** ESP, relay (phần cuộn), servo, tụ chống sụt áp. Các chân 3V cấp cho khuếch đại độ ẩm và BH1750.
- **Miền bơm (6V pin):** pin 6V, tiếp điểm relay (COM/NO), bơm. **Không có dây nào từ miền này vào ESP, kể cả GND.** Relay có tiếp điểm khô nên cách ly hai miền, không cần nối GND chung.

Phương án thay thế (chưa dùng): cấp servo từ pin 6V. Khi đó **bắt buộc** nối (−) pin 6V với G của ESP (GND chung cho tín hiệu), mất sự tách biệt giữa miền bơm và miền ESP, và không cho servo và bơm chạy cùng lúc. SG90 chịu tối đa 6V.

## 6. Logic điều khiển

- Chân `D5` (GPIO14) → `IN` của relay. Module relay thường **kích mức thấp**: `D5 = LOW` → relay đóng → bơm chạy. Nếu thực tế ngược, đổi `RELAY_ACTIVE_LOW` trong code.
- Đã gặp trường hợp relay không nhả hẳn khi chân lên HIGH (mức 3.3V của ESP không đủ cho module 5V). Cách xử lý: khi tắt, đặt chân về `INPUT` (thả nổi) thay vì `HIGH`; khi bật mới `OUTPUT` + `LOW`.
- Cảm biến độ ẩm: `analogRead(A0)` 0-1023, **lớn = khô, nhỏ = ướt**. Cần hiệu chuẩn `ADC_DRY` (ngoài không khí) và `ADC_WET` (nhúng nước); giá trị đọc phụ thuộc chất lượng nguồn nên hiệu chuẩn lại khi đổi nguồn.
- BH1750: thư viện `BH1750` (Christopher Laws), `lightMeter.begin()` rồi `readLightLevel()` trả lux.
- Servo: thư viện `Servo`, `servo.attach(D6, 500, 2400)`, `servo.write(góc)`. Nên `detach()` khi không chuyển động để tránh rung và giảm dòng; tránh chạm 0° và 180° để khỏi kẹt cứng.

## 7. Phần mềm kèm theo

- `soil_pump_test/soil_pump_test.ino`: web server đọc độ ẩm, bật/tắt bơm, tự tắt bơm sau 10 giây. **Chưa tích hợp BH1750 và servo.**
- Sketch test riêng đã dùng: I2C scanner (xác nhận BH1750 ở 0x23), đọc BH1750 qua Serial, quét servo 60°-120°-90°.

| Giao diện (sketch chính) | Lệnh | Tác dụng |
|---|---|---|
| Web | `GET /` | Trang nút bấm và độ ẩm |
| Web | `GET /status` | JSON: `raw`, `moisture`, `pump`, `max_pump_ms` |
| Web | `GET /pump?on=1` / `on=0` | Bật / tắt bơm |
| Serial 115200 | `1` / `0` / `s` | Bật / tắt / in trạng thái |

## 8. Ràng buộc và lưu ý quan trọng

1. **Không cấp nguồn bơm từ chân 5V/3V3 của ESP.** Bơm ăn dòng lớn, dễ làm ESP sụt áp, reset hoặc hỏng.
2. **Không cấp 5V cho khuếch đại độ ẩm** khi AO nối trực tiếp A0: AO có thể vượt 3.3V và hại chân ADC.
3. ESP8266 chỉ có **1 chân ADC**, đã dùng cho độ ẩm. Muốn thêm cảm biến analog cần ADS1115 (I2C, dùng chung D1/D2 với BH1750) hoặc mux.
4. Servo chỉ cấp từ chân VU (5V) khi tải nhẹ (SG90 không tải hoặc tải rất nhỏ) và ESP được cấp bằng **củ sạc 5V ≥ 1A**, không dùng cổng USB laptop hoặc power bank. Servo kẹt hoặc có tải nặng cần nguồn riêng (buck 5V).
5. **Tụ chống sụt áp** của servo phải đúng cực, điện áp ghi trên thân ≥ 10V, đặt sát servo. Thiếu tụ thì ESP dễ reset khi servo khởi động.
6. Không để servo và bơm cùng lúc tiêu thụ nguồn nếu chung nguồn.
7. **Không để bơm chạy khô.**
8. Cáp USB dài, mỏng làm sụt áp, gây reset và đọc cảm biến lệch; dùng cáp ngắn, tốt.
9. Nếu BH1750 không được nhận (scanner báo "không có thiết bị"): kiểm tra chân header đã hàn chưa, SCL/SDA có bị đảo không, VCC/GND, và thử `Wire.begin(D1, D2)` để loại trừ nối ngược.

## 9. Thông tin chưa xác nhận (AI đọc tài liệu nên hỏi lại nếu cần)

- Công dụng của servo (che nắng, xoay vòi, cần gạt...) và tải thực tế.
- Loại servo cụ thể (SG90, MG90S hay khác) và điện áp pin 6V thực tế (4 AA kiềm mới có thể ~6.4V).
- Relay kích mức thấp hay cao, và có cần đặt chân `INPUT` khi tắt không (đã gặp relay không nhả).
- Diode chống xung ngược đã lắp hay chưa.
- Dòng định mức của bơm 6V.
- Loại củ sạc và cáp USB đang dùng.

## 10. Quy trình chạy thử an toàn

1. **Hở dây (+) bơm khỏi NO** (hoặc rút pin 6V), chỉ cấp ESP qua củ sạc.
2. Nạp sketch tương ứng: đọc BH1750 qua Serial (che tay thì lux giảm), đọc `raw` độ ẩm khi khô và nhúng nước.
3. Thử servo không gắn tải, góc nhỏ 60°-120°. Nếu ESP reset hoặc servo rung, kiểm tra tụ, GND, nguồn cấp.
4. Thử relay `/pump?on=1`, `/pump?on=0`, nghe tiếng "tách" và kiểm tra chiều logic.
5. Nối lại dây bơm, thả bơm vào nước rồi mới bật.
6. Nếu nóng, khét hoặc ESP reset liên tục: rút nguồn ngay và kiểm tra dây.
