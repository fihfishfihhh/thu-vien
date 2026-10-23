/*************************************************************************
 * PHẦN 2: HÀM TIỆN ÍCH (THỜI GIAN VN, ÂM BÁO, QR SVG)
 *************************************************************************/
function formatVnTime(dateObj = new Date()) {
  const formatter = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(dateObj);
  const map = {};
  parts.forEach(p => { map[p.type] = p.value; });
  return `${map.day}/${map.month}/${map.year} | ${map.hour}:${map.minute}:${map.second}`;
}

function formatShortVnDate(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function getDaysOverdue(dueDateIso) {
  const now = new Date();
  const due = new Date(dueDateIso);
  return Math.floor((now - due) / (1000 * 60 * 60 * 24));
}

function playSignalSound(isValid) {
  if (!state.soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (isValid) {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(210, ctx.currentTime);
      osc.frequency.setValueAtTime(150, ctx.currentTime + 0.14);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch (e) {}
}

function generateQrSvg(codeString) {
  let hash = 0;
  for (let i = 0; i < codeString.length; i++) {
    hash = ((hash << 5) - hash) + codeString.charCodeAt(i);
    hash |= 0;
  }
  let cells = '';
  const size = 7;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const isCorner = (r < 2 && c < 2) || (r < 2 && c >= size - 2) || (r >= size - 2 && c < 2);
      const bit = (Math.abs(hash + r * 13 + c * 7) % 2 === 0) || isCorner;
      if (bit) {
        cells += `<rect x="${c * 8 + 4}" y="${r * 8 + 4}" width="7" height="7" fill="#000000" rx="1"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="w-full h-full">${cells}</svg>`;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  const borderClass = type === 'success' ? 'border-emerald-500/60 text-emerald-200' :
                      type === 'error' ? 'border-rose-500/60 text-rose-200' : 'border-white/20 text-white';
  toast.className = `pointer-events-auto bg-black/95 border ${borderClass} px-4 py-2.5 rounded-xl font-mono-tech text-xs transition-all duration-300`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
