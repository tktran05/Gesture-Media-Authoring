// Nhận diện cử chỉ tay (MediaPipe Hands) → phát lệnh qua callback onCommand.
// Có EMA smoothing + hysteresis pinch để ổn định, chống nhấp nháy.

const EMA_ALPHA = 0.65;   // smoothing (cao hơn = phản hồi nhanh hơn)
const DEAD_ZONE = 0.003;  // ngưỡng tối thiểu để tính là có di chuyển

// Ngưỡng pinch có hysteresis: vào dễ hơn thoát
const PINCH_ENTER = 0.060;  // khoảng cách để BẮT ĐẦU pinch
const PINCH_EXIT  = 0.115;  // khoảng cách để KẾT THÚC pinch (bám chắc hơn)

const DRAG_EXIT_FRAMES = 2; // số frame không-pinch liên tiếp để kết thúc drag

// MediaPipe trả handedness GIẢ ĐỊNH ảnh đã lật (selfie); webcam gửi ảnh GỐC nên
// nhãn bị đảo so với tay thật → swap. Nếu thấy ngược (tay PHẢI focus), đổi false.
const SWAP_HANDEDNESS = true;

// ── MATH / DETECTORS ───────────────────────────────────────────
function dist(lm, a, b) {
  return Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
}

function pinchDist(lm)   { return dist(lm, 4, 8); }
function pinchCenter(lm) { return { x: (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2 }; }
function ema(prev, val)  { return prev === null ? val : EMA_ALPHA * val + (1 - EMA_ALPHA) * prev; }

// 4 ngón (trừ cái) đều DUỖI và ngón cái không chạm ngón trỏ
function isOpenPalm(lm) {
  return (
    dist(lm, 8,  5) > dist(lm, 6,  5) * 1.3 &&
    dist(lm, 12, 9) > dist(lm, 10, 9) * 1.3 &&
    dist(lm, 16,13) > dist(lm, 14,13) * 1.3 &&
    dist(lm, 20,17) > dist(lm, 18,17) * 1.3 &&
    dist(lm, 4,  8) > 0.08
  );
}

// 4 ngón (trừ cái) đều CO. Khoảng [1.1, 1.3] giữa fist/palm = vùng trung tính.
function isFist(lm) {
  return (
    dist(lm, 8,  5) < dist(lm, 6,  5) * 1.1 &&
    dist(lm, 12, 9) < dist(lm, 10, 9) * 1.1 &&
    dist(lm, 16,13) < dist(lm, 14,13) * 1.1 &&
    dist(lm, 20,17) < dist(lm, 18,17) * 1.1
  );
}

// Nhãn tay THẬT của người dùng (xem SWAP_HANDEDNESS)
function handLabel(entry) {
  const raw = entry?.label ?? 'Right';
  return SWAP_HANDEDNESS ? (raw === 'Left' ? 'Right' : 'Left') : raw;
}

// ── STATE ──────────────────────────────────────────────────────
const orbitState = { prevX: null, prevY: null, smoothX: null, smoothY: null };
const zoomState  = { prevDist: null, smoothDist: null };
const pinchState = { active: false, exitCount: 0, smoothX: null, smoothY: null }; // drag
const focusState = { active: false, smoothX: null, smoothY: null };               // focus (tay trái)

function resetOrbit() {
  orbitState.prevX = orbitState.prevY = orbitState.smoothX = orbitState.smoothY = null;
}
function resetZoom() {
  zoomState.prevDist = zoomState.smoothDist = null;
}
function resetFocusPinch() {
  focusState.active  = false;
  focusState.smoothX = focusState.smoothY = null;
}
// Kết thúc drag ngay (emit DRAG_END nếu đang drag)
function forceEndPinch() {
  if (pinchState.active) emit({ state: 'DRAG_END' });
  pinchState.active    = false;
  pinchState.exitCount = 0;
  pinchState.smoothX   = pinchState.smoothY = null;
}
function resetAll() {
  forceEndPinch();
  resetOrbit();
  resetZoom();
  resetFocusPinch();
}

// ── COMMAND EMISSION ───────────────────────────────────────────
let onCommand   = () => {};
let onLandmarks = () => {};
function emit(cmd) { onCommand(cmd); }        // ≡ main.onCommand({state:'ORBIT', dx:0.012, dy:-0.003})


// ── GESTURE HANDLERS (mỗi cái cập nhật state + emit lệnh) ──────
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
  const p = pinchState;
  const c = pinchCenter(lm);
  p.smoothX = ema(p.smoothX, c.x);
  p.smoothY = ema(p.smoothY, c.y);
  p.exitCount = 0;
  emit({ state: p.active ? 'DRAG' : 'DRAG_START', x: p.smoothX, y: p.smoothY });
  p.active = true;
}

// Pinch tay TRÁI → PLANET_FOCUS. phase 'start' (frame đầu) = raycast chọn hành tinh.
function handleFocusPinch(lm) {
  const f = focusState;
  const c = pinchCenter(lm);
  f.smoothX = ema(f.smoothX, c.x);
  f.smoothY = ema(f.smoothY, c.y);
  emit({
    state: 'PLANET_FOCUS',
    phase: f.active ? 'move' : 'start',
    x: f.smoothX,
    y: f.smoothY,
  });
  f.active = true;
}

// Không thoát drag ngay — đếm đủ DRAG_EXIT_FRAMES mới kết thúc (chống rớt frame)
function tryEndPinch() {
  if (!pinchState.active) return;
  pinchState.exitCount++;
  if (pinchState.exitCount >= DRAG_EXIT_FRAMES) forceEndPinch();
}

// ── ROUTING THEO TỪNG NHÓM CỬ CHỈ (trả true nếu đã xử lý xong frame) ──
function handleTwoHandZoom(hands) {
  if (pinchDist(hands[0]) >= PINCH_EXIT || pinchDist(hands[1]) >= PINCH_EXIT) return false;

  resetOrbit();
  forceEndPinch();
  resetFocusPinch();

  const c1 = pinchCenter(hands[0]);
  const c2 = pinchCenter(hands[1]);
  const raw = Math.hypot(c1.x - c2.x, c1.y - c2.y);
  const z = zoomState;
  z.smoothDist = ema(z.smoothDist, raw);
  if (z.prevDist !== null) {
    const delta = z.smoothDist - z.prevDist;
    if (Math.abs(delta) > DEAD_ZONE) emit({ state: 'ZOOM', zoomDelta: delta });
  }
  z.prevDist = z.smoothDist;
  return true;
}

function handleLeftHand(lm) {
  forceEndPinch(); // dọn drag tay phải còn sót khi đổi sang tay trái
  if (isFist(lm)) {
    resetOrbit();
    resetFocusPinch();
    emit({ state: 'FOCUS_RESET' });
    return true;
  }
  const threshold = focusState.active ? PINCH_EXIT : PINCH_ENTER;
  if (pinchDist(lm) < threshold) {
    resetOrbit();
    handleFocusPinch(lm);
    return true;
  }
  resetFocusPinch();
  return false; // tay trái mở → để ORBIT xử lý
}

function handleRightHand(lm, handCount) {
  resetFocusPinch();
  const threshold = pinchState.active ? PINCH_EXIT : PINCH_ENTER;
  if (handCount === 1 && pinchDist(lm) < threshold) {
    resetOrbit();
    handlePinch(lm);
    return true;
  }
  tryEndPinch();
  return false;
}

// ── PROCESS FRAME (luồng cử chỉ chính, đọc từ trên xuống) ──────
function processFrame(results) {
  const hands = results.multiHandLandmarks ?? [];
  onLandmarks(hands);

  if (hands.length === 0) {
    resetAll();
    emit({ state: 'IDLE' });
    return;
  }

  // Ưu tiên: 2 tay pinch = ZOOM
  if (hands.length === 2 && handleTwoHandZoom(hands)) return;
  resetZoom();

  const lm = hands[0];
  const isLeftHand = handLabel(results.multiHandedness?.[0]) === 'Left';

  if (hands.length === 1 && isLeftHand) {
    if (handleLeftHand(lm)) return;   // nắm tay = reset, pinch = focus
  } else {
    if (handleRightHand(lm, hands.length)) return; // pinch = drag
  }

  // ORBIT: lòng bàn tay mở (chỉ khi không drag/không focus-pinch)
  if (!pinchState.active && !focusState.active && hands.length === 1 && isOpenPalm(lm)) {
    handleOrbit(lm);
    return;
  }
  resetOrbit();

  if (!pinchState.active) emit({ state: 'IDLE' });
}

// ── SETUP ──────────────────────────────────────────────────────
export async function setupGesture(videoEl, handlers = {}) {
  onCommand   = handlers.onCommand   ?? (() => {});
  onLandmarks = handlers.onLandmarks ?? (() => {});

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
