/*************************************************************************
 * THÊM SÁCH: ảnh bìa + ảnh mã QR (đọc nội dung QR để quét sau này)
 *************************************************************************/
let newBookCover = null;
let newBookQr = { image: null, text: '' }; // ảnh QR đã chuẩn hoá + nội dung QR đọc được

function resetAddBookForm() {
  newBookCover = null;
  newBookQr = { image: null, text: '' };
  document.getElementById('formAddBook').reset();
  refreshAddBookQrPreview();
}

// Xem trước: ảnh QR đã tải lên, hoặc QR tự tạo từ mã sách
function refreshAddBookQrPreview() {
  const box = document.getElementById('addBookQrPreview');
  const info = document.getElementById('addBookQrInfo');
  const clearBtn = document.getElementById('btnClearQrImage');

  if (newBookQr.image) {
    box.innerHTML = `<img src="${newBookQr.image}" alt="QR" class="w-full h-full object-contain" />`;
    info.textContent = `Nội dung QR: ${newBookQr.text}`;
    clearBtn.classList.remove('hidden');
  } else {
    const code = document.getElementById('inputBookCode').value.trim().toUpperCase();
    box.innerHTML = code ? generateQrSvg(code) : '';
    info.textContent = 'Chưa có ảnh QR: hệ thống sẽ tự tạo QR từ mã sách.';
    clearBtn.classList.add('hidden');
  }
}

// Đọc ảnh QR tải lên: lấy nội dung + lưu bản gọn (tối đa 480px)
function loadQrImageFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      let result = null;
      try {
        result = decodeQrFrom(img, img.naturalWidth, img.naturalHeight, 1000);
      } catch (err) {}
      if (!result) {
        showToast('Không đọc được mã QR trong ảnh này', 'error');
        return;
      }

      const scale = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      newBookQr = { image: canvas.toDataURL('image/png'), text: result.text };

      const titleInput = document.getElementById('inputBookTitle');
      if (!titleInput.value.trim()) titleInput.value = result.text; // QR ghi tên sách thì điền luôn
      refreshAddBookQrPreview();
      showToast('Đã đọc mã QR', 'success');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function setupAddBookEvents() {
  const modal = document.getElementById('modalAddBook');
  const closeModal = () => modal.classList.add('hidden');

  // Thêm Sách (Yêu cầu Key Quản Lý nếu chưa mở khoá)
  document.getElementById('btnOpenAddBookModal').addEventListener('click', () => {
    requestAdminUnlock(() => {
      resetAddBookForm();
      document.getElementById('inputBookCode').value = `LIB-QR-${String(state.books.length + 1).padStart(3, '0')}`;
      refreshAddBookQrPreview();
      modal.classList.remove('hidden');
    });
  });
  document.getElementById('btnCloseAddBookModal').addEventListener('click', closeModal);
  document.getElementById('btnCancelAddBook').addEventListener('click', closeModal);

  document.getElementById('inputBookCoverFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { newBookCover = reader.result; };
    reader.readAsDataURL(file);
  });

  document.getElementById('inputBookQrFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) loadQrImageFile(file);
  });
  document.getElementById('btnClearQrImage').addEventListener('click', () => {
    newBookQr = { image: null, text: '' };
    refreshAddBookQrPreview();
  });
  document.getElementById('inputBookCode').addEventListener('input', refreshAddBookQrPreview);

  document.getElementById('formAddBook').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('inputBookTitle').value.trim();
    const author = document.getElementById('inputBookAuthor').value.trim();
    const category = document.getElementById('inputBookCategory').value;
    const stock = Math.max(1, parseInt(document.getElementById('inputBookStock').value, 10) || 1);
    const code = document.getElementById('inputBookCode').value.trim().toUpperCase();
    const desc = document.getElementById('inputBookDesc').value.trim();

    if (state.books.some(b => b.code.toLowerCase() === code.toLowerCase())) {
      showToast(`Mã sách ${code} đã tồn tại`, 'error');
      return;
    }

    state.books.unshift({
      id: 'B' + Date.now(),
      code,
      title,
      author,
      category,
      stock,
      totalStock: stock,
      desc,
      coverImage: newBookCover,
      qrImage: newBookQr.image,
      qrText: newBookQr.text,
      reviews: []
    });

    closeModal();
    resetAddBookForm();
    saveState();
    renderAll();
    showToast('Đã lưu sách vào kho', 'success');
  });
}
