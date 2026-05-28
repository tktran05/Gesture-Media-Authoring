import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// ── CẤU HÌNH HÀNH TINH (nguồn dữ liệu duy nhất) ────────────────
// speed: tốc độ quỹ đạo (rad/s) — tỉ lệ Kepler: gần mặt trời = nhanh hơn
const PLANETS = [
  { name: 'Mercury', size: 0.5,  dist: 8,  speed: 0.80, selfRotation: 0.30, initialAngle: 2.1,  texture: 'mercury.jpg', roughness: 1,    metalness: 0.02 },
  { name: 'Venus',   size: 0.9,  dist: 11, speed: 0.50, selfRotation: 0.20, initialAngle: 4.8,  texture: 'venus.jpg',   roughness: 0.6,  metalness: 0.05 },
  { name: 'Earth',   size: 1,    dist: 15, speed: 0.40, selfRotation: 1.50, initialAngle: 3.45, texture: 'earth.jpg',   roughness: 0.5,  metalness: 0.01 },
  { name: 'Mars',    size: 0.8,  dist: 19, speed: 0.30, selfRotation: 1.40, initialAngle: 0.9,  texture: 'mars.jpg',    roughness: 0.75, metalness: 0.02 },
  { name: 'Jupiter', size: 2,    dist: 25, speed: 0.20, selfRotation: 3.00, initialAngle: 2.7,  texture: 'jupiter.jpg', roughness: 0.9,  metalness: 0.0  },
  { name: 'Saturn',  size: 1.7,  dist: 31, speed: 0.15, selfRotation: 2.80, initialAngle: 5.8,  texture: 'saturn.jpg',  roughness: 0.9,  metalness: 0.0, hasRings: true },
  { name: 'Uranus',  size: 1.2,  dist: 37, speed: 0.10, selfRotation: 2.00, initialAngle: 1.2,  texture: 'uranus.jpg',  roughness: 0.85, metalness: 0.0 },
  { name: 'Neptune', size: 1.1,  dist: 42, speed: 0.08, selfRotation: 1.80, initialAngle: 6.1,  texture: 'neptune.jpg', roughness: 0.85, metalness: 0.0 },
];

const loader = new THREE.TextureLoader();
const tex = (file) => loader.load(`/textures/${file}`);

// ── DỰNG TOÀN BỘ SCENE ─────────────────────────────────────────
export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000814);
  scene.fog = new THREE.Fog(0x000814, 180, 250);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 30, 70);

  const renderer = createRenderer();
  const controls = createControls(camera, renderer);

  addLights(scene);
  addSky(scene);
  addSun(scene);

  const planets = PLANETS.map(body => {
    const entry = createPlanet(body);
    scene.add(entry.pivot);
    scene.add(createOrbitRing(body));
    return entry;
  });

  const composer = createComposer(renderer, scene, camera);

  return { scene, camera, renderer, controls, composer, planets };
}

// ── HELPERS ────────────────────────────────────────────────────
function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);
  return renderer;
}

function createControls(camera, renderer) {
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.3;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.5;
  controls.minDistance = 8;
  controls.maxDistance = 200;
  controls.target.set(0, 0, 0);
  return controls;
}

function addLights(scene) {
  scene.add(new THREE.AmbientLight(new THREE.Color(0.13, 0.13, 0.13), 0.5));

  const sunLight = new THREE.PointLight(new THREE.Color(1.0, 1.0, 1.0), 10.0, 1000, 0.5);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);

  const fillLight = new THREE.PointLight(new THREE.Color(0.2, 0.4, 1.0), 2.0, 100, 1);
  fillLight.position.set(50, 50, -100);
  scene.add(fillLight);
}

function addSky(scene) {
  const stars = new THREE.Mesh(
    new THREE.SphereGeometry(200, 64, 64),
    new THREE.MeshBasicMaterial({
      map: tex('8k_stars.jpg'),
      side: THREE.BackSide,
      toneMapped: false,
      color: new THREE.Color(1.2, 1.2, 1.2),
    })
  );
  scene.add(stars);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(190, 64, 64),
    new THREE.MeshBasicMaterial({
      map: tex('stars.jpg'),
      side: THREE.BackSide,
      toneMapped: false,
      transparent: true,
      opacity: 0.3,
      color: new THREE.Color(0.8, 0.9, 1.0),
    })
  );
  scene.add(sky);
}

function addSun(scene) {
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(5, 64, 64),
    new THREE.MeshBasicMaterial({
      map: tex('sun.jpg'),
      toneMapped: false,
      color: new THREE.Color(1.2, 1.1, 0.9),
    })
  );

  const lensflare = new Lensflare();
  lensflare.addElement(new LensflareElement(tex('lensflare0.png'), 512, 0,   new THREE.Color(1, 0.9, 0.8)));
  lensflare.addElement(new LensflareElement(tex('lensflare2.png'), 128, 0.2, new THREE.Color(1, 1, 0.6)));
  lensflare.addElement(new LensflareElement(tex('lensflare2.png'),  64, 0.4, new THREE.Color(0.8, 0.8, 1)));
  lensflare.addElement(new LensflareElement(tex('lensflare2.png'),  32, 0.6, new THREE.Color(1, 0.8, 0.6)));
  sun.add(lensflare);

  scene.add(sun);
  return sun;
}

// Tạo 1 hành tinh: mesh (+ nhãn, + vành nếu có) gắn trong pivot xoay quanh mặt trời
function createPlanet(body) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(body.size, 64, 64),
    new THREE.MeshStandardMaterial({
      map:       tex(body.texture),
      roughness: body.roughness,
      metalness: body.metalness,
      emissive:  new THREE.Color(0, 0, 0),
    })
  );
  mesh.castShadow    = true;
  mesh.receiveShadow = true;
  mesh.userData      = { name: body.name };
  mesh.add(createLabel(body));
  if (body.hasRings) mesh.add(createRings(body));

  const pivot = new THREE.Object3D();
  pivot.add(mesh);
  mesh.position.x  = body.dist;
  pivot.rotation.y = body.initialAngle;

  return { mesh, pivot, data: body, orbitSpeed: body.speed };
}

// Nhãn tên — Sprite tự BILLBOARD (luôn hướng camera). Ẩn sẵn, focus mới bật.
function createLabel(body) {
  const label = new SpriteText(body.name);
  label.color      = '#ffffff';
  label.textHeight = body.size * 0.8;
  label.fontWeight = '150';
  label.position.set(0, body.size * 1.8, 0); // trục Y bất biến dưới self-rotation
  label.visible    = false;
  return label;
}

function createRings(body) {
  const ringTex = tex('saturn_ring.png');
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(body.size + 0.5, body.size + 1.2, 64),
    new THREE.MeshBasicMaterial({
      map: ringTex, alphaMap: ringTex,
      side: THREE.DoubleSide, transparent: true, opacity: 0.5,
    })
  );
  ring.rotation.x = Math.PI / 2;
  return ring;
}

// Vòng quỹ đạo phẳng dưới mặt phẳng XZ; màu theo khoảng cách
function createOrbitRing(body) {
  let color;
  if (body.dist < 20)      color = new THREE.Color(0.3, 0.6, 1.0);
  else if (body.dist < 35) color = new THREE.Color(0.6, 0.4, 1.0);
  else                     color = new THREE.Color(1.0, 0.4, 0.5);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(body.dist - 0.05, body.dist + 0.05, 128),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.6, toneMapped: false })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.01;
  return ring;
}

function createComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.2, 0.1
  ));
  composer.addPass(new OutputPass());
  return composer;
}
