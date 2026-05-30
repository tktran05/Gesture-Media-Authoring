import * as THREE from 'three';

// Cử chỉ camera (hàm thuần, không giữ state):
// - orbit: xoay quanh controls.target bằng toạ độ cầu, giữ nguyên khoảng cách.
// - zoom: di chuyển camera dọc trục nhìn tới target, kẹp khoảng cách [MIN, MAX].

const ZOOM_MIN = 8;
const ZOOM_MAX = 200;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function orbitCamera(camera, controls, dx, dy) {
  const spherical = new THREE.Spherical().setFromVector3(
    camera.position.clone().sub(controls.target)
  );
  spherical.theta += dx * 5;
  // Kẹp phi không cho tới đỉnh/đáy → tránh camera lật ngược (gimbal flip)
  spherical.phi = clamp(spherical.phi - dy * 5, 0.05, Math.PI - 0.05);
  camera.position.setFromSpherical(spherical).add(controls.target);
  camera.lookAt(controls.target);
}

export function zoomCamera(camera, controls, zoomDelta) {
  const dir     = camera.position.clone().sub(controls.target).normalize();
  const newDist = clamp(
    camera.position.distanceTo(controls.target) - zoomDelta * 40,
    ZOOM_MIN, ZOOM_MAX
  );
  camera.position.copy(controls.target).addScaledVector(dir, newDist);
}
