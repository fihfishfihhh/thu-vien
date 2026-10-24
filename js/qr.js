/*************************************************************************
 * QUÉT MÃ QR SÁCH (camera hoặc ảnh) - dùng jsQR
 * Mã QR có thể chứa MÃ SÁCH (VD: LIB-QR-001) hoặc TÊN SÁCH (VD: Sách toán)
 *************************************************************************/
const QR_COOLDOWN_MS = 8000;     // không xử lý lại cùng 1 mã trong 8 giây (tránh mượn đôi khi sách còn trước camera)
const QR_COLOR = '#60a5fa';

let lastQr = { text: '', at: 0, box: null };

// Bỏ dấu, hạ chữ thường, gộp khoảng trắng để so khớp tên sách
function normalizeText(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// Tìm sách theo mã trước, không có thì theo tên
function findBookByText(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const byCode = state.books.find(b => b.code.toLowerCase() === lower);
  if (byCode) return byCode;
  const norm = normalizeText(raw);
  return state.books.find(b => normalizeText(b.title) === norm) || null;
}

// Đọc QR từ 1 nguồn (video/ảnh), thu nhỏ để quét nhanh
function decodeQrFrom(source, width, height, maxSide = 720) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = decodeQrFrom.canvas || (decodeQrFrom.canvas = document.createElement('canvas'));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
  if (!code || !code.data) return null;

  const loc = code.location;
  const xs = [loc.topLeftCorner.x, loc.topRightCorner.x, loc.bottomLeftCorner.x, loc.bottomRightCorner.x];
  const ys = [loc.topLeftCorner.y, loc.topRightCorner.y, loc.bottomLeftCorner.y, loc.bottomRightCorner.y];
  const x = Math.min(...xs) / scale;
  const y = Math.min(...ys) / scale;
  return {
    text: code.data.trim(),
    box: { x, y, width: Math.max(...xs) / scale - x, height: Math.max(...ys) / scale - y }
  };
}

// Điền mã QR vào ô sách + tự xác thực nếu đã biết học sinh
function applyQrResult(result, { allowAuto = true } = {}) {
  const now = Date.now();
  const sameAsLast = result.text === lastQr.text && now - lastQr.at < QR_COOLDOWN_MS;
  lastQr = { text: result.text, at: now, box: result.box };
  if (sameAsLast) return;

  const book = findBookByText(result.text);
  const input = document.getElementById('inputManualBarcode');
  const select = document.getElementById('selectBookBarcode');

  if (!book) {
    input.value = result.text;
    updateCameraHudPreview();
    playSignalSound(false);
    showResultSignal('RED', 'KHÔNG CÓ SÁCH NÀY');
    showToast(`Không tìm thấy sách: ${result.text}`, 'error');
    return;
  }

  input.value = '';
  select.value = book.code;
  updateCameraHudPreview();
  showToast(`Đã quét: ${book.title}`, 'success');

  const autoOn = document.getElementById('toggleAutoConfirm').checked;
  if (allowAuto && autoOn && document.getElementById('selectFaceStudent').value) {
    executeScanTransaction();
  } else {
    playSignalSound(true);
  }
}

// Gọi trong vòng quét camera
function scanQrOnVideo(video) {
  try {
    const result = decodeQrFrom(video, video.videoWidth, video.videoHeight);
    if (result) applyQrResult(result);
  } catch (err) {
    // bỏ qua khung lỗi
  }
}

// Ô khoanh QR còn hiển thị khoảng 1,2 giây sau lần đọc cuối
function currentQrOverlayItem() {
  if (!lastQr.box || Date.now() - lastQr.at > 1200) return null;
  const book = findBookByText(lastQr.text);
  return {
    box: lastQr.box,
    label: book ? book.title : 'QR lạ',
    color: book ? QR_COLOR : FACE_COLOR_BAD
  };
}

// Quét QR từ ảnh tải lên
function scanQrPhotoFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      let result = null;
      try {
        result = decodeQrFrom(img, img.naturalWidth, img.naturalHeight, 1000);
      } catch (err) {}
      if (!result) {
        showToast('Không đọc được mã QR trong ảnh', 'error');
        return;
      }
      lastQr = { text: '', at: 0, box: null }; // ảnh tải lên luôn được xử lý
      applyQrResult(result);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// Nhập tay: Enter để xác nhận (tên sách hoặc mã sách đều được)
function setupQrEvents() {
  document.getElementById('inputQrPhoto').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) scanQrPhotoFile(file);
  });
  document.getElementById('inputManualBarcode').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    executeScanTransaction();
  });
}
