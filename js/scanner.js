/*************************************************************************
 * PHẦN 3: MÀN HÌNH QUÉT, NHẬN DIỆN KHUÔN MẶT & ĐÈN XANH / ĐỎ
 *************************************************************************/
let resetBufferTimer = null;

// Camera quét
let scanStream = null;
let scanLoopTimer = null;
let scanFrameBusy = false;

// Trạng thái nhận diện
let signalHoldUntil = 0;              // giữ kết quả giao dịch trên đèn đến mốc này
let faceStreak = { id: null, count: 0 }; // cùng 1 người liên tiếp mới tính là nhận diện được
let lostFrames = 0;

function populateScannerSelectors() {
  const studentSelect = document.getElementById('selectFaceStudent');
  const bookSelect = document.getElementById('selectBookBarcode');

  const curStudent = studentSelect.value;
  const curBook = bookSelect.value;

  if (state.students.length === 0) {
    studentSelect.innerHTML = `<option value="">Chưa có dữ liệu học sinh</option>`;
  } else {
    studentSelect.innerHTML = `<option value="">-- Hoặc chọn học sinh thủ công --</option>` +
      state.students.map(st =>
        `<option value="${st.id}">${escapeHtml(st.name)} (${escapeHtml(st.className)})</option>`
      ).join('');
  }

  if (state.books.length === 0) {
    bookSelect.innerHTML = `<option value="">Chưa có dữ liệu sách</option>`;
  } else {
    bookSelect.innerHTML = `<option value="">-- Chọn mã sách --</option>` +
      state.books.map(b =>
        `<option value="${b.code}">[${escapeHtml(b.code)}] ${escapeHtml(b.title)} (${b.stock})</option>`
      ).join('');
  }

  if (curStudent && Array.from(studentSelect.options).some(o => o.value === curStudent)) {
    studentSelect.value = curStudent;
  }
  if (curBook && Array.from(bookSelect.options).some(o => o.value === curBook)) {
    bookSelect.value = curBook;
  }

  updateCameraHudPreview();
}

// Cập nhật bảng thông tin bên phải (học sinh + sách đang chọn)
function updateCameraHudPreview() {
  const studentId = document.getElementById('selectFaceStudent').value;
  const manualCode = document.getElementById('inputManualBarcode').value.trim();
  const selectedCode = manualCode || document.getElementById('selectBookBarcode').value;

  const student = state.students.find(s => s.id === studentId);
  const book = state.books.find(b => b.code.toLowerCase() === selectedCode.toLowerCase());

  document.getElementById('hudStudentName').textContent = student ? student.name : 'Chưa nhận diện';
  document.getElementById('hudStudentClass').textContent = student ? `Lớp ${student.className}` : '---';

  const photo = document.getElementById('hudStudentPhoto');
  const photoEmpty = document.getElementById('hudStudentPhotoEmpty');
  if (student && student.photo) {
    photo.src = student.photo;
    photo.classList.remove('hidden');
    photoEmpty.classList.add('hidden');
  } else {
    photo.classList.add('hidden');
    photoEmpty.classList.remove('hidden');
  }

  document.getElementById('hudBookTitle').textContent = book
    ? `[${book.code}] ${book.title}`
    : (selectedCode ? `Không có mã "${selectedCode}"` : '---');
}

// Điều khiển Đèn Đỏ / Xanh nằm gọn ở góc trên bên phải khung quét
function setCornerSignal(status, labelText) {
  const greenDot = document.getElementById('lampGreenDot');
  const redDot = document.getElementById('lampRedDot');
  const textEl = document.getElementById('cornerSignalText');

  textEl.textContent = labelText;

  if (status === 'GREEN') {
    greenDot.className = 'w-4 h-4 rounded-full lamp-dot-green-on transition-all duration-300';
    redDot.className = 'w-4 h-4 rounded-full bg-rose-950/30 border border-rose-900/30 transition-all duration-300';
    textEl.className = 'font-mono-tech text-[11px] tracking-wider uppercase text-emerald-400 font-bold';
  } else if (status === 'RED') {
    greenDot.className = 'w-4 h-4 rounded-full bg-emerald-950/30 border border-emerald-900/30 transition-all duration-300';
    redDot.className = 'w-4 h-4 rounded-full lamp-dot-red-on transition-all duration-300';
    textEl.className = 'font-mono-tech text-[11px] tracking-wider uppercase text-rose-400 font-bold';
  } else {
    greenDot.className = 'w-4 h-4 rounded-full bg-emerald-950/50 border border-emerald-800/40 transition-all duration-300';
    redDot.className = 'w-4 h-4 rounded-full bg-rose-950/50 border border-rose-800/40 transition-all duration-300';
    textEl.className = 'font-mono-tech text-[11px] tracking-wider uppercase text-neutral-400';
  }
}

// Kết quả mượn/trả: giữ đèn 3 giây để vòng quét khuôn mặt không ghi đè
function showResultSignal(status, labelText) {
  signalHoldUntil = Date.now() + 3000;
  setCornerSignal(status, labelText);
}

/*************************************************************************
 * CAMERA + TỰ ĐỘNG NHẬN DIỆN KHUÔN MẶT
 *************************************************************************/
function setScanSource(mode) {
  // mode: 'camera' | 'image' | 'none'
  document.getElementById('cameraVideo').classList.toggle('hidden', mode !== 'camera');
  document.getElementById('uploadedScanPreview').classList.toggle('hidden', mode !== 'image');
  document.getElementById('scanEmptyState').classList.toggle('hidden', mode !== 'none');
  document.getElementById('cameraModeLabel').textContent =
    mode === 'camera' ? 'LIVE CAMERA' : mode === 'image' ? 'ẢNH QUÉT' : 'TERMINAL 01';
  document.getElementById('btnStartCamera').textContent = mode === 'camera' ? 'TẮT CAMERA' : 'BẬT CAMERA';
}

async function startScanCamera() {
  if (scanStream) return;
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
  } catch (err) {
    showToast('Không mở được camera', 'error');
    return;
  }

  const video = document.getElementById('cameraVideo');
  video.srcObject = scanStream;
  clearFaceCanvas(document.getElementById('scanOverlay'));
  setScanSource('camera');

  try {
    await loadFaceModels();
  } catch (err) {
    showToast('Không tải được mô hình nhận diện, hãy chọn học sinh thủ công', 'error');
    return;
  }
  scanFrame();
}

function stopScanCamera() {
  clearTimeout(scanLoopTimer);
  scanLoopTimer = null;
  if (scanStream) {
    scanStream.getTracks().forEach(t => t.stop());
    scanStream = null;
  }
  document.getElementById('cameraVideo').srcObject = null;
  clearFaceCanvas(document.getElementById('scanOverlay'));
  faceStreak = { id: null, count: 0 };
  setScanSource('none');
  if (Date.now() >= signalHoldUntil) setCornerSignal('IDLE', 'CHỜ QUÉT');
}

async function scanFrame() {
  if (!scanStream) return;
  const video = document.getElementById('cameraVideo');
  if (!scanFrameBusy && faceModelsReady && video.readyState >= 2 && video.videoWidth) {
    scanFrameBusy = true;
    try {
      const dets = await detectFaces(video);
      if (scanStream) handleDetections(dets, video.videoWidth, video.videoHeight);
    } catch (err) {
      // bỏ qua khung lỗi, thử lại khung sau
    } finally {
      scanFrameBusy = false;
    }
  }
  if (scanStream) scanLoopTimer = setTimeout(scanFrame, 120);
}

// Vẽ ô khoanh mặt + tự chọn học sinh khi nhận diện được
// needStreak: số khung liên tiếp cùng 1 người mới chọn (camera = 2, ảnh tĩnh = 1)
function handleDetections(dets, width, height, needStreak = 2) {
  const items = dets.map(d => {
    const student = matchStudent(d.descriptor);
    return {
      box: d.detection.box,
      student,
      label: student ? student.name : 'Không nhận diện',
      color: student ? FACE_COLOR_OK : FACE_COLOR_BAD
    };
  });
  drawFaceBoxes(document.getElementById('scanOverlay'), width, height, items);

  if (Date.now() < signalHoldUntil) return;

  if (items.length === 0) {
    lostFrames++;
    if (lostFrames >= 8) {
      faceStreak = { id: null, count: 0 };
      setCornerSignal('IDLE', 'CHỜ QUÉT');
    }
    return;
  }
  lostFrames = 0;

  // Người đứng gần nhất = khuôn mặt lớn nhất
  const main = items.reduce((a, b) => (boxArea(b.box) > boxArea(a.box) ? b : a));
  if (main.student) {
    faceStreak = faceStreak.id === main.student.id
      ? { id: main.student.id, count: faceStreak.count + 1 }
      : { id: main.student.id, count: 1 };
    if (faceStreak.count >= needStreak) {
      const select = document.getElementById('selectFaceStudent');
      if (select.value !== main.student.id) {
        select.value = main.student.id;
        updateCameraHudPreview();
      }
      setCornerSignal('GREEN', 'ĐÃ NHẬN DIỆN');
    }
  } else {
    faceStreak = { id: null, count: 0 };
    setCornerSignal('RED', 'KHÔNG NHẬN DIỆN');
  }
}

// Quét từ ảnh tải lên
function scanPhotoFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    stopScanCamera();
    const img = document.getElementById('uploadedScanPreview');
    img.onload = async () => {
      setScanSource('image');
      const canvas = document.getElementById('scanOverlay');
      clearFaceCanvas(canvas);
      try {
        await loadFaceModels();
        const dets = await detectFaces(img);
        signalHoldUntil = 0;
        handleDetections(dets, img.naturalWidth, img.naturalHeight, 1);
        if (dets.length === 0) showToast('Không thấy khuôn mặt trong ảnh', 'error');
      } catch (err) {
        showToast('Không nhận diện được ảnh', 'error');
      }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function executeScanTransaction() {
  if (resetBufferTimer) clearTimeout(resetBufferTimer);

  const studentId = document.getElementById('selectFaceStudent').value;
  const manualCode = document.getElementById('inputManualBarcode').value.trim();
  const bookCode = manualCode || document.getElementById('selectBookBarcode').value;

  const student = state.students.find(s => s.id === studentId);
  const book = state.books.find(b => b.code.toLowerCase() === bookCode.toLowerCase());
  const nowVn = formatVnTime();

  if (!student || !book) {
    playSignalSound(false);
    showResultSignal('RED', 'KHÔNG HỢP LỆ');
    resetBufferTimer = setTimeout(() => clearScannerBuffer(true), 3000);
    return;
  }

  if (state.scanGate === 'borrow') {
    if (book.stock <= 0) {
      playSignalSound(false);
      showResultSignal('RED', 'HẾT SÁCH');
      resetBufferTimer = setTimeout(() => clearScannerBuffer(true), 3000);
      return;
    }

    book.stock -= 1;
    const now = new Date();
    const due = new Date(now.getTime() + BORROW_LIMIT_DAYS * 24 * 60 * 60 * 1000);

    state.borrows.unshift({
      borrowId: 'M-' + Math.floor(1000 + Math.random() * 9000),
      studentId: student.id,
      studentName: student.name,
      studentClass: student.className,
      bookId: book.id,
      bookCode: book.code,
      bookTitle: book.title,
      borrowDateIso: now.toISOString(),
      dueDateIso: due.toISOString(),
      returned: false
    });

    state.logs.unshift({
      id: 'LOG-' + String(state.logs.length + 1).padStart(3, '0'),
      action: 'MƯỢN',
      dataname: `${student.name} - ${student.className}`,
      bookdata: `[${book.code}] ${book.title}`,
      timeVn: nowVn,
      status: 'GREEN'
    });

    saveState();
    playSignalSound(true);
    showResultSignal('GREEN', 'HỢP LỆ');
  } else {
    if (state.role !== 'admin') {
      playSignalSound(false);
      showResultSignal('RED', 'CẦN QUYỀN QUẢN LÝ');
      return;
    }

    book.stock += 1;
    const activeBorrow = state.borrows.find(
      b => !b.returned && b.bookCode === book.code && (b.studentId === student.id || true)
    );
    if (activeBorrow) activeBorrow.returned = true;

    state.logs.unshift({
      id: 'LOG-' + String(state.logs.length + 1).padStart(3, '0'),
      action: 'TRẢ (+1)',
      dataname: `${student.name} - ${student.className}`,
      bookdata: `[${book.code}] ${book.title}`,
      timeVn: nowVn,
      status: 'GREEN'
    });

    saveState();
    playSignalSound(true);
    showResultSignal('GREEN', 'ĐÃ TRẢ (+1)');
  }

  document.getElementById('inputManualBarcode').value = '';
  renderAll();

  // Tự động làm trống bộ đệm (endl;) sau 3 giây để không nhập nhầm người sau
  resetBufferTimer = setTimeout(() => {
    clearScannerBuffer(true);
  }, 3000);
}

function clearScannerBuffer(silent = false) {
  document.getElementById('inputManualBarcode').value = '';
  document.getElementById('selectFaceStudent').value = '';
  document.getElementById('selectBookBarcode').value = '';
  faceStreak = { id: null, count: 0 };
  if (!silent) signalHoldUntil = 0;
  setCornerSignal('IDLE', 'CHỜ QUÉT');
  updateCameraHudPreview();
  if (!silent) showToast('Đã làm mới bộ đệm');
}
