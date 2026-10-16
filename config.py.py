# config.py - File cấu hình trung tâm của hệ thống thư viện
import os
import hashlib

# 1. CẤU HÌNH BẢO MẬT (Dev Key)
# Mặc định khóa là: "Duong11A2@Secret" (Bạn có thể đổi qua biến môi trường DEV_SECRET_KEY)
RAW_DEV_KEY = os.getenv("DEV_SECRET_KEY", "Duong11A2@Secret")
# Lưu bản băm SHA-256 để so sánh an toàn, chống lộ khóa trong bộ nhớ
DEV_KEY_HASH = hashlib.sha256(RAW_DEV_KEY.encode("utf-8")).hexdigest()

# Giới hạn chống dò khóa (Brute-force): Tối đa 5 lần sai trong 300 giây (5 phút)
MAX_FAILED_AUTH = 5
AUTH_LOCKOUT_SECONDS = 300

# 2. QUY TẮC MƯỢN TRẢ SÁCH
MAX_BOOKS_PER_STUDENT = 3       # Tối đa 3 cuốn / 1 học sinh
LOAN_DURATION_DAYS = 5          # Mỗi lần mượn tối đa 5 ngày
SCAN_COOLDOWN_SECONDS = 10      # Chống quét lặp cùng 1 cuốn sách trong 10 giây

# 3. NGƯỠNG NHẬN DIỆN KHUÔN MẶT & KHOẢNG CÁCH
FACE_MATCH_THRESHOLD = 0.48     # Ngưỡng khoảng cách Euclid tối đa để công nhận đúng người
FACE_MAX_DIST_CEIL = 0.60       # Ngưỡng trần để tính 0% độ tương đồng
FACE_MIN_DIST_FLOOR = 0.20      # Ngưỡng sàn để tính 100% độ tương đồng

# Tỷ lệ chiều rộng khuôn mặt / chiều rộng khung hình camera
FACE_SIZE_MIN_RATIO = 0.08      # Dưới 8% khung hình -> Quá xa (0%)
FACE_SIZE_OPT_RATIO = 0.28      # Từ 28% khung hình trở lên -> Khoảng cách lý tưởng (100%)
MIN_ACCURACY_PERCENT = 10.0     # Nếu độ chính xác <= 10% thì chặn quét, báo "Đến gần hơn"

# Ngưỡng phát hiện người thứ 2 đứng quá gần:
# Nếu diện tích mặt thứ 2 >= 45% diện tích mặt người đứng gần nhất -> Báo KHÔNG HỢP LỆ
SECOND_FACE_MAX_RATIO = 0.45

# 4. CHỐNG MẠO DANH (ANTI-SPOOFING)
CHALLENGE_EXPIRY_SECONDS = 20   # Thử thách ngẫu nhiên hết hạn sau 20 giây
# Các hành động thử thách: OPEN_MOUTH (Mở miệng), BLINK (Nhắm mắt), TURN_LEFT (Quay trái), TURN_RIGHT (Quay phải)
CHALLENGE_ACTIONS = ["OPEN_MOUTH", "BLINK", "TURN_LEFT", "TURN_RIGHT"]

# 5. CẤU HÌNH TẢI ẢNH (UPLOAD)
UPLOAD_DIR = "uploads"
DB_PATH = "library.db"
MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024  # Giới hạn ảnh tối đa 2MB