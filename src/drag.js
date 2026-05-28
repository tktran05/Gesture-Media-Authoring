import * as THREE from 'three';
import { pickPlanet } from './picking.js';

// Kéo hành tinh bằng pinch tay phải, thả ra thì snap về quỹ đạo gần nhất.
// Toàn bộ state (mesh đang chọn, đang kéo, vị trí trước) đóng gói trong closure.
export function createDragController({ scene, camera, planets }) {
  const raycaster   = new THREE.Raycaster();
  const selectables = planets.map(p => p.mesh);
  const orbits      = planets.map(p => ({ dist: p.data.dist, speed: p.data.speed }));

  let selected = null;
  let dragging = false;
  let lastX = null;
  let lastY = null;

  function highlight(mesh, on) {
    if (mesh?.material?.emissive) {
      mesh.material.emissive.setHex(on ? 0x221100 : 0x000000);
    }
  }

  function select(handX, handY) {
    highlight(selected, false);
    selected = pickPlanet(handX, handY, camera, raycaster, selectables);
    highlight(selected, true);
  }

  function begin() {
    if (!selected) return;
    // Tách khỏi pivot để di chuyển tự do trong scene
    if (selected.parent !== scene) {
      const worldPos = new THREE.Vector3();
      selected.getWorldPosition(worldPos);
      selected.parent.remove(selected);
      scene.add(selected);
      selected.position.copy(worldPos);
    }
    lastX = lastY = null;
    dragging = true;
  }

  function move(handX, handY) {
    if (!selected || !dragging) return;
    if (lastX === null) { lastX = handX; lastY = handY; return; }

    const dx = handX - lastX;
    const dy = handY - lastY;
    lastX = handX;
    lastY = handY;

    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up    = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);

    // Projected depth → scale ổn định khi object di ngang (giống Blender)
    const dist  = camDir.dot(selected.position.clone().sub(camera.position));
    const scale = dist * 2 * Math.tan((camera.fov * Math.PI / 180) / 2);

    selected.position.addScaledVector(right, -dx * scale * camera.aspect);
    selected.position.addScaledVector(up,    -dy * scale);
  }

  // Snap hành tinh về quỹ đạo có bán kính gần nhất + nhận tốc độ quỹ đạo đó
  function snapToNearestOrbit(entry) {
    const { mesh, pivot } = entry;

    const wPos = new THREE.Vector3();
    mesh.getWorldPosition(wPos);
    const currentR = Math.sqrt(wPos.x * wPos.x + wPos.z * wPos.z);

    const nearest = orbits.reduce((best, o) =>
      Math.abs(o.dist - currentR) < Math.abs(best.dist - currentR) ? o : best
    );

    scene.remove(mesh);
    pivot.add(mesh);
    pivot.rotation.y = Math.atan2(-wPos.z, wPos.x);
    mesh.position.set(nearest.dist, 0, 0); // về mặt phẳng quỹ đạo (y=0)

    entry.orbitSpeed = nearest.speed;
  }

  function end() {
    if (dragging && selected) {
      const entry = planets.find(p => p.mesh === selected);
      if (entry) snapToNearestOrbit(entry);
    }
    highlight(selected, false);
    dragging = false;
    selected = null;
    lastX = lastY = null;
  }

  return {
    // Hành tinh đang bị kéo (để render loop tạm dừng quỹ đạo của nó)
    getDraggedPlanet() {
      return dragging ? planets.find(p => p.mesh === selected) : null;
    },
    onCommand(cmd) {
      switch (cmd.state) {
        case 'DRAG_START': select(cmd.x, cmd.y); begin(); break;
        case 'DRAG':       move(cmd.x, cmd.y);             break;
        case 'DRAG_END':   end();                          break;
      }
    },
  };
}
