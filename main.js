import * as THREE from 'three';
import { createScene } from './src/scene.js';
import { setupGesture } from './src/gesture.js';
import { createDragController } from './src/drag.js';
import { createFocusController } from './src/focus.js';
import { createHandOverlay } from './src/overlay.js';

// ── KHỞI TẠO ──────────────────────────────────────────────────
const { scene, camera, renderer, controls, composer, planets } = createScene();

const drag    = createDragController({ scene, camera, planets });
const focus   = createFocusController({ camera, controls, planets });
const overlay = createHandOverlay(document.getElementById('overlay'));

const clock       = new THREE.Clock();
const statusLabel = document.getElementById('gesture-label');

// ── CỬ CHỈ CAMERA (orbit / zoom quanh controls.target) ────────
const ZOOM_MIN = 8;
const ZOOM_MAX = 200;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function orbitCamera(dx, dy) {
  const spherical = new THREE.Spherical().setFromVector3(
    camera.position.clone().sub(controls.target)
  );
  spherical.theta += dx * 5;
  spherical.phi = clamp(spherical.phi - dy * 5, 0.05, Math.PI - 0.05);
  camera.position.setFromSpherical(spherical).add(controls.target);
  camera.lookAt(controls.target);
}

function zoomCamera(zoomDelta) {
  const dir     = camera.position.clone().sub(controls.target).normalize();
  const newDist = clamp(camera.position.distanceTo(controls.target) - zoomDelta * 40, ZOOM_MIN, ZOOM_MAX);
  camera.position.copy(controls.target).addScaledVector(dir, newDist);
}

// ── ĐỊNH TUYẾN LỆNH CỬ CHỈ ────────────────────────────────────
function onCommand(cmd) {
  statusLabel.textContent = cmd.state;

  switch (cmd.state) {
    case 'ORBIT': orbitCamera(cmd.dx, cmd.dy); break;
    case 'ZOOM':  zoomCamera(cmd.zoomDelta);   break;

    case 'DRAG_START':
    case 'DRAG':
    case 'DRAG_END':
      drag.onCommand(cmd);
      break;

    case 'PLANET_FOCUS':
      if (cmd.phase === 'start') focus.focusAtScreen(cmd.x, cmd.y);
      break;

    case 'FOCUS_RESET':
      focus.reset();
      break;
  }
}

// ── VÒNG LẶP RENDER ───────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // Quỹ đạo + tự xoay; bỏ qua quỹ đạo của hành tinh đang bị kéo
  const dragged = drag.getDraggedPlanet();
  for (const p of planets) {
    if (p !== dragged) p.pivot.rotation.y += p.orbitSpeed * dt;
    p.mesh.rotation.y += p.data.selfRotation * dt;
  }

  focus.update();
  controls.update();
  composer.render();
}
animate();

// ── RESIZE (overlay tự lo kích thước của nó) ──────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ── NHẠC NỀN (loop vô hạn) ────────────────────────────────────
function startMusic() {
  const bgm = new Audio('/textures/interstellar.mp3');
  bgm.loop   = true;
  bgm.volume = 0.6;
  // Tự phát; nếu trình duyệt chặn autoplay → phát ở lần tương tác đầu tiên
  bgm.play().catch(() => {
    const start = () => {
      bgm.play();
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
  });
}
startMusic();

// ── KHỞI ĐỘNG GESTURE ─────────────────────────────────────────
setupGesture(document.getElementById('webcam'), {
  onCommand,
  onLandmarks: overlay.draw,
});
