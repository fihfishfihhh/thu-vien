/*************************************************************************
 * NHẬN DIỆN KHUÔN MẶT (face-api, mô hình lưu sẵn trong thư mục /models)
 *************************************************************************/
const FACE_MODEL_URL = 'models';
const FACE_MATCH_DISTANCE = 0.5;   // càng nhỏ càng khắt khe (0.4 - 0.6)
const FACE_COLOR_OK = '#4ade80';
const FACE_COLOR_BAD = '#f87171';

let faceModelsPromise = null;
let faceModelsReady = false;

function setFaceModelStatus(text) {
  const el = document.getElementById('faceModelStatus');
  if (el) el.textContent = text;
}

function loadFaceModels() {
  if (typeof faceapi === 'undefined') {
    return Promise.reject(new Error('Chưa tải được thư viện face-api'));
  }
  if (!faceModelsPromise) {
    setFaceModelStatus('ĐANG TẢI MÔ HÌNH...');
    faceModelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL)
    ]).then(() => {
      faceModelsReady = true;
      setFaceModelStatus('MÔ HÌNH SẴN SÀNG');
    }).catch(err => {
      faceModelsPromise = null;
      setFaceModelStatus('LỖI TẢI MÔ HÌNH');
      throw err;
    });
  }
  return faceModelsPromise;
}

function faceOptions() {
  return new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
}

// Phát hiện + lấy vector đặc trưng (dùng để nhận diện)
function detectFaces(input) {
  return faceapi.detectAllFaces(input, faceOptions()).withFaceLandmarks().withFaceDescriptors();
}

// Chỉ lấy ô khoanh (nhẹ hơn, dùng để xem trước)
function detectBoxes(input) {
  return faceapi.detectAllFaces(input, faceOptions());
}

function boxArea(box) {
  return box.width * box.height;
}

// Bộ so khớp được dựng lại khi danh sách khuôn mặt đổi
let faceMatcher = null;
let faceMatcherSignature = '';

function getFaceMatcher() {
  const enrolled = state.students.filter(s => s.descriptors && s.descriptors.length);
  const signature = enrolled.map(s => s.id + ':' + s.descriptors.length).join('|');
  if (signature !== faceMatcherSignature) {
    faceMatcherSignature = signature;
    faceMatcher = enrolled.length
      ? new faceapi.FaceMatcher(
          enrolled.map(s => new faceapi.LabeledFaceDescriptors(s.id, s.descriptors.map(d => new Float32Array(d)))),
          FACE_MATCH_DISTANCE
        )
      : null;
  }
  return faceMatcher;
}

// Trả về học sinh khớp nhất hoặc null
function matchStudent(descriptor) {
  const matcher = getFaceMatcher();
  if (!matcher) return null;
  const best = matcher.findBestMatch(descriptor);
  if (best.label === 'unknown') return null;
  return state.students.find(s => s.id === best.label) || null;
}

// Rút gọn vector 128 số để lưu localStorage nhỏ hơn
function packDescriptor(descriptor) {
  return Array.from(descriptor, x => Math.round(x * 10000) / 10000);
}

// Cắt ảnh khuôn mặt vuông 96x96 làm ảnh đại diện
function makeFaceThumb(source, box) {
  const side = Math.max(box.width, box.height) * 1.5;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  canvas.getContext('2d').drawImage(source, cx - side / 2, cy - side / 2, side, side, 0, 0, 96, 96);
  return canvas.toDataURL('image/jpeg', 0.7);
}

// Vẽ ô khoanh khuôn mặt lên canvas (toạ độ theo kích thước gốc của video/ảnh)
function drawFaceBoxes(canvas, width, height, items) {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  const lineWidth = Math.max(2, Math.round(width / 280));
  const fontSize = Math.max(14, Math.round(width / 42));

  items.forEach(({ box, label, color }) => {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    if (label) {
      ctx.font = `600 ${fontSize}px Inter, sans-serif`;
      const labelW = ctx.measureText(label).width + fontSize;
      const labelH = fontSize * 1.7;
      const labelY = box.y - labelH >= 0 ? box.y - labelH : box.y + box.height;
      ctx.fillStyle = color;
      ctx.fillRect(box.x, labelY, labelW, labelH);
      ctx.fillStyle = '#000000';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, box.x + fontSize / 2, labelY + labelH / 2);
    }
  });
}

function clearFaceCanvas(canvas) {
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}
