/*************************************************************************
 * ĐĂNG KÝ KHUÔN MẶT HỌC SINH (chụp bằng camera hoặc tải ảnh)
 *************************************************************************/
const ENROLL_MAX_SAMPLES = 5;

let enrollStream = null;
let enrollTimer = null;
let enrollBusy = false;
let enrollSamples = []; // [{ descriptor: number[], thumb: string }]

function renderEnrollSamples() {
  const box = document.getElementById('enrollSamples');
  box.innerHTML = enrollSamples.map((s, i) => `
    <div class="relative">
      <img src="${s.thumb}" alt="" class="w-14 h-14 rounded-lg object-cover border border-white/15" />
      <button type="button" data-remove-sample="${i}" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black border border-white/30 text-[11px] text-neutral-300 hover:text-rose-400 leading-none">×</button>
    </div>
  `).join('');
  document.getElementById('enrollCounter').textContent =
    `${enrollSamples.length}/${ENROLL_MAX_SAMPLES} ảnh (nên chụp 3)`;
}

function setEnrollHint(text) {
  document.getElementById('enrollHint').textContent = text;
}

async function startEnrollCamera() {
  const btn = document.getElementById('btnEnrollCamera');
  try {
    enrollStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
  } catch (err) {
    showToast('Không mở được camera', 'error');
    return;
  }
  const video = document.getElementById('enrollVideo');
  video.srcObject = enrollStream;
  video.classList.remove('hidden');
  document.getElementById('enrollEmpty').classList.add('hidden');
  btn.textContent = 'TẮT CAMERA';

  try {
    await loadFaceModels();
  } catch (err) {
    showToast('Không tải được mô hình nhận diện', 'error');
    return;
  }
  enrollLoop();
}

function stopEnrollCamera() {
  clearTimeout(enrollTimer);
  enrollTimer = null;
  if (enrollStream) {
    enrollStream.getTracks().forEach(t => t.stop());
    enrollStream = null;
  }
  const video = document.getElementById('enrollVideo');
  video.srcObject = null;
  video.classList.add('hidden');
  clearFaceCanvas(document.getElementById('enrollOverlay'));
  document.getElementById('enrollEmpty').classList.remove('hidden');
  document.getElementById('btnEnrollCamera').textContent = 'BẬT CAMERA';
  setEnrollHint('');
}

// Xem trước: khoanh khuôn mặt đang thấy để người chụp biết đã được nhận
async function enrollLoop() {
  if (!enrollStream) return;
  const video = document.getElementById('enrollVideo');
  if (!enrollBusy && video.readyState >= 2 && video.videoWidth) {
    try {
      const dets = await detectBoxes(video);
      const ok = dets.length === 1;
      drawFaceBoxes(
        document.getElementById('enrollOverlay'),
        video.videoWidth,
        video.videoHeight,
        dets.map(d => ({ box: d.box, label: '', color: ok ? FACE_COLOR_OK : FACE_COLOR_BAD }))
      );
      setEnrollHint(dets.length === 0 ? 'Không thấy khuôn mặt'
        : dets.length > 1 ? 'Có nhiều hơn 1 khuôn mặt' : 'Sẵn sàng chụp');
    } catch (err) {}
  }
  enrollTimer = setTimeout(enrollLoop, 250);
}

// Lấy mẫu từ video hoặc ảnh: chọn khuôn mặt lớn nhất
async function addEnrollSampleFrom(source) {
  if (enrollSamples.length >= ENROLL_MAX_SAMPLES) {
    showToast(`Tối đa ${ENROLL_MAX_SAMPLES} ảnh`, 'error');
    return;
  }
  await loadFaceModels();
  const dets = await detectFaces(source);
  if (dets.length === 0) {
    showToast('Không thấy khuôn mặt, thử lại', 'error');
    return;
  }
  const main = dets.reduce((a, b) => (boxArea(b.detection.box) > boxArea(a.detection.box) ? b : a));
  enrollSamples.push({
    descriptor: packDescriptor(main.descriptor),
    thumb: makeFaceThumb(source, main.detection.box)
  });
  renderEnrollSamples();
  playSignalSound(true);
}

async function captureEnrollSample() {
  if (!enrollStream) {
    showToast('Hãy bật camera trước', 'error');
    return;
  }
  if (enrollBusy) return;
  enrollBusy = true;
  try {
    const video = document.getElementById('enrollVideo');
    await addEnrollSampleFrom(video);
  } catch (err) {
    showToast('Chụp thất bại, thử lại', 'error');
  } finally {
    enrollBusy = false;
  }
}

function addEnrollPhotoFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = async () => {
      enrollBusy = true;
      try {
        await addEnrollSampleFrom(img);
      } catch (err) {
        showToast('Không xử lý được ảnh', 'error');
      } finally {
        enrollBusy = false;
      }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function saveEnrolledStudent(e) {
  e.preventDefault();
  const name = document.getElementById('inputNewStudentName').value.trim();
  const className = document.getElementById('inputNewStudentClass').value.trim().toUpperCase();
  if (!name || !className) return;
  if (enrollSamples.length === 0) {
    showToast('Cần chụp hoặc tải ít nhất 1 ảnh khuôn mặt', 'error');
    return;
  }

  // Cảnh báo nếu khuôn mặt này đã thuộc về học sinh khác
  const duplicate = matchStudent(new Float32Array(enrollSamples[0].descriptor));
  if (duplicate && !confirm(`Khuôn mặt này giống "${duplicate.name}" đã lưu. Vẫn lưu học sinh mới?`)) {
    return;
  }

  state.students.push({
    id: 'HS' + Date.now().toString(36).toUpperCase(),
    name,
    className,
    descriptors: enrollSamples.map(s => s.descriptor),
    photo: enrollSamples[0].thumb,
    registered: true
  });

  enrollSamples = [];
  e.target.reset();
  renderEnrollSamples();
  saveState();
  renderAll();
  showToast('Đã lưu học sinh', 'success');
}

function setupEnrollEvents() {
  document.getElementById('btnEnrollCamera').addEventListener('click', () => {
    if (enrollStream) stopEnrollCamera();
    else startEnrollCamera();
  });
  document.getElementById('btnEnrollCapture').addEventListener('click', captureEnrollSample);
  document.getElementById('inputEnrollPhoto').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) addEnrollPhotoFile(file);
  });
  document.getElementById('enrollSamples').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-sample]');
    if (!btn) return;
    enrollSamples.splice(Number(btn.getAttribute('data-remove-sample')), 1);
    renderEnrollSamples();
  });
  document.getElementById('formAddStudentFace').addEventListener('submit', saveEnrolledStudent);

  document.getElementById('studentDbPills').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-delete-student]');
    if (!btn) return;
    const student = state.students.find(s => s.id === btn.getAttribute('data-delete-student'));
    if (!student || !confirm(`Xoá học sinh "${student.name}"?`)) return;
    state.students = state.students.filter(s => s.id !== student.id);
    saveState();
    renderAll();
  });

  renderEnrollSamples();
}
