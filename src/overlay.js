// Vẽ khung xương bàn tay (21 landmark) lên canvas overlay.
// Mirror trục X (1 - x) để khớp ảnh gương của webcam.

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

// 5 màu cho 5 ngón (theo index landmark)
const DOT_COLOR = [
  '#ffffff',
  '#ffaa00','#ffaa00','#ffaa00','#ffaa00',
  '#00d4aa','#00d4aa','#00d4aa','#00d4aa',
  '#6c63ff','#6c63ff','#6c63ff','#6c63ff',
  '#ff6b6b','#ff6b6b','#ff6b6b','#ff6b6b',
  '#ff69b4','#ff69b4','#ff69b4','#ff69b4',
];

export function createHandOverlay(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function draw(hands) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!hands?.length) return;

    for (const lm of hands) {
      drawBones(lm);
      drawJoints(lm);
    }
  }

  function drawBones(lm) {
    ctx.strokeStyle = 'rgba(150,150,255,0.5)';
    ctx.lineWidth   = 1.5;
    for (const [a, b] of CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo((1 - lm[a].x) * canvas.width, lm[a].y * canvas.height);
      ctx.lineTo((1 - lm[b].x) * canvas.width, lm[b].y * canvas.height);
      ctx.stroke();
    }
  }

  function drawJoints(lm) {
    for (const [i, pt] of lm.entries()) {
      const x = (1 - pt.x) * canvas.width;
      const y = pt.y * canvas.height;
      const r = i === 0 ? 7 : 5;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = DOT_COLOR[i];
      ctx.fill();

      ctx.fillStyle    = '#000';
      ctx.font         = `bold ${r + 4}px monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i, x, y);
    }
  }

  return { draw };
}
