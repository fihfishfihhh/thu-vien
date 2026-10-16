# app.py - Máy chủ Backend chính của Hệ thống Thư viện Trường học
import os
import io
import csv
import json
import math
import time
import uuid
import shutil
import sqlite3
import secrets
import hashlib
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import FastAPI, Header, HTTPException, UploadFile, File, Form, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

import config

# Khởi tạo thư mục lưu ảnh và ứng dụng FastAPI
os.makedirs(config.UPLOAD_DIR, exist_ok=True)
os.makedirs("static", exist_ok=True)

app = FastAPI(title="Hệ Thống Thư Viện Trường Học - Vi Hoàng Dương 11A2")

# Múi giờ Việt Nam (UTC+7)
VN_TZ = timezone(timedelta(hours=7))

def get_vn_now() -> datetime:
    """Lấy thời gian hiện tại chuẩn múi giờ Việt Nam."""
    return datetime.now(VN_TZ)

def format_vn_time(dt: datetime) -> str:
    """Định dạng thời gian dễ đọc: YYYY-MM-DD HH:MM:SS"""
    return dt.strftime("%Y-%m-%d %H:%M:%S")

def remove_accents(input_str: str) -> str:
    """Bỏ dấu tiếng Việt và chuyển chữ thường để tìm kiếm chính xác khi gõ sai dấu."""
    if not input_str:
        return ""
    s = input_str.replace("đ", "d").replace("Đ", "D")
    nfkd_form = unicodedata.normalize('NFKD', s)
    only_ascii = "".join([c for c in nfkd_form if not unicodedata.combining(c)])
    return " ".join(only_ascii.lower().split())

# =====================================================================
# QUẢN LÝ BỘ NHỚ TẠM: CHỐNG DÒ KHÓA, NONCE THỬ THÁCH & CHỐNG QUÉT LẶP
# =====================================================================
failed_auth_attempts = {}  # {ip: {"count": int, "lock_until": float}}
active_challenges = {}     # {nonce: {"action": str, "expires_at": float}}
recent_scans = {}          # {copy_code: float_timestamp}

def verify_dev_permission(request: Request, x_dev_key: Optional[str] = Header(None)):
    """
    Hàm kiểm tra quyền Dev/Thủ thư bắt buộc ở phía Máy chủ.
    Sử dụng so sánh thời gian hằng số (constant-time) và khóa IP nếu dò mật khẩu.
    """
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()

    # 1. Kiểm tra xem IP này có đang bị khóa do nhập sai nhiều lần không
    ip_record = failed_auth_attempts.get(client_ip, {"count": 0, "lock_until": 0})
    if now < ip_record["lock_until"]:
        wait_sec = int(ip_record["lock_until"] - now)
        raise HTTPException(
            status_code=429,
            detail=f"Tạm khóa do nhập sai khóa quá nhiều lần. Thử lại sau {wait_sec} giây."
        )

    # 2. Kiểm tra khóa gửi lên
    if not x_dev_key:
        raise HTTPException(status_code=401, detail="Yêu cầu quyền Dev/Thủ thư (Thiếu khóa).")

    incoming_hash = hashlib.sha256(x_dev_key.encode("utf-8")).hexdigest()
    if not secrets.compare_digest(incoming_hash, config.DEV_KEY_HASH):
        ip_record["count"] += 1
        if ip_record["count"] >= config.MAX_FAILED_AUTH:
            ip_record["lock_until"] = now + config.AUTH_LOCKOUT_SECONDS
            ip_record["count"] = 0
        failed_auth_attempts[client_ip] = ip_record
        raise HTTPException(status_code=403, detail="Khóa Dev/Thủ thư không chính xác.")

    # Xóa bộ đếm lỗi nếu đăng nhập đúng
    if client_ip in failed_auth_attempts:
        del failed_auth_attempts[client_ip]
    return True

# =====================================================================
# CƠ SỞ DỮ LIỆU SQLITE (BẬT WAL MODE CHỐNG HỎNG DỮ LIỆU KHI MẤT ĐIỆN)
# =====================================================================
def get_db():
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def init_db():
    """Khởi tạo các bảng và thêm dữ liệu mẫu của Vi Hoàng Dương 11A2."""
    conn = get_db()
    cur = conn.cursor()

    cur.executescript("""
    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL UNIQUE,
        name_normalized TEXT NOT NULL,
        photo_path TEXT,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS face_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        embedding_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS book_titles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL UNIQUE,
        title_normalized TEXT NOT NULL,
        cover_path TEXT,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS book_copies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_title_id INTEGER NOT NULL,
        copy_code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'AVAILABLE',
        created_at TEXT NOT NULL,
        FOREIGN KEY (book_title_id) REFERENCES book_titles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        copy_id INTEGER NOT NULL,
        borrowed_at TEXT NOT NULL,
        due_at TEXT NOT NULL,
        returned_at TEXT,
        returned_by_librarian INTEGER DEFAULT 0,
        FOREIGN KEY (student_id) REFERENCES students(id),
        FOREIGN KEY (copy_id) REFERENCES book_copies(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_type TEXT NOT NULL,
        student_name TEXT,
        book_info TEXT,
        status_result TEXT NOT NULL,
        reason TEXT NOT NULL,
        timestamp_vn TEXT NOT NULL
    );
    """)

    # Tạo sẵn học sinh mặc định: Vi Hoàng Dương 11A2 và 2 đầu sách mẫu nếu DB trống
    now_str = format_vn_time(get_vn_now())
    cur.execute("SELECT COUNT(*) as cnt FROM students")
    if cur.fetchone()["cnt"] == 0:
        default_student = "Vi Hoàng Dương 11A2"
        cur.execute(
            "INSERT INTO students (full_name, name_normalized, created_at) VALUES (?, ?, ?)",
            (default_student, remove_accents(default_student), now_str)
        )

    cur.execute("SELECT COUNT(*) as cnt FROM book_titles")
    if cur.fetchone()["cnt"] == 0:
        sample_books = [
            ("Lập Trình Python Cơ Bản", ["PY-001", "PY-002"]),
            ("Cấu Trúc Dữ Liệu Và Giải Thuật C++", ["CPP-001", "CPP-002"])
        ]
        for title, codes in sample_books:
            cur.execute(
                "INSERT INTO book_titles (title, title_normalized, created_at) VALUES (?, ?, ?)",
                (title, remove_accents(title), now_str)
            )
            title_id = cur.lastrowid
            for code in codes:
                cur.execute(
                    "INSERT INTO book_copies (book_title_id, copy_code, status, created_at) VALUES (?, ?, 'AVAILABLE', ?)",
                    (title_id, code, now_str)
                )

    conn.commit()
    conn.close()

init_db()

# =====================================================================
# HÀM TIỆN ÍCH AN NINH TẢI FILE & TOÁN HỌC KHUÔN MẶT
# =====================================================================
def save_safe_image(upload_file: Optional[UploadFile]) -> Optional[str]:
    """
    Kiểm tra loại file bằng Magic Bytes (chữ ký nhị phân đầu file),
    giới hạn dung lượng 2MB và đặt tên file ngẫu nhiên an toàn (UUID).
    """
    if not upload_file or not upload_file.filename:
        return None

    content = upload_file.file.read(config.MAX_UPLOAD_SIZE_BYTES + 1)
    if len(content) > config.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Dung lượng ảnh vượt quá giới hạn 2MB.")

    # Kiểm tra Magic Bytes thực tế của JPEG, PNG, WEBP
    ext = None
    if content.startswith(b"\xff\xd8\xff"):
        ext = ".jpg"
    elif content.startswith(b"\x89PNG\r\n\x1a\n"):
        ext = ".png"
    elif content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        ext = ".webp"
    else:
        raise HTTPException(status_code=400, detail="Định dạng file không hợp lệ. Chỉ nhận ảnh JPG, PNG, WEBP thật.")

    safe_filename = f"{uuid.uuid4().hex}{ext}"
    full_path = os.path.join(config.UPLOAD_DIR, safe_filename)
    with open(full_path, "wb") as f:
        f.write(content)
    return f"/uploads/{safe_filename}"

def euclidean_distance(vec1: List[float], vec2: List[float]) -> float:
    """Tính khoảng cách Euclid giữa 2 vector 128 chiều."""
    if len(vec1) != 128 or len(vec2) != 128:
        return 999.0
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(vec1, vec2)))

def compute_accuracy_percentage(distance: float, face_ratio: float) -> float:
    """
    Công thức tính % Độ chính xác kết hợp khoảng cách đặc trưng (d) và kích thước mặt (r).
    """
    # 1. Điểm tương đồng đặc trưng S_sim
    s_sim = (config.FACE_MAX_DIST_CEIL - distance) / (config.FACE_MAX_DIST_CEIL - config.FACE_MIN_DIST_FLOOR)
    s_sim = max(0.0, min(1.0, s_sim))

    # 2. Hệ số khoảng cách đứng S_dist
    s_dist = (face_ratio - config.FACE_SIZE_MIN_RATIO) / (config.FACE_SIZE_OPT_RATIO - config.FACE_SIZE_MIN_RATIO)
    s_dist = max(0.0, min(1.0, s_dist))

    return round(s_sim * s_dist * 100.0, 1)

def log_audit(conn, action_type: str, student_name: str, book_info: str, status_result: str, reason: str):
    """Ghi nhật ký hoạt động chuẩn giờ Việt Nam."""
    now_str = format_vn_time(get_vn_now())
    conn.execute(
        """INSERT INTO audit_logs (action_type, student_name, book_info, status_result, reason, timestamp_vn)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (action_type, student_name, book_info, status_result, reason, now_str)
    )

# =====================================================================
# API CÔNG KHAI CHO HỌC SINH (KHÔNG CẦN ĐĂNG NHẬP - CHỈ ĐỌC)
# =====================================================================
@app.get("/api/public/search-student")
def search_student(q: str = ""):
    """Học sinh nhập tên để tra cứu sách đang mượn, quá hạn, và lịch sử."""
    norm_q = remove_accents(q)
    if not norm_q:
        return {"students": []}

    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, full_name, photo_path FROM students WHERE name_normalized LIKE ? LIMIT 10",
        (f"%{norm_q}%",)
    )
    students = cur.fetchall()
    now_str = format_vn_time(get_vn_now())

    result = []
    for st in students:
        cur.execute("""
            SELECT l.id, bt.title, bc.copy_code, l.borrowed_at, l.due_at, l.returned_at, l.returned_by_librarian
            FROM loans l
            JOIN book_copies bc ON l.copy_id = bc.id
            JOIN book_titles bt ON bc.book_title_id = bt.id
            WHERE l.student_id = ?
            ORDER BY l.id DESC LIMIT 20
        """, (st["id"],))
        loans = [dict(row) for row in cur.fetchall()]

        active_loans = [x for x in loans if x["returned_at"] is None]
        overdue_loans = [x for x in active_loans if x["due_at"] < now_str]

        result.append({
            "full_name": st["full_name"],
            "photo_path": st["photo_path"],
            "active_count": len(active_loans),
            "max_allowed": config.MAX_BOOKS_PER_STUDENT,
            "reached_max": len(active_loans) >= config.MAX_BOOKS_PER_STUDENT,
            "has_overdue": len(overdue_loans) > 0,
            "loans": loans
        })
    conn.close()
    return {"students": result}

@app.get("/api/public/search-books")
def search_books(q: str = ""):
    """Tra cứu tên sách và số lượng cuốn còn lại trong kho."""
    norm_q = remove_accents(q)
    conn = get_db()
    cur = conn.cursor()

    if norm_q:
        cur.execute(
            "SELECT id, title, cover_path FROM book_titles WHERE title_normalized LIKE ? ORDER BY title",
            (f"%{norm_q}%",)
        )
    else:
        cur.execute("SELECT id, title, cover_path FROM book_titles ORDER BY title")

    titles = cur.fetchall()
    output = []
    for t in titles:
        cur.execute("SELECT copy_code, status FROM book_copies WHERE book_title_id = ?", (t["id"],))
        copies = [dict(c) for c in cur.fetchall()]
        avail = sum(1 for c in copies if c["status"] == "AVAILABLE")
        output.append({
            "id": t["id"],
            "title": t["title"],
            "cover_path": t["cover_path"],
            "total_copies": len(copies),
            "available_copies": avail,
            "copies": copies
        })
    conn.close()
    return {"books": output}

# =====================================================================
# API QUẢN TRỊ & CHẾ ĐỘ QUÉT (BẮT BUỘC KIỂM TRA KHÓA DEV Ở MÁY CHỦ)
# =====================================================================
@app.post("/api/dev/verify-key")
def verify_key_endpoint(request: Request, x_dev_key: Optional[str] = Header(None)):
    verify_dev_permission(request, x_dev_key)
    return {"valid": True, "config": {
        "max_books": config.MAX_BOOKS_PER_STUDENT,
        "loan_days": config.LOAN_DURATION_DAYS,
        "min_accuracy": config.MIN_ACCURACY_PERCENT,
        "second_face_ratio": config.SECOND_FACE_MAX_RATIO
    }}

@app.get("/api/dev/face-db")
def get_face_database(request: Request, x_dev_key: Optional[str] = Header(None)):
    """Lấy danh sách học sinh và vector khuôn mặt để hiển thị hộp nhận diện trên camera."""
    verify_dev_permission(request, x_dev_key)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, full_name, photo_path FROM students ORDER BY full_name")
    students = cur.fetchall()
    data = []
    for s in students:
        cur.execute("SELECT embedding_json FROM face_embeddings WHERE student_id = ?", (s["id"],))
        embs = [json.loads(r["embedding_json"]) for r in cur.fetchall()]
        data.append({
            "id": s["id"],
            "full_name": s["full_name"],
            "photo_path": s["photo_path"],
            "embeddings": embs
        })
    conn.close()
    return {"students": data, "thresholds": {
        "match_threshold": config.FACE_MATCH_THRESHOLD,
        "max_dist": config.FACE_MAX_DIST_CEIL,
        "min_dist": config.FACE_MIN_DIST_FLOOR,
        "size_min": config.FACE_SIZE_MIN_RATIO,
        "size_opt": config.FACE_SIZE_OPT_RATIO,
        "min_acc": config.MIN_ACCURACY_PERCENT,
        "second_face_ratio": config.SECOND_FACE_MAX_RATIO
    }}

@app.post("/api/dev/challenge")
def create_liveness_challenge(request: Request, x_dev_key: Optional[str] = Header(None)):
    """
    Sinh một mã dùng một lần (Nonce) và một hành động ngẫu nhiên an toàn mật mã
    để chống mạo danh bằng ảnh tĩnh hoặc phát lại gói tin (Replay Attack).
    """
    verify_dev_permission(request, x_dev_key)
    now = time.time()
    # Dọn dẹp các Nonce đã hết hạn
    expired = [k for k, v in active_challenges.items() if v["expires_at"] < now]
    for k in expired:
        del active_challenges[k]

    nonce = secrets.token_urlsafe(16)
    action = secrets.choice(config.CHALLENGE_ACTIONS)
    active_challenges[nonce] = {
        "action": action,
        "expires_at": now + config.CHALLENGE_EXPIRY_SECONDS
    }

    action_labels = {
        "OPEN_MOUTH": "HÁ MIỆNG RỘNG",
        "BLINK": "NHẮM MẮT LẠI",
        "TURN_LEFT": "QUAY MẶT SANG TRÁI",
        "TURN_RIGHT": "QUAY MẶT SANG PHẢI"
    }
    return {
        "nonce": nonce,
        "action": action,
        "label": action_labels[action],
        "expires_in": config.CHALLENGE_EXPIRY_SECONDS
    }

class ScanPayload(BaseModel):
    embedding: List[float]
    face_ratio: float
    second_face_ratio: float
    copy_code: str
    nonce: str
    challenge_metric: float       # Giá trị đo điểm mốc (MAR, EAR, hoặc Yaw) lúc vượt thử thách
    micro_movement_score: float   # Độ biến thiên vi chuyển động giữa các khung hình

@app.post("/api/dev/scan")
def process_scan_transaction(
    payload: ScanPayload,
    request: Request,
    x_dev_key: Optional[str] = Header(None)
):
    """
    Xử lý trung tâm cho thao tác Quét Mượn/Trả sách.
    Trả về đúng 2 trạng thái: "HỢP LỆ" hoặc "KHÔNG HỢP LỆ" kèm 1 dòng lý do.
    """
    verify_dev_permission(request, x_dev_key)
    conn = get_db()
    cur = conn.cursor()
    now_ts = time.time()
    now_dt = get_vn_now()
    now_str = format_vn_time(now_dt)
    copy_code = payload.copy_code.strip().upper()

    # 1. Kiểm tra Nonce chống phát lại và chống giả mạo
    ch = active_challenges.pop(payload.nonce, None)
    if not ch or now_ts > ch["expires_at"]:
        log_audit(conn, "SCAN", "Không rõ", copy_code, "KHÔNG HỢP LỆ", "Phiên kiểm tra chống giả mạo đã hết hạn")
        conn.commit()
        conn.close()
        return {"status": "KHÔNG HỢP LỆ", "reason": "Phiên chống mạo danh hết hạn, vui lòng thử lại."}

    # Kiểm tra kết quả thử thách điểm mốc khuôn mặt trên máy chủ
    req_action = ch["action"]
    passed_challenge = False
    if req_action == "OPEN_MOUTH" and payload.challenge_metric > 0.42:
        passed_challenge = True
    elif req_action == "BLINK" and payload.challenge_metric < 0.21:
        passed_challenge = True
    elif req_action == "TURN_LEFT" and payload.challenge_metric < -0.22:
        passed_challenge = True
    elif req_action == "TURN_RIGHT" and payload.challenge_metric > 0.22:
        passed_challenge = True

    if not passed_challenge or payload.micro_movement_score < 0.002:
        log_audit(conn, "SCAN", "Nghi vấn mạo danh", copy_code, "KHÔNG HỢP LỆ", f"Không vượt qua thử thách {req_action}")
        conn.commit()
        conn.close()
        return {"status": "KHÔNG HỢP LỆ", "reason": "Chưa xác thực được người thật (Nghi vấn ảnh tĩnh/video)."}

    # 2. Kiểm tra có người thứ 2 đứng quá gần không
    if payload.second_face_ratio >= config.SECOND_FACE_MAX_RATIO:
        log_audit(conn, "SCAN", "Nhiều khuôn mặt", copy_code, "KHÔNG HỢP LỆ", "Có người thứ hai đứng quá gần")
        conn.commit()
        conn.close()
        return {"status": "KHÔNG HỢP LỆ", "reason": "Có người thứ hai đứng quá gần camera."}

    # 3. Đối sánh vector khuôn mặt với CSDL trên máy chủ
    cur.execute("""
        SELECT s.id, s.full_name, fe.embedding_json
        FROM face_embeddings fe
        JOIN students s ON fe.student_id = s.id
    """)
    rows = cur.fetchall()
    if not rows:
        conn.close()
        return {"status": "KHÔNG HỢP LỆ", "reason": "Chưa có dữ liệu khuôn mặt nào trong hệ thống."}

    best_student = None
    min_dist = 999.0
    for r in rows:
        emb = json.loads(r["embedding_json"])
        d = euclidean_distance(payload.embedding, emb)
        if d < min_dist:
            min_dist = d
            best_student = {"id": r["id"], "full_name": r["full_name"]}

    acc_percent = compute_accuracy_percentage(min_dist, payload.face_ratio)

    if acc_percent <= config.MIN_ACCURACY_PERCENT:
        conn.close()
        return {"status": "KHÔNG HỢP LỆ", "reason": f"Độ chính xác quá thấp ({acc_percent}%). Vui lòng đến gần hơn."}

    if min_dist > config.FACE_MATCH_THRESHOLD or not best_student:
        log_audit(conn, "SCAN", "Người lạ", copy_code, "KHÔNG HỢP LỆ", "Không nhận diện được học sinh")
        conn.commit()
        conn.close()
        return {"status": "KHÔNG HỢP LỆ", "reason": "Khuôn mặt chưa được đăng ký trong thư viện."}

    student_id = best_student["id"]
    student_name = best_student["full_name"]

    # 4. Kiểm tra chống quét lặp 1 cuốn sách 2 lần liên tiếp
    last_scan_time = recent_scans.get(copy_code, 0)
    if now_ts - last_scan_time < config.SCAN_COOLDOWN_SECONDS:
        conn.close()
        return {"status": "KHÔNG HỢP LỆ", "reason": f"Mã sách {copy_code} vừa được quét, vui lòng đợi vài giây."}

    # 5. Tìm thông tin cuốn sách
    cur.execute("""
        SELECT bc.id, bc.copy_code, bc.status, bt.title, bt.cover_path
        FROM book_copies bc
        JOIN book_titles bt ON bc.book_title_id = bt.id
        WHERE bc.copy_code = ?
    """, (copy_code,))
    book_copy = cur.fetchone()

    if not book_copy:
        log_audit(conn, "SCAN", student_name, copy_code, "KHÔNG HỢP LỆ", "Mã sách không tồn tại")
        conn.commit()
        conn.close()
        return {"status": "KHÔNG HỢP LỆ", "reason": f"Mã sách '{copy_code}' không tồn tại trong kho."}

    book_label = f"{book_copy['title']} ({copy_code})"

    # =================================================================
    # TRƯỜNG HỢP A: SÁCH ĐANG CÓ SẴN -> XỬ LÝ MƯỢN SÁCH
    # =================================================================
    if book_copy["status"] == "AVAILABLE":
        # Kiểm tra các cuốn học sinh này đang mượn chưa trả
        cur.execute(
            "SELECT id, due_at FROM loans WHERE student_id = ? AND returned_at IS NULL",
            (student_id,)
        )
        active_loans = cur.fetchall()

        # Kiểm tra có sách quá hạn không
        has_overdue = any(row["due_at"] < now_str for row in active_loans)
        if has_overdue:
            log_audit(conn, "MƯỢN", student_name, book_label, "KHÔNG HỢP LỆ", "Còn sách quá hạn chưa trả")
            conn.commit()
            conn.close()
            return {"status": "KHÔNG HỢP LỆ", "reason": f"{student_name} đang có sách quá hạn chưa trả."}

        # Kiểm tra số lượng tối đa (3 cuốn)
        if len(active_loans) >= config.MAX_BOOKS_PER_STUDENT:
            log_audit(conn, "MƯỢN", student_name, book_label, "KHÔNG HỢP LỆ", "Đã đạt tối đa số cuốn được mượn")
            conn.commit()
            conn.close()
            return {
                "status": "KHÔNG HỢP LỆ",
                "reason": f"{student_name} đã mượn đủ tối đa {config.MAX_BOOKS_PER_STUDENT} cuốn."
            }

        # Cho phép mượn (Hạn 5 ngày)
        due_dt = now_dt + timedelta(days=config.LOAN_DURATION_DAYS)
        due_str = format_vn_time(due_dt)

        cur.execute(
            "INSERT INTO loans (student_id, copy_id, borrowed_at, due_at) VALUES (?, ?, ?, ?)",
            (student_id, book_copy["id"], now_str, due_str)
        )
        cur.execute("UPDATE book_copies SET status = 'BORROWED' WHERE id = ?", (book_copy["id"],))

        recent_scans[copy_code] = now_ts
        reason_msg = f"MƯỢN THÀNH CÔNG: {student_name} - {book_label} (Hạn trả: {due_str[:10]})"
        log_audit(conn, "MƯỢN", student_name, book_label, "HỢP LỆ", reason_msg)
        conn.commit()
        conn.close()
        return {"status": "HỢP LỆ", "reason": reason_msg, "cover_path": book_copy["cover_path"]}

    # =================================================================
    # TRƯỜNG HỢP B: SÁCH ĐANG ĐƯỢC MƯỢN -> XỬ LÝ TRẢ SÁCH
    # =================================================================
    else:
        cur.execute("""
            SELECT l.id, l.student_id, s.full_name as borrower_name
            FROM loans l
            JOIN students s ON l.student_id = s.id
            WHERE l.copy_id = ? AND l.returned_at IS NULL
            ORDER BY l.id DESC LIMIT 1
        """, (book_copy["id"],))
        active_loan = cur.fetchone()

        if not active_loan:
            # Phòng hờ lệch trạng thái
            cur.execute("UPDATE book_copies SET status = 'AVAILABLE' WHERE id = ?", (book_copy["id"],))
            conn.commit()
            conn.close()
            return {"status": "KHÔNG HỢP LỆ", "reason": "Lỗi đồng bộ trạng thái sách, đã tự khôi phục."}

        # Sách phải do chính người mượn trả
        if active_loan["student_id"] != student_id:
            borrower = active_loan["borrower_name"]
            log_audit(
                conn, "TRẢ", student_name, book_label, "KHÔNG HỢP LỆ",
                f"Trả sai người (Người mượn là {borrower})"
            )
            conn.commit()
            conn.close()
            return {
                "status": "KHÔNG HỢP LỆ",
                "reason": f"Sách này do {borrower} mượn. Phải chính chủ trả hoặc Thủ thư xác nhận."
            }

        # Đúng người mượn -> Ghi nhận trả sách
        cur.execute("UPDATE loans SET returned_at = ? WHERE id = ?", (now_str, active_loan["id"]))
        cur.execute("UPDATE book_copies SET status = 'AVAILABLE' WHERE id = ?", (book_copy["id"],))

        recent_scans[copy_code] = now_ts
        reason_msg = f"TRẢ THÀNH CÔNG: {student_name} đã trả {book_label}"
        log_audit(conn, "TRẢ", student_name, book_label, "HỢP LỆ", reason_msg)
        conn.commit()
        conn.close()
        return {"status": "HỢP LỆ", "reason": reason_msg, "cover_path": book_copy["cover_path"]}

# =====================================================================
# CÁC API QUẢN LÝ HỌC SINH, SÁCH, TRẢ HỘ, LOG & SAO LƯU CHO DEV/THỦ THƯ
# =====================================================================
@app.post("/api/dev/students")
def register_student_face(
    request: Request,
    full_name: str = Form(...),
    embeddings_json: str = Form(...),
    photo: Optional[UploadFile] = File(None),
    x_dev_key: Optional[str] = Header(None)
):
    """Đăng ký học sinh mới hoặc bổ sung thêm nhiều góc khuôn mặt cho học sinh đã có."""
    verify_dev_permission(request, x_dev_key)
    clean_name = " ".join(full_name.strip().split())
    if not clean_name:
        raise HTTPException(status_code=400, detail="Họ tên không được để trống.")

    try:
        emb_list = json.loads(embeddings_json)
        if not isinstance(emb_list, list) or len(emb_list) == 0:
            raise ValueError()
    except Exception:
        raise HTTPException(status_code=400, detail="Dữ liệu vector khuôn mặt không hợp lệ.")

    photo_path = save_safe_image(photo)
    now_str = format_vn_time(get_vn_now())

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, photo_path FROM students WHERE full_name = ?", (clean_name,))
    st = cur.fetchone()

    if st:
        student_id = st["id"]
        if photo_path:
            cur.execute("UPDATE students SET photo_path = ? WHERE id = ?", (photo_path, student_id))
    else:
        cur.execute(
            "INSERT INTO students (full_name, name_normalized, photo_path, created_at) VALUES (?, ?, ?, ?)",
            (clean_name, remove_accents(clean_name), photo_path, now_str)
        )
        student_id = cur.lastrowid

    added_count = 0
    for vec in emb_list:
        if isinstance(vec, list) and len(vec) == 128:
            cur.execute(
                "INSERT INTO face_embeddings (student_id, embedding_json, created_at) VALUES (?, ?, ?)",
                (student_id, json.dumps(vec), now_str)
            )
            added_count += 1

    log_audit(conn, "ĐĂNG KÝ MẶT", clean_name, f"Thêm {added_count} mẫu mặt", "HỢP LỆ", "Dev cập nhật khuôn mặt")
    conn.commit()
    conn.close()
    return {"message": f"Đã lưu {added_count} mẫu khuôn mặt cho '{clean_name}'."}

@app.post("/api/dev/books")
def add_book_and_copies(
    request: Request,
    title: str = Form(...),
    copy_codes: str = Form(...),
    cover: Optional[UploadFile] = File(None),
    x_dev_key: Optional[str] = Header(None)
):
    """Thêm đầu sách, gắn ảnh bìa và tạo mã riêng cho từng cuốn sách."""
    verify_dev_permission(request, x_dev_key)
    clean_title = " ".join(title.strip().split())
    codes = [c.strip().upper() for c in copy_codes.split(",") if c.strip()]
    if not clean_title or not codes:
        raise HTTPException(status_code=400, detail="Cần nhập tên sách và ít nhất 1 mã cuốn sách.")

    cover_path = save_safe_image(cover)
    now_str = format_vn_time(get_vn_now())

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM book_titles WHERE title = ?", (clean_title,))
    bt = cur.fetchone()

    if bt:
        title_id = bt["id"]
        if cover_path:
            cur.execute("UPDATE book_titles SET cover_path = ? WHERE id = ?", (cover_path, title_id))
    else:
        cur.execute(
            "INSERT INTO book_titles (title, title_normalized, cover_path, created_at) VALUES (?, ?, ?, ?)",
            (clean_title, remove_accents(clean_title), cover_path, now_str)
        )
        title_id = cur.lastrowid

    added_codes = []
    for code in codes:
        try:
            cur.execute(
                "INSERT INTO book_copies (book_title_id, copy_code, status, created_at) VALUES (?, ?, 'AVAILABLE', ?)",
                (title_id, code, now_str)
            )
            added_codes.append(code)
        except sqlite3.IntegrityError:
            pass  # Bỏ qua nếu mã cuốn đã tồn tại

    log_audit(conn, "THÊM SÁCH", "Thủ thư", clean_title, "HỢP LỆ", f"Tạo {len(added_codes)} mã cuốn: {', '.join(added_codes)}")
    conn.commit()
    conn.close()
    return {"message": f"Đã thêm sách '{clean_title}' với {len(added_codes)} mã cuốn mới."}

class LibrarianReturnPayload(BaseModel):
    copy_code: str
    note: Optional[str] = "Thủ thư xác nhận trả hộ"

@app.post("/api/dev/librarian-return")
def librarian_return_override(
    payload: LibrarianReturnPayload,
    request: Request,
    x_dev_key: Optional[str] = Header(None)
):
    """Thủ thư xác nhận trả sách hộ khi học sinh nhờ người khác trả hoặc vắng mặt."""
    verify_dev_permission(request, x_dev_key)
    code = payload.copy_code.strip().upper()
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        SELECT l.id, s.full_name, bt.title, bc.id as copy_id
        FROM loans l
        JOIN book_copies bc ON l.copy_id = bc.id
        JOIN book_titles bt ON bc.book_title_id = bt.id
        JOIN students s ON l.student_id = s.id
        WHERE bc.copy_code = ? AND l.returned_at IS NULL
    """, (code,))
    active = cur.fetchone()

    if not active:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Mã sách '{code}' hiện không ở trạng thái đang mượn.")

    now_str = format_vn_time(get_vn_now())
    cur.execute(
        "UPDATE loans SET returned_at = ?, returned_by_librarian = 1 WHERE id = ?",
        (now_str, active["id"])
    )
    cur.execute("UPDATE book_copies SET status = 'AVAILABLE' WHERE id = ?", (active["copy_id"],))

    book_label = f"{active['title']} ({code})"
    log_audit(conn, "TRẢ HỘ", active["full_name"], book_label, "HỢP LỆ", f"Thủ thư xác nhận: {payload.note}")
    conn.commit()
    conn.close()
    return {"message": f"Đã xác nhận trả hộ sách {book_label} cho học sinh {active['full_name']}."}

@app.get("/api/dev/logs")
def view_or_export_logs(
    request: Request,
    export_csv: bool = False,
    key: Optional[str] = None,
    x_dev_key: Optional[str] = Header(None)
):
    """Xem nhật ký hoặc xuất ra file CSV chuẩn UTF-8 (hỗ trợ mở bằng Excel trên điện thoại)."""
    effective_key = x_dev_key or key
    verify_dev_permission(request, effective_key)

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    if export_csv:
        output = io.StringIO()
        output.write('\ufeff')  # BOM để Excel nhận diện đúng tiếng Việt UTF-8
        writer = csv.writer(output)
        writer.writerow(["ID", "Loại", "Họ Tên Học Sinh", "Sách", "Trạng Thái", "Lý Do Chi Tiết", "Thời Gian (VN)"])
        for r in rows:
            writer.writerow([
                r["id"], r["action_type"], r["student_name"],
                r["book_info"], r["status_result"], r["reason"], r["timestamp_vn"]
            ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=nhat_ky_thu_vien.csv"}
        )
    return {"logs": rows}

@app.get("/api/dev/backup")
def backup_database(request: Request, key: Optional[str] = None, x_dev_key: Optional[str] = Header(None)):
    """Tải toàn bộ file cơ sở dữ liệu SQLite về máy để sao lưu an toàn."""
    verify_dev_permission(request, x_dev_key or key)
    backup_filename = f"backup_library_{get_vn_now().strftime('%Y%m%d_%H%M%S')}.db"
    return FileResponse(config.DB_PATH, filename=backup_filename, media_type="application/octet-stream")

@app.post("/api/dev/restore")
def restore_database(
    request: Request,
    db_file: UploadFile = File(...),
    x_dev_key: Optional[str] = Header(None)
):
    """Phục hồi cơ sở dữ liệu từ file .db đã sao lưu."""
    verify_dev_permission(request, x_dev_key)
    header_bytes = db_file.file.read(16)
    if not header_bytes.startswith(b"SQLite format 3\x00"):
        raise HTTPException(status_code=400, detail="File tải lên không phải là cơ sở dữ liệu SQLite hợp lệ.")

    db_file.file.seek(0)
    temp_path = "restore_temp.db"
    with open(temp_path, "wb") as f:
        shutil.copyfileobj(db_file.file, f)
    shutil.move(temp_path, config.DB_PATH)
    return {"message": "Đã phục hồi cơ sở dữ liệu thành công!"}

# Phục vụ thư mục ảnh tải lên và giao diện tĩnh
app.mount("/uploads", StaticFiles(directory=config.UPLOAD_DIR), name="uploads")
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def serve_home():
    return FileResponse("static/index.html")