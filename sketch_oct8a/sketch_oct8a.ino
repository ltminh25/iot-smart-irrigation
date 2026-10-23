/*
 * HỆ THỐNG ĐO ĐỘ ẨM ĐẤT + ÁNH SÁNG (BH1750) + TƯỚI CÂY & MÁI CHE TỰ ĐỘNG - ESP8266
 *
 * Phần cứng thực tế (theo HARDWARE_10_18.md):
 *   1. Khuếch đại độ ẩm đất (LM393): VCC -> 3V, GND -> G, AO -> A0
 *   2. Cảm biến ánh sáng BH1750 (GY-302, I2C 0x23): VCC -> 3V, GND -> G, SCL -> D1 (GPIO5), SDA -> D2 (GPIO4)
 *   3. Relay 1 kênh (bơm nước 6V): VCC -> VU (5V), GND -> G, IN -> D5 (GPIO14)
 *      - Cấp nguồn bơm 6V hoàn toàn độc lập qua tiếp điểm COM - NO của Relay.
 *      - Điều khiển kiểu thả nổi (Floating):
 *          + BẬT bơm: pinMode(D5, OUTPUT); digitalWrite(D5, LOW);
 *          + TẮT bơm: pinMode(D5, INPUT); (thả nổi để ngắt hẳn opto 5V trên mạch 3.3V ESP8266)
 *   4. Servo mái che (SG90/MG90S): VCC -> VU (5V, kèm tụ 470-1000uF), GND -> G, Signal -> D6 (GPIO12)
 *      - Mở mái che (curtain_open): góc 60°
 *      - Đóng mái che (curtain_close): góc 120°
 *      - Tự động detach() sau 600ms khi quay xong để chống rung và tránh sụt áp.
 *      - Không chạy bơm và quay servo cùng lúc.
 *
 * Giao tiếp:
 *   - MQTT Broker: broker.hivemq.com:1883 (Device UID: esp8266-plant-01)
 *     + Publish:
 *         plant/esp8266-plant-01/telemetry/soil   {"deviceId":"esp8266-plant-01","type":"soil","value":...,"unit":"%"}
 *         plant/esp8266-plant-01/telemetry/light  {"deviceId":"esp8266-plant-01","type":"light","value":...,"unit":"lux"}
 *         plant/esp8266-plant-01/status           {"deviceId":"esp8266-plant-01","status":"online","uptime":...,"firmwareVersion":"1.0.0"}
 *         plant/esp8266-plant-01/ack              {"command_id":"...","deviceId":"esp8266-plant-01","status":"executed"}
 *     + Subscribe:
 *         plant/esp8266-plant-01/cmd/#            (nhận lệnh pump_on, pump_off, curtain_open, curtain_close)
 *   - Web Server cục bộ trên ESP8266 (http://<IP>/):
 *     + GET /              : Giao diện điều khiển & theo dõi trực tiếp
 *     + GET /status        : JSON trạng thái đầy đủ (raw, moisture, lux, pump, curtain_angle, mqtt)
 *     + GET /pump?on=1|0   : Bật / tắt bơm thủ công
 *     + GET /curtain?act=open|close : Mở (60°) / Đóng (120°) mái che
 *   - Serial (115200):
 *     + '1': Bật bơm | '0': Tắt bơm | 'o': Mở mái che (60°) | 'c': Đóng mái che (120°) | 's': In trạng thái JSON
 */

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <Wire.h>
#include <BH1750.h>
#include <Servo.h>
#include <PubSubClient.h>

// ====== CẤU HÌNH WIFI & MQTT - SỬA CHỖ NÀY NẾU CẦN ======
const char* WIFI_SSID       = "Thanh Anh";
const char* WIFI_PASS       = "chungcuvuive";

const char* MQTT_BROKER     = "broker.hivemq.com";
const int   MQTT_PORT       = 1883;
const char* DEVICE_UID      = "esp8266-plant-01";
const char* FW_VERSION      = "1.0.0";

// ====== CẤU HÌNH CHÂN PHẦN CỨNG (NODE MCU ESP8266) ======
const int   SOIL_PIN        = A0;
const int   I2C_SDA_PIN     = D2;   // GPIO4
const int   I2C_SCL_PIN     = D1;   // GPIO5
const int   RELAY_PIN       = D5;   // GPIO14
const int   SERVO_PIN       = D6;   // GPIO12

// ====== CẤU HÌNH HIỆU CHUẨN & AN TOÀN ======
// Đọc raw ngoài không khí (khô) và khi nhúng nước (ướt)
const int   ADC_DRY         = 850;
const int   ADC_WET         = 400;

// Góc Servo an toàn (tránh 0° và 180° để khỏi kẹt cơ khí)
const int   SERVO_OPEN_DEG  = 60;   // Mở mái che (curtain_open)
const int   SERVO_CLOSE_DEG = 120;  // Đóng mái che (curtain_close)
const unsigned long SERVO_ATTACH_MS = 650; // Thời gian chờ servo quay xong trước khi detach()

// Thời gian bơm tối đa để tránh chạy khô / tràn nước
const unsigned long MAX_PUMP_MS     = 10000;
const unsigned long DEFAULT_PUMP_MS = 5000;

// Chu kỳ gửi dữ liệu
const unsigned long TELEMETRY_INTERVAL_MS = 5000;  // Gửi độ ẩm + ánh sáng mỗi 5 giây
const unsigned long HEARTBEAT_INTERVAL_MS = 15000; // Gửi heartbeat mỗi 15 giây
const unsigned long SERIAL_PRINT_MS       = 2000;  // In Serial mỗi 2 giây
const unsigned long MQTT_RETRY_MS         = 5000;  // Thử kết nối lại MQTT mỗi 5 giây
// =========================================================

// Topic MQTT
String topicSoil   = String("plant/") + DEVICE_UID + "/telemetry/soil";
String topicLight  = String("plant/") + DEVICE_UID + "/telemetry/light";
String topicStatus = String("plant/") + DEVICE_UID + "/status";
String topicAck    = String("plant/") + DEVICE_UID + "/ack";
String topicCmd    = String("plant/") + DEVICE_UID + "/cmd/#";

ESP8266WebServer server(80);
WiFiClient espClient;
PubSubClient mqttClient(espClient);
BH1750 lightMeter(0x23);
Servo curtainServo;

bool bh1750Ready = false;
bool pumpOn = false;
unsigned long pumpStartMs = 0;
unsigned long activePumpLimitMs = MAX_PUMP_MS;

int currentServoAngle = SERVO_OPEN_DEG;
String curtainState = "open"; // "open" (60°) hoặc "closed" (120°)
bool servoMoving = false;
unsigned long servoMoveStartMs = 0;

unsigned long lastTelemetryMs = 0;
unsigned long lastHeartbeatMs = 0;
unsigned long lastPrintMs = 0;
unsigned long lastMqttRetryMs = 0;

// ------ ĐIỀU KHIỂN RELAY BƠM (KIỂU THẢ NỔI AN TOÀN) ------
void setPump(bool on, unsigned long durationMs = MAX_PUMP_MS) {
  if (on) {
    // Nếu servo đang quay thì detach ngay để tránh sụt áp nguồn 5V (VU)
    if (servoMoving) {
      curtainServo.detach();
      servoMoving = false;
    }
    pumpOn = true;
    pumpStartMs = millis();
    activePumpLimitMs = (durationMs > 0 && durationMs <= MAX_PUMP_MS) ? durationMs : MAX_PUMP_MS;

    // Bật relay: kéo chân D5 xuống LOW
    pinMode(RELAY_PIN, OUTPUT);
    digitalWrite(RELAY_PIN, LOW);
    Serial.printf(">> BƠM: BẬT (tối đa %lu ms)\n", activePumpLimitMs);
  } else {
    pumpOn = false;
    // Tắt relay: chuyển chân D5 về INPUT (thả nổi) để opto 5V ngắt hẳn
    pinMode(RELAY_PIN, INPUT);
    Serial.println(">> BƠM: TẮT (thả nổi chân D5)");
  }
}

// ------ ĐIỀU KHIỂN SERVO MÁI CHE (TỰ ĐỘNG DETACH) ------
void moveCurtain(int targetAngle, const char* stateLabel) {
  // Không quay servo khi bơm đang chạy để bảo vệ nguồn; nếu cần thì tắt bơm trước
  if (pumpOn) {
    Serial.println("!! Tạm tắt bơm trước khi quay Servo để tránh sụt áp");
    setPump(false);
    delay(50);
  }

  targetAngle = constrain(targetAngle, SERVO_OPEN_DEG, SERVO_CLOSE_DEG);
  currentServoAngle = targetAngle;
  curtainState = String(stateLabel);

  // Đặt góc đích TRƯỚC khi attach() để thư viện Servo không giật về góc mặc định 90°
  curtainServo.write(targetAngle);
  if (!curtainServo.attached()) {
    curtainServo.attach(SERVO_PIN, 500, 2400);
  }
  curtainServo.write(targetAngle);
  servoMoving = true;
  servoMoveStartMs = millis();

  Serial.printf(">> SERVO MÁI CHE: %s (góc %d°)\n", stateLabel, targetAngle);
}

// ------ ĐỌC CẢM BIẾN ĐỘ ẨM ĐẤT (A0) ------
int readRawSoil() {
  long sum = 0;
  for (int i = 0; i < 8; i++) {
    sum += analogRead(SOIL_PIN);
    delay(2);
  }
  return sum / 8;
}

int rawToPercent(int raw) {
  int pct = map(raw, ADC_DRY, ADC_WET, 0, 100);
  return constrain(pct, 0, 100);
}

// ------ ĐỌC CẢM BIẾN ÁNH SÁNG BH1750 (I2C D1/D2) ------
float readLightLux() {
  if (!bh1750Ready) {
    // Thử khởi tạo lại nếu trước đó chưa nhận
    bh1750Ready = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23);
    if (!bh1750Ready) return 0.0f;
  }
  float lux = lightMeter.readLightLevel();
  if (lux < 0 || isnan(lux)) {
    return 0.0f;
  }
  return lux;
}

// ------ TRÍCH XUẤT CHUỖI JSON ĐƠN GIẢN ------
String extractJsonString(const String& json, const char* key) {
  String pattern = String("\"") + key + "\"";
  int keyIdx = json.indexOf(pattern);
  if (keyIdx < 0) return "";
  int colonIdx = json.indexOf(':', keyIdx + pattern.length());
  if (colonIdx < 0) return "";
  int firstQuote = json.indexOf('"', colonIdx + 1);
  if (firstQuote < 0) return "";
  int secondQuote = json.indexOf('"', firstQuote + 1);
  if (secondQuote < 0) return "";
  return json.substring(firstQuote + 1, secondQuote);
}

unsigned long extractJsonULong(const String& json, const char* key, unsigned long defaultVal) {
  String pattern = String("\"") + key + "\"";
  int keyIdx = json.indexOf(pattern);
  if (keyIdx < 0) return defaultVal;
  int colonIdx = json.indexOf(':', keyIdx + pattern.length());
  if (colonIdx < 0) return defaultVal;
  int startIdx = colonIdx + 1;
  while (startIdx < (int)json.length() && (json[startIdx] == ' ' || json[startIdx] == '"')) {
    startIdx++;
  }
  int endIdx = startIdx;
  while (endIdx < (int)json.length() && isDigit(json[endIdx])) {
    endIdx++;
  }
  if (endIdx == startIdx) return defaultVal;
  unsigned long val = json.substring(startIdx, endIdx).toInt();
  return val > 0 ? val : defaultVal;
}

// ------ GỬI XÁC NHẬN LỆNH (ACK) VỀ BACKEND ------
void sendCommandAck(const String& commandId, const char* statusStr) {
  if (!mqttClient.connected() || commandId.length() == 0) return;
  String payload = String("{\"command_id\":\"") + commandId +
                   "\",\"commandId\":\"" + commandId +
                   "\",\"deviceId\":\"" + DEVICE_UID +
                   "\",\"status\":\"" + statusStr + "\"}";
  mqttClient.publish(topicAck.c_str(), payload.c_str(), false);
  Serial.printf("[MQTT ACK] %s\n", payload.c_str());
}

// ------ XỬ LÝ LỆNH TỪ BACKEND QUA MQTT ------
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  msg.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }
  Serial.printf("[MQTT CMD] Topic: %s | Payload: %s\n", topic, msg.c_str());

  String commandId = extractJsonString(msg, "command_id");
  if (commandId.length() == 0) {
    commandId = extractJsonString(msg, "commandId");
  }
  String action = extractJsonString(msg, "action");
  action.toLowerCase();

  unsigned long duration = extractJsonULong(msg, "duration", DEFAULT_PUMP_MS);

  if (action == "pump_on") {
    setPump(true, duration);
    sendCommandAck(commandId, "executed");
  } else if (action == "pump_off") {
    setPump(false);
    sendCommandAck(commandId, "executed");
  } else if (action == "curtain_open" || action == "roof_open") {
    moveCurtain(SERVO_OPEN_DEG, "open");
    sendCommandAck(commandId, "executed");
  } else if (action == "curtain_close" || action == "roof_close") {
    moveCurtain(SERVO_CLOSE_DEG, "closed");
    sendCommandAck(commandId, "executed");
  } else {
    Serial.printf("[MQTT CMD] Lệnh không xác định: %s\n", action.c_str());
    sendCommandAck(commandId, "failed");
  }
}

// ------ KẾT NỐI MQTT (KHÔNG CHẶN VÒNG LẶP) ------
void ensureMqttConnected() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (mqttClient.connected()) return;

  unsigned long now = millis();
  if (now - lastMqttRetryMs < MQTT_RETRY_MS) return;
  lastMqttRetryMs = now;

  String clientId = String(DEVICE_UID) + "-" + String(ESP.getChipId(), HEX);
  String lwtPayload = String("{\"deviceId\":\"") + DEVICE_UID + "\",\"status\":\"offline\"}";

  Serial.printf("[MQTT] Đang kết nối tới %s (%s)... ", MQTT_BROKER, clientId.c_str());
  if (mqttClient.connect(clientId.c_str(), NULL, NULL, topicStatus.c_str(), 1, false, lwtPayload.c_str())) {
    Serial.println("THÀNH CÔNG!");
    mqttClient.subscribe(topicCmd.c_str(), 1);
    // Gửi heartbeat online ngay khi kết nối
    String onlinePayload = String("{\"deviceId\":\"") + DEVICE_UID +
                           "\",\"status\":\"online\",\"uptime\":" + String(millis() / 1000) +
                           ",\"firmwareVersion\":\"" + FW_VERSION + "\"}";
    mqttClient.publish(topicStatus.c_str(), onlinePayload.c_str(), false);
  } else {
    Serial.printf("Thất bại (rc=%d), sẽ thử lại sau 5s\n", mqttClient.state());
  }
}

// ------ PUBLISH TELEMETRY & HEARTBEAT ------
void publishTelemetry() {
  if (!mqttClient.connected()) return;

  int raw = readRawSoil();
  int moisture = rawToPercent(raw);
  float lux = readLightLux();

  String soilJson = String("{\"deviceId\":\"") + DEVICE_UID +
                    "\",\"type\":\"soil\",\"value\":" + String(moisture) +
                    ",\"raw\":" + String(raw) +
                    ",\"unit\":\"%\"}";
  mqttClient.publish(topicSoil.c_str(), soilJson.c_str(), false);

  String lightJson = String("{\"deviceId\":\"") + DEVICE_UID +
                     "\",\"type\":\"light\",\"value\":" + String(lux, 1) +
                     ",\"unit\":\"lux\"}";
  mqttClient.publish(topicLight.c_str(), lightJson.c_str(), false);

  Serial.printf("[MQTT PUB] soil=%d%% (raw=%d) | light=%.1f lux\n", moisture, raw, lux);
}

void publishHeartbeat() {
  if (!mqttClient.connected()) return;
  String hbJson = String("{\"deviceId\":\"") + DEVICE_UID +
                  "\",\"status\":\"online\",\"uptime\":" + String(millis() / 1000) +
                  ",\"firmwareVersion\":\"" + FW_VERSION + "\"}";
  mqttClient.publish(topicStatus.c_str(), hbJson.c_str(), false);
}

// ------ GIAO DIỆN WEB CỤC BỘ TRÊN ESP8266 ------
String statusJson() {
  int raw = readRawSoil();
  float lux = readLightLux();
  String j = "{\"device_uid\":\"" + String(DEVICE_UID) + "\"" +
             ",\"raw\":" + String(raw) +
             ",\"moisture\":" + String(rawToPercent(raw)) +
             ",\"lux\":" + String(lux, 1) +
             ",\"bh1750_ready\":" + (bh1750Ready ? "true" : "false") +
             ",\"pump\":" + (pumpOn ? "true" : "false") +
             ",\"curtain_state\":\"" + curtainState + "\"" +
             ",\"servo_angle\":" + String(currentServoAngle) +
             ",\"mqtt_connected\":" + (mqttClient.connected() ? "true" : "false") +
             ",\"max_pump_ms\":" + String(MAX_PUMP_MS) + "}";
  return j;
}

const char INDEX_HTML[] PROGMEM = R"HTML(
<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP8266 Smart Plant Care</title>
<style>
 body{font-family:sans-serif;max-width:480px;margin:20px auto;padding:0 16px;background:#f7fafc;color:#1a202c}
 .card{background:#fff;border-radius:10px;padding:16px;margin-bottom:14px;box-shadow:0 1px 4px rgba(0,0,0,0.08)}
 .v{font-size:32px;font-weight:700;color:#2b6cb0}
 .sub{color:#4a5568;font-size:14px;margin-top:4px}
 button{font-size:16px;padding:10px 16px;margin:6px 6px 0 0;border:none;border-radius:6px;cursor:pointer;background:#3182ce;color:#fff}
 button.off{background:#e53e3e}
 button.sec{background:#38a169}
 .badge{display:inline-block;padding:3px 8px;border-radius:4px;font-size:12px;background:#e2e8f0}
</style></head><body>
<h2>ESP8266 Smart Plant Care</h2>
<div class="card">
 <div>Thiết bị: <b id="uid">--</b> | MQTT: <span class="badge" id="mq">--</span></div>
</div>
<div class="card">
 <div>Độ ẩm đất</div>
 <div class="v" id="m">--%</div>
 <div class="sub">Raw ADC (A0): <span id="r">--</span></div>
</div>
<div class="card">
 <div>Cường độ ánh sáng (BH1750)</div>
 <div class="v" id="lx">-- lux</div>
 <div class="sub">Trạng thái I2C: <span id="bh">--</span></div>
</div>
<div class="card">
 <div>Máy bơm (Relay D5): <b id="p">--</b></div>
 <button onclick="pump(1)">BẬT bơm (5s)</button>
 <button class="off" onclick="pump(0)">TẮT bơm</button>
</div>
<div class="card">
 <div>Mái che Servo (D6): <b id="cs">--</b> (<span id="ang">--</span>°)</div>
 <button class="sec" onclick="curtain('open')">MỞ mái che (60°)</button>
 <button onclick="curtain('close')">ĐÓNG mái che (120°)</button>
</div>
<script>
async function load(){
 const d=await (await fetch('/status')).json();
 uid.textContent=d.device_uid;
 mq.textContent=d.mqtt_connected?'Đã kết nối':'Mất kết nối';
 m.textContent=d.moisture+'%';
 r.textContent=d.raw;
 lx.textContent=d.lux+' lux';
 bh.textContent=d.bh1750_ready?'Sẵn sàng (0x23)':'Chưa nhận BH1750';
 p.textContent=d.pump?'ĐANG CHẠY':'TẮT';
 cs.textContent=d.curtain_state==='open'?'ĐANG MỞ':'ĐANG ĐÓNG';
 ang.textContent=d.servo_angle;
}
async function pump(on){await fetch('/pump?on='+on);load();}
async function curtain(act){await fetch('/curtain?act='+act);load();}
load();setInterval(load,2000);
</script></body></html>
)HTML";

void handleRoot()   { server.send_P(200, "text/html", INDEX_HTML); }
void handleStatus() { server.send(200, "application/json", statusJson()); }
void handlePump() {
  if (!server.hasArg("on")) {
    server.send(400, "text/plain", "thieu tham so on=0|1");
    return;
  }
  bool on = (server.arg("on") == "1");
  setPump(on, DEFAULT_PUMP_MS);
  server.send(200, "application/json", statusJson());
}
void handleCurtain() {
  if (!server.hasArg("act")) {
    server.send(400, "text/plain", "thieu tham so act=open|close");
    return;
  }
  String act = server.arg("act");
  if (act == "open") {
    moveCurtain(SERVO_OPEN_DEG, "open");
  } else if (act == "close") {
    moveCurtain(SERVO_CLOSE_DEG, "closed");
  }
  server.send(200, "application/json", statusJson());
}

void setup() {
  Serial.begin(115200);
  delay(200);

  // 1. Luôn tắt bơm ngay lúc khởi động (chế độ thả nổi INPUT)
  setPump(false);

  // 2. Khởi tạo I2C (SDA = D2, SCL = D1) và cảm biến BH1750
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  bh1750Ready = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23);
  if (bh1750Ready) {
    Serial.println("[I2C] BH1750 (0x23) đã sẵn sàng.");
  } else {
    Serial.println("[I2C] Cảnh báo: Chưa tìm thấy BH1750 ở 0x23, sẽ tự thử lại.");
  }

  // 3. Đưa Servo về góc mở an toàn (60°) rồi tự detach trong loop()
  moveCurtain(SERVO_OPEN_DEG, "open");

  // 4. Kết nối WiFi
  Serial.printf("\nĐang kết nối WiFi: %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 15000) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("\nWiFi đã kết nối! IP cục bộ: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nChưa kết nối được WiFi, ESP8266 sẽ tự động kết nối lại ở chế độ nền.");
  }

  // 5. Cấu hình MQTT
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  mqttClient.setKeepAlive(30);

  // 6. Khởi động Web Server nội bộ
  server.on("/", handleRoot);
  server.on("/status", handleStatus);
  server.on("/pump", handlePump);
  server.on("/curtain", handleCurtain);
  server.begin();
  Serial.println("Web Server sẵn sàng. Lệnh Serial: 1=bật bơm, 0=tắt bơm, o=mở mái(60°), c=đóng mái(120°), s=trạng thái");
}

void loop() {
  server.handleClient();

  // Kết nối & duy trì MQTT
  ensureMqttConnected();
  if (mqttClient.connected()) {
    mqttClient.loop();
  }

  unsigned long now = millis();

  // Tự động detach Servo sau khi quay xong để chống rung & tiết kiệm dòng
  if (servoMoving && (now - servoMoveStartMs >= SERVO_ATTACH_MS)) {
    curtainServo.detach();
    servoMoving = false;
    Serial.println(">> SERVO: Đã detach() sau khi quay xong");
  }

  // Tự động tắt bơm khi hết thời gian an toàn
  if (pumpOn && (now - pumpStartMs >= activePumpLimitMs)) {
    Serial.println("!! Hết thời gian tưới an toàn, tự động tắt bơm");
    setPump(false);
  }

  // Đọc lệnh nhanh qua Serial Monitor
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '1') setPump(true, DEFAULT_PUMP_MS);
    else if (c == '0') setPump(false);
    else if (c == 'o' || c == 'O') moveCurtain(SERVO_OPEN_DEG, "open");
    else if (c == 'c' || c == 'C') moveCurtain(SERVO_CLOSE_DEG, "closed");
    else if (c == 's' || c == 'S') Serial.println(statusJson());
  }

  // Gửi dữ liệu Telemetry định kỳ lên Backend qua MQTT
  if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = now;
    publishTelemetry();
  }

  // Gửi Heartbeat định kỳ
  if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = now;
    publishHeartbeat();
  }

  // In log Serial mỗi 2 giây để tiện theo dõi và hiệu chuẩn
  if (now - lastPrintMs >= SERIAL_PRINT_MS) {
    lastPrintMs = now;
    int raw = readRawSoil();
    float lux = readLightLux();
    Serial.printf("raw=%d moisture=%d%% lux=%.1f pump=%s curtain=%s(%d°) mqtt=%s\n",
                  raw, rawToPercent(raw), lux,
                  pumpOn ? "ON" : "OFF",
                  curtainState.c_str(), currentServoAngle,
                  mqttClient.connected() ? "OK" : "NO");
  }
}
