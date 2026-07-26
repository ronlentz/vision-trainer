// Vergence trainer — a single fused target on layer 0 (both eyes) slowly
// approaches the face; the user pulls the trigger the moment it splits into
// two (break point), then again when it fuses back to one on the way out
// (recovery point). Three cycles, distances logged for the eye doctor.
// Not a staircase driver — results are measurements, not game score.
import * as THREE from 'three';
import { store } from '../store.js';

const FAR = 2.0; // meters from face
const NEAR = 0.15;
const SPEED = 0.08; // m/s
const CYCLES = 3;
const EYE_Y = 1.5;

export async function run(ctx) {
  const { scene, ui, safety } = ctx;
  safety.setActivity('vergence');

  await ui.panel(
    'Vergence trainer.\nKeep both eyes on the white cross as it slowly comes toward you. Pull the TRIGGER the moment it splits into two — then pull it again when it becomes one image on the way back out. 3 rounds.',
    [{ id: 'ok', label: 'Start' }],
  );

  const target = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  target.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.008), mat));
  target.add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.008), mat.clone()));
  target.position.set(0, EYE_Y, -FAR);
  scene.add(target); // layer 0 — both eyes, must fuse

  const hud = ui.makeHud();
  let cycle = 0;
  let phase = 'in'; // 'in' (approaching) | 'out' (retreating)
  const results = [];
  let cur = { break: null, recovery: null };
  const updateHud = () =>
    hud.set(
      `round ${cycle + 1}/${CYCLES} · ${phase === 'in' ? 'coming closer — trigger when it DOUBLES' : 'moving away — trigger when it is ONE again'} · B/Y = stop`,
    );
  updateHud();

  let signal = false;
  function onSelect() {
    if (safety.paused || ui.busy) return;
    signal = true;
  }
  for (const c of ui.controllers) c.addEventListener('selectstart', onSelect);

  let exit = false;
  await new Promise((resolve) => {
    const exitHud = ui.makeHud();
    exitHud.mesh.position.set(0.85, 1.05, -1.2);
    exitHud.mesh.scale.setScalar(0.5);
    exitHud.set('EXIT');
    exitHud.mesh.userData.label = 'EXIT';
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

      const dist = -target.position.z;
      if (phase === 'in') {
        target.position.z += SPEED * dt;
        if (signal) {
          cur.break = +dist.toFixed(3);
          phase = 'out';
          updateHud();
        } else if (dist <= NEAR) {
          cur.break = null; // never split — excellent convergence
          phase = 'out';
          updateHud();
        }
      } else {
        target.position.z -= SPEED * dt;
        if (signal) {
          cur.recovery = +dist.toFixed(3);
          nextCycle();
        } else if (dist >= FAR) {
          cur.recovery = null;
          nextCycle();
        }
      }
      signal = false;

      function nextCycle() {
        results.push(cur);
        cur = { break: null, recovery: null };
        cycle++;
        if (cycle >= CYCLES) {
          cleanup();
        } else {
          phase = 'in';
          target.position.z = -FAR;
          updateHud();
        }
      }
    });

    function cleanup() {
      off();
      ui.buttons = ui.buttons.filter((x) => x !== exitHud.mesh);
      exitHud.dispose();
      resolve();
    }
  });

  for (const c of ui.controllers) c.removeEventListener('selectstart', onSelect);
  scene.remove(target);
  hud.dispose();

  if (results.length) {
    store.logEvent('vergence', { cycles: results }); // stored in meters
    const fmt = (v) => {
      if (v === null) return 'never';
      const inches = Math.round(v * 39.3701);
      return inches >= 36 ? `${Math.floor(inches / 12)} ft ${inches % 12} in` : `${inches} in`;
    };
    await ui.panel(
      'Vergence results (distance from face):\n' +
        results
          .map((r, i) => `Round ${i + 1}: split at ${fmt(r.break)}, single again at ${fmt(r.recovery)}`)
          .join('\n') +
        '\nRecorded for your eye doctor.',
      [{ id: 'ok', label: 'Back to menu' }],
    );
  }
  safety.setActivity(null);
  return results;
}
