import * as THREE from 'three';
import bombSoundUrl from '../assets/nuclear-bomb-explosion.mp3';

export function createExplosionManager(scene, camera) {
  const explosions = [];
  
  let shakeTime = 0;
  let shakeIntensity = 0;

  return {
    explode(planetEntry) {
      const pos = new THREE.Vector3();
      planetEntry.mesh.getWorldPosition(pos);
      
      // Ẩn hành tinh (Bao gồm cả vành đai và nhãn vì chúng là child của mesh)
      planetEntry.mesh.visible = false;
      
      // Phát âm thanh nổ
      const sfx = new Audio(bombSoundUrl);
      sfx.volume = 0.8;
      sfx.play().catch(e => console.warn("Audio play blocked by browser", e));
      
      // 1. TẠO HẠT MẢNH VỠ (PARTICLES)
      const particleGeo = new THREE.BufferGeometry();
      const particleCount = 600; // Số lượng hạt sci-fi
      const positions = new Float32Array(particleCount * 3);
      const velocities = [];
      const colors = new Float32Array(particleCount * 3);
      
      const baseColor = new THREE.Color(0xff5500);  // Lửa cam đỏ
      const sparkColor = new THREE.Color(0xffffaa); // Tia lửa chớp vàng
      
      for(let i=0; i<particleCount; i++) {
        // Tọa độ xuất phát
        positions[i*3] = pos.x;
        positions[i*3+1] = pos.y;
        positions[i*3+2] = pos.z;
        
        // Vận tốc tỏa tròn (Spherical distribution)
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const speed = 30 + Math.random() * 120; // Nổ bắn ra ngẫu nhiên tốc độ cực cao, lan siêu rộng
        
        // Thêm độ nhiễu loạn ngẫu nhiên vào vector vận tốc
        const vx = speed * Math.sin(phi) * Math.cos(theta) + (Math.random() - 0.5) * 20;
        const vy = speed * Math.sin(phi) * Math.sin(theta) + (Math.random() - 0.5) * 20;
        const vz = speed * Math.cos(phi) + (Math.random() - 0.5) * 20;
        velocities.push(new THREE.Vector3(vx, vy, vz));
        
        // Màu sắc ngẫu nhiên lai giữa cam và vàng
        const mixedColor = baseColor.clone().lerp(sparkColor, Math.random());
        colors[i*3] = mixedColor.r;
        colors[i*3+1] = mixedColor.g;
        colors[i*3+2] = mixedColor.b;
      }
      
      particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      
      const particleMat = new THREE.PointsMaterial({
        size: 0.6,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending, // Sáng rực khi xếp chồng
        depthWrite: false
      });
      const particles = new THREE.Points(particleGeo, particleMat);
      scene.add(particles);

      // 2. TẠO SÓNG XUNG KÍCH (SHOCKWAVE)
      const shockGeo = new THREE.SphereGeometry(planetEntry.data.size, 32, 32);
      const shockMat = new THREE.MeshBasicMaterial({
        color: 0x55aaff, // Xanh viễn tưởng
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const shockwave = new THREE.Mesh(shockGeo, shockMat);
      shockwave.position.copy(pos);
      scene.add(shockwave);
      
      // 3. KÍCH HOẠT RUNG CHẤN CAMERA
      shakeTime = 4.0; // Rung lâu theo âm thanh nổ (4.0s)
      shakeIntensity = 4.0; // Rung chấn cực mạnh
      
      explosions.push({
        age: 0,
        duration: 4.0,       // Hiệu ứng hạt tồn tại lâu hơn (4.0s)
        respawnTimer: 5.0,   // Chờ thêm 5s để phục hồi hành tinh
        planet: planetEntry,
        particles,
        velocities,
        shockwave,
        cleanedUp: false,
        dead: false
      });
    },
    
    update(dt) {
      // Xử lý rung camera (Camera shake)
      // Chạy SAU controls.update() để đè lên vị trí chuẩn của OrbitControls
      if (shakeTime > 0) {
        shakeTime -= dt;
        const r = shakeIntensity * (shakeTime / 4.0); // Giảm dần lực rung trong 4s
        camera.position.x += (Math.random() - 0.5) * r;
        camera.position.y += (Math.random() - 0.5) * r;
        camera.position.z += (Math.random() - 0.5) * r;
      }

      for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i];
        exp.age += dt;
        
        if (exp.age <= exp.duration) {
          // Cập nhật vị trí các hạt mảnh vỡ
          const positions = exp.particles.geometry.attributes.position.array;
          for(let j=0; j<exp.velocities.length; j++) {
            positions[j*3]     += exp.velocities[j].x * dt;
            positions[j*3+1]   += exp.velocities[j].y * dt;
            positions[j*3+2]   += exp.velocities[j].z * dt;
            // Lực cản (Drag) làm hạt bay chậm dần lại
            exp.velocities[j].multiplyScalar(0.92); 
          }
          exp.particles.geometry.attributes.position.needsUpdate = true;
          // Mờ dần theo đường cong parabol
          exp.particles.material.opacity = 1.0 - Math.pow(exp.age / exp.duration, 2);
          
          // Cập nhật sóng xung kích (Phóng to liên tục, mờ chậm hơn để khớp 4s)
          const scale = 1.0 + exp.age * 30; 
          exp.shockwave.scale.set(scale, scale, scale);
          exp.shockwave.material.opacity = Math.max(0, 0.8 - exp.age * 0.8);
          
        } else if (!exp.cleanedUp) {
          // Xóa rác 3D khỏi bộ nhớ khi hạt bay xong
          scene.remove(exp.particles);
          exp.particles.geometry.dispose();
          exp.particles.material.dispose();
          
          scene.remove(exp.shockwave);
          exp.shockwave.geometry.dispose();
          exp.shockwave.material.dispose();
          
          exp.cleanedUp = true;
        }

        // Kiểm tra thời gian hồi sinh hành tinh (1.5s + 5.0s)
        if (exp.age > exp.duration + exp.respawnTimer) {
          exp.planet.mesh.visible = true; // Hiện lại
          exp.dead = true; // Đánh dấu xóa khỏi mảng explosions
        }
      }
      
      // Xóa các vụ nổ đã hoàn thành vòng đời
      for (let i = explosions.length - 1; i >= 0; i--) {
        if (explosions[i].dead) explosions.splice(i, 1);
      }
    }
  };
}
