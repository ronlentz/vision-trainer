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
  // record the game mechanics in the session log so any future tuning shows
  // up as a discontinuity marker in the clinical record (PICK_RADIUS is
  // FROZEN from program day zero — changing it redefines the 75% target)
  store.logEvent('mechanics', { game: 'bubble-pop', pickRadius: 0.11 });

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

  // Aiming: bubbles are weak-eye-only, so they carry NO stereo depth cue —
  // aiming must not require depth judgment. Generous pick radius around the
  // ray, hover highlight on the bubble, a both-eyes reticle at the aim
  // point, and the laser terminates on the target.
  const PICK_RADIUS = 0.11;
  const tmpMat = new THREE.Matrix4();
  const rayOrigin = new THREE.Vector3();
  const rayDir = new THREE.Vector3();
  const toBubble = new THREE.Vector3();
  const closest = new THREE.Vector3();

  function nearestOnRay(c) {
    tmpMat.identity().extractRotation(c.matrixWorld);
    rayOrigin.setFromMatrixPosition(c.matrixWorld);
    rayDir.set(0, 0, -1).applyMatrix4(tmpMat);
    let best = null;
    let bestDist = PICK_RADIUS;
    let bestT = 0;
    for (const b of bubbles) {
      toBubble.subVectors(b.position, rayOrigin);
      const t = toBubble.dot(rayDir);
      if (t < 0.1) continue;
      closest.copy(rayDir).multiplyScalar(t).add(rayOrigin);
      const dist = closest.distanceTo(b.position);
      if (dist < bestDist) {
        best = b;
        bestDist = dist;
        bestT = t;
      }
    }
    return best ? { bubble: best, t: bestT } : null;
  }

  // THERAPY-CRITICAL: every aim cue that fires off a bubble's position must
  // be WEAK-EYE-ONLY. A both-eyes cue (reticle, laser change) would let the
  // strong eye find bubbles by sweeping, bypassing the weak eye entirely and
  // feeding the staircase a fake signal.
  const reticles = ui.controllers.map(() => {
    const r = new THREE.Mesh(
      new THREE.SphereGeometry(0.016, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    r.visible = false;
    r.layers.set(weakLayer);
    group.add(r);
    return r;
  });

  // weak-eye-only aiming ray that shortens to the target; the shared layer-0
  // ui laser stays full length so the strong eye learns nothing
  const weakRays = ui.controllers.map((c) => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -3),
    ]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.6 }),
    );
    line.layers.set(weakLayer);
    c.add(line);
    return line;
  });

  function onSelect(e) {
    if (safety.paused || ui.busy) return;
    const hit = nearestOnRay(e.target);
    if (hit) popBubble(hit.bubble);
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
    store.addResult('bubble-pop', 1, 1);
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
          store.addResult('bubble-pop', 0, 1);
          removeBubble(b);
          updateHud();
        }
      }

      // hover feedback — all of it weak-eye-only: highlight the aimed
      // bubble, park the reticle at the aim point, shorten the weak-eye ray
      for (const b of bubbles) b.scale.setScalar(1);
      ui.controllers.forEach((c, i) => {
        const hit = nearestOnRay(c);
        if (hit) {
          hit.bubble.scale.setScalar(1.25);
          reticles[i].visible = true;
          reticles[i].position.copy(rayDir.set(0, 0, -1).applyMatrix4(tmpMat.identity().extractRotation(c.matrixWorld)))
            .multiplyScalar(hit.t)
            .add(rayOrigin.setFromMatrixPosition(c.matrixWorld));
          weakRays[i].scale.z = hit.t / 3;
        } else {
          reticles[i].visible = false;
          weakRays[i].scale.z = 1;
        }
      });

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
      ui.controllers.forEach((c, i) => {
        c.removeEventListener('selectstart', onSelect);
        c.remove(weakRays[i]);
        weakRays[i].geometry.dispose();
        weakRays[i].material.dispose();
      });
      ui.buttons = ui.buttons.filter((x) => x !== exitHud.mesh);
      exitHud.dispose();
      hud.dispose();
      scene.remove(group);
      safety.setActivity(null);
      resolve({ popped, escaped });
    }
  });
}
