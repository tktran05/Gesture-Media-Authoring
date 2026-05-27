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

    case 'DRAG_END': {
      if (isDragging && selectedMesh) {
        const entry = planetMeshes.find(p => p.mesh === selectedMesh);
        if (entry) snapToNearestOrbit(entry);
      }
      stopDrag();
      break;
    }
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

  // Cập nhật quỹ đạo cho tất cả hành tinh trừ hành tinh đang kéo
  const dragging = isDragging ? planetMeshes.find(p => p.mesh === selectedMesh) : null;
  for (const p of planetMeshes) {
    if (p !== dragging) {
      p.pivot.rotation.y += p.orbitSpeed * delta;
    }
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
