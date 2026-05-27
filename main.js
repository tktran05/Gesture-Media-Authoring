import * as THREE from 'three';
import { initSolarSystem } from './scene.js';
import { setupGesture } from './gesture.js';

// ── KHỞI TẠO SCENE ────────────────────────────────────────────
const { scene, camera, renderer, controls, sun, composer, planetMeshes } = initSolarSystem();

// Danh sách object có thể chọn: hành tinh + mặt trời
const selectables = [...planetMeshes.map(p => p.mesh), sun];

// ── DRAG STATE ────────────────────────────────────────────────
const raycaster    = new THREE.Raycaster();
const dragPlane    = new THREE.Plane();
const dragNormal   = new THREE.Vector3();
const dragTarget   = new THREE.Vector3(); // vị trí đích (cập nhật mỗi frame tay)

let selectedMesh = null;
let isDragging   = false;

// Chuyển tọa độ tay (0–1, đã mirror) sang NDC Three.js (–1 đến 1)
function toNDC(x, y) {
  return new THREE.Vector2((1 - x) * 2 - 1, -(y * 2 - 1));
}

function highlight(mesh, on) {
  if (mesh?.material?.emissive) {
    mesh.material.emissive.setHex(on ? 0x221100 : 0x000000);
  }
}

function trySelect(handX, handY) {
  raycaster.setFromCamera(toNDC(handX, handY), camera);
  const hits = raycaster.intersectObjects(selectables, false);
  highlight(selectedMesh, false);
  selectedMesh = hits.length > 0 ? hits[0].object : null;
  highlight(selectedMesh, true);
}

function startDrag() {
  if (!selectedMesh) return;

  // Reparent về scene để di chuyển tự do trong không gian thế giới
  if (selectedMesh.parent !== scene) {
    const worldPos = new THREE.Vector3();
    selectedMesh.getWorldPosition(worldPos);
    selectedMesh.parent.remove(selectedMesh);
    scene.add(selectedMesh);
    selectedMesh.position.copy(worldPos);
  }

  // Khởi tạo dragTarget tại vị trí hiện tại để không bị giật lúc bắt đầu
  dragTarget.copy(selectedMesh.position);

  // Mặt phẳng kéo thả vuông góc với hướng camera, đi qua object
  camera.getWorldDirection(dragNormal);
  dragPlane.setFromNormalAndCoplanarPoint(dragNormal, selectedMesh.position);
  isDragging = true;
}

function applyDrag(handX, handY) {
  if (!selectedMesh || !isDragging) return;
  raycaster.setFromCamera(toNDC(handX, handY), camera);

  // Cập nhật vị trí đích — object sẽ lerp tới đây trong animate()
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(dragPlane, hit)) {
    dragTarget.copy(hit);
  }
}

function stopDrag() {
  highlight(selectedMesh, false);
  isDragging   = false;
  selectedMesh = null;
}

// ── XỬ LÝ LỆNH CỬ CHỈ ────────────────────────────────────────
window.onGestureCommand = function(cmd) {
  document.getElementById('gesture-label').textContent = cmd.state;

  switch (cmd.state) {
    case 'ORBIT': {
      // Xoay camera quanh mặt trời bằng lòng bàn tay mở
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
      // Zoom bằng 2 tay pinch
      const dir     = camera.position.clone().sub(controls.target).normalize();
      const dist    = camera.position.distanceTo(controls.target);
      const newDist = Math.max(8, Math.min(200, dist - cmd.zoomDelta * 20));
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

    case 'DRAG_END':
      stopDrag();
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
// MAX_STEP: giới hạn bước nhảy tối đa 1 frame để tránh teleport khi tay giật
const MAX_STEP = 3;

function animate() {
  requestAnimationFrame(animate);

  // Copy trực tiếp → object đi cùng tốc độ với tay, không bị tụt hậu
  if (isDragging && selectedMesh) {
    const step = dragTarget.clone().sub(selectedMesh.position);
    if (step.length() > MAX_STEP) step.setLength(MAX_STEP);
    selectedMesh.position.add(step);
  }

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
