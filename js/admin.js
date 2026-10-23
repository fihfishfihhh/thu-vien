/*************************************************************************
 * PHẦN 5: GIA HẠN, QUÁ HẠN (HSQUAHAN_TV) & LOG QUẢN TRỊ
 *************************************************************************/
function renderRenewals() {
  const selectBorrow = document.getElementById('renewSelectBorrow');
  const activeBorrows = state.borrows.filter(b => !b.returned);

  if (activeBorrows.length === 0) {
    selectBorrow.innerHTML = `<option value="">Chưa có phiếu mượn</option>`;
  } else {
    selectBorrow.innerHTML = activeBorrows.map(b =>
      `<option value="${b.borrowId}">${b.studentName} - ${b.bookTitle} (Hạn: ${formatShortVnDate(b.dueDateIso)})</option>`
    ).join('');
  }

  const pendingCount = state.renewals.filter(r => r.status === 'PENDING').length;
  document.getElementById('badgePendingRenew').textContent = pendingCount;

  const listBox = document.getElementById('renewalListContainer');
  if (state.renewals.length === 0) {
    listBox.innerHTML = `<div class="text-xs text-neutral-600 font-mono-tech">Chưa có đơn gia hạn.</div>`;
    return;
  }

  listBox.innerHTML = state.renewals.map(r => {
    const statusText = r.status === 'PENDING' ? 'CHỜ DUYỆT' : r.status === 'APPROVED' ? 'ĐÃ DUYỆT (+5 NGÀY)' : 'TỪ CHỐI (TRẢ SÁCH)';
    const adminBtns = (state.role === 'admin' && r.status === 'PENDING') ? `
      <div class="flex items-center gap-2 pt-2">
        <button type="button" data-approve-renew="${r.renewId}" class="px-3 py-1 rounded bg-white text-black font-mono-tech font-bold text-[11px]">
          DUYỆT
        </button>
        <button type="button" data-reject-renew="${r.renewId}" class="px-3 py-1 rounded border border-rose-500/50 text-rose-300 font-mono-tech text-[11px]">
          TỪ CHỐI
        </button>
      </div>
    ` : '';

    return `<div class="bg-black/80 border border-white/10 rounded-xl p-4 space-y-2.5">
      <div class="flex items-center justify-between text-xs">
        <span class="font-medium text-white">${r.studentName} — ${r.bookTitle}</span>
        <span class="font-mono-tech text-[10px] text-neutral-400">${statusText}</span>
      </div>
      <p class="text-xs text-neutral-400">${r.note}</p>
      <div class="grid grid-cols-2 gap-2">
        <img src="${r.frontImg}" alt="Mặt trước" class="w-full h-24 object-cover rounded border border-white/10" />
        <img src="${r.conditionImg}" alt="Tình trạng" class="w-full h-24 object-cover rounded border border-white/10" />
      </div>
      ${adminBtns}
    </div>`;
  }).join('');
}

function getOverdueList() {
  return state.borrows.filter(b => !b.returned && getDaysOverdue(b.dueDateIso) > 0);
}

function renderOverdueTable() {
  const overdueItems = getOverdueList();
  document.getElementById('badgeOverdueCount').textContent = overdueItems.length;

  const tbody = document.getElementById('overdueTableBody');
  if (overdueItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center font-mono-tech text-xs text-neutral-600">Trống</td></tr>`;
    return;
  }

  tbody.innerHTML = overdueItems.map(item => `
    <tr>
      <td class="py-2.5 px-3 font-mono-tech text-neutral-400">${item.borrowId}</td>
      <td class="py-2.5 px-3 text-white">${item.studentName} (${item.studentClass})</td>
      <td class="py-2.5 px-3 text-neutral-300">${item.bookTitle}</td>
      <td class="py-2.5 px-3 font-mono-tech text-rose-400">${formatShortVnDate(item.dueDateIso)}</td>
      <td class="py-2.5 px-3 font-mono-tech text-rose-400">${getDaysOverdue(item.dueDateIso)} ngày</td>
      <td class="py-2.5 px-3 text-right">
        <button type="button" data-quick-return="${item.borrowId}" class="px-2.5 py-1 rounded bg-white text-black font-mono-tech font-bold text-[11px]">
          THU HỒI (+1)
        </button>
      </td>
    </tr>
  `).join('');
}

function renderLogsAndDatabase() {
  const rawBox = document.getElementById('rawLogsStreamBox');
  if (state.logs.length === 0) {
    rawBox.textContent = '// Chưa có bản ghi nào.';
  } else {
    rawBox.textContent = state.logs.map(l =>
`Họ và tên: ${l.dataname}
Sách đã mượn: ${l.bookdata}
Ngày/tháng/năm | giờ : ${l.timeVn}
endl;`
    ).join('\n\n');
  }

  const pills = document.getElementById('studentDbPills');
  if (state.students.length === 0) {
    pills.innerHTML = `<span class="text-xs font-mono-tech text-neutral-600">Chưa có học sinh nào.</span>`;
  } else {
    pills.innerHTML = state.students.map(s => `
      <span class="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-white/5 border border-white/10 font-mono-tech text-[11px] text-neutral-300">
        ${s.photo
          ? `<img src="${s.photo}" alt="" class="w-6 h-6 rounded-full object-cover" />`
          : `<span class="w-6 h-6 rounded-full bg-white/10"></span>`}
        ${escapeHtml(s.name)} (${escapeHtml(s.className)})${s.descriptors && s.descriptors.length ? '' : ' · chưa có mặt'}
        <button type="button" data-delete-student="${s.id}" class="text-neutral-500 hover:text-rose-400 leading-none" title="Xoá học sinh">×</button>
      </span>
    `).join('');
  }
}

function updateRoleVisibility() {
  const isAdmin = state.role === 'admin';
  const btnStudent = document.getElementById('btnRoleStudent');
  const btnAdmin = document.getElementById('btnRoleAdmin');
  const tabOverdue = document.getElementById('tabBtnOverdue');
  const tabLogs = document.getElementById('tabBtnLogs');
  const btnGateReturn = document.getElementById('btnGateReturn');

  if (isAdmin) {
    btnAdmin.className = 'px-3 py-1 rounded-full bg-white text-black font-bold transition';
    btnStudent.className = 'px-3 py-1 rounded-full text-neutral-400 hover:text-white transition';
    tabOverdue.classList.remove('hidden');
    tabLogs.classList.remove('hidden');
    btnGateReturn.classList.remove('hidden');
  } else {
    btnStudent.className = 'px-3 py-1 rounded-full bg-white text-black font-bold transition';
    btnAdmin.className = 'px-3 py-1 rounded-full text-neutral-400 hover:text-white transition';
    tabOverdue.classList.add('hidden');
    tabLogs.classList.add('hidden');
    btnGateReturn.classList.add('hidden');
    if (state.scanGate === 'return') {
      document.getElementById('btnGateBorrow').click();
    }
  }
}

function renderAll() {
  updateRoleVisibility();
  populateScannerSelectors();
  renderInventory();
  renderRenewals();
  renderOverdueTable();
  renderLogsAndDatabase();
}
