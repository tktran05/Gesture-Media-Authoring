import * as THREE from 'three';

// Đổi toạ độ tay (0..1, đã mirror) sang Normalized Device Coordinates cho raycast.
export function screenToNDC(handX, handY) {
  return new THREE.Vector2((1 - handX) * 2 - 1, -(handY * 2 - 1));
}

// Chọn mesh dưới vị trí tay: raycast chính xác trước, nếu trượt thì lấy
// mesh gần con trỏ nhất trên màn hình trong ngưỡng 15%. Trả null nếu không có.
export function pickPlanet(handX, handY, camera, raycaster, meshes) {
  const ndc = screenToNDC(handX, handY);

  // Dựng tia: gốc = camera, hướng = xuyên qua điểm ndc
  raycaster.setFromCamera(ndc, camera);

  //kiểm tra tia cắt mesh nào, trả về list hành tinh, gần nhất -> index 0
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length > 0) return hits[0].object;

  // Không cắt trúng mesh nào → chọn mesh gần con trỏ nhất
  const THRESH = 0.15;
  const p = new THREE.Vector3();
  let best = null;
  let bestDist = THRESH;
  for (const mesh of meshes) {
    mesh.getWorldPosition(p);
    // Chiếu p (3D) sang màn hình (2D)
    p.project(camera);
    const d = Math.hypot(p.x - ndc.x, p.y - ndc.y);
    if (d < bestDist) { bestDist = d; best = mesh; }
  }
  return best;
}
