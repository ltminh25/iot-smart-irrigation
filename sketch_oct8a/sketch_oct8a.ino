/*
 * Soil moisture + pump test - ESP8266 (NodeMCU / Wemos D1 mini)
 *
 * Phần cứng:
 *   Khuếch đại (LM393): VCC->3V3, GND->G, AO->A0
 *   Relay: VCC->5V (VU/VIN), GND->G, IN->D5 (GPIO14)
 *   Mạch bơm (độc lập, qua tiếp điểm khô): Pin 6V(+)->COM, NO->Bơm(+), Bơm(-)->Pin 6V(-)
 *
 * Điều khiển:
 *   Web:    http://<IP>/            (trang nút bấm)
 *           http://<IP>/status      (JSON)
 *           http://<IP>/pump?on=1   (bật)  |  /pump?on=0 (tắt)
 *   Serial (115200): gõ '1' bật, '0' tắt, 's' in trạng thái
 *
 * An toàn: bơm tự tắt sau MAX_PUMP_MS để tránh chạy khô / tràn nước.
 */

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>

// ====== CẤU HÌNH - SỬA CHỖ NÀY ======
const char* WIFI_SSID = "Thanh Anh";
const char* WIFI_PASS = "chungcuvuive";

const int  RELAY_PIN        = D5;      // GPIO14
const bool RELAY_ACTIVE_LOW = true;    // đa số module relay kích mức thấp; chạy ngược thì đổi

// Hiệu chuẩn: đọc raw ngoài không khí (khô) và khi nhúng nước (ướt), điền vào đây
const int ADC_DRY = 850;
const int ADC_WET = 400;

const unsigned long MAX_PUMP_MS = 10000;   // tự tắt bơm sau 10 giây
// =====================================

ESP8266WebServer server(80);
bool pumpOn = false;
unsigned long pumpStartMs = 0;
unsigned long lastPrintMs = 0;

void setPump(bool on) {
  pumpOn = on;
  if (on) pumpStartMs = millis();
  // XOR: active-low thì bật = LOW, active-high thì bật = HIGH
  digitalWrite(RELAY_PIN, (on != RELAY_ACTIVE_LOW) ? HIGH : LOW);
  Serial.println(on ? ">> BƠM: BẬT" : ">> BƠM: TẮT");
}

int readRaw() {
  // Trung bình 8 lần cho đỡ nhiễu
  long sum = 0;
  for (int i = 0; i < 8; i++) { sum += analogRead(A0); delay(2); }
  return sum / 8;
}

int rawToPercent(int raw) {
  int pct = map(raw, ADC_DRY, ADC_WET, 0, 100);
  return constrain(pct, 0, 100);
}

String statusJson() {
  int raw = readRaw();
  String j = "{\"raw\":" + String(raw) +
             ",\"moisture\":" + String(rawToPercent(raw)) +
             ",\"pump\":" + (pumpOn ? "true" : "false") +
             ",\"max_pump_ms\":" + String(MAX_PUMP_MS) + "}";
  return j;
}

const char INDEX_HTML[] PROGMEM = R"HTML(
<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Soil + Pump</title>
<style>
 body{font-family:sans-serif;max-width:420px;margin:24px auto;padding:0 16px}
 .v{font-size:40px;font-weight:700} button{font-size:18px;padding:12px 20px;margin:6px 6px 0 0}
</style></head><body>
<h2>Độ ẩm đất</h2>
<div class="v" id="m">--%</div>
<div>Raw ADC: <span id="r">--</span> | Bơm: <b id="p">--</b></div>
<p><button onclick="pump(1)">BẬT bơm</button><button onclick="pump(0)">TẮT bơm</button></p>
<script>
async function load(){const d=await (await fetch('/status')).json();
 m.textContent=d.moisture+'%';r.textContent=d.raw;p.textContent=d.pump?'ĐANG CHẠY':'tắt';}
async function pump(on){await fetch('/pump?on='+on);load();}
load();setInterval(load,2000);
</script></body></html>
)HTML";

void handleRoot()   { server.send_P(200, "text/html", INDEX_HTML); }
void handleStatus() { server.send(200, "application/json", statusJson()); }
void handlePump() {
  if (!server.hasArg("on")) { server.send(400, "text/plain", "thieu tham so on=0|1"); return; }
  setPump(server.arg("on") == "1");
  server.send(200, "application/json", statusJson());
}

void setup() {
  Serial.begin(115200);
  delay(200);
  pinMode(RELAY_PIN, OUTPUT);
  setPump(false);                        // luôn tắt bơm lúc khởi động

  Serial.printf("\nKết nối WiFi %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.print("\nIP: "); Serial.println(WiFi.localIP());

  server.on("/", handleRoot);
  server.on("/status", handleStatus);
  server.on("/pump", handlePump);
  server.begin();
  Serial.println("Web server sẵn sàng. Serial: 1=bật, 0=tắt, s=trạng thái");
}

void loop() {
  server.handleClient();

  // Lệnh qua Serial
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '1') setPump(true);
    else if (c == '0') setPump(false);
    else if (c == 's') Serial.println(statusJson());
  }

  // Tự tắt bơm khi quá thời gian an toàn
  if (pumpOn && millis() - pumpStartMs >= MAX_PUMP_MS) {
    Serial.println("!! Quá MAX_PUMP_MS, tự tắt bơm");
    setPump(false);
  }

  // In dữ liệu cảm biến mỗi 2 giây để hiệu chuẩn
  if (millis() - lastPrintMs >= 2000) {
    lastPrintMs = millis();
    int raw = readRaw();
    Serial.printf("raw=%d  moisture=%d%%  pump=%s\n", raw, rawToPercent(raw), pumpOn ? "ON" : "OFF");
  }
}
