import * as THREE from 'three';
import { initSolarSystem } from './scene.js';
import { setupGesture } from './gesture.js';

// ── KHỞI TẠO SCENE ────────────────────────────────────────────
const { scene, camera, renderer, controls, composer, planetMeshes } = initSolarSystem();

// Mặt trời cố định — không nằm trong danh sách chọn được
const selectables = planetMeshes.map(p => p.mesh);

// Quỹ đạo: dist (bán kính) + speed (tốc độ, rad/s) — dùng để snap
const ORBITS = planetMeshes.map(p => ({ dist: p.data.dist, speed: p.data.speed }));

// Gán tốc độ quỹ đạo ban đầu cho từng hành tinh
planetMeshes.forEach(p => { p.orbitSpeed = p.data.speed; });

const clock = new THREE.Clock();

// ── DRAG STATE ────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();

let selectedMesh = null;
let isDragging   = false;
let lastDragX    = null;
let lastDragY    = null;

// ── FOCUS STATE (độc lập hoàn toàn với hệ drag ở trên) ────────
const FOCUS_LERP        = 0.08;   // tốc độ nội suy camera/target khi bay vào
const FOCUS_DIST_FACTOR = 4.5;    // khoảng cách camera = bán kính hành tinh * factor

let focusedMesh    = null;  // mesh hành tinh đang focus
let focusDistance  = 0;     // khoảng cách camera mong muốn tới mục tiêu
let focusReady     = false; // đã bay tới nơi → chuyển sang chế độ follow
let focusResetting = false; // đang bay về view ban đầu (nắm tay trái)

// Snapshot view ban đầu (overview, tâm = mặt trời) để nắm tay trái quay lại
const INITIAL_CAM_POS = camera.position.clone();
const INITIAL_TARGET  = controls.target.clone();

const _focusPos     = new THREE.Vector3(); // world pos mục tiêu (mỗi frame)
const _prevFocusPos = new THREE.Vector3(); // world pos frame trước (để follow)
const _focusDelta   = new THREE.Vector3(); // quãng mục tiêu đi giữa 2 frame

function toNDC(x, y) {
  return new THREE.Vector2((1 - x) * 2 - 1, -(y * 2 - 1));
}

function highlight(mesh, on) {
  if (mesh?.material?.emissive) {
    mesh.material.emissive.setHex(on ? 0x221100 : 0x000000);
  }
}

const _wPos = new THREE.Vector3();

function trySelect(handX, handY) {
  const ndc = toNDC(handX, handY);
  highlight(selectedMesh, false);

  // Thử raycast chính xác trước
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(selectables, false);
  if (hits.length > 0) {
    selectedMesh = hits[0].object;
    highlight(selectedMesh, true);
    return;
  }

  // Fallback: chọn hành tinh gần nhất trên màn hình trong ngưỡng 15% chiều ngang
  const THRESH = 0.15;
  let bestMesh = null;
  let bestDist = THRESH;
  for (const mesh of selectables) {
    mesh.getWorldPosition(_wPos);
    const p = _wPos.project(camera);
    const d = Math.hypot(p.x - ndc.x, p.y - ndc.y);
    if (d < bestDist) { bestDist = d; bestMesh = mesh; }
  }
  selectedMesh = bestMesh;
  highlight(selectedMesh, true);
}

function startDrag() {
  if (!selectedMesh) return;
  // Tách khỏi pivot để di chuyển tự do trong scene
  if (selectedMesh.parent !== scene) {
    const worldPos = new THREE.Vector3();
    selectedMesh.getWorldPosition(worldPos);
    selectedMesh.parent.remove(selectedMesh);
    scene.add(selectedMesh);
    selectedMesh.position.copy(worldPos);
  }
  lastDragX = lastDragY = null;
  isDragging = true;
}

function applyDrag(handX, handY) {
  if (!selectedMesh || !isDragging) return;
  if (lastDragX === null) { lastDragX = handX; lastDragY = handY; return; }

  const dx = handX - lastDragX;
  const dy = handY - lastDragY;
  lastDragX = handX;
  lastDragY = handY;

  const right  = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up     = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);

  // Projected depth → scale ổn định khi object di ngang (giống Blender)
  const dist  = camDir.dot(selectedMesh.position.clone().sub(camera.position));
  const scale = dist * 2 * Math.tan((camera.fov * Math.PI / 180) / 2);

  selectedMesh.position.addScaledVector(right, -dx * scale * camera.aspect);
  selectedMesh.position.addScaledVector(up,    -dy * scale);
}

// ── SNAP VỀ QUỸ ĐẠO GẦN NHẤT ────────────────────────────────
function snapToNearestOrbit(planetEntry) {
  const { mesh, pivot } = planetEntry;

  // Vị trí world hiện tại của hành tinh
  const wPos = new THREE.Vector3();
  mesh.getWorldPosition(wPos);

  // Khoảng cách XZ từ gốc tọa độ (mặt trời)
  const currentR = Math.sqrt(wPos.x * wPos.x + wPos.z * wPos.z);

  // Tìm quỹ đạo có bán kính gần nhất
  const nearest = ORBITS.reduce((best, o) =>
    Math.abs(o.dist - currentR) < Math.abs(best.dist - currentR) ? o : best
  );

  // Reparent về pivot của chính hành tinh đó
  scene.remove(mesh);
  pivot.add(mesh);

  // Căn chỉnh góc pivot theo hướng XZ hiện tại, snap distance về quỹ đạo
  pivot.rotation.y = Math.atan2(-wPos.z, wPos.x);
  mesh.position.set(nearest.dist, 0, 0); // về mặt phẳng quỹ đạo (y=0)

  // Gán tốc độ của quỹ đạo mới
  planetEntry.orbitSpeed = nearest.speed;
}

function stopDrag() {
  highlight(selectedMesh, false);
  isDragging   = false;
  selectedMesh = null;
  lastDragX    = lastDragY = null;
}

// ── FOCUS HELPERS ─────────────────────────────────────────────
// Raycast chọn HÀNH TINH để focus. Độc lập với drag (không đụng selectedMesh).
function pickPlanet(handX, handY) {
  const ndc = toNDC(handX, handY);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(selectables, false);
  if (hits.length > 0) return hits[0].object;

  // Fallback: hành tinh gần con trỏ nhất trên màn hình (ngưỡng 15%)
  const THRESH = 0.15;
  let best = null, bestDist = THRESH;
  for (const mesh of selectables) {
    mesh.getWorldPosition(_wPos);
    const p = _wPos.project(camera);
    const d = Math.hypot(p.x - ndc.x, p.y - ndc.y);
    if (d < bestDist) { bestDist = d; best = mesh; }
  }
  return best;
}

// Nhãn đang hiển thị (chỉ 1 cái mỗi lúc). Mặt trời không có nhãn → focus mặt trời = ẩn hết.
let visibleLabel = null;
function showLabelFor(mesh) {
  if (visibleLabel) visibleLabel.visible = false;
  const entry  = planetMeshes.find(p => p.mesh === mesh);
  visibleLabel = entry?.label ?? null;
  if (visibleLabel) visibleLabel.visible = true;
}

function enterFocus(mesh) {
  if (!mesh) return;
  focusResetting = false; // huỷ reset nếu đang bay về mà pinch hành tinh
  focusReady   = false;   // bay lại từ đầu (đổi mục tiêu cũng dùng)
  focusedMesh  = mesh;
  const radius = mesh.geometry?.parameters?.radius ?? 1;
  focusDistance = radius * FOCUS_DIST_FACTOR;
  showLabelFor(mesh);     // hiện nhãn hành tinh được focus (ẩn nhãn cũ)
}

// Nắm tay trái → bay về view ban đầu (overview, tâm = mặt trời)
function resetFocus() {
  focusedMesh    = null;  // ngừng bám hành tinh ngay
  focusReady     = false;
  focusResetting = true;
  showLabelFor(null);     // ẩn mọi nhãn
}

// Gọi mỗi frame trong render loop, TRƯỚC controls.update().
// Zoom vào hành tinh và bám theo. Nắm tay trái = bay về view ban đầu.
// Đổi hành tinh: pinch tay trái vào hành tinh khác.
function updateFocus() {
  // ── RESET: bay về view ban đầu (nắm tay trái) ──
  if (focusResetting) {
    controls.target.lerp(INITIAL_TARGET, FOCUS_LERP);
    camera.position.lerp(INITIAL_CAM_POS, FOCUS_LERP);
    if (controls.target.distanceTo(INITIAL_TARGET) < 0.05 &&
        camera.position.distanceTo(INITIAL_CAM_POS) < 0.05) {
      focusResetting = false;
    }
    return;
  }

  if (!focusedMesh) return;

  focusedMesh.getWorldPosition(_focusPos);

  if (!focusReady) {
    // PHA 1 — BAY VÀO: kéo target & camera về hành tinh theo focusDistance
    controls.target.lerp(_focusPos, FOCUS_LERP);
    const dir     = camera.position.clone().sub(controls.target).normalize();
    const desired = _focusPos.clone().add(dir.multiplyScalar(focusDistance));
    camera.position.lerp(desired, FOCUS_LERP);

    if (controls.target.distanceTo(_focusPos) < 0.15) {
      focusReady = true;
      controls.target.copy(_focusPos);    // snap nhỏ để tâm orbit khớp chính xác
      _prevFocusPos.copy(_focusPos);
    }
  } else {
    // PHA 2 — FOLLOW: dời camera + target đúng bằng quãng hành tinh đã đi.
    // Giữ nguyên góc orbit & khoảng cách zoom của người dùng (không ép lại),
    // nên hành tinh luôn ở tâm khi nó tiếp tục chạy quanh mặt trời.
    _focusDelta.copy(_focusPos).sub(_prevFocusPos);
    camera.position.add(_focusDelta);
    controls.target.copy(_focusPos);
    _prevFocusPos.copy(_focusPos);
  }
}

// ── XỬ LÝ LỆNH CỬ CHỈ ────────────────────────────────────────
window.onGestureCommand = function(cmd) {
  document.getElementById('gesture-label').textContent = cmd.state;

  switch (cmd.state) {
    case 'ORBIT': {
      controls.enabled = false;
      const spherical = new THREE.Spherical().setFromVector3(
        camera.position.clone().sub(controls.target)
      );
      spherical.theta += cmd.dx * 5;
      spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, spherical.phi - cmd.dy * 5));
      camera.position.setFromSpherical(spherical).add(controls.target);
      camera.lookAt(controls.target);
      controls.enabled = true;
      break;
    }

    case 'ZOOM': {
      const dir     = camera.position.clone().sub(controls.target).normalize();
      const dist    = camera.position.distanceTo(controls.target);
      const newDist = Math.max(8, Math.min(200, dist - cmd.zoomDelta * 40));
      camera.position.copy(controls.target).addScaledVector(dir, newDist);
      break;
    }

    case 'DRAG_START':
      trySelect(cmd.x, cmd.y);
      startDrag();
      break;

    case 'DRAG':
      applyDrag(cmd.x, cmd.y);
      break;

    case 'DRAG_END': {
      if (isDragging && selectedMesh) {
        const entry = planetMeshes.find(p => p.mesh === selectedMesh);
        if (entry) snapToNearestOrbit(entry);
      }
      stopDrag();
      break;
    }

    case 'PLANET_FOCUS': {
      // Chỉ raycast ở frame ĐẦU của lần pinch; frame sau để render loop bám theo.
      if (cmd.phase === 'start') {
        const hit = pickPlanet(cmd.x, cmd.y);
        if (hit) enterFocus(hit);
      }
      break;
    }

    case 'FOCUS_RESET':
      resetFocus();   // nắm tay trái → bay về view ban đầu (mặt trời)
      break;
  }
};

// ── VẼ LANDMARK BÀN TAY LÊN OVERLAY ──────────────────────────
const overlay = document.getElementById('overlay');
const ctx     = overlay.getContext('2d');
overlay.width  = window.innerWidth;
overlay.height = window.innerHeight;

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

const DOT_COLOR = [
  '#ffffff',
  '#ffaa00','#ffaa00','#ffaa00','#ffaa00',
  '#00d4aa','#00d4aa','#00d4aa','#00d4aa',
  '#6c63ff','#6c63ff','#6c63ff','#6c63ff',
  '#ff6b6b','#ff6b6b','#ff6b6b','#ff6b6b',
  '#ff69b4','#ff69b4','#ff69b4','#ff69b4',
];

window.drawLandmarks = function(hands) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!hands?.length) return;
  for (const lm of hands) {
    ctx.strokeStyle = 'rgba(150,150,255,0.5)';
    ctx.lineWidth   = 1.5;
    for (const [a, b] of CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo((1 - lm[a].x) * overlay.width, lm[a].y * overlay.height);
      ctx.lineTo((1 - lm[b].x) * overlay.width, lm[b].y * overlay.height);
      ctx.stroke();
    }
    for (const [i, pt] of lm.entries()) {
      const x = (1 - pt.x) * overlay.width;
      const y = pt.y * overlay.height;
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
};

// ── VÒNG LẶP RENDER ───────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  // Cập nhật quỹ đạo + tự xoay cho tất cả hành tinh
  const dragging = isDragging ? planetMeshes.find(p => p.mesh === selectedMesh) : null;
  for (const p of planetMeshes) {
    if (p !== dragging) {
      p.pivot.rotation.y += p.orbitSpeed * delta;       // xoay quanh mặt trời
    }
    p.mesh.rotation.y += p.data.selfRotation * delta;   // tự xoay quanh trục
  }

  updateFocus();

  controls.update();
  composer.render();
}
animate();

// ── RESIZE ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  overlay.width  = window.innerWidth;
  overlay.height = window.innerHeight;
});

// ── KHỞI ĐỘNG GESTURE ─────────────────────────────────────────
setupGesture(document.getElementById('webcam'));
