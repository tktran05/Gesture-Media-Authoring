import * as THREE from 'three';
import { pickPlanet } from './picking.js';

export function createFocusController({ camera, controls, planets }) {
  const LERP        = 0.08;   // tốc độ nội suy camera/target
  const DIST_FACTOR = 4.5;    // khoảng cách camera = bán kính hành tinh * factor

  const raycaster   = new THREE.Raycaster();
  const selectables = planets.map(p => p.mesh);

  const initialCamPos = camera.position.clone();
  const initialTarget = controls.target.clone();

  const targetPos = new THREE.Vector3(); // world pos hành tinh (mỗi frame)
  const prevPos   = new THREE.Vector3(); // world pos frame trước (để follow)
  const moveDelta = new THREE.Vector3(); // quãng hành tinh đi giữa 2 frame

  let focused   = null;   // mesh đang focus
  let distance  = 0;      // khoảng cách camera mong muốn
  let ready     = false;  // đã bay tới nơi → chuyển sang follow
  let resetting = false;  // đang bay về view ban đầu
  let visibleLabel = null;

  function showLabel(mesh) {
    if (visibleLabel) visibleLabel.visible = false;
    const entry = planets.find(p => p.mesh === mesh);
    visibleLabel = entry?.label ?? null;
    if (visibleLabel) visibleLabel.visible = true;
  }

  function enter(mesh) {
    if (!mesh) return;
    resetting = false; // huỷ reset nếu đang bay về mà pinch hành tinh
    ready     = false; // bay lại từ đầu (đổi hành tinh cũng dùng)
    focused   = mesh;
    const radius = mesh.geometry?.parameters?.radius ?? 1;
    distance = radius * DIST_FACTOR;
    showLabel(mesh);
  }

  function flyIn() {
    controls.target.lerp(targetPos, LERP);
    const dir     = camera.position.clone().sub(controls.target).normalize();
    const desired = targetPos.clone().add(dir.multiplyScalar(distance));
    camera.position.lerp(desired, LERP);

    if (controls.target.distanceTo(targetPos) < 0.15) {
      ready = true;
      controls.target.copy(targetPos);  // snap nhỏ để tâm orbit khớp chính xác
      prevPos.copy(targetPos);
    }
  }

  function follow() {
    moveDelta.copy(targetPos).sub(prevPos);
    camera.position.add(moveDelta);
    controls.target.copy(targetPos);
    prevPos.copy(targetPos);
  }

  return {
    focusAtScreen(handX, handY) {
      const mesh = pickPlanet(handX, handY, camera, raycaster, selectables);
      if (mesh) enter(mesh);
    },

    reset() {
      focused   = null;
      ready     = false;
      resetting = true;
      showLabel(null);
    },

    update() {
      if (resetting) {
        controls.target.lerp(initialTarget, LERP);
        camera.position.lerp(initialCamPos, LERP);
        if (controls.target.distanceTo(initialTarget) < 0.05 &&
            camera.position.distanceTo(initialCamPos) < 0.05) {
          resetting = false;
        }
        return;
      }

      if (!focused) return;

      focused.getWorldPosition(targetPos);
      if (!ready) flyIn();
      else        follow();
    },
  };
}
