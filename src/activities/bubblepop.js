// Bubble pop — the main staircase driver; most session time lives here.
// Bubbles → WEAK eye (full contrast). Distractor field → STRONG eye
// (attenuated). Point either controller and pull the trigger to pop.
//
// Performance metric (FIXED for the whole program, per spec example):
// pop accuracy — success = bubbles popped, attempts = bubbles popped +
// bubbles that escaped unpopped. Target ratio lives in staircase.PERF_TARGET.
import * as THREE from 'three';
import { weakLayer, strongLayer } from '../eyes.js';
import { setContrast } from '../contrast.js';
import { staircase } from '../staircase.js';
import { store } from '../store.js';

const X = 0.55;
const Y_SPAWN = 1.1;
const Y_ESCAPE = 1.95;
const Z_NEAR = -1.1;
const Z_FAR = -1.7;
const BUBBLE_R = 0.06;
const RISE_SPEED = 0.09; // m/s
const SPAWN_EVERY = 1.1; // s
const MAX_CONCURRENT = 6;
const BUBBLE_COLORS = [0x7fd4ff, 0xa8ffbf, 0xffd47f, 0xff9fd4];

export async function run(ctx) {
  const { scene, ui, safety } = ctx;
  safety.setActivity('bubble-pop');

  const group = new THREE.Group();
  scene.add(group);

  // distractor field — strong eye only, attenuated, never pop-able
  const distractors = [];
  for (let i = 0; i < 14; i++) {
    const d = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.05),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    d.position.set(
      (Math.random() - 0.5) * 2 * X,
      Y_SPAWN + Math.random() * (Y_ESCAPE - Y_SPAWN),
      Z_FAR + Math.random() * (Z_NEAR - Z_FAR),
    );
    d.userData.drift = new THREE.Vector3(
      (Math.random() - 0.5) * 0.06,
      (Math.random() - 0.5) * 0.06,
      0,
    );
    d.layers.set(strongLayer);
    setContrast(d, staircase.contrast());
    group.add(d);
    distractors.push(d);
  }

  const bubbles = [];
  function spawnBubble() {
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(BUBBLE_R, 20, 20),
      new THREE.MeshBasicMaterial({
        color: BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)],
      }),
    );
    b.position.set(
      (Math.random() - 0.5) * 2 * X,
      Y_SPAWN,
      Z_FAR + Math.random() * (Z_NEAR - Z_FAR),
    );
    b.userData.wobblePhase = Math.random() * Math.PI * 2;
    b.layers.set(weakLayer);
    group.add(b);
    bubbles.push(b);
  }

  let popped = 0;
  let escaped = 0;
  const hud = ui.makeHud();
  const acc = () =>
    popped + escaped > 0 ? Math.round((popped / (popped + escaped)) * 100) : 100;
  const updateHud = () =>
    hud.set(
      `popped ${popped}  ·  escaped ${escaped}  ·  accuracy ${acc()}%  ·  contrast ${staircase.contrast().toFixed(2)}  ·  B/Y = double vision`,
    );
  updateHud();

  // trigger → raycast against bubbles (weak layer)
  const raycaster = new THREE.Raycaster();
  raycaster.layers.enable(weakLayer);
  const tmpMat = new THREE.Matrix4();
  function onSelect(e) {
    if (safety.paused || ui.busy) return;
    const c = e.target;
    tmpMat.identity().extractRotation(c.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMat);
    const hit = raycaster.intersectObjects(bubbles, false)[0];
    if (hit) popBubble(hit.object);
  }
  for (const c of ui.controllers) c.addEventListener('selectstart', onSelect);

  function removeBubble(b) {
    group.remove(b);
    bubbles.splice(bubbles.indexOf(b), 1);
    b.geometry.dispose();
    b.material.dispose();
  }
  function popBubble(b) {
    popped++;
    store.addResult(1, 1);
    removeBubble(b);
    updateHud();
  }

  let exit = false;
  let spawnTimer = 0;

  return await new Promise((resolve) => {
    const exitHud = ui.makeHud();
    exitHud.mesh.position.set(0.85, 1.05, -1.2);
    exitHud.mesh.scale.setScalar(0.5);
    exitHud.set('EXIT GAME');
    exitHud.mesh.userData.label = 'EXIT GAME';
    exitHud.mesh.userData.onClick = () => {
      exit = true;
    };
    ui.buttons.push(exitHud.mesh);

    const off = ctx.onFrame((dt) => {
      if (exit || safety.abortActivity) {
        cleanup();
        return;
      }
      if (safety.paused || ui.busy) return;

      spawnTimer += dt;
      if (spawnTimer >= SPAWN_EVERY && bubbles.length < MAX_CONCURRENT) {
        spawnTimer = 0;
        spawnBubble();
      }

      for (const b of [...bubbles]) {
        b.position.y += RISE_SPEED * dt;
        b.userData.wobblePhase += dt * 2;
        b.position.x += Math.sin(b.userData.wobblePhase) * 0.02 * dt;
        if (b.position.y > Y_ESCAPE) {
          escaped++;
          store.addResult(0, 1);
          removeBubble(b);
          updateHud();
        }
      }

      for (const d of distractors) {
        d.position.addScaledVector(d.userData.drift, dt);
        if (Math.abs(d.position.x) > X) d.userData.drift.x *= -1;
        if (d.position.y > Y_ESCAPE || d.position.y < Y_SPAWN) d.userData.drift.y *= -1;
        d.rotation.y += dt * 0.5;
        setContrast(d, staircase.contrast());
      }
    });

    function cleanup() {
      off();
      for (const c of ui.controllers) c.removeEventListener('selectstart', onSelect);
      ui.buttons = ui.buttons.filter((x) => x !== exitHud.mesh);
      exitHud.dispose();
      hud.dispose();
      scene.remove(group);
      safety.setActivity(null);
      resolve({ popped, escaped });
    }
  });
}
