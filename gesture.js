// gesture.js

// ── CONFIG ─────────────────────────────────────────────────────
const EMA_ALPHA = 0.6;
const DEAD_ZONE = 0.005;

// ── DETECTORS ──────────────────────────────────────────────────
function isOpenPalm(lm) {
  function dist(a, b) {
    return Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
  }
  const indexUp  = dist(8,  5) > dist(6,  5) * 1.3;
  const middleUp = dist(12, 9) > dist(10, 9) * 1.3;
  const ringUp   = dist(16,13) > dist(14,13) * 1.3;
  const pinkyUp  = dist(20,17) > dist(18,17) * 1.3;
  const notPinch = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) > 0.08;
  return indexUp && middleUp && ringUp && pinkyUp && notPinch;
}

function isPinch(lm) {
  return Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) < 0.06;
}

// ── EMA ────────────────────────────────────────────────────────
function ema(prev, val) {
  return prev === null ? val : EMA_ALPHA * val + (1 - EMA_ALPHA) * prev;
}

// ── STATE ──────────────────────────────────────────────────────
const orbitState = { prevX: null, prevY: null, smoothX: null, smoothY: null };
const zoomState  = { prevDist: null, smoothDist: null };
const pinchState = { dragging: false, smoothX: null, smoothY: null };

function resetOrbit() {
  orbitState.prevX = orbitState.prevY = null;
  orbitState.smoothX = orbitState.smoothY = null;
}

function resetZoom() {
  zoomState.prevDist = zoomState.smoothDist = null;
}

function resetPinch() {
  pinchState.dragging = false;
  pinchState.smoothX = pinchState.smoothY = null;
}

// ── EMIT ───────────────────────────────────────────────────────
function emit(cmd) {
  if (typeof window.onGestureCommand === 'function') {
    window.onGestureCommand(cmd);
  }
}

// ── HANDLERS ───────────────────────────────────────────────────
function handleOrbit(lm) {
  const s = orbitState;
  // Dùng landmark 9 — giữa lòng bàn tay, ổn định nhất
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
  const p    = pinchState;
  const rawX = (lm[4].x + lm[8].x) / 2;
  const rawY = (lm[4].y + lm[8].y) / 2;
  p.smoothX  = ema(p.smoothX, rawX);
  p.smoothY  = ema(p.smoothY, rawY);

  if (!p.dragging) {
    p.dragging = true;
    emit({ state: 'DRAG_START', x: p.smoothX, y: p.smoothY });
  } else {
    emit({ state: 'DRAG', x: p.smoothX, y: p.smoothY });
  }
}

function handlePinchEnd() {
  if (!pinchState.dragging) return;
  emit({ state: 'DRAG_END' });
  resetPinch();
}

// ── PROCESS FRAME ──────────────────────────────────────────────
function processFrame({ multiHandLandmarks }) {
  if (typeof window.drawLandmarks === 'function') {
    window.drawLandmarks(multiHandLandmarks);
  }

  const hands = multiHandLandmarks;

  if (!hands?.length) {
    handlePinchEnd();
    resetOrbit();
    resetZoom();
    emit({ state: 'IDLE' });
    return;
  }

  const lm = hands[0];

  // ZOOM: 2 tay pinch — check trước
  if (hands.length === 2 && isPinch(hands[0]) && isPinch(hands[1])) {
    resetOrbit();
    resetPinch();
    const z   = zoomState;
    const p1  = { x: (hands[0][4].x + hands[0][8].x) / 2, y: (hands[0][4].y + hands[0][8].y) / 2 };
    const p2  = { x: (hands[1][4].x + hands[1][8].x) / 2, y: (hands[1][4].y + hands[1][8].y) / 2 };
    const raw = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    z.smoothDist = ema(z.smoothDist, raw);
    if (z.prevDist !== null) {
      const delta = z.smoothDist - z.prevDist;
      if (Math.abs(delta) > DEAD_ZONE) emit({ state: 'ZOOM', zoomDelta: delta });
    }
    z.prevDist = z.smoothDist;
    return;
  }
  resetZoom();

  // ORBIT: open palm — 4 ngón duỗi, không pinch
  if (hands.length === 1 && isOpenPalm(lm)) {
    handlePinchEnd();
    handleOrbit(lm);
    return;
  }
  resetOrbit();

  // PINCH: 1 tay pinch → drag
  if (hands.length === 1 && isPinch(lm)) {
    handlePinch(lm);
    return;
  }

  handlePinchEnd();
  emit({ state: 'IDLE' });
}

// ── SETUP ──────────────────────────────────────────────────────
export async function setupGesture(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  videoEl.srcObject = stream;
  await new Promise(r => videoEl.onloadedmetadata = r);

  await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
  await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');

  const hands = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
  });
  hands.setOptions({
    maxNumHands:            2,
    modelComplexity:        1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence:  0.6,
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
    s.src = src; s.onload = resolve;
    document.head.appendChild(s);
  });
}