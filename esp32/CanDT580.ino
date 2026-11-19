/*
 * Cân DT580 + ESP32-C5 + HX711 + BLE
 * ===================================
 * ESP32-C5 đọc số cân từ cảm biến lực (load cell) của cân DT580 qua module
 * HX711, rồi gửi số cân qua Bluetooth BLE cho app iPhone (tên "Cân DT580").
 * App iPhone đọc số cân bằng giọng nói tiếng Việt ra loa.
 *
 * PHẦN CỨNG (theo sơ đồ đấu nối đã chốt):
 *   - Cảm biến lực trong cân DT580: 4 dây, đã chấm song song 2 dây TÍN HIỆU
 *     từ mạch cân sang HX711 (xanh lá -> A+, trắng -> A-).
 *   - Chân E+ / E- của HX711 ĐỂ TRỐNG, không nối gì hết.
 *     (Nguồn kích thích cho cảm biến do mạch gốc của cân cấp, HX711 chỉ
 *     "nghe" tín hiệu. Cân vẫn hiển thị bình thường.)
 *   - HX711 -> ESP32-C5: VCC -> 3V3, GND -> GND, DT -> GPIO 4, SCK -> GPIO 5.
 *
 * YÊU CẦU PHẦN MỀM:
 *   - Arduino ESP32 Core 3.3.0 trở lên (mới có hỗ trợ ESP32-C5).
 *   - Thư viện HX711 (bogde) + NimBLE-Arduino 2.x (h2zero, bản 2.5.2).
 *     LƯU Ý: bản NimBLE-Arduino 2.3.6 KHÔNG link được với Arduino ESP32
 *     Core 3.3.x (thiếu symbol r_os_mempool_init...), phải dùng 2.5.2.
 *     Đã kiểm chứng biên dịch được ngày 18/11/2026 với Core 3.3.13 +
 *     HX711 0.7.5 + NimBLE-Arduino 2.5.2 (flash 58%, RAM 8%).
 *   - Board: ESP32C5 Dev Module. Cổng: COM3 (trên PC dương).
 *
 * HIỆU CHUẨN (BẮT BUỘC, xem README.md):
 *   - Số cân CHƯA hiệu chuẩn sẽ SAI. Phải hiệu chuẩn 1 lần bằng quả cân
 *     chuẩn (1kg hoặc 5kg) rồi mới xài.
 *   - Hệ số hiệu chuẩn: CALIBRATION_FACTOR ở dưới.
 */

#include <Arduino.h>
#include "HX711.h"
#include <NimBLEDevice.h>

// ---------- Chân nối HX711 ----------
#define HX711_DT_PIN   4   // HX711 DT  -> GPIO 4
#define HX711_SCK_PIN  5   // HX711 SCK -> GPIO 5

// ---------- Hiệu chuẩn ----------
// Hệ số tỉ lệ: số cân (kg) = giá trị raw của HX711 / hệ số này.
// Cách tính: đặt quả cân chuẩn lên cân (vd 1kg), đọc số raw trên Serial,
// hệ số = số raw / khối lượng quả cân (kg).
// Ví dụ: đặt 1kg, Serial in raw = 12345 -> CALIBRATION_FACTOR = 12345.
// MẶC ĐỊNH = 1.0 (chưa hiệu chuẩn) -> số cân in ra sẽ là số raw, KHÔNG
// phải số kg thật. Phải hiệu chuẩn rồi sửa số này, nạp lại code.
float CALIBRATION_FACTOR = 1.0;

// ---------- BLE ----------
#define BLE_DEVICE_NAME "CanDT580"
#define SERVICE_UUID "54aaafad-74a5-4e13-a29f-a5efde5d363f"
#define CHAR_UUID    "82c91516-57c4-4278-8434-30fd74d1b5b8"

// ---------- Ngưỡng phát hiện cân ỔN ĐỊNH ----------
// Cân được coi là ổn định khi 10 mẫu liên tiếp (~1 giây) dao động trong
// khoảng tối đa 40g (tức ±20g). Tăng số này lên nếu cân đặt chỗ rung/lắc.
const float STABLE_WINDOW_KG = 0.04;  // 40g
const int   STABLE_COUNT     = 10;    // 10 mẫu ~ 1 giây
const float MIN_WEIGHT_KG    = 0.05;  // dưới 50g coi như cân trống
const float RESEND_DIFF_KG   = 0.05;  // gửi lại nếu số thay đổi >= 50g

HX711 scale;

NimBLECharacteristic* pWeightChar = nullptr;
bool deviceConnected = false;

// Bộ đệm 10 mẫu gần nhất để xét ổn định
float readings[STABLE_COUNT];
int   readIndex = 0;
int   readCount = 0;
float lastSentWeight    = -1;  // số cân đã gửi qua BLE lần cuối (-1 = chưa gửi)
float lastPrintedWeight = -1;  // số cân đã in ra Serial lần cuối

// Callback khi iPhone kết nối / ngắt kết nối BLE.
// LƯU Ý: NimBLE-Arduino 2.x đổi chữ ký hàm, phải có tham số NimBLEConnInfo&
// (bản 1.x chỉ có pServer). Viết sai chữ ký thì code vẫn biên dịch được
// nhưng callback không bao giờ chạy.
class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* pServer, NimBLEConnInfo& connInfo) override {
    deviceConnected = true;
    Serial.println("iPhone da ket noi BLE");
  }

  void onDisconnect(NimBLEServer* pServer, NimBLEConnInfo& connInfo, int reason) override {
    deviceConnected = false;
    Serial.println("iPhone da ngat ket noi");
    // advertiseOnDisconnect(true) đã bật ở setup() nên server tự quảng
    // cáo BLE lại, không cần gọi startAdvertising() ở đây.
  }
};

// Gửi số cân qua BLE notify (chỉ gọi khi đã có iPhone kết nối).
// notify() trả về false nếu bộ đệm BLE đầy -> thử lại vài lần.
void sendWeightBLE(float kg) {
  char msg[16];
  snprintf(msg, sizeof(msg), "%.1f", kg);
  if (pWeightChar != nullptr) {
    pWeightChar->setValue(msg);
    for (int i = 0; i < 3; i++) {
      if (pWeightChar->notify()) break;
      delay(50);
    }
  }
  Serial.print("Da gui BLE: ");
  Serial.println(msg);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println("=== Can DT580 + ESP32-C5 + HX711 + BLE ===");
  Serial.println("Luc khoi dong, can PHAI DANG TRONG (khong co do tren can)");
  Serial.println("vi ESP32 se tu tru bi (tare) ngay luc nay.");

  // --- HX711 ---
  scale.begin(HX711_DT_PIN, HX711_SCK_PIN);
  scale.set_scale(CALIBRATION_FACTOR);
  // Chi tru bi khi HX711 san sang. Neu chua noi module HX711 (chan DT
  // dang noi long) thi tare() se doi mai khong xong -> setup() ket
  // luon, BLE khong bao gio khoi dong. Cho toi da 2 giay, khong thay
  // thi bo qua tru bi, van chay BLE binh thuong.
  unsigned long t0 = millis();
  while (!scale.is_ready() && millis() - t0 < 2000) { delay(10); }
  if (scale.is_ready()) {
    scale.tare();  // trừ bì, cân phải đang trống
    Serial.print("Da tru bi. Raw luc trong: ");
    Serial.println(scale.read_average(10));
  } else {
    Serial.println("CANH BAO: khong thay HX711 (chua noi module?). Bo qua tru bi, van chay BLE.");
  }

  // --- BLE ---
  NimBLEDevice::init(BLE_DEVICE_NAME);
  NimBLEServer* pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());
  // NimBLE 2.x: quảng cáo KHÔNG tự chạy lại khi client ngắt kết nối,
  // phải bật advertiseOnDisconnect(true) thì server mới tự quảng cáo lại.
  pServer->advertiseOnDisconnect(true);

  NimBLEService* pService = pServer->createService(SERVICE_UUID);
  pWeightChar = pService->createCharacteristic(
    CHAR_UUID,
    NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY
  );
  pWeightChar->setValue("0.0");
  pService->start();

  NimBLEAdvertising* pAdvertising = NimBLEDevice::getAdvertising();
  pAdvertising->setName(BLE_DEVICE_NAME);
  pAdvertising->addServiceUUID(SERVICE_UUID);
  // NimBLE 2.x: setScanResponse() đổi thành enableScanResponse().
  pAdvertising->enableScanResponse(true);
  pAdvertising->start();

  Serial.print("BLE dang quang cao: ");
  Serial.println(BLE_DEVICE_NAME);
  Serial.println("Cho iPhone ket noi...");
  Serial.println("Lenh Serial: 't' = tru bi lai, 'r' = doc so raw hien tai");
}

void loop() {
  // --- Lệnh từ Serial Monitor (để hiệu chuẩn / trừ bì) ---
  if (Serial.available()) {
    char c = Serial.read();
    if (c == 't' || c == 'T') {
      scale.tare();
      lastSentWeight = -1;
      lastPrintedWeight = -1;
      readCount = 0;
      readIndex = 0;
      Serial.println("Da tru bi (tare). Can dang trong.");
    } else if (c == 'r' || c == 'R') {
      long raw = scale.get_value(5);
      float w = scale.get_units(5);
      Serial.print("Raw: ");
      Serial.print(raw);
      Serial.print(" | Can: ");
      Serial.print(w, 1);
      Serial.println(" kg");
    }
  }

  // --- Doc can (HX711 chay 10 mau/giay nen moi lan doc ~100ms) ---
  // Chua co HX711 thi bo qua vong nay (khong goi get_units vi no se
  // doi mai). BLE van chay binh thuong.
  if (!scale.is_ready()) {
    delay(100);
    return;
  }
  float w = scale.get_units(1);
  if (w < 0) w = 0;  // tránh số âm do nhiễu khi cân trống

  readings[readIndex] = w;
  readIndex = (readIndex + 1) % STABLE_COUNT;
  if (readCount < STABLE_COUNT) readCount++;

  // Chưa đủ 10 mẫu thì chờ tiếp
  if (readCount < STABLE_COUNT) {
    delay(10);
    return;
  }

  // Tính min / max / trung bình của 10 mẫu
  float mn = readings[0], mx = readings[0], sum = 0;
  for (int i = 0; i < STABLE_COUNT; i++) {
    if (readings[i] < mn) mn = readings[i];
    if (readings[i] > mx) mx = readings[i];
    sum += readings[i];
  }
  float avg = sum / STABLE_COUNT;
  float range = mx - mn;

  // --- Cân trống (đồ đã lấy ra) -> reset để lần cân sau gửi lại ---
  if (avg < MIN_WEIGHT_KG) {
    lastSentWeight = -1;
    lastPrintedWeight = -1;
    delay(10);
    return;
  }

  // --- Cân ổn định? (dao động trong ngưỡng, liên tục ~1 giây) ---
  if (range > STABLE_WINDOW_KG) {
    // Số đang nhảy (đang bỏ đồ lên / lấy đồ ra) -> không gửi
    delay(10);
    return;
  }

  // Ổn định: in ra Serial 1 lần cho mỗi giá trị (để hiệu chuẩn / debug).
  // Tách riêng với việc gửi BLE để khi chưa có iPhone kết nối thì Serial
  // vẫn in 1 lần chứ không spam.
  if (lastPrintedWeight < 0 || fabs(avg - lastPrintedWeight) >= RESEND_DIFF_KG) {
    float rawDelta = avg * CALIBRATION_FACTOR;
    Serial.print("Can on dinh: ");
    Serial.print(avg, 1);
    Serial.print(" kg (raw: ");
    Serial.print(rawDelta, 0);
    Serial.println(")");
    lastPrintedWeight = avg;
  }

  // Ổn định + số thay đổi so với lần gửi trước -> gửi qua BLE.
  // Chỉ gửi khi đã có iPhone kết nối. Chưa kết nối thì KHÔNG cập nhật
  // lastSentWeight, để khi iPhone kết nối vào thì lần sau gửi lại.
  if (deviceConnected &&
      (lastSentWeight < 0 || fabs(avg - lastSentWeight) >= RESEND_DIFF_KG)) {
    sendWeightBLE(avg);
    lastSentWeight = avg;
  }

  delay(10);
}
