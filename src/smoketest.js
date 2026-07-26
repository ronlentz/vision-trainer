// Per-eye rendering smoke test (kept for regression checks — run with ?smoke).
// Red cube  → layer 1 → LEFT eye only.
// Blue cube → layer 2 → RIGHT eye only.
// Grid + sphere → layer 0 → both eyes.
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import config from './config.js';

export function start() {
  const hud = document.getElementById('hud');
  const log = (msg) => {
    hud.textContent = msg;
    console.log('[smoke-test]', msg);
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(config.backgroundGray);

  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 50);
  camera.position.set(0, 1.6, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 3));
  scene.add(new THREE.GridHelper(4, 8, 0x555555, 0x666666));

  const anchor = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  anchor.position.set(0, 1.5, -1.5);
  scene.add(anchor);

  const leftEyeCube = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.25, 0.25),
    new THREE.MeshStandardMaterial({ color: 0xdd2222 }),
  );
  leftEyeCube.position.set(-0.35, 1.5, -1.5);
  leftEyeCube.layers.set(1);
  scene.add(leftEyeCube);

  const rightEyeCube = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.25, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x2222dd }),
  );
  rightEyeCube.position.set(0.35, 1.5, -1.5);
  rightEyeCube.layers.set(2);
  scene.add(rightEyeCube);

  const idleMsg = [
    'PER-EYE SMOKE TEST',
    'Red cube = LEFT eye only (layer 1). Blue cube = RIGHT eye only (layer 2).',
    'Enter VR, then close one eye at a time: exactly one cube must vanish.',
    navigator.xr ? 'navigator.xr: available' : 'navigator.xr: NOT available',
  ].join('\n');
  log(idleMsg);

  let layersReported = false;
  renderer.xr.addEventListener('sessionstart', () => {
    layersReported = false;
  });
  renderer.xr.addEventListener('sessionend', () => log(idleMsg));

  function reportEyeLayers() {
    const cams = renderer.xr.getCamera().cameras;
    if (cams.length < 2) return;
    const seen = (cam) =>
      ['grid+anchor(L0)', 'RED cube(L1)', 'BLUE cube(L2)']
        .filter((_, i) => (cam.layers.mask >> i) & 1)
        .join(', ');
    log(
      [
        'XR SESSION ACTIVE — per-eye camera layer check:',
        `eye 0 (left)  mask=${cams[0].layers.mask} sees: ${seen(cams[0])}`,
        `eye 1 (right) mask=${cams[1].layers.mask} sees: ${seen(cams[1])}`,
        cams[0].layers.isEnabled(1) &&
        !cams[0].layers.isEnabled(2) &&
        cams[1].layers.isEnabled(2) &&
        !cams[1].layers.isEnabled(1)
          ? 'PASS: left eye gets layer 1 only, right eye gets layer 2 only.'
          : 'FAIL: unexpected layer masks — per-eye separation is broken.',
      ].join('\n'),
    );
    layersReported = true;
  }

  renderer.setAnimationLoop((t) => {
    leftEyeCube.rotation.y = t / 2000;
    rightEyeCube.rotation.y = t / 2000;
    renderer.render(scene, camera);
    if (renderer.xr.isPresenting && !layersReported) reportEyeLayers();
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  window.__smokeTest = {
    renderer,
    forceFrame() {
      renderer.render(scene, camera);
      if (renderer.xr.isPresenting) reportEyeLayers();
      return hud.textContent;
    },
  };
}
