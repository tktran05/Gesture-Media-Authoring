// gesture.js — v2: hysteresis + temporal stability

const EMA_ALPHA = 0.65;   // smoothing (cao hơn = phản hồi nhanh hơn)
const DEAD_ZONE = 0.003;  // ngưỡng tối thiểu để tính là có di chuyển

// Ngưỡng pinch có hysteresis: vào dễ hơn thoát
const PINCH_ENTER = 0.060;  // khoảng cách để BẮT ĐẦU pinch
const PINCH_EXIT  = 0.115;  // khoảng cách để KẾT THÚC pinch (rộng hơn → bám chắc hơn)

// Số frame không-pinch liên tiếp cần thiết để thực sự kết thúc drag
const DRAG_EXIT_FRAMES = 2;

// ── DETECTORS ──────────────────────────────────────────────────
function pinchDist(lm) {
  return Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
}

function isOpenPalm(lm) {
  function d(a, b) { return Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y); }
  return (
    d(8,  5) > d(6,  5) * 1.3  &&  // ngón trỏ duỗi
    d(12, 9) > d(10, 9) * 1.3  &&  // ngón giữa duỗi
    d(16,13) > d(14,13) * 1.3  &&  // ngón áp út duỗi
    d(20,17) > d(18,17) * 1.3  &&  // ngón út duỗi
    d(4,  8) > 0.08                 // ngón cái không chạm ngón trỏ
  );
}

// ── EMA ────────────────────────────────────────────────────────
function ema(prev, val) {
  return prev === null ? val : EMA_ALPHA * val + (1 - EMA_ALPHA) * prev;
}

// ── STATE ──────────────────────────────────────────────────────
const orbitState = { prevX: null, prevY: null, smoothX: null, smoothY: null };
const zoomState  = { prevDist: null, smoothDist: null };
const pinchState = {
  active:    false, // đang trong trạng thái drag?
  exitCount: 0,     // số frame liên tiếp không đủ điều kiện pinch
  smoothX:   null,
  smoothY:   null,
};

function resetOrbit() {
  orbitState.prevX = orbitState.prevY = orbitState.smoothX = orbitState.smoothY = null;
}
function resetZoom() {
  zoomState.prevDist = zoomState.smoothDist = null;
}
function forceEndPinch() {
  if (pinchState.active) emit({ state: 'DRAG_END' });
  pinchState.active    = false;
  pinchState.exitCount = 0;
  pinchState.smoothX   = pinchState.smoothY = null;
}

// ── EMIT ───────────────────────────────────────────────────────
function emit(cmd) {
  if (typeof window.onGestureCommand === 'function') window.onGestureCommand(cmd);
}

// ── HANDLERS ───────────────────────────────────────────────────
function handleOrbit(lm) {
  const s = orbitState;
  s.smoothX = ema(s.smoothX, lm[9].x);
  s.smoothY = ema(s.smoothY, lm[9].y);
  if (s.prevX !== null) {
    const dx = s.smoothX - s.prevX;
    const dy = s.smoothY - s.prevY;
    if (Math.abs(dx) > DEAD_ZONE || Math.abs(dy) > DEAD_ZONE) {
      emit({ state: 'ORBIT', dx, dy });
    }
  }
  s.prevX = s.smoothX;
  s.prevY = s.smoothY;
}

function handlePinch(lm) {
  const p   = pinchState;
  p.smoothX = ema(p.smoothX, (lm[4].x + lm[8].x) / 2);
  p.smoothY = ema(p.smoothY, (lm[4].y + lm[8].y) / 2);
  p.exitCount = 0; // xác nhận vẫn đang pinch → reset bộ đếm thoát

  if (!p.active) {
    p.active = true;
    emit({ state: 'DRAG_START', x: p.smoothX, y: p.smoothY });
  } else {
    emit({ state: 'DRAG', x: p.smoothX, y: p.smoothY });
  }
}

// Không thoát drag ngay — đếm frame rồi mới quyết định
// Trong khi đang đếm: object đứng yên (không emit DRAG)
function tryEndPinch() {
  if (!pinchState.active) return false;
  pinchState.exitCount++;
  if (pinchState.exitCount >= DRAG_EXIT_FRAMES) {
    emit({ state: 'DRAG_END' });
    pinchState.active    = false;
    pinchState.exitCount = 0;
    pinchState.smoothX   = pinchState.smoothY = null;
    return true;
  }
  return false; // vẫn đang chờ xác nhận
}

// ── PROCESS FRAME ──────────────────────────────────────────────
function processFrame({ multiHandLandmarks }) {
  if (typeof window.drawLandmarks === 'function') {
    window.drawLandmarks(multiHandLandmarks);
  }

  const hands = multiHandLandmarks;

  // Không có tay
  if (!hands?.length) {
    forceEndPinch();
    resetOrbit();
    resetZoom();
    emit({ state: 'IDLE' });
    return;
  }

  const lm = hands[0];

  // ── ZOOM: 2 tay cùng pinch ─────────────────────────────────
  if (hands.length === 2) {
    const d1 = pinchDist(hands[0]);
    const d2 = pinchDist(hands[1]);
    if (d1 < PINCH_EXIT && d2 < PINCH_EXIT) {
      resetOrbit();
      forceEndPinch();
      const z = zoomState;
      const cx1 = (hands[0][4].x + hands[0][8].x) / 2;
      const cy1 = (hands[0][4].y + hands[0][8].y) / 2;
      const cx2 = (hands[1][4].x + hands[1][8].x) / 2;
      const cy2 = (hands[1][4].y + hands[1][8].y) / 2;
      const raw = Math.hypot(cx1 - cx2, cy1 - cy2);
      z.smoothDist = ema(z.smoothDist, raw);
      if (z.prevDist !== null) {
        const delta = z.smoothDist - z.prevDist;
        if (Math.abs(delta) > DEAD_ZONE) emit({ state: 'ZOOM', zoomDelta: delta });
      }
      z.prevDist = z.smoothDist;
      return;
    }
  }
  resetZoom();

  // ── PINCH DRAG: ưu tiên kiểm tra trước orbit ───────────────
  // Dùng ngưỡng hysteresis: nếu đang drag thì ngưỡng thoát rộng hơn
  const dist = pinchDist(lm);
  const threshold = pinchState.active ? PINCH_EXIT : PINCH_ENTER;

  if (hands.length === 1 && dist < threshold) {
    resetOrbit();
    handlePinch(lm);
    return;
  }

  // Không đủ điều kiện pinch → thử kết thúc drag (có độ trễ)
  const ended = tryEndPinch();

  // ── ORBIT: lòng bàn tay mở (chỉ khi không đang drag) ──────
  if (!pinchState.active && hands.length === 1 && isOpenPalm(lm)) {
    handleOrbit(lm);
    return;
  }
  resetOrbit();

  if (!pinchState.active) emit({ state: 'IDLE' });
}

// ── SETUP ──────────────────────────────────────────────────────
export async function setupGesture(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  videoEl.srcObject = stream;
  await new Promise(r => (videoEl.onloadedmetadata = r));

  await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
  await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');

  const hands = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
  });
  hands.setOptions({
    maxNumHands:            2,
    modelComplexity:        1,
    minDetectionConfidence: 0.75,
    minTrackingConfidence:  0.65,
  });
  hands.onResults(processFrame);

  const cam = new Camera(videoEl, {
    onFrame: async () => await hands.send({ image: videoEl }),
    width: 640, height: 480,
  });
  cam.start();
}

function loadScript(src) {
  return new Promise(resolve => {
    const s = document.createElement('script');
    s.src    = src;
    s.onload = resolve;
    document.head.appendChild(s);
  });
}
