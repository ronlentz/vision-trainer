// Main app: scene, session flow, menu. Smoke test lives in smoketest.js
// (?smoke). Safety systems wrap every activity.
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import config from './config.js';
import { UI } from './ui.js';
import { Safety } from './safety.js';
import { store } from './store.js';
import { staircase } from './staircase.js';
import { weakEyeName } from './eyes.js';
import * as calibration from './activities/calibration.js';
import * as brickbreaker from './activities/brickbreaker.js';

const hudEl = document.getElementById('hud');

export function start() {
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

  const ui = new UI(scene, renderer);
  let endRequested = false;
  const safety = new Safety(ui, () => {
    endRequested = true;
  });

  // per-frame callbacks for activities
  const frameFns = new Set();
  const ctx = {
    scene,
    camera,
    renderer,
    ui,
    safety,
    store,
    staircase,
    onFrame(fn) {
      frameFns.add(fn);
      return () => frameFns.delete(fn);
    },
  };

  // Desktop 2D info
  hudEl.textContent = [
    'Vision Trainer',
    `strong-eye contrast: ${staircase.contrast().toFixed(2)} · weak eye: ${weakEyeName}`,
    'Put the headset on and click Enter VR. Add ?emulator for desktop testing.',
  ].join('\n');

  renderer.xr.addEventListener('sessionstart', () => {
    sessionFlow().catch((e) => {
      console.error('[vt] session flow error', e);
    });
  });

  async function sessionFlow() {
    endRequested = false;
    safety.paused = false;
    safety.abortActivity = false;
    safety.activeMs = 0;
    safety._lastBreakMs = 0;
    safety._capConfirmedThroughMs = config.sessionMinutes * 60_000;

    // one staircase adjustment per completed day, evaluated at next start
    const evalResult = staircase.evaluatePendingDay(store);
    store.startSession(staircase.contrast());
    if (evalResult && evalResult.change !== 'none') {
      store.logEvent('staircase-daily', evalResult);
    }

    // start-of-session banner (spec-mandated wording)
    await ui.panel(
      'This is a training aid, not a treatment.\nReport your progress and any double vision to your optometrist.',
      [{ id: 'ok', label: 'Understood' }],
    );

    // pre-session check, every session
    const contacts = await ui.panel(
      'Contacts in? (or glasses on, if that is your correction)\nTraining without your correction quietly invalidates the program.',
      [
        { id: 'yes', label: 'Yes — start' },
        { id: 'no', label: 'No', color: '#b03030' },
      ],
    );
    if (contacts === 'no') {
      await ui.panel('Put your correction in first, then start a new session.', [
        { id: 'ok', label: 'OK' },
      ]);
      await endSession();
      return;
    }
    store.logEvent('pre-check-passed', {});

    if (evalResult) {
      await ui.panel(
        `Daily staircase review for ${evalResult.day}: ${evalResult.change === 'raise' ? 'contrast RAISED' : evalResult.change === 'lower' ? 'contrast LOWERED' : 'no change'} (${evalResult.why}).\nStrong-eye contrast today: ${staircase.contrast().toFixed(2)}`,
        [{ id: 'ok', label: 'OK' }],
      );
    }

    // menu loop
    while (!endRequested) {
      const choice = await ui.panel(
        `Choose an activity.\nStrong-eye contrast: ${staircase.contrast().toFixed(2)} · played ${Math.round(safety.activeMinutes())} min\nB or Y button = DOUBLE VISION / STOP (always active)`,
        [
          { id: 'calibration', label: 'Calibration check' },
          { id: 'brick', label: 'Brick breaker' },
          { id: 'end', label: 'End session', color: '#b03030' },
        ],
      );
      if (choice === 'end' || endRequested) break;
      if (choice === 'calibration') await calibration.run(ctx);
      else if (choice === 'brick') await brickbreaker.run(ctx);
    }
    await endSession();
  }

  async function endSession() {
    store.tick(safety.activeMinutes());
    store.endSession(staircase.contrast());
    const session = renderer.xr.getSession();
    if (session) await session.end().catch(() => {});
  }

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (renderer.xr.isPresenting) {
      safety.update(dt, renderer.xr.getSession());
      ui.update();
      for (const fn of frameFns) fn(dt);
    }
    renderer.render(scene, camera);
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // Debug/testing hooks (used by the desktop emulator flow tests).
  window.__vt = {
    ui,
    safety,
    store,
    staircase,
    scene,
    renderer,
    press: (label) => ui.debugPress(label),
    panelText: () => ui.lastPanelText,
    buttons: () => ui.buttons.map((b) => b.userData.label),
    stop: () => {
      window.__vtStopFlag = true;
    },
    forceFrame(dt = 1 / 72) {
      if (renderer.xr.isPresenting) {
        safety.update(dt, renderer.xr.getSession());
        ui.update();
        for (const fn of frameFns) fn(dt);
      }
      renderer.render(scene, camera);
    },
  };
}
