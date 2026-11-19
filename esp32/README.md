# ESP32-C5 cho cân DT580 — đọc HX711 + gửi số cân qua BLE

Code Arduino cho board ESP32-C5 (ESP-C5-32): đọc số cân từ cảm biến lực
(load cell) của cân DT580 qua module HX711, rồi gửi số cân qua Bluetooth
BLE cho app iPhone "Cân DT580" (app đọc số bằng giọng nói tiếng Việt).

## Đấu nối (theo sơ đồ đã chốt)

| Từ | Tới | Ghi chú |
|----|-----|---------|
| Cảm biến lực, dây xanh lá | HX711 chân A+ | Chấm song song từ mạch cân |
| Cảm biến lực, dây trắng | HX711 chân A- | Chấm song song từ mạch cân |
| HX711 chân E+ | — | **ĐỂ TRỐNG, không nối** |
| HX711 chân E- | — | **ĐỂ TRỐNG, không nối** |
| HX711 VCC | ESP32-C5 chân 3V3 | |
| HX711 GND | ESP32-C5 chân GND | |
| HX711 DT | ESP32-C5 GPIO 4 | |
| HX711 SCK | ESP32-C5 GPIO 5 | |

Chân E+/E- của HX711 để trống vì nguồn kích thích cho cảm biến do mạch
gốc của cân cấp, HX711 chỉ "nghe" tín hiệu. Nối E+/E- của HX711 vô mạch
cân sẽ làm 2 nguồn điện đánh nhau. Cân vẫn hiển thị bình thường.

## Thư viện cần cài (Arduino IDE)

1. **Arduino ESP32 Core 3.3.0 trở lên** (mới có hỗ trợ ESP32-C5).
   Vào File → Preferences → Additional Boards Manager URLs, thêm:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
   Rồi vào Tools → Board → Boards Manager, tìm "esp32" của Espressif,
   cài bản 3.3.0 trở lên.
2. **HX711 Arduino Library** (tác giả bogde) — vào Sketch → Include
   Library → Manage Libraries, tìm "HX711", cài bản mới nhất.
3. **NimBLE-Arduino 2.x** (tác giả h2zero, bản **2.5.2**) — vào
   Manage Libraries, tìm "NimBLE-Arduino", cài bản 2.5.2.
   LƯU Ý: bản 2.3.6 KHÔNG link được với Arduino ESP32 Core 3.3.x (lỗi
   thiếu symbol `r_os_mempool_init`...), phải dùng 2.5.2 trở lên.
   Đã kiểm chứng biên dịch được ngày 18/11/2026 với Core 3.3.13 +
   HX711 0.7.5 + NimBLE-Arduino 2.5.2 (flash 58%, RAM 8%).

## Cách nạp code

1. Mở file `CanDT580.ino` bằng Arduino IDE.
2. Tools → Board → esp32 → chọn **ESP32C5 Dev Module**.
3. Tools → Port → chọn **COM3** (cổng ESP32-C5 trên PC dương).
   Dùng cổng USB-C của board hiện ra COM3. Nếu Serial Monitor không
   hiện gì thì bật thêm Tools → USB CDC On Boot → Enabled rồi nạp lại.
4. Bấm **Upload**.
5. **Lúc bật nguồn / nạp code xong, cân phải ĐANG TRỐNG** (không có đồ
   trên cân), vì ESP32 tự trừ bì (tare) ngay lúc khởi động.

## Cách hiệu chuẩn (BẮT BUỘC, làm 1 lần)

Số cân CHƯA hiệu chuẩn sẽ SAI. Làm 1 lần duy nhất rồi xài hoài:

1. Để `CALIBRATION_FACTOR = 1.0` trong file `CanDT580.ino`, nạp code.
2. Mở Serial Monitor (tốc độ 115200 baud). Cân đang trống.
3. Đặt 1 quả cân chuẩn lên cân (vd quả **1kg**, hoặc 5kg cho chính xác hơn).
4. Đợi cân ổn định (~1 giây), Serial in ra dòng dạng:
   `Can on dinh: 12345.0 kg (raw: 12345)`
   (Số này là số raw vì hệ số đang = 1.0.)
5. Tính hệ số: **hệ số = số raw / khối lượng quả cân (kg)**.
   Ví dụ đặt 1kg, raw = 12345 → hệ số = 12345.
   Đặt 5kg, raw = 61725 → hệ số = 61725 / 5 = 12345.
6. Sửa `CALIBRATION_FACTOR = 12345;` trong file, nạp lại code.
7. Kiểm tra: đặt lại quả cân 1kg, Serial phải in đúng `Can on dinh: 1.0 kg`.

Lệnh trong Serial Monitor (gõ rồi Enter):
- `t` — trừ bì lại (cân phải đang trống).
- `r` — đọc số raw + số cân hiện tại (để hiệu chuẩn).

## Cách test bằng app nRF Connect trên iPhone

1. Cài app **nRF Connect** (miễn phí, của Nordic) trên iPhone.
2. Cấp nguồn cho ESP32-C5.
3. Mở nRF Connect → bấm **Scan** → thấy thiết bị tên **CanDT580** → bấm
   **Connect**.
4. Mở service UUID `54aaafad-...`, mở characteristic UUID `82c91516-...`,
   bấm nút bật **notification** (biểu tượng 3 mũi tên xuống).
5. Đặt đồ lên cân, đợi ổn định ~1 giây → giá trị characteristic đổi
   thành số cân dạng text, vd `12.5`.
6. Thấy số nhảy đúng là ESP32 chạy đúng. App "Cân DT580" xài chung
   giao diện BLE này nên cũng sẽ nhận được số.

## BLE gửi gì cho app iPhone

- Tên thiết bị: `CanDT580`.
- Service UUID: `54aaafad-74a5-4e13-a29f-a5efde5d363f`.
- Characteristic UUID: `82c91516-57c4-4278-8434-30fd74d1b5b8`
  (quyền READ + NOTIFY).
- Dữ liệu: text UTF-8, số cân kg 1 số lẻ, vd `12.5`.
- ESP32 chỉ gửi (notify) khi: cân đã ổn định (~1 giây, dao động trong
  ±20g), số cân khác lần gửi trước từ 50g trở lên, và đã có iPhone kết
  nối. Số đang nhảy thì không gửi. Lấy đồ ra (về gần 0) thì reset để
  lần cân sau gửi lại.

## Xử lý sự cố

- **Serial toàn in 0.0 / nRF Connect không thấy "CanDT580":** kiểm tra
  dây HX711 (DT → GPIO 4, SCK → GPIO 5, VCC → 3V3, GND → GND), kiểm
  tra chân E+/E- của HX711 đang để trống, kiểm tra cân đã bật nguồn
  chưa, thử rút nguồn ESP32 cắm lại.
- **Số cân nhảy lung tung, không ổn định:** tăng `STABLE_WINDOW_KG`
  trong code (vd từ 0.04 lên 0.06), kiểm tra mối hàn 2 dây tín hiệu
  có chắc không, tránh để cân chỗ rung/lắc.
- **Số cân sai (vd đặt 1kg mà in 2.5kg):** chưa hiệu chuẩn hoặc hệ số
  sai — làm lại bước hiệu chuẩn ở trên.
- **Cân bị trừ bì sai (lúc khởi động có đồ trên cân):** lấy hết đồ ra,
  gõ `t` trong Serial Monitor để trừ bì lại, hoặc rút nguồn cắm lại
  khi cân đang trống.
- **iPhone kết nối rồi mà không nhận được số:** kiểm tra trong nRF
  Connect đã bật notification cho characteristic chưa; kiểm tra số cân
  đã ổn định chưa (phải đợi ~1 giây sau khi đặt đồ lên).
