// Per-eye rendering smoke test.
// Red cube  → layer 1 → LEFT eye only.
// Blue cube → layer 2 → RIGHT eye only.
// Grid + sphere → layer 0 → both eyes (orientation anchor).
// In the headset: close one eye at a time; exactly one cube must disappear.
//
// Desktop check without a headset: append ?emulator to the URL to load the
// IWER WebXR emulator (Meta Quest 2 profile) and render side-by-side stereo.

import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import config from './config.js';

const hud = document.getElementById('hud');
const log = (msg) => {
  hud.textContent = msg;
  console.log('[smoke-test]', msg);
};

async function maybeInstallEmulator() {
  if (!new URLSearchParams(location.search).has('emulator')) return false;
  const { XRDevice, metaQuest2 } = await import('iwer');
  const device = new XRDevice(metaQuest2);
  device.installRuntime({ forceInstall: true });
  device.stereoEnabled = true; // render both eyes side by side on the canvas
  window.__iwerDevice = device; // console access for head movement if needed
  return true;
}

const emulated = await maybeInstallEmulator();

const scene = new THREE.Scene();
scene.background = new THREE.Color(config.backgroundGray);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.05,
  50,
);
camera.position.set(0, 1.6, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 3));

// Layer 0 — both eyes: floor grid and a small fusion anchor sphere.
const grid = new THREE.GridHelper(4, 8, 0x555555, 0x666666);
scene.add(grid);
const anchor = new THREE.Mesh(
  new THREE.SphereGeometry(0.03, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xffffff }),
);
anchor.position.set(0, 1.5, -1.5);
scene.add(anchor);

// Layer 1 — LEFT eye only: red cube.
const leftEyeCube = new THREE.Mesh(
  new THREE.BoxGeometry(0.25, 0.25, 0.25),
  new THREE.MeshStandardMaterial({ color: 0xdd2222 }),
);
leftEyeCube.position.set(-0.35, 1.5, -1.5);
leftEyeCube.layers.set(1);
scene.add(leftEyeCube);

// Layer 2 — RIGHT eye only: blue cube.
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
  emulated ? 'WebXR EMULATOR ACTIVE (IWER, Quest 2 profile).' : '',
  navigator.xr ? 'navigator.xr: available' : 'navigator.xr: NOT available',
]
  .filter(Boolean)
  .join('\n');
log(idleMsg);

let layersReported = false;
renderer.xr.addEventListener('sessionstart', () => {
  layersReported = false;
});
renderer.xr.addEventListener('sessionend', () => {
  log(idleMsg);
});

function reportEyeLayers() {
  const cams = renderer.xr.getCamera().cameras;
  if (cams.length < 2) return; // mono view (e.g. inline) — keep waiting
  const seen = (cam) =>
    ['grid+anchor(L0)', 'RED cube(L1)', 'BLUE cube(L2)']
      .filter((_, i) => (cam.layers.mask >> i) & 1)
      .join(', ');
  const lines = [
    'XR SESSION ACTIVE — per-eye camera layer check:',
    `eye 0 (left)  mask=${cams[0].layers.mask} sees: ${seen(cams[0])}`,
    `eye 1 (right) mask=${cams[1].layers.mask} sees: ${seen(cams[1])}`,
    cams[0].layers.isEnabled(1) &&
    !cams[0].layers.isEnabled(2) &&
    cams[1].layers.isEnabled(2) &&
    !cams[1].layers.isEnabled(1)
      ? 'PASS: left eye gets layer 1 only, right eye gets layer 2 only.'
      : 'FAIL: unexpected layer masks — per-eye separation is broken.',
  ];
  log(lines.join('\n'));
  layersReported = true;
}

renderer.setAnimationLoop((t) => {
  leftEyeCube.rotation.y = t / 2000;
  rightEyeCube.rotation.y = t / 2000;
  renderer.render(scene, camera);
  // Check after render: three.js assigns per-eye layer masks during render.
  if (renderer.xr.isPresenting && !layersReported) reportEyeLayers();
});

// Debug handle: lets a headless/throttled browser force one frame and
// re-run the layer check when requestAnimationFrame is not ticking.
window.__smokeTest = {
  renderer,
  forceFrame() {
    renderer.render(scene, camera);
    if (renderer.xr.isPresenting) reportEyeLayers();
    return hud.textContent;
  },
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
