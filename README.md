# thu-vien-11a2

SCHOOL : LIB - hệ thống thư viện trường học (web tĩnh, chạy trên GitHub Pages).

## Nhận diện khuôn mặt
- Quản lý → tab **QUẢN TRỊ & LOG** → nhập tên/lớp, bật camera, bấm **CHỤP** (nên 3 ảnh) hoặc **TẢI ẢNH** → **LƯU HỌC SINH**.
- Tab **QUÉT** → **BẬT CAMERA**: máy tự khoanh khuôn mặt, xanh = nhận ra học sinh, đỏ = không nhận diện.
- Dùng thư viện `face-api` + mô hình lưu sẵn trong `lib/` và `models/` (không cần mạng ngoài).

## Cấu trúc
```
index.html        giao diện
css/style.css     style
lib/face-api.js   thư viện nhận diện khuôn mặt
models/           mô hình nhận diện
js/state.js       cấu hình + state (localStorage)
js/utils.js       giờ VN, âm báo, QR, toast
js/face.js        tải mô hình, so khớp, vẽ ô khoanh mặt
js/scanner.js     màn hình quét mượn/trả + vòng quét camera
js/inventory.js   kho sách + đánh giá
js/admin.js       gia hạn, quá hạn, log
js/enroll.js      đăng ký khuôn mặt học sinh
js/events.js      xử lý sự kiện
js/background.js  hiệu ứng mưa
js/main.js        khởi động
```
