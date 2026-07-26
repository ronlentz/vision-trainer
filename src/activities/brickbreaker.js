// Brick breaker — game #1.
// Paddle → STRONG eye (attenuated by the staircase contrast).
// Ball + bricks → WEAK eye (always full contrast).
// Unplayable unless both eyes contribute — that's the point.
//
// Performance metric (FIXED for the whole program): paddle return rate,
// success = paddle hits, attempts = hits + misses.
import * as THREE from 'three';
import { weakLayer, strongLayer } from '../eyes.js';
import { setContrast } from '../contrast.js';
import { staircase } from '../staircase.js';
import { store } from '../store.js';

// play volume
const X = 0.55; // half-width
const Y_LO = 1.15;
const Y_HI = 1.85;
const Z_WALL = -1.7; // behind bricks
const Z_BRICKS = -1.55;
const Z_PADDLE = -0.65;
const Z_MISS = -0.42; // past the paddle → miss
const BALL_R = 0.035;
const SPEED = 1.05; // m/s, constant

const BRICK_COLORS = [0xff6a00, 0xffb300, 0x27c24c, 0x00b8d4];

export async function run(ctx) {
  const { scene, ui, safety } = ctx;
  safety.setActivity('brick-breaker');

  const group = new THREE.Group();
  scene.add(group);

  // bounds wireframe on layer 0 so both eyes agree on the arena
  const arena = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(X * 2, Y_HI - Y_LO, -(Z_WALL - Z_MISS))),
    new THREE.LineBasicMaterial({ color: 0x555555 }),
  );
  arena.position.set(0, (Y_LO + Y_HI) / 2, (Z_WALL + Z_MISS) / 2);
  group.add(arena);

  // paddle — strong eye, contrast-attenuated
  const paddle = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.14, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  paddle.position.set(0, 1.5, Z_PADDLE);
  paddle.layers.set(strongLayer);
  setContrast(paddle, staircase.contrast());
  group.add(paddle);

  // ball — weak eye, full contrast
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  ball.layers.set(weakLayer);
  group.add(ball);

  // bricks — weak eye, full contrast
  let bricks = [];
  const BW = 0.17;
  const BH = 0.075;
  function buildWall() {
    for (const b of bricks) group.remove(b);
    bricks = [];
    const cols = 6;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        const brick = new THREE.Mesh(
          new THREE.BoxGeometry(BW, BH, 0.05),
          new THREE.MeshBasicMaterial({ color: BRICK_COLORS[r % BRICK_COLORS.length] }),
        );
        brick.position.set(
          (cIdx - (cols - 1) / 2) * (BW + 0.015),
          Y_LO + 0.12 + r * (BH + 0.015) + 0.35,
          Z_BRICKS,
        );
        brick.layers.set(weakLayer);
        group.add(brick);
        bricks.push(brick);
      }
    }
  }

  const vel = new THREE.Vector3();
  let serving = 0; // countdown until serve
  function serve() {
    ball.position.set(0, 1.5, -1.0);
    vel
      .set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.35, -1)
      .normalize()
      .multiplyScalar(SPEED);
    serving = 0;
  }

  let hits = 0;
  let misses = 0;
  let broken = 0;
  let rounds = 0;
  const hud = ui.makeHud();
  const updateHud = () =>
    hud.set(
      `bricks ${broken}  ·  returns ${hits}/${hits + misses}  ·  contrast ${staircase.contrast().toFixed(2)}  ·  B/Y = double vision`,
    );

  buildWall();
  serve();
  updateHud();

  let exit = false;

  return await new Promise((resolve) => {
    // exit button as a lightweight persistent panel-button
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
      // exit/abort must work even while a safety panel has the game paused
      if (exit || safety.abortActivity) {
        cleanup();
        return;
      }
      if (safety.paused || ui.busy) return;

      // paddle follows controller (first controller with a position)
      const c = ui.controllers[0];
      const p = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
      if (p.lengthSq() > 0.0001) {
        paddle.position.x = THREE.MathUtils.clamp(p.x * 1.6, -X + 0.12, X - 0.12);
        paddle.position.y = THREE.MathUtils.clamp(1.5 + (p.y - 1.3) * 1.6, Y_LO + 0.07, Y_HI - 0.07);
      }
      setContrast(paddle, staircase.contrast());

      if (serving > 0) {
        serving -= dt;
        if (serving <= 0) serve();
        return;
      }

      ball.position.addScaledVector(vel, dt);
      const b = ball.position;

      if (b.x > X - BALL_R || b.x < -X + BALL_R) vel.x *= -1;
      if (b.y > Y_HI - BALL_R || b.y < Y_LO + BALL_R) vel.y *= -1;
      if (b.z < Z_WALL + BALL_R) vel.z *= -1;

      // bricks
      if (vel.z < 0 && b.z < Z_BRICKS + 0.08) {
        for (const brick of bricks) {
          if (
            Math.abs(b.x - brick.position.x) < BW / 2 + BALL_R &&
            Math.abs(b.y - brick.position.y) < BH / 2 + BALL_R &&
            Math.abs(b.z - brick.position.z) < 0.05 / 2 + BALL_R
          ) {
            group.remove(brick);
            bricks.splice(bricks.indexOf(brick), 1);
            broken++;
            store.addResult(0, 0); // bricks are score, not the staircase metric
            vel.z *= -1;
            updateHud();
            break;
          }
        }
        if (bricks.length === 0) {
          rounds++;
          buildWall();
        }
      }

      // paddle
      if (vel.z > 0 && b.z > Z_PADDLE - BALL_R && b.z < Z_PADDLE + 0.06) {
        const dx = b.x - paddle.position.x;
        const dy = b.y - paddle.position.y;
        if (Math.abs(dx) < 0.12 + BALL_R && Math.abs(dy) < 0.07 + BALL_R) {
          vel.z = -Math.abs(vel.z);
          vel.x += dx * 2.2;
          vel.y += dy * 2.2;
          vel.normalize().multiplyScalar(SPEED);
          hits++;
          store.addResult(1, 1);
          updateHud();
        }
      }

      // miss
      if (b.z > Z_MISS) {
        misses++;
        store.addResult(0, 1);
        updateHud();
        serving = 1.0;
        ball.position.set(0, 1.5, -1.0);
        vel.set(0, 0, 0);
      }
    });

    function cleanup() {
      off();
      ui.buttons = ui.buttons.filter((x) => x !== exitHud.mesh);
      exitHud.dispose();
      hud.dispose();
      scene.remove(group);
      safety.setActivity(null);
      resolve({ hits, misses, broken, rounds });
    }
  });
}
