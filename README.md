# thu-vien-11a2

SCHOOL : LIB - hệ thống thư viện trường học (web tĩnh, chạy trên GitHub Pages).

## Nhận diện khuôn mặt
- Quản lý → tab **QUẢN TRỊ & LOG** → nhập tên/lớp, bật camera, bấm **CHỤP** (nên 3 ảnh) hoặc **TẢI ẢNH** → **LƯU HỌC SINH**.
- Tab **QUÉT** → **BẬT CAMERA**: máy tự khoanh khuôn mặt, xanh = nhận ra học sinh, đỏ = không nhận diện.
- Dùng thư viện `face-api` + mô hình lưu sẵn trong `lib/` và `models/` (không cần mạng ngoài).

## Quét tự động (không cần bấm xác thực)
- Tab **QUÉT** → **BẬT CAMERA**. Máy thấy **khuôn mặt** đã đăng ký và **mã QR sách** là tự ghi vào log và trừ số lượng sách (thứ tự nào cũng được).
- Chỉ thấy 1 trong 2 thì chờ tối đa 15 giây rồi tự xoá, để người sau không bị dính.
- Đang mượn đúng cuốn đó chưa trả thì báo đỏ, không mượn đôi. Hết sách thì báo đỏ.
- Vẫn có thể **TẢI ẢNH QR**, hoặc nhập mã / tên sách rồi Enter, hoặc bấm **GHI NHẬN THỦ CÔNG**.

## Thêm sách có ảnh mã QR
- Kho sách → **THÊM SÁCH** → **THÊM ẢNH MÃ QR**: máy đọc nội dung QR (VD: tên sách), điền tên nếu còn trống và lưu cùng sách.
- Không tải ảnh QR thì hệ thống tự tạo QR thật từ mã sách. Quét theo: mã sách, nội dung QR đã lưu hoặc tên sách (không phân biệt hoa thường, dấu).

## Nền tuỳ chỉnh
- Nút **NỀN** ở thanh trên: tải ảnh hoặc video (tối đa 150MB), chọn màu có sẵn, chỉnh độ tối, bật/tắt hiệu ứng mưa. Lưu trên từng máy.

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
js/addbook.js      thêm sách + ảnh QR
js/custombg.js    nền tuỳ chỉnh
js/enroll.js      đăng ký khuôn mặt học sinh
js/events.js      xử lý sự kiện
js/background.js  hiệu ứng mưa
js/main.js        khởi động
```
