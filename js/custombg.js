/*************************************************************************
 * NỀN TUỲ CHỈNH: ảnh / video tải lên hoặc màu có sẵn
 * - Cài đặt nhỏ lưu localStorage; file ảnh/video lưu IndexedDB (chứa được file lớn)
 *************************************************************************/
const BG_SETTINGS_KEY = 'SCHOOL_LIB_BG_V1';
const BG_DB_NAME = 'SCHOOL_LIB_BG_DB';
const BG_MAX_FILE_MB = 150;

const BG_PRESETS = [
  { id: 'night',  name: 'Xanh đêm', css: 'radial-gradient(ellipse at 20% 0%, #1e3a8a 0%, #0b1020 55%, #000 100%)' },
  { id: 'violet', name: 'Tím',      css: 'radial-gradient(ellipse at 80% 0%, #5b21b6 0%, #14091f 55%, #000 100%)' },
  { id: 'forest', name: 'Xanh lá',  css: 'radial-gradient(ellipse at 20% 100%, #166534 0%, #07140b 55%, #000 100%)' },
  { id: 'wine',   name: 'Đỏ rượu',  css: 'radial-gradient(ellipse at 50% 0%, #7f1d1d 0%, #1a0808 55%, #000 100%)' },
  { id: 'steel',  name: 'Xám thép', css: 'linear-gradient(160deg, #3f4652 0%, #14171c 60%, #000 100%)' }
];

let bgSettings = { mode: 'none', preset: null, dim: 55, rain: true, fileName: '', fileIsVideo: false };
let bgObjectUrl = null;

function loadBgSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(BG_SETTINGS_KEY));
    if (saved) bgSettings = { ...bgSettings, ...saved };
  } catch (err) {}
}

function saveBgSettings() {
  try {
    localStorage.setItem(BG_SETTINGS_KEY, JSON.stringify(bgSettings));
  } catch (err) {}
}

/* ---- IndexedDB: lưu 1 file nền ---- */
function bgDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BG_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function bgFileSave(blob) {
  const db = await bgDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(blob, 'current');
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function bgFileLoad() {
  const db = await bgDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('files').objectStore('files').get('current');
    req.onsuccess = () => { db.close(); resolve(req.result || null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function bgFileDelete() {
  try {
    const db = await bgDb();
    await new Promise(resolve => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').delete('current');
      tx.oncomplete = tx.onerror = () => { db.close(); resolve(); };
    });
  } catch (err) {}
}

/* ---- Áp dụng nền lên trang ---- */
function revokeBgUrl() {
  if (bgObjectUrl) URL.revokeObjectURL(bgObjectUrl);
  bgObjectUrl = null;
}

function applyBackground(blob) {
  const wrap = document.getElementById('customBg');
  const media = document.getElementById('customBgMedia');
  revokeBgUrl();
  media.innerHTML = '';
  media.style.background = '';

  if (bgSettings.mode === 'preset') {
    const preset = BG_PRESETS.find(p => p.id === bgSettings.preset);
    if (preset) media.style.background = preset.css;
    wrap.classList.toggle('hidden', !preset);
  } else if (bgSettings.mode === 'file' && blob) {
    bgObjectUrl = URL.createObjectURL(blob);
    if (bgSettings.fileIsVideo) {
      const video = document.createElement('video');
      video.src = bgObjectUrl;
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      video.className = 'absolute inset-0 w-full h-full object-cover';
      media.appendChild(video);
      video.play().catch(() => {});
    } else {
      media.style.background = `center / cover no-repeat url("${bgObjectUrl}")`;
    }
    wrap.classList.remove('hidden');
  } else {
    wrap.classList.add('hidden');
  }

  document.getElementById('customBgDim').style.opacity = String(bgSettings.dim / 100);
  document.getElementById('bgRainCanvas').style.display = bgSettings.rain ? '' : 'none';
  syncBgPanel();
}

function syncBgPanel() {
  document.getElementById('bgDimRange').value = bgSettings.dim;
  document.getElementById('bgDimValue').textContent = `${bgSettings.dim}%`;
  document.getElementById('bgRainToggle').checked = bgSettings.rain;
  document.getElementById('bgFileName').textContent = bgSettings.mode === 'file' ? bgSettings.fileName : '';
  document.querySelectorAll('[data-bg-preset]').forEach(btn => {
    const on = bgSettings.mode === 'preset' && btn.getAttribute('data-bg-preset') === bgSettings.preset;
    btn.className = 'w-8 h-8 rounded-full border-2 transition ' + (on ? 'border-white' : 'border-white/20 hover:border-white/60');
  });
}

async function setBackgroundFile(file) {
  const isVideo = file.type.startsWith('video/');
  if (!isVideo && !file.type.startsWith('image/')) {
    showToast('Chỉ nhận ảnh hoặc video', 'error');
    return;
  }
  if (file.size > BG_MAX_FILE_MB * 1024 * 1024) {
    showToast(`File quá lớn (tối đa ${BG_MAX_FILE_MB}MB)`, 'error');
    return;
  }

  bgSettings = { ...bgSettings, mode: 'file', preset: null, fileName: file.name, fileIsVideo: isVideo };
  try {
    await bgFileSave(file);
  } catch (err) {
    showToast('Không lưu được nền, chỉ dùng tạm lần này', 'error');
  }
  saveBgSettings();
  applyBackground(file);
}

function setBackgroundPreset(id) {
  bgSettings = { ...bgSettings, mode: 'preset', preset: id };
  bgFileDelete();
  saveBgSettings();
  applyBackground(null);
}

function resetBackground() {
  bgSettings = { mode: 'none', preset: null, dim: 55, rain: true, fileName: '', fileIsVideo: false };
  bgFileDelete();
  saveBgSettings();
  applyBackground(null);
}

async function initCustomBackground() {
  loadBgSettings();

  document.getElementById('bgPresets').innerHTML = BG_PRESETS.map(p =>
    `<button type="button" data-bg-preset="${p.id}" title="${p.name}" class="w-8 h-8 rounded-full border-2 border-white/20" style="background:${p.css}"></button>`
  ).join('');

  const panel = document.getElementById('bgPanel');
  document.getElementById('btnBgMenu').addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('hidden');
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => panel.classList.add('hidden'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') panel.classList.add('hidden'); });

  document.getElementById('inputBgFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) setBackgroundFile(file);
  });
  document.getElementById('bgPresets').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bg-preset]');
    if (btn) setBackgroundPreset(btn.getAttribute('data-bg-preset'));
  });
  document.getElementById('bgDimRange').addEventListener('input', (e) => {
    bgSettings.dim = Number(e.target.value);
    document.getElementById('customBgDim').style.opacity = String(bgSettings.dim / 100);
    document.getElementById('bgDimValue').textContent = `${bgSettings.dim}%`;
    saveBgSettings();
  });
  document.getElementById('bgRainToggle').addEventListener('change', (e) => {
    bgSettings.rain = e.target.checked;
    document.getElementById('bgRainCanvas').style.display = bgSettings.rain ? '' : 'none';
    saveBgSettings();
  });
  document.getElementById('btnBgReset').addEventListener('click', resetBackground);

  let blob = null;
  if (bgSettings.mode === 'file') {
    try {
      blob = await bgFileLoad();
    } catch (err) {}
    if (!blob) bgSettings.mode = 'none';
  }
  applyBackground(blob);
}
