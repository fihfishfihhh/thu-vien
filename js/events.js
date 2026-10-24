/*************************************************************************
 * PHẦN 6: SỰ KIỆN TƯƠNG TÁC & XÁC THỰC KEY QUẢN LÝ
 *************************************************************************/
let pendingAdminCallback = null;

function requestAdminUnlock(onSuccess) {
  if (state.role === 'admin') {
    if (onSuccess) onSuccess();
    return;
  }
  pendingAdminCallback = onSuccess || null;
  document.getElementById('inputAdminKey').value = '';
  document.getElementById('adminKeyError').classList.add('hidden');
  document.getElementById('modalAdminKey').classList.remove('hidden');
  document.getElementById('inputAdminKey').focus();
}

function setupEventListeners() {
  // Chuyển Tab
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      document.querySelectorAll('.nav-tab').forEach(b => {
        b.classList.remove('bg-white', 'text-black', 'font-bold');
        b.classList.add('text-neutral-400');
      });
      btn.classList.add('bg-white', 'text-black', 'font-bold');
      btn.classList.remove('text-neutral-400');

      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      document.getElementById(`tab-${target}`).classList.remove('hidden');

      // Rời tab nào thì tắt camera tab đó
      if (target !== 'scan') stopScanCamera();
      if (target !== 'logs') stopEnrollCamera();
    });
  });

  document.getElementById('btnLogoHome').addEventListener('click', () => {
    document.querySelector('[data-tab="scan"]').click();
  });

  // Âm báo
  document.getElementById('btnToggleSound').addEventListener('click', (e) => {
    state.soundEnabled = !state.soundEnabled;
    e.currentTarget.textContent = state.soundEnabled ? 'ÂM: BẬT' : 'ÂM: TẮT';
    saveState();
  });

  // Chuyển quyền Học Sinh / Quản Lý (Yêu cầu nhập Key)
  document.getElementById('btnRoleStudent').addEventListener('click', () => {
    state.role = 'student';
    renderAll();
    document.querySelector('[data-tab="scan"]').click();
  });

  document.getElementById('btnRoleAdmin').addEventListener('click', () => {
    requestAdminUnlock(() => {
      showToast('Đã mở khoá chế độ Quản Lý', 'success');
    });
  });

  document.getElementById('btnCloseAdminKeyModal').addEventListener('click', () => {
    document.getElementById('modalAdminKey').classList.add('hidden');
  });
  document.getElementById('btnCancelAdminKey').addEventListener('click', () => {
    document.getElementById('modalAdminKey').classList.add('hidden');
  });

  document.getElementById('formAdminKey').addEventListener('submit', (e) => {
    e.preventDefault();
    const val = document.getElementById('inputAdminKey').value.trim();
    if (val === ADMIN_ACCESS_KEY) {
      state.role = 'admin';
      document.getElementById('modalAdminKey').classList.add('hidden');
      renderAll();
      if (pendingAdminCallback) {
        pendingAdminCallback();
        pendingAdminCallback = null;
      }
    } else {
      document.getElementById('adminKeyError').classList.remove('hidden');
    }
  });

  // Cổng Mượn / Cổng Trả
  const btnGateBorrow = document.getElementById('btnGateBorrow');
  const btnGateReturn = document.getElementById('btnGateReturn');

  btnGateBorrow.addEventListener('click', () => {
    state.scanGate = 'borrow';
    btnGateBorrow.className = 'px-4 py-1.5 rounded-full text-xs font-mono-tech font-bold bg-white text-black transition';
    btnGateReturn.className = 'px-4 py-1.5 rounded-full text-xs font-mono-tech text-neutral-400 border border-white/15 hover:text-white transition';
    if (state.role !== 'admin') btnGateReturn.classList.add('hidden');
  });

  btnGateReturn.addEventListener('click', () => {
    requestAdminUnlock(() => {
      state.scanGate = 'return';
      btnGateReturn.className = 'px-4 py-1.5 rounded-full text-xs font-mono-tech font-bold bg-white text-black transition';
      btnGateBorrow.className = 'px-4 py-1.5 rounded-full text-xs font-mono-tech text-neutral-400 border border-white/15 hover:text-white transition';
    });
  });

  // Quét
  document.getElementById('selectFaceStudent').addEventListener('change', updateCameraHudPreview);
  document.getElementById('selectBookBarcode').addEventListener('change', updateCameraHudPreview);
  document.getElementById('inputManualBarcode').addEventListener('input', updateCameraHudPreview);
  document.getElementById('btnExecuteScan').addEventListener('click', executeScanTransaction);
  document.getElementById('btnResetBuffer').addEventListener('click', () => clearScannerBuffer(false));

  // Camera thật + nhận diện khuôn mặt
  document.getElementById('btnStartCamera').addEventListener('click', () => {
    if (scanStream) stopScanCamera();
    else startScanCamera();
  });
  document.getElementById('btnEmptyStartCamera').addEventListener('click', startScanCamera);

  // Ảnh quét tải lên
  document.getElementById('inputScanPhoto').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) scanPhotoFile(file);
  });

  // Kho sách
  document.getElementById('inputSearchBook').addEventListener('input', renderInventory);
  document.getElementById('selectCategoryFilter').addEventListener('change', renderInventory);

  const btnGrid = document.getElementById('btnViewGrid');
  const btnList = document.getElementById('btnViewList');
  btnGrid.addEventListener('click', () => {
    state.viewMode = 'grid';
    btnGrid.className = 'px-3 py-1 rounded-full bg-white text-black font-bold transition';
    btnList.className = 'px-3 py-1 rounded-full text-neutral-400 hover:text-white transition';
    renderInventory();
  });
  btnList.addEventListener('click', () => {
    state.viewMode = 'list';
    btnList.className = 'px-3 py-1 rounded-full bg-white text-black font-bold transition';
    btnGrid.className = 'px-3 py-1 rounded-full text-neutral-400 hover:text-white transition';
    renderInventory();
  });

  document.getElementById('booksContainer').addEventListener('click', (e) => {
    const openBtn = e.target.closest('[data-open-book]');
    if (openBtn) {
      openBookDetailModal(openBtn.getAttribute('data-open-book'));
      return;
    }
    const scanBtn = e.target.closest('[data-quick-scan]');
    if (scanBtn) {
      const code = scanBtn.getAttribute('data-quick-scan');
      document.getElementById('selectBookBarcode').value = code;
      document.getElementById('inputManualBarcode').value = '';
      updateCameraHudPreview();
      document.querySelector('[data-tab="scan"]').click();
    }
  });

  // Thêm Sách (Yêu cầu Key Quản Lý nếu chưa mở khoá)
  document.getElementById('btnOpenAddBookModal').addEventListener('click', () => {
    requestAdminUnlock(() => {
      const nextNum = state.books.length + 1;
      document.getElementById('inputBookCode').value = `LIB-QR-${String(nextNum).padStart(3, '0')}`;
      document.getElementById('modalAddBook').classList.remove('hidden');
    });
  });

  document.getElementById('btnCloseAddBookModal').addEventListener('click', () => {
    document.getElementById('modalAddBook').classList.add('hidden');
  });
  document.getElementById('btnCancelAddBook').addEventListener('click', () => {
    document.getElementById('modalAddBook').classList.add('hidden');
  });

  let tempNewBookCover = null;
  document.getElementById('inputBookCoverFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { tempNewBookCover = reader.result; };
    reader.readAsDataURL(file);
  });

  document.getElementById('formAddBook').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('inputBookTitle').value.trim();
    const author = document.getElementById('inputBookAuthor').value.trim();
    const category = document.getElementById('inputBookCategory').value;
    const stock = Math.max(1, parseInt(document.getElementById('inputBookStock').value, 10) || 1);
    const code = document.getElementById('inputBookCode').value.trim().toUpperCase();
    const desc = document.getElementById('inputBookDesc').value.trim();

    state.books.unshift({
      id: 'B' + Date.now(),
      code,
      title,
      author,
      category,
      stock,
      totalStock: stock,
      desc,
      coverImage: tempNewBookCover,
      reviews: []
    });

    tempNewBookCover = null;
    e.target.reset();
    document.getElementById('modalAddBook').classList.add('hidden');
    saveState();
    renderAll();
    showToast('Đã lưu sách vào kho', 'success');
  });

  // Chi tiết sách & Bình luận
  document.getElementById('btnCloseBookDetail').addEventListener('click', () => {
    document.getElementById('modalBookDetail').classList.add('hidden');
  });

  document.getElementById('formAddReview').addEventListener('submit', (e) => {
    e.preventDefault();
    const book = state.books.find(b => b.id === state.selectedBookIdForModal);
    if (!book) return;
    const user = document.getElementById('inputReviewerName').value.trim();
    const stars = parseInt(document.getElementById('selectReviewStars').value, 10);
    const text = document.getElementById('inputReviewComment').value.trim();

    book.reviews.unshift({
      user,
      stars,
      text,
      date: new Date().toLocaleDateString('vi-VN')
    });

    e.target.reset();
    saveState();
    openBookDetailModal(book.id);
    renderInventory();
  });

  // Gia hạn sách
  document.getElementById('inputFrontPhoto').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.uploadedFrontImage = reader.result;
      document.getElementById('previewFrontBox').innerHTML = `<img src="${reader.result}" alt="" class="w-full h-full object-cover" />`;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('inputConditionPhoto').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.uploadedConditionImage = reader.result;
      document.getElementById('previewConditionBox').innerHTML = `<img src="${reader.result}" alt="" class="w-full h-full object-cover" />`;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('formRenewalRequest').addEventListener('submit', (e) => {
    e.preventDefault();
    const borrowId = document.getElementById('renewSelectBorrow').value;
    const borrow = state.borrows.find(b => b.borrowId === borrowId);
    if (!borrow) {
      showToast('Chưa có phiếu mượn để gia hạn', 'error');
      return;
    }
    if (!state.uploadedFrontImage || !state.uploadedConditionImage) {
      showToast('Vui lòng chọn đủ 2 ảnh minh chứng', 'error');
      return;
    }
    const note = document.getElementById('inputRenewNote').value.trim() || 'Xin gia hạn 5 ngày';

    state.renewals.unshift({
      renewId: 'GH-' + String(state.renewals.length + 1).padStart(2, '0'),
      borrowId: borrow.borrowId,
      studentName: `${borrow.studentName} (${borrow.studentClass})`,
      bookTitle: borrow.bookTitle,
      note,
      frontImg: state.uploadedFrontImage,
      conditionImg: state.uploadedConditionImage,
      status: 'PENDING',
      createdAtVn: formatVnTime()
    });

    state.uploadedFrontImage = null;
    state.uploadedConditionImage = null;
    document.getElementById('previewFrontBox').innerHTML = 'Trống';
    document.getElementById('previewConditionBox').innerHTML = 'Trống';
    document.getElementById('inputRenewNote').value = '';

    saveState();
    renderAll();
    showToast('Đã gửi đơn gia hạn', 'success');
  });

  document.getElementById('renewalListContainer').addEventListener('click', (e) => {
    const approveBtn = e.target.closest('[data-approve-renew]');
    const rejectBtn = e.target.closest('[data-reject-renew]');
    if (!approveBtn && !rejectBtn) return;

    requestAdminUnlock(() => {
      if (approveBtn) {
        const id = approveBtn.getAttribute('data-approve-renew');
        const ren = state.renewals.find(r => r.renewId === id);
        if (ren) {
          ren.status = 'APPROVED';
          const borrow = state.borrows.find(b => b.borrowId === ren.borrowId);
          if (borrow) {
            const curDue = new Date(borrow.dueDateIso);
            const baseDate = curDue > new Date() ? curDue : new Date();
            borrow.dueDateIso = new Date(baseDate.getTime() + BORROW_LIMIT_DAYS * 24 * 60 * 60 * 1000).toISOString();
          }
          saveState();
          renderAll();
        }
      } else if (rejectBtn) {
        const id = rejectBtn.getAttribute('data-reject-renew');
        const ren = state.renewals.find(r => r.renewId === id);
        if (ren) {
          ren.status = 'REJECTED';
          saveState();
          renderAll();
        }
      }
    });
  });

  // Quá hạn HSQUAHAN_TV
  document.getElementById('overdueTableBody').addEventListener('click', (e) => {
    const returnBtn = e.target.closest('[data-quick-return]');
    if (!returnBtn) return;
    const id = returnBtn.getAttribute('data-quick-return');
    const item = state.borrows.find(b => b.borrowId === id);
    if (item && !item.returned) {
      item.returned = true;
      const book = state.books.find(b => b.id === item.bookId || b.code === item.bookCode);
      if (book) book.stock += 1;
      state.logs.unshift({
        id: 'LOG-' + String(state.logs.length + 1).padStart(3, '0'),
        action: 'THU HỒI (+1)',
        dataname: `${item.studentName} - ${item.studentClass}`,
        bookdata: `[${item.bookCode}] ${item.bookTitle}`,
        timeVn: formatVnTime(),
        status: 'GREEN'
      });
      saveState();
      renderAll();
    }
  });

  document.getElementById('btnExportOverdueJson').addEventListener('click', () => {
    const data = {
      file: 'HSQUAHAN_TV',
      exportedAtVn: formatVnTime(),
      overdueStudents: getOverdueList()
    };
    downloadFile('HSQUAHAN_TV.json', JSON.stringify(data, null, 2), 'application/json');
  });

  document.getElementById('btnExportOverdueCsv').addEventListener('click', () => {
    const rows = [['MaPhieu', 'HoVaTen', 'Lop', 'MaSach', 'TenSach', 'HanTra', 'SoNgayTre']];
    getOverdueList().forEach(item => {
      rows.push([
        item.borrowId,
        `"${item.studentName}"`,
        item.studentClass,
        item.bookCode,
        `"${item.bookTitle}"`,
        formatShortVnDate(item.dueDateIso),
        getDaysOverdue(item.dueDateIso)
      ]);
    });
    downloadFile('HSQUAHAN_TV.csv', rows.map(r => r.join(',')).join('\n'), 'text/csv;charset=utf-8;');
  });

  // Quản trị Học Sinh & Log
  setupEnrollEvents();
  setupQrEvents();

  document.getElementById('btnClearAllData').addEventListener('click', () => {
    state.students = [];
    state.books = [];
    state.borrows = [];
    state.renewals = [];
    state.logs = [];
    saveState();
    renderAll();
    showToast('Đã xoá toàn bộ dữ liệu');
  });

  document.getElementById('btnExportAllLogs').addEventListener('click', () => {
    downloadFile('library_logs.json', JSON.stringify(state.logs, null, 2), 'application/json');
  });

  document.getElementById('btnCopyRawLogs').addEventListener('click', () => {
    const text = document.getElementById('rawLogsStreamBox').textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showToast('Đã sao chép'));
    }
  });
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
