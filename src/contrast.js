// Contrast attenuation: "weakening" content means lowering its contrast
// against the background gray — NOT lowering opacity against black.
import * as THREE from 'three';
import config from './config.js';

const bg = new THREE.Color(config.backgroundGray);

// Remembers the mesh's full-contrast color on first call, then lerps the
// material color from background gray (level 0) to that color (level 1).
export function setContrast(mesh, level) {
  if (!mesh.userData.baseColor) {
    mesh.userData.baseColor = mesh.material.color.clone();
  }
  mesh.material.color.copy(bg).lerp(mesh.userData.baseColor, THREE.MathUtils.clamp(level, 0, 1));
}
