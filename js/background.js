/*************************************************************************
 * PHẦN 7: BACKGROUND HẠT RƠI XUỐNG NHƯ MƯA (ÍT VÀ MỜ)
 *************************************************************************/
function initSparseRainBackground() {
  const canvas = document.getElementById('bgRainCanvas');
  const ctx = canvas.getContext('2d');
  let w = canvas.width = window.innerWidth;
  let h = canvas.height = window.innerHeight;

  // Chỉ 24 hạt mưa mảnh và mờ rơi từ trên xuống
  const drops = Array.from({ length: 24 }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    len: Math.random() * 14 + 8,
    vy: Math.random() * 1.1 + 0.55,
    alpha: Math.random() * 0.14 + 0.04
  }));

  window.addEventListener('resize', () => {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  });

  function draw() {
    ctx.clearRect(0, 0, w, h);
    drops.forEach(d => {
      d.y += d.vy;
      if (d.y > h) {
        d.y = -d.len;
        d.x = Math.random() * w;
      }
      const grad = ctx.createLinearGradient(d.x, d.y, d.x, d.y + d.len);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      grad.addColorStop(1, `rgba(255, 255, 255, ${d.alpha})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x, d.y + d.len);
      ctx.stroke();
    });
    requestAnimationFrame(draw);
  }
  draw();
}
