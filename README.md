# thu-vien-11a2

SCHOOL : LIB - hệ thống thư viện trường học (web tĩnh, chạy trên GitHub Pages).

## Nhận diện khuôn mặt
- Quản lý → tab **QUẢN TRỊ & LOG** → nhập tên/lớp, bật camera, bấm **CHỤP** (nên 3 ảnh) hoặc **TẢI ẢNH** → **LƯU HỌC SINH**.
- Tab **QUÉT** → **BẬT CAMERA**: máy tự khoanh khuôn mặt, xanh = nhận ra học sinh, đỏ = không nhận diện.
- Dùng thư viện `face-api` + mô hình lưu sẵn trong `lib/` và `models/` (không cần mạng ngoài).

## Quét QR sách
- Tab **QUÉT** → **BẬT CAMERA**, đưa mã QR của sách trước camera: máy khoanh ô xanh dương và tự điền sách.
- Hoặc bấm **TẢI ẢNH QR**, hoặc nhập mã / tên sách vào ô rồi bấm **Enter**.
- Mã QR chứa **mã sách** (VD `LIB-QR-001`) hoặc **tên sách** đều được (tên so khớp không phân biệt hoa thường, dấu).
- Đã nhận diện mặt + quét QR thì tự xác thực (có thể tắt bằng ô tích bên dưới). QR in từ trang chi tiết sách là QR thật.

## Cấu trúc
```
index.html        giao diện
css/style.css     style
lib/face-api.js   thư viện nhận diện khuôn mặt
lib/jsQR.js       đọc mã QR
lib/qrcode.js     tạo mã QR
models/           mô hình nhận diện
js/state.js       cấu hình + state (localStorage)
js/utils.js       giờ VN, âm báo, QR, toast
js/face.js        tải mô hình, so khớp, vẽ ô khoanh mặt
js/qr.js          quét QR sách, tìm sách theo mã/tên
js/scanner.js     màn hình quét mượn/trả + vòng quét camera
js/inventory.js   kho sách + đánh giá
js/admin.js       gia hạn, quá hạn, log
js/enroll.js      đăng ký khuôn mặt học sinh
js/events.js      xử lý sự kiện
js/background.js  hiệu ứng mưa
js/main.js        khởi động
```
