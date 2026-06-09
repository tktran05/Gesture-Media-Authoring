import * as THREE from 'three';
import { pickPlanet, screenToNDC } from './picking.js';

// Kéo hành tinh bằng pinch tay phải, thả ra thì snap về quỹ đạo gần nhất.
// Kiểu Blender-style "Grab": mặt phẳng kéo đi qua object, vuông góc camera.
export function createDragController({ scene, camera, planets }) {
  const raycaster   = new THREE.Raycaster();
  const selectables = planets.map(p => p.mesh);
  const orbits      = planets.map(p => ({ dist: p.data.dist, speed: p.data.speed }));

  // Tái dùng (tránh new mỗi frame)
  const _dragPlane = new THREE.Plane();
  const _hit       = new THREE.Vector3();
  const _camDir    = new THREE.Vector3();

  let selected = null;
  let dragging = false;
  let explodeTimer = 0;
  let preparingExplode = false;

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
    // Dựng mặt phẳng kéo: đi qua object, vuông góc hướng nhìn camera (Blender Grab)
    camera.getWorldDirection(_camDir);
    _dragPlane.setFromNormalAndCoplanarPoint(_camDir, selected.position);
    dragging = true;
  }

  // Bắn tia từ camera qua vị trí tay, giao với mặt phẳng kéo → đặt object tại đó.
  // Plane đã được dựng ở begin() nên object giữ nguyên độ sâu suốt drag.
  function move(handX, handY) {
    if (!selected || !dragging) return;
    raycaster.setFromCamera(screenToNDC(handX, handY), camera);
    if (raycaster.ray.intersectPlane(_dragPlane, _hit)) {
      selected.position.copy(_hit);
    }
  }

  
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
    mesh.position.set(nearest.dist, 0, 0); 

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
    preparingExplode = false;
    explodeTimer = 0;
  }

  return {
    update(dt) {
      if (preparingExplode && selected) {
        explodeTimer += dt;
        
        // Ép nhỏ hành tinh còn 30% trong 2 giây
        const progress = Math.min(explodeTimer / 2.0, 1.0);
        const scale = 1.0 - (0.7 * progress);
        selected.scale.set(scale, scale, scale);
        
        if (explodeTimer >= 2.0) {
          preparingExplode = false;
          explodeTimer = 0;
          selected.scale.set(1, 1, 1);
          return 'TRIGGER_EXPLODE';
        }
      } else {
        explodeTimer -= dt * 2.0; // Giảm nhanh gấp đôi nếu hủy
        if (explodeTimer < 0) explodeTimer = 0;
        
        if (selected && selected.scale.x < 1.0) {
          // Phục hồi kích thước mượt mà
          selected.scale.lerp(new THREE.Vector3(1, 1, 1), 0.15);
        }
      }
      return null;
    },

    getDraggedPlanet() {
      return dragging ? planets.find(p => p.mesh === selected) : null;
    },
    onCommand(cmd) {
      switch (cmd.state) {
        case 'DRAG_START': select(cmd.x, cmd.y); begin(); break;
        case 'DRAG':       move(cmd.x, cmd.y);             break;
        case 'DRAG_END':   end();                          break;
        case 'EXPLODE_PREPARE': preparingExplode = true;   break;
        case 'EXPLODE_CANCEL':  preparingExplode = false;  break;
      }
    },
  };
}
