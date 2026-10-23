/*************************************************************************
 * PHẦN 3: MÀN HÌNH QUÉT & ĐÈN GÓC XANH / ĐỎ
 *************************************************************************/
let resetBufferTimer = null;

function populateScannerSelectors() {
  const studentSelect = document.getElementById('selectFaceStudent');
  const bookSelect = document.getElementById('selectBookBarcode');

  const curStudent = studentSelect.value;
  const curBook = bookSelect.value;

  if (state.students.length === 0) {
    studentSelect.innerHTML = `<option value="">Chưa có dữ liệu học sinh</option>`;
  } else {
    studentSelect.innerHTML = `<option value="">-- Chọn khuôn mặt học sinh --</option>` +
      state.students.map(st =>
        `<option value="${st.id}">${st.name} (${st.className})</option>`
      ).join('');
  }

  if (state.books.length === 0) {
    bookSelect.innerHTML = `<option value="">Chưa có dữ liệu sách</option>`;
  } else {
    bookSelect.innerHTML = `<option value="">-- Chọn mã sách --</option>` +
      state.books.map(b =>
        `<option value="${b.code}">[${b.code}] ${b.title} (${b.stock})</option>`
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

function updateCameraHudPreview() {
  const studentId = document.getElementById('selectFaceStudent').value;
  const manualCode = document.getElementById('inputManualBarcode').value.trim();
  const selectedCode = manualCode || document.getElementById('selectBookBarcode').value;

  const student = state.students.find(s => s.id === studentId);
  const book = state.books.find(b => b.code.toLowerCase() === selectedCode.toLowerCase());

  const faceBox = document.getElementById('faceBoundingBox');
  const faceName = document.getElementById('hudStudentName');
  const faceClass = document.getElementById('hudStudentClass');
  const faceStatus = document.getElementById('hudFaceStatusText');

  if (student) {
    faceName.textContent = student.name;
    faceClass.textContent = `Lớp ${student.className}`;
    faceStatus.textContent = 'READY';
    faceBox.className = 'relative w-64 h-64 sm:w-72 sm:h-72 border border-white/50 rounded-2xl flex flex-col justify-between p-4 bg-black/30 backdrop-blur-[2px] transition-all duration-300';
  } else {
    faceName.textContent = 'Chưa nhận diện';
    faceClass.textContent = '---';
    faceStatus.textContent = 'IDLE';
    faceBox.className = 'relative w-64 h-64 sm:w-72 sm:h-72 border border-white/20 rounded-2xl flex flex-col justify-between p-4 bg-black/20 backdrop-blur-[2px] transition-all duration-300';
  }

  document.getElementById('hudBookCode').textContent = selectedCode ? selectedCode : 'MÃ SÁCH: ---';
  document.getElementById('hudBookTitle').textContent = book ? book.title : '---';
}

// Điều khiển Đèn Đỏ / Xanh nằm gọn ở góc trên bên phải khung quét
function setCornerSignal(status, labelText) {
  const greenDot = document.getElementById('lampGreenDot');
  const redDot = document.getElementById('lampRedDot');
  const textEl = document.getElementById('cornerSignalText');
  const faceBox = document.getElementById('faceBoundingBox');

  textEl.textContent = labelText;

  if (status === 'GREEN') {
    greenDot.className = 'w-4 h-4 rounded-full lamp-dot-green-on transition-all duration-300';
    redDot.className = 'w-4 h-4 rounded-full bg-rose-950/30 border border-rose-900/30 transition-all duration-300';
    textEl.className = 'font-mono-tech text-[11px] tracking-wider uppercase text-emerald-400 font-bold';
    faceBox.className = 'relative w-64 h-64 sm:w-72 sm:h-72 border-2 border-emerald-400 rounded-2xl flex flex-col justify-between p-4 bg-emerald-950/15 transition-all duration-300';
  } else if (status === 'RED') {
    greenDot.className = 'w-4 h-4 rounded-full bg-emerald-950/30 border border-emerald-900/30 transition-all duration-300';
    redDot.className = 'w-4 h-4 rounded-full lamp-dot-red-on transition-all duration-300';
    textEl.className = 'font-mono-tech text-[11px] tracking-wider uppercase text-rose-400 font-bold';
    faceBox.className = 'relative w-64 h-64 sm:w-72 sm:h-72 border-2 border-rose-500 rounded-2xl flex flex-col justify-between p-4 bg-rose-950/15 transition-all duration-300';
  } else {
    greenDot.className = 'w-4 h-4 rounded-full bg-emerald-950/50 border border-emerald-800/40 transition-all duration-300';
    redDot.className = 'w-4 h-4 rounded-full bg-rose-950/50 border border-rose-800/40 transition-all duration-300';
    textEl.className = 'font-mono-tech text-[11px] tracking-wider uppercase text-neutral-400';
    updateCameraHudPreview();
  }
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
    setCornerSignal('RED', 'KHÔNG HỢP LỆ');
    resetBufferTimer = setTimeout(() => clearScannerBuffer(true), 3000);
    return;
  }

  if (state.scanGate === 'borrow') {
    if (book.stock <= 0) {
      playSignalSound(false);
      setCornerSignal('RED', 'HẾT SÁCH');
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
    setCornerSignal('GREEN', 'HỢP LỆ');
  } else {
    if (state.role !== 'admin') {
      playSignalSound(false);
      setCornerSignal('RED', 'CẦN QUYỀN QUẢN LÝ');
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
    setCornerSignal('GREEN', 'ĐÃ TRẢ (+1)');
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
  setCornerSignal('IDLE', 'CHỜ QUÉT');
  if (!silent) showToast('Đã làm mới bộ đệm');
}
