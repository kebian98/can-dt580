# Cân DT580 — App iPhone đọc số cân bằng giọng nói

App iPhone nhận số cân từ ESP32-C5 qua Bluetooth BLE rồi đọc bằng giọng nói
tiếng Việt ra loa (qua bộ thu Bluetooth UGREEN). Chạy được cả khi iPhone tắt
màn hình.

## Trong repo này có gì

- `app/` — code app iPhone viết bằng Expo (React Native).
  Tên app: **Cân DT580**, bundle ID: `com.bao.candt580`.
- `esp32/` — code cho board ESP32-C5 (đọc HX711 + gửi số cân qua BLE).
- `.github/workflows/build-ios.yml` — GitHub Actions tự động build ra file
  `.ipa` **CHƯA KÝ** (unsigned) để dương tự ký lại bằng zSign trên iPhone.

## Cách build hoạt động

EAS Build (Expo) **không** build được `.ipa` unsigned cho iPhone thật, nên
repo này dùng GitHub Actions (máy Mac miễn phí của GitHub):

1. `npx expo prebuild` tạo thư mục native `ios/` (không cần tài khoản EAS/Apple).
2. `xcodebuild` build với `CODE_SIGNING_ALLOWED=NO` (không ký).
3. Đóng gói `Payload/*.app` thành file `.ipa` unsigned.
4. Đăng file `.ipa` lên GitHub Release (khi push tag) và lưu làm artifact.

Không cần secrets, không cần tài khoản Apple/Expo lúc build.

## Hướng dẫn từng bước (dương tự làm)

### Bước 1 — Tạo tài khoản GitHub (miễn phí)

Vào https://github.com/signup, đăng ký bằng email của dương.
**Tui không tạo tài khoản giùm dương** — dương tự tạo và giữ mật khẩu.

### Bước 2 — Tạo repo mới trên GitHub

1. Đăng nhập GitHub, bấm nút **+** (góc phải trên) → **New repository**.
2. Tên repo gợi ý: `can-dt580`.
3. Chọn **Public** (repo public thì GitHub Actions miễn phí không giới hạn;
   repo private thì được 2.000 phút/tháng, máy macOS tính 10x nên còn
   ~200 phút macOS/tháng — vẫn đủ ~10–20 build).
4. **Không** tick "Add a README file" (vì code đã có sẵn README).
5. Bấm **Create repository**.

### Bước 3 — Đẩy code lên repo

Dương nhận code từ Bảo (thư mục `can-dt580`), mở Terminal/Command Prompt
trên máy mình, chạy từng lệnh sau (thay `TÊN-TÀI-KHOẢN` bằng tên GitHub
của dương):

```bash
cd can-dt580
git init
git add .
git commit -m "Cân DT580 v1.0.0"
git branch -M main
git remote add origin https://github.com/TÊN-TÀI-KHOẢN/can-dt580.git
git push -u origin main
```

Lưu ý: GitHub không cho push bằng mật khẩu nữa, lúc push nó sẽ hỏi
**Personal Access Token (PAT)** thay cho mật khẩu. Dương tự tạo PAT ở
GitHub → Settings → Developer settings → Personal access tokens →
Tokens (classic) → Generate new token (tick ô `repo`), rồi dán token đó
làm mật khẩu khi push. **Không gửi token này cho tui.**

### Bước 4 — Push tag để kích hoạt build

```bash
git tag v1.0.0
git push origin v1.0.0
```

Push tag xong, GitHub Actions tự chạy (vào tab **Actions** trên repo để xem
tiến độ, build mất khoảng 10–20 phút). Muốn build lại mà không cần tag mới
thì vào tab **Actions** → chọn workflow **Build iOS (unsigned .ipa)** →
**Run workflow**.

### Bước 5 — Tải file .ipa

- Nếu push tag: vào tab **Releases** trên repo, tải file
  `CanDT580-unsigned.ipa` trong bản release `v1.0.0`.
- Nếu chạy tay (Run workflow): vào tab **Actions** → mở lần chạy đó →
  mục **Artifacts** → tải `CanDT580-unsigned-...`.

### Bước 6 — Ký lại bằng zSign trên iPhone (dương tự làm)

1. Chuyển file `.ipa` vào iPhone (qua AirDrop, Files, hoặc tải trực tiếp
   từ trình duyệt trên iPhone).
2. Mở app **zSign**, import file `.ipa`, ký lại bằng **chứng chỉ của dương**.
3. Cài app đã ký lên iPhone.

**Tui không đụng vô chứng chỉ của dương** — dương tự ký bằng zSign trên
điện thoại của mình. Đừng gửi file `.p12` hay mật khẩu chứng chỉ cho tui.

### Bước 7 — Bật Developer Mode + Trust lần đầu

1. iPhone iOS 16 trở lên: vào **Settings → Privacy & Security →
   Developer Mode** → bật lên (máy sẽ khởi động lại 1 lần).
2. Mở app Cân DT580 lần đầu, iPhone sẽ báo chưa tin cậy → vào
   **Settings → General → VPN & Device Management** → chọn tên team
   chứng chỉ → bấm **Trust**.

### Bước 8 — Nếu chứng chỉ hết hạn hoặc bị thu hồi

Chứng chỉ enterprise của bên thứ ba có thể bị Apple thu hồi bất cứ lúc nào,
hoặc hết hạn (chứng chỉ hiện tại của dương hết hạn ngày 19/11/2026).
Khi đó app sẽ không mở được (báo "Untrusted Developer" hoặc tự đóng).

Cách khắc phục:

1. Gia hạn / lấy chứng chỉ mới.
2. Ký lại file `.ipa` (giữ file `.ipa` unsigned cẩn thận để ký lại nhanh)
   bằng chứng chỉ mới trong zSign.
3. Cài đè lên app cũ — **đừng xóa app cũ** để giữ dữ liệu trong app.

## Giả định (ghi rõ để người đọc biết)

- Code app Expo nằm trong thư mục `app/` (có `package.json`, `app.json`).
- Tên app: "Cân DT580", bundle ID: `com.bao.candt580`.
- Node 22 LTS trong workflow (khớp Expo SDK 58; Expo yêu cầu Node 18+).
- Tên workspace/scheme của Xcode được tìm tự động trong workflow (không
  hard-code), vì tên project sau khi prebuild có thể khác tên app do ký tự
  tiếng Việt.
- Repo public thì GitHub Actions miễn phí không giới hạn; repo private thì
  giới hạn ~200 phút macOS/tháng (đủ ~10–20 build).
- File `.ipa` build ra là **unsigned** — bắt buộc phải ký lại bằng zSign
  (hoặc AltStore/SideStore) mới cài được lên iPhone thật.
