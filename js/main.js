setInterval(() => {
  const el = document.getElementById('liveVnClock');
  if (el) el.textContent = formatVnTime();
}, 1000);

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('liveVnClock').textContent = formatVnTime();
  setupEventListeners();
  renderAll();
  initSparseRainBackground();
  initCustomBackground();
});
