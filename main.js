import * as THREE from 'three';
import { createScene } from './src/scene.js';
import { setupGesture } from './src/gesture.js';
import { createDragController } from './src/drag.js';
import { createFocusController } from './src/focus.js';
import { createHandOverlay } from './src/overlay.js';
import { orbitCamera, zoomCamera } from './src/cameraGestures.js';
import { createExplosionManager } from './src/explosion.js';

const { scene, camera, renderer, controls, composer, planets } = createScene();

const drag    = createDragController({ scene, camera, planets });
const focus   = createFocusController({ camera, controls, planets });
const overlay = createHandOverlay(document.getElementById('overlay'));
const explosionManager = createExplosionManager(scene, camera);

const clock       = new THREE.Clock();
const statusLabel = document.getElementById('gesture-label');

function onCommand(cmd) {
  statusLabel.textContent = cmd.state;

  switch (cmd.state) {
    case 'ORBIT': orbitCamera(camera, controls, cmd.dx, cmd.dy); break;
    case 'ZOOM':  zoomCamera(camera, controls, cmd.zoomDelta);   break;

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

    case 'EXPLODE_PREPARE':
    case 'EXPLODE_CANCEL':
      drag.onCommand(cmd);
      break;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  const dragged = drag.getDraggedPlanet();
  for (const p of planets) {
    if (p !== dragged) p.pivot.rotation.y += p.orbitSpeed * dt;
    p.mesh.rotation.y += p.data.selfRotation * dt;
  }

  const dragAction = drag.update(dt);
  if (dragAction === 'TRIGGER_EXPLODE') {
    const entry = drag.getDraggedPlanet();
    if (entry) {
      explosionManager.explode(entry);
      drag.onCommand({ state: 'DRAG_END' });
    }
  }

  focus.update();
  explosionManager.update(dt);
  controls.update();
  composer.render();
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

function startMusic() {
  const bgm = new Audio('/textures/interstellar.mp3');
  bgm.loop   = true;
  bgm.volume = 0.6;
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

setupGesture(document.getElementById('webcam'), {
  onCommand,
  onLandmarks: overlay.draw,
});
