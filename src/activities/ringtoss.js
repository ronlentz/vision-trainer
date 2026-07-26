// Ring toss — trains depth judgment through fusion.
// Target ring → WEAK eye only (full contrast). Thrown ball → layer 0 (both
// eyes). Judging the ring's distance requires the weak eye to contribute to
// fusion; the ball gives both eyes a shared reference.
//
// Grab: pull trigger (anywhere, if not aiming at a button) — the ball snaps
// to that hand. Release trigger to throw. Score does NOT feed the staircase
// (throwing skill would pollute the contrast signal) but is logged per-game.
import * as THREE from 'three';
import { weakLayer } from '../eyes.js';
import { staircase } from '../staircase.js';
import { store } from '../store.js';

const RING_R = 0.16;
const TUBE_R = 0.02;
const BALL_R = 0.04;
const GRAVITY = -3.5; // gentle indoor arc; visual mechanics matter, not physics
const SPAWN = new THREE.Vector3(0.25, 1.3, -0.5);

export async function run(ctx) {
  const { scene, ui, safety } = ctx;
  safety.setActivity('ring-toss');

  const group = new THREE.Group();
  scene.add(group);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(RING_R, 0.02, 16, 48),
    new THREE.MeshBasicMaterial({ color: 0xffd45e }),
  );
  ring.layers.set(weakLayer);
  group.add(ring);
  function placeRing() {
    ring.position.set(
      (Math.random() - 0.5) * 0.8,
      1.2 + Math.random() * 0.4,
      -(1.2 + Math.random() * 1.0),
    );
  }
  placeRing();

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  ball.position.copy(SPAWN);
  group.add(ball); // layer 0 — both eyes

  // state: 'idle' | 'held' | 'flying'
  let state = 'idle';
  let holder = null;
  const vel = new THREE.Vector3();
  const history = []; // recent {pos, t} of the holding controller
  let scoredThisFlight = false;
  let respawnTimer = 0;
  let stallTime = 0; // a ball balanced on the rim counts as a miss after 2s

  let throws = 0;
  let through = 0;
  const hud = ui.makeHud();
  const updateHud = () =>
    hud.set(
      `through ${through}/${throws}  ·  contrast ${staircase.contrast().toFixed(2)}  ·  grab+release trigger to throw  ·  B/Y = double vision`,
    );
  updateHud();

  const tmp = new THREE.Vector3();
  function onSelectStart(e) {
    if (safety.paused || ui.busy) return;
    const c = e.target;
    if (ui._hit(c)) return; // aiming at a button (e.g. EXIT) — don't grab
    if (state !== 'flying') {
      state = 'held';
      holder = c;
      history.length = 0;
    }
  }
  function onSelectEnd(e) {
    if (state !== 'held' || e.target !== holder) return;
    // velocity from recent motion
    vel.set(0, 0, 0);
    if (history.length >= 2) {
      const a = history[0];
      const b = history[history.length - 1];
      const dt = (b.t - a.t) / 1000;
      if (dt > 0.005) {
        vel.subVectors(b.pos, a.pos).divideScalar(dt).multiplyScalar(1.15);
        vel.clampLength(0, 6);
      }
    }
    state = 'flying';
    holder = null;
    scoredThisFlight = false;
    stallTime = 0;
    throws++;
    updateHud();
  }
  for (const c of ui.controllers) {
    c.addEventListener('selectstart', onSelectStart);
    c.addEventListener('selectend', onSelectEnd);
  }

  function endFlight(success) {
    store.addResult('ring-toss', success ? 1 : 0, 1, false); // per-game only
    if (success) through++;
    // relocate after EVERY throw: a rim bounce is both-eyes-visible physics,
    // so any ring-position knowledge the strong eye gleans from it must
    // expire before it can guide the next throw
    placeRing();
    updateHud();
    state = 'idle';
    respawnTimer = 0.8;
    vel.set(0, 0, 0);
  }

  let exit = false;
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

      if (state === 'held' && holder) {
        tmp.setFromMatrixPosition(holder.matrixWorld);
        ball.position.copy(tmp);
        history.push({ pos: tmp.clone(), t: performance.now() });
        if (history.length > 6) history.shift();
      } else if (state === 'flying') {
        const prevZ = ball.position.z;
        vel.y += GRAVITY * dt;
        ball.position.addScaledVector(vel, dt);
        // rim collision — a throw that clips the ring bounces (sometimes in)
        if (Math.abs(ball.position.z - ring.position.z) < BALL_R + TUBE_R + 0.02) {
          const dx = ball.position.x - ring.position.x;
          const dy = ball.position.y - ring.position.y;
          const rl = Math.hypot(dx, dy);
          if (rl > 1e-4) {
            const rimX = ring.position.x + (dx / rl) * RING_R;
            const rimY = ring.position.y + (dy / rl) * RING_R;
            const ox = ball.position.x - rimX;
            const oy = ball.position.y - rimY;
            const oz = ball.position.z - ring.position.z;
            const d = Math.hypot(ox, oy, oz);
            if (d > 1e-4 && d < BALL_R + TUBE_R) {
              const nx = ox / d, ny = oy / d, nz = oz / d;
              const push = BALL_R + TUBE_R + 0.002 - d;
              ball.position.x += nx * push;
              ball.position.y += ny * push;
              ball.position.z += nz * push;
              const dot = vel.x * nx + vel.y * ny + vel.z * nz;
              if (dot < 0) {
                vel.x -= 2 * dot * nx;
                vel.y -= 2 * dot * ny;
                vel.z -= 2 * dot * nz;
                vel.multiplyScalar(0.45);
              }
            }
          }
        }
        // ring plane crossing (ring faces the player, plane = its z);
        // clean pass = center clears the opening with ball radius to spare —
        // anything tighter hits the rim collision above and may bounce in
        if (!scoredThisFlight && prevZ > ring.position.z && ball.position.z <= ring.position.z) {
          const dx = ball.position.x - ring.position.x;
          const dy = ball.position.y - ring.position.y;
          if (Math.hypot(dx, dy) < RING_R - TUBE_R - BALL_R + 0.015) {
            scoredThisFlight = true;
            endFlight(true);
            return;
          }
        }
        if (vel.lengthSq() < 0.0225) { // < 0.15 m/s: rim-rest jitter, not flight
          stallTime += dt;
        } else {
          stallTime = 0;
        }
        if (
          ball.position.y < 0.03 ||
          ball.position.z < -3.2 ||
          Math.abs(ball.position.x) > 2.5 ||
          stallTime > 2
        ) {
          endFlight(false);
        }
      } else if (state === 'idle' && respawnTimer > 0) {
        respawnTimer -= dt;
        if (respawnTimer <= 0) ball.position.copy(SPAWN);
      }
      ring.rotation.z += dt * 0.3; // slight spin makes the ring easier to spot
    });

    function cleanup() {
      off();
      for (const c of ui.controllers) {
        c.removeEventListener('selectstart', onSelectStart);
        c.removeEventListener('selectend', onSelectEnd);
      }
      ui.buttons = ui.buttons.filter((x) => x !== exitHud.mesh);
      exitHud.dispose();
      hud.dispose();
      scene.remove(group);
      safety.setActivity(null);
      resolve({ throws, through });
    }
  });
}
