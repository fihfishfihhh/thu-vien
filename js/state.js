/*************************************************************************
 * PHẦN 1: CẤU HÌNH KEY QUẢN LÝ & STATE TRỐNG (KHÔNG CÓ DỮ LIỆU ẢO)
 *************************************************************************/
const ADMIN_ACCESS_KEY = 'eadlibraryjdh-28678-2027rews';
const BORROW_LIMIT_DAYS = 5;
const STORAGE_KEY = 'SCHOOL_LIB_CLEAN_V2';

const EMPTY_STATE = {
  role: 'student',     // 'student' | 'admin'
  scanGate: 'borrow',  // 'borrow' | 'return'
  viewMode: 'grid',    // 'grid' | 'list'
  soundEnabled: true,
  selectedBookIdForModal: null,
  uploadedFrontImage: null,
  uploadedConditionImage: null,
  students: [],        // Trống hoàn toàn để bạn tự thêm
  books: [],           // Trống hoàn toàn để bạn tự thêm
  borrows: [],
  renewals: [],
  logs: []
};

let state = loadState();

function loadState() {
  try {
    localStorage.removeItem('SCHOOL_LIB_BETA_STATE_V1'); // Xoá dữ liệu mẫu cũ
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      parsed.role = 'student'; // Mặc định luôn khởi động ở chế độ Học Sinh, vào Quản Lý phải nhập key
      return parsed;
    }
  } catch (err) {}
  return JSON.parse(JSON.stringify(EMPTY_STATE));
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {}
}
