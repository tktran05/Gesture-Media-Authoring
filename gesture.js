// gesture.js — v2: hysteresis + temporal stability

const EMA_ALPHA = 0.65;   // smoothing (cao hơn = phản hồi nhanh hơn)
const DEAD_ZONE = 0.003;  // ngưỡng tối thiểu để tính là có di chuyển

// Ngưỡng pinch có hysteresis: vào dễ hơn thoát
const PINCH_ENTER = 0.060;  // khoảng cách để BẮT ĐẦU pinch
const PINCH_EXIT  = 0.115;  // khoảng cách để KẾT THÚC pinch (rộng hơn → bám chắc hơn)

// Số frame không-pinch liên tiếp cần thiết để thực sự kết thúc drag
const DRAG_EXIT_FRAMES = 2;

// Tay nào kích hoạt FOCUS. MediaPipe trả handedness GIẢ ĐỊNH ảnh đã lật (selfie);
// webcam ở đây gửi ảnh GỐC (chưa lật) nên nhãn bị đảo so với tay thật → swap lại.
// Nếu chạy thấy ngược (tay PHẢI lại focus), đổi thành false.
const SWAP_HANDEDNESS = true;

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

// Chuẩn hoá nhãn tay về tay THẬT của người dùng (xem SWAP_HANDEDNESS).
function handLabel(entry) {
  const raw = entry?.label ?? 'Right';
  if (!SWAP_HANDEDNESS) return raw;
  return raw === 'Left' ? 'Right' : 'Left';
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
// State riêng cho FOCUS (pinch tay trái) — tách khỏi drag để không ảnh hưởng nhau
const focusState = {
  active:  false,
  smoothX: null,
  smoothY: null,
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

function resetFocusPinch() {
  focusState.active  = false;
  focusState.smoothX = focusState.smoothY = null;
}

// Pinch tay TRÁI → PLANET_FOCUS. KHÔNG bao giờ emit DRAG_*.
// phase 'start' (frame đầu): main.js raycast chọn hành tinh.
// phase 'move'  (các frame sau): main.js đã bám theo hành tinh ở render loop.
function handleFocusPinch(lm) {
  const f = focusState;
  f.smoothX = ema(f.smoothX, (lm[4].x + lm[8].x) / 2);
  f.smoothY = ema(f.smoothY, (lm[4].y + lm[8].y) / 2);
  const starting = !f.active;
  f.active = true;
  emit({
    state:      'PLANET_FOCUS',
    phase:      starting ? 'start' : 'move',
    handedness: 'Left',
    x:          f.smoothX,
    y:          f.smoothY,
  });
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
function processFrame(results) {
  const hands = results.multiHandLandmarks;
  const handed = results.multiHandedness;

  if (typeof window.drawLandmarks === 'function') {
    window.drawLandmarks(hands);
  }

  // Không có tay — noHand:true để main.js biết mà đếm giờ thoát focus
  if (!hands?.length) {
    forceEndPinch();
    resetOrbit();
    resetZoom();
    resetFocusPinch();
    emit({ state: 'IDLE', noHand: true });
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
      resetFocusPinch();
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

  const label = handLabel(handed?.[0]);
  const dist  = pinchDist(lm);

  // ── PINCH TAY TRÁI → PLANET_FOCUS (không bao giờ drag) ─────
  if (hands.length === 1 && label === 'Left') {
    forceEndPinch(); // dọn drag tay phải còn sót khi đổi sang tay trái
    const threshold = focusState.active ? PINCH_EXIT : PINCH_ENTER;
    if (dist < threshold) {
      resetOrbit();
      handleFocusPinch(lm);
      return;
    }
    resetFocusPinch();
    // tay trái mở → rơi xuống xét ORBIT bên dưới
  } else {
    // ── PINCH TAY PHẢI → DRAG (giữ nguyên hành vi cũ) ────────
    resetFocusPinch();
    const threshold = pinchState.active ? PINCH_EXIT : PINCH_ENTER;
    if (hands.length === 1 && dist < threshold) {
      resetOrbit();
      handlePinch(lm);
      return;
    }
    // Không đủ điều kiện pinch → thử kết thúc drag (có độ trễ)
    tryEndPinch();
  }

  // ── ORBIT: lòng bàn tay mở (chỉ khi không drag/không focus-pinch) ──
  if (!pinchState.active && !focusState.active && hands.length === 1 && isOpenPalm(lm)) {
    handleOrbit(lm);
    return;
  }
  resetOrbit();

  if (!pinchState.active) emit({ state: 'IDLE', noHand: false });
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
