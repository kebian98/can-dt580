# Cân DT580 — app iPhone đọc số cân ra loa

App iPhone nhận số cân từ cân tính tiền DT580 (qua ESP32-C5, Bluetooth LE)
rồi đọc bằng giọng tiếng Việt ra loa Bluetooth (UGREEN). Tắt màn hình vẫn
đọc được.

## App làm gì

- Quét BLE tìm cân **CanDT580** (service `54aaafad-…-363f`) → kết nối → nhận
  số cân qua NOTIFY (characteristic `82c91516-…-b5b8`).
- Hiện số cân to trên màn hình + đọc bằng giọng Việt, kiểu chợ:
  12.5 → "12 ký rưỡi", 12.3 → "12 ký 3", 0 → "không ký".
- **Tính tiền + đọc số tiền:** nhập đơn giá (đ/kg) trong thẻ "Cài đặt đọc"
  (có nút giá nhanh 5.000 / 8.000 / 10.000 / 15.000 / 20.000), app tự
  tính tiền = số cân × đơn giá, hiện "THÀNH TIỀN" to trên màn hình
  (VD 100.000đ). Chọn chế độ đọc: "Chỉ cân" / "Chỉ tiền" / "Cả hai"
  (VD 12.5kg × 8.000đ/kg → "12 ký rưỡi, 100 nghìn"). Chưa nhập đơn giá
  thì app chỉ đọc số cân, không đọc "0 đồng".
- **Tốc độ đọc:** chọn 0.75x / 1x / 1.25x / 1.5x trong thẻ "Cài đặt đọc".
- Chế độ đọc, đơn giá và tốc độ được **lưu lại** (AsyncStorage) — mở app
  sau vẫn còn.
- Mất kết nối thì tự quét lại. iOS kill app thì tự mở lại nhờ BLE state
  restoration (`restoreStateIdentifier`).
- Công tắc Bật/Tắt giọng đọc. Hiện số cân vừa đọc + giờ đọc.

## Thư viện chính

| Thư viện | Dùng để làm gì |
| --- | --- |
| `react-native-ble-plx` 3.5.1 | BLE central: quét, nối, nhận NOTIFY (trả base64 → decode UTF-8) |
| `expo-speech` ~58.0.4 | TTS tiếng Việt (giọng hệ thống iOS, chọn lúc chạy, ưu tiên Enhanced) |
| `expo-audio` ~58.0.12 | Audio session nền (`.playback`) để đọc được khi tắt màn hình / gạt nút im lặng |
| `@react-native-async-storage/async-storage` | Lưu cài đặt đọc (chế độ đọc, đơn giá, tốc độ) |
| `react-native-safe-area-context` | Safe-area (tai thỏ, nút Home) |
| `buffer` | Decode base64 → UTF-8 |

## Cấu trúc

```
app.json        Cấu hình Expo: bundle ID com.bao.candt580, UIBackgroundModes
                ["bluetooth-central", "audio"], NSBluetoothAlwaysUsageDescription,
                plugin react-native-ble-plx + expo-audio (enableBackgroundPlayback)
eas.json        Cấu hình build EAS (chỉ cấu hình — KHÔNG chạy eas build ở đây)
App.tsx         Giao diện + điều phối BLE/TTS
src/ble.ts      Quản lý BLE: quét, nối, subscribe, tự nối lại, restore state
src/speech.ts   TTS tiếng Việt: chọn giọng vi-VN lúc chạy, chỉnh tốc độ (rate)
src/format.ts   Định dạng số cân + số tiền (hiển thị + câu đọc kiểu chợ)
src/settings.ts Lưu/nạp cài đặt đọc bằng AsyncStorage
src/theme.ts    Bảng màu, spacing, cỡ chữ
```

## Chạy thử (dev build — KHÔNG chạy được trong Expo Go)

App dùng native module (BLE + audio nền) nên **không chạy trong Expo Go**.
Phải build dev build rồi cài lên iPhone thật.

```bash
cd app
npm install
npx tsc --noEmit        # kiểm tra type
npx expo config         # kiểm tra cấu hình hợp lệ
```

Build qua cloud bằng **GitHub Actions** (máy Mac miễn phí, xem workflow ở
`../.github/workflows/`): `expo prebuild` + `xcodebuild` không ký →
file `.ipa` chưa ký → dương tự ký lại bằng **zSign** trên điện thoại rồi cài.

## Cài lên iPhone

1. Lấy file `.ipa` chưa ký từ GitHub Actions (Artifacts/Releases).
2. Dương tự ký bằng **zSign** trên điện thoại (chứng chỉ của dương).
3. Trên iPhone: bật **Developer Mode** (Cài đặt → Quyền riêng tư & Bảo mật),
   lần đầu mở app thì **Trust** nhà phát triển
   (Cài đặt → Cài đặt chung → VPN & Quản lý thiết bị).
4. Mở app → bấm **Quét & Kết nối** → cân DT580 (ESP32) đang bật sẽ nối vào.
   Mở app là tự nối lại, không cần bấm lại.

Lưu ý khi dùng ở sạp:

- **Để chuông (không gạt nút im lặng)** — iPhone gạt im lặng mà audio session
  chưa kịp set `.playback` thì giọng đọc sẽ câm.
- Loa Bluetooth (UGREEN) phải đang nối với iPhone thì tiếng mới ra loa.
- Tầm BLE ~10 m. Ra khỏi tầm, ESP32 mất nguồn hoặc tắt Bluetooth thì app
  tự quét lại để nối.

## Kiểm tra nhanh ESP32 trước khi mở app

Dùng app miễn phí **nRF Connect** (Nordic, trên App Store): quét thấy
"CanDT580" → kết nối → bật notification trên characteristic → đặt đồ lên
cân, thấy số nhảy là ESP32 đúng. Sau đó mới mở app Cân DT580.

## Không dùng EAS Build

EAS Build cloud **không** build được `.ipa` chưa ký cho iPhone thật (bản
unsigned của nó chỉ là bản simulator). Muốn ký bằng chứng chỉ zSign của
dương thì phải build qua GitHub Actions như trên — không cần tài khoản
Apple Developer ($99/năm), không cần tài khoản Expo.
