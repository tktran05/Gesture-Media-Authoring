import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export function initSolarSystem() {
  // ── SCENE & CAMERA ─────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000814);
  scene.fog = new THREE.Fog(0x000814, 180, 250);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 30, 70);

  // ── RENDERER ───────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  // ── CONTROLS ───────────────────────────────────────────────
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.3;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.5;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.enableRotate = true;
  controls.minDistance = 8;
  controls.maxDistance = 200;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.autoRotate = false;
  controls.target.set(0, 0, 0);

  // ── TEXTURE LOADER ─────────────────────────────────────────
  const loader = new THREE.TextureLoader();

  // ── LIGHTING ───────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(new THREE.Color(0.13, 0.13, 0.13), 0.5));

  const pointLight = new THREE.PointLight(new THREE.Color(1.0, 1.0, 1.0), 10.0, 1000, 0.5);
  pointLight.position.set(0, 0, 0);
  scene.add(pointLight);

  const fillLight = new THREE.PointLight(new THREE.Color(0.2, 0.4, 1.0), 2.0, 100, 1);
  fillLight.position.set(50, 50, -100);
  scene.add(fillLight);

  // ── STARFIELD ──────────────────────────────────────────────
  const starGeo = new THREE.SphereGeometry(200, 64, 64);
  const starMat = new THREE.MeshBasicMaterial({
    map: loader.load('/textures/8k_stars.jpg'),
    side: THREE.BackSide,
    toneMapped: false,
    color: new THREE.Color(1.2, 1.2, 1.2),
  });
  scene.add(new THREE.Mesh(starGeo, starMat));

  const skyGeo = new THREE.SphereGeometry(190, 64, 64);
  const skyMat = new THREE.MeshBasicMaterial({
    map: loader.load('/textures/stars.jpg'),
    side: THREE.BackSide,
    toneMapped: false,
    transparent: true,
    opacity: 0.3,
    color: new THREE.Color(0.8, 0.9, 1.0),
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // ── SUN ────────────────────────────────────────────────────
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(5, 64, 64),
    new THREE.MeshBasicMaterial({
      map: loader.load('/textures/sun.jpg'),
      toneMapped: false,
      color: new THREE.Color(1.2, 1.1, 0.9),
    })
  );
  scene.add(sun);

  const lensflare = new Lensflare();
  lensflare.addElement(new LensflareElement(loader.load('/textures/lensflare0.png'), 512, 0,   new THREE.Color(1, 0.9, 0.8)));
  lensflare.addElement(new LensflareElement(loader.load('/textures/lensflare2.png'), 128, 0.2, new THREE.Color(1, 1, 0.6)));
  lensflare.addElement(new LensflareElement(loader.load('/textures/lensflare2.png'),  64, 0.4, new THREE.Color(0.8, 0.8, 1)));
  lensflare.addElement(new LensflareElement(loader.load('/textures/lensflare2.png'),  32, 0.6, new THREE.Color(1, 0.8, 0.6)));
  sun.add(lensflare);

  // ── PLANETS ────────────────────────────────────────────────
  const PLANETS = [
    { name: 'Mercury', size: 0.5,  dist: 8,  initialAngle: 2.1,  texture: 'mercury.jpg', roughness: 1,    metalness: 0.02 },
    { name: 'Venus',   size: 0.9,  dist: 11, initialAngle: 4.8,  texture: 'venus.jpg',   roughness: 0.6,  metalness: 0.05 },
    { name: 'Earth',   size: 1,    dist: 15, initialAngle: 3.45, texture: 'earth.jpg',   roughness: 0.5,  metalness: 0.01 },
    { name: 'Mars',    size: 0.8,  dist: 19, initialAngle: 0.9,  texture: 'mars.jpg',    roughness: 0.75, metalness: 0.02 },
    { name: 'Jupiter', size: 2,    dist: 25, initialAngle: 2.7,  texture: 'jupiter.jpg', roughness: 0.9,  metalness: 0.0  },
    { name: 'Saturn',  size: 1.7,  dist: 31, initialAngle: 5.8,  texture: 'saturn.jpg',  roughness: 0.9,  metalness: 0.0, hasRings: true },
    { name: 'Uranus',  size: 1.2,  dist: 37, initialAngle: 1.2,  texture: 'uranus.jpg',  roughness: 0.85, metalness: 0.0 },
    { name: 'Neptune', size: 1.1,  dist: 42, initialAngle: 6.1,  texture: 'neptune.jpg', roughness: 0.85, metalness: 0.0 },
  ];

  const planetMeshes = [];

  PLANETS.forEach(body => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(body.size, 64, 64),
      new THREE.MeshStandardMaterial({
        map:       loader.load(`/textures/${body.texture}`),
        roughness: body.roughness,
        metalness: body.metalness,
        emissive:  new THREE.Color(0, 0, 0),
      })
    );
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.userData      = { name: body.name };

    const pivot = new THREE.Object3D();
    pivot.add(mesh);
    mesh.position.x  = body.dist;
    pivot.rotation.y = body.initialAngle;
    scene.add(pivot);

    if (body.hasRings) {
      const ringTex = loader.load('/textures/saturn_ring.png');
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(body.size + 0.5, body.size + 1.2, 64),
        new THREE.MeshBasicMaterial({
          map: ringTex, alphaMap: ringTex,
          side: THREE.DoubleSide, transparent: true, opacity: 0.5,
        })
      );
      ring.rotation.x = Math.PI / 2;
      mesh.add(ring);
    }

    // Orbit ring
    let orbitColor, baseOpacity;
    if (body.dist < 20)      { orbitColor = new THREE.Color(0.3, 0.6, 1.0); baseOpacity = 0.6; }
    else if (body.dist < 35) { orbitColor = new THREE.Color(0.6, 0.4, 1.0); baseOpacity = 0.6; }
    else                     { orbitColor = new THREE.Color(1.0, 0.4, 0.5); baseOpacity = 0.6; }

    const orbit = new THREE.Mesh(
      new THREE.RingGeometry(body.dist - 0.05, body.dist + 0.05, 128),
      new THREE.MeshBasicMaterial({ color: orbitColor, side: THREE.DoubleSide, transparent: true, opacity: baseOpacity, toneMapped: false })
    );
    orbit.rotation.x = Math.PI / 2;
    orbit.position.y = -0.01;
    scene.add(orbit);

    planetMeshes.push({ mesh, pivot, data: body });
  });

  // ── POST-PROCESSING ────────────────────────────────────────
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.6, 0.05
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  return { scene, camera, renderer, controls, loader, sun, composer, bloomPass, planetMeshes };
}
