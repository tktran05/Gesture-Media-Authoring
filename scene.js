import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

// ── Scene setup ──────────────────────────────────────────────
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x1a1a2e);
document.body.appendChild(renderer.domElement);

camera.position.set(0, 2, 8);
camera.lookAt(0, 0, 0);

// ── Lighting ─────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

// ── 3 Objects ────────────────────────────────────────────────
const box = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshLambertMaterial({ color: 0x6c63ff })
);
box.position.set(-3, 0, 0);
scene.add(box);

const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(0.6, 32, 32),
  new THREE.MeshLambertMaterial({ color: 0x00d4aa })
);
sphere.position.set(0, 0, 0);
scene.add(sphere);

const cone = new THREE.Mesh(
  new THREE.ConeGeometry(0.6, 1.2, 4),   // 4 mặt = hình kim tự tháp / tam giác 3D
  new THREE.MeshLambertMaterial({ color: 0xff6b6b })
);
cone.position.set(3, 0, 0);
scene.add(cone);

// ── Selected object ───────────────────────────────────────────
let selected = box;  // mặc định chọn box

// ── Transform API ─────────────────────────────────────────────
// Đây là các hàm Member A sẽ gọi khi tích hợp gesture

export function moveObject(dx, dy, dz) {
  selected.position.x += dx;
  selected.position.y += dy;
  selected.position.z += dz;
}

export function scaleObject(delta) {
  const s = selected.scale.x + delta;
  selected.scale.setScalar(Math.max(0.2, Math.min(5, s)));
}

export function selectObject(obj) {
  selected = obj;
}

// ── Keyboard state ────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key] = true;

  // Chọn object bằng phím 1 2 3
  if (e.key === '1') selectObject(box);
  if (e.key === '2') selectObject(sphere);
  if (e.key === '3') selectObject(cone);
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

const SPEED = 0.05;
const SCALE = 0.02;

function handleKeys() {
  if (keys['ArrowLeft']  || keys['a']) moveObject(-SPEED, 0, 0);
  if (keys['ArrowRight'] || keys['d']) moveObject( SPEED, 0, 0);
  if (keys['ArrowUp']    || keys['w']) moveObject(0,  SPEED, 0);
  if (keys['ArrowDown']  || keys['s']) moveObject(0, -SPEED, 0);
  if (keys['+'] || keys['='])          scaleObject( SCALE);
  if (keys['-'])                        scaleObject(-SCALE);
}

// ── Animation loop ────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  handleKeys();
  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Export objects để main.js có thể dùng nếu cần
export { box, sphere, cone, scene, camera, renderer };
