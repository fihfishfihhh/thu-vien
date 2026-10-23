/*************************************************************************
 * PHẦN 4: KHO SÁCH & ĐÁNH GIÁ
 *************************************************************************/
function renderInventory() {
  const keyword = document.getElementById('inputSearchBook').value.trim().toLowerCase();
  const cat = document.getElementById('selectCategoryFilter').value;

  const filtered = state.books.filter(b => {
    const matchCat = cat === 'ALL' || b.category === cat;
    const matchKey = !keyword ||
      b.title.toLowerCase().includes(keyword) ||
      b.author.toLowerCase().includes(keyword) ||
      b.code.toLowerCase().includes(keyword);
    return matchCat && matchKey;
  });

  const container = document.getElementById('booksContainer');
  container.className = state.viewMode === 'grid'
    ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
    : 'flex flex-col gap-3';

  if (filtered.length === 0) {
    container.innerHTML = `<div class="col-span-full fade-black-surface rounded-2xl p-10 text-center text-neutral-500 font-mono-tech text-xs">
      Kho sách đang trống.
    </div>`;
    return;
  }

  container.innerHTML = filtered.map(b => {
    const avgStars = b.reviews.length
      ? (b.reviews.reduce((s, r) => s + Number(r.stars), 0) / b.reviews.length).toFixed(1)
      : '-';

    if (state.viewMode === 'list') {
      return `<div class="fade-black-surface rounded-2xl p-4 flex items-center justify-between gap-4">
        <div>
          <span class="font-mono-tech text-[11px] text-neutral-400">[${b.code}] SL: ${b.stock}</span>
          <h3 class="text-sm font-medium text-white">${b.title}</h3>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" data-quick-scan="${b.code}" class="px-3 py-1 rounded-full border border-white/15 hover:border-white text-[11px] font-mono-tech text-neutral-300">
            CHỌN QUÉT
          </button>
          <button type="button" data-open-book="${b.id}" class="px-3 py-1 rounded-full bg-white text-black font-mono-tech font-bold text-[11px]">
            CHI TIẾT
          </button>
        </div>
      </div>`;
    }

    return `<div class="fade-black-surface rounded-2xl p-5 flex flex-col justify-between gap-4">
      <div class="space-y-2.5">
        <div class="flex items-center justify-between font-mono-tech text-[11px]">
          <span class="text-neutral-400">${b.code}</span>
          <span class="${b.stock > 0 ? 'text-emerald-400' : 'text-rose-400'}">SL: ${b.stock}</span>
        </div>
        ${b.coverImage ? `<img src="${b.coverImage}" alt="${b.title}" class="w-full h-32 object-cover rounded-xl border border-white/10" />` : ''}
        <div>
          <h3 class="text-base font-medium text-white">${b.title}</h3>
          <p class="text-xs text-neutral-500">${b.author}</p>
        </div>
      </div>
      <div class="pt-3 border-t border-white/10 flex items-center justify-between">
        <span class="font-mono-tech text-[11px] text-neutral-400">Đánh giá: ${avgStars}/5</span>
        <div class="flex items-center gap-2">
          <button type="button" data-quick-scan="${b.code}" class="px-2.5 py-1 rounded-full border border-white/15 hover:border-white text-[11px] font-mono-tech text-neutral-300">
            QUÉT
          </button>
          <button type="button" data-open-book="${b.id}" class="px-3 py-1 rounded-full bg-white text-black font-mono-tech font-bold text-[11px]">
            MỞ
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openBookDetailModal(bookId) {
  const book = state.books.find(b => b.id === bookId);
  if (!book) return;
  state.selectedBookIdForModal = bookId;

  document.getElementById('detailBookCode').textContent = `${book.code} | Tồn kho: ${book.stock}`;
  document.getElementById('detailBookTitle').textContent = book.title;
  document.getElementById('detailBookAuthor').textContent = `${book.author} (${book.category})`;
  document.getElementById('detailBookDesc').textContent = book.desc || '';
  document.getElementById('detailQrString').textContent = book.code;
  document.getElementById('detailQrSvgBox').innerHTML = generateQrSvg(book.code);

  const reviewsBox = document.getElementById('detailReviewsList');
  if (book.reviews.length === 0) {
    reviewsBox.innerHTML = `<div class="text-xs text-neutral-600">Chưa có bình luận.</div>`;
  } else {
    reviewsBox.innerHTML = book.reviews.map(r => `
      <div class="bg-black border border-white/10 rounded-xl p-2.5 space-y-1">
        <div class="flex items-center justify-between text-xs">
          <span class="font-medium text-white">${r.user}</span>
          <span class="font-mono-tech text-neutral-400">${r.stars}/5</span>
        </div>
        <p class="text-xs text-neutral-300">${r.text}</p>
      </div>
    `).join('');
  }

  document.getElementById('modalBookDetail').classList.remove('hidden');
}
