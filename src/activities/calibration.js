// Calibration + suppression check.
// Step 1: a ring shown to the WEAK eye only — can the user see it at all?
// Step 2: fusion check — a square frame to the strong eye, a cross to the
// weak eye, same spot in space. Fused vision locks them together; double
// vision / misalignment gets a warning to talk to the eye doctor.
import * as THREE from 'three';
import { weakLayer, strongLayer, weakEyeName } from '../eyes.js';
import { store } from '../store.js';

const CENTER = new THREE.Vector3(0, 1.55, -1.3);
const PANEL_OPTS = { y: 0.95, z: -1.25 }; // low, so targets stay visible above

function ring() {
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(0.12, 0.02, 16, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  m.position.copy(CENTER);
  m.layers.set(weakLayer);
  return m;
}

function cross() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.01), mat);
  const v = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.16, 0.01), mat.clone());
  g.add(h, v);
  g.position.copy(CENTER);
  g.traverse((o) => o.layers && o.layers.set(weakLayer));
  return g;
}

function frame() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const s = 0.3;
  const t = 0.02;
  const top = new THREE.Mesh(new THREE.BoxGeometry(s + t, t, 0.01), mat);
  const bot = top.clone();
  const left = new THREE.Mesh(new THREE.BoxGeometry(t, s + t, 0.01), mat.clone());
  const right = left.clone();
  top.position.y = s / 2;
  bot.position.y = -s / 2;
  left.position.x = -s / 2;
  right.position.x = s / 2;
  g.add(top, bot, left, right);
  g.position.copy(CENTER);
  g.traverse((o) => o.layers && o.layers.set(strongLayer));
  return g;
}

export async function run(ctx) {
  const { scene, ui, safety } = ctx;
  safety.setActivity('calibration');
  const result = { suppressionSeen: null, fusion: null };

  await ui.panel(
    `Suppression check.\nKeep BOTH eyes open. A white ring will appear — it is only shown to your ${weakEyeName.toUpperCase()} (weak) eye.`,
    [{ id: 'ok', label: 'Start' }],
    PANEL_OPTS,
  );

  const r = ring();
  scene.add(r);
  const seen = await ui.panel(
    'Both eyes open: can you see the white ring?',
    [
      { id: 'yes', label: 'Yes, I see it' },
      { id: 'no', label: 'No', color: '#b03030' },
    ],
    PANEL_OPTS,
  );
  scene.remove(r);
  result.suppressionSeen = seen === 'yes';

  if (!result.suppressionSeen) {
    await ui.panel(
      'With both eyes open, your weak eye is being strongly suppressed right now. Mention this to your eye doctor. Training can still continue.',
      [{ id: 'ok', label: 'OK' }],
      PANEL_OPTS,
    );
  }

  await ui.panel(
    'Fusion check.\nNext: a square frame (one eye) and a cross (other eye) in the same spot. If your eyes work together they lock into one steady image.',
    [{ id: 'ok', label: 'Show me' }],
    PANEL_OPTS,
  );

  const f = frame();
  const c = cross();
  scene.add(f, c);
  const fusion = await ui.panel(
    'Look at the shapes: is the cross centered inside the square as ONE steady image — or do you see double / drifting apart?',
    [
      { id: 'aligned', label: 'One steady image' },
      { id: 'double', label: 'Double / drifting', color: '#b03030' },
    ],
    PANEL_OPTS,
  );
  scene.remove(f, c);
  result.fusion = fusion;

  store.logEvent('calibration', result);

  if (fusion === 'double') {
    store.logEvent('double-vision', { activity: 'calibration', reported: 'fusion-check' });
    await ui.panel(
      'You reported DOUBLE VISION.\nStop here and speak to your eye doctor before continuing training.',
      [{ id: 'ok', label: 'Back to menu' }],
      PANEL_OPTS,
    );
  } else {
    await ui.panel(
      `Calibration recorded.\nRing seen: ${result.suppressionSeen ? 'yes' : 'NO'} · Fusion: ${fusion === 'aligned' ? 'aligned' : 'double'}`,
      [{ id: 'ok', label: 'Back to menu' }],
      PANEL_OPTS,
    );
  }
  safety.setActivity(null);
  return result;
}
