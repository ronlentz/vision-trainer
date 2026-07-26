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
import * as bubblepop from './activities/bubblepop.js';
import * as ringtoss from './activities/ringtoss.js';
import * as vergence from './activities/vergence.js';
import { syncNow, syncStatus, getSyncConfig, archiveSnapshot } from './sync.js';
import { localDay } from './store.js';

const hudEl = document.getElementById('hud');

export async function start() {
  // Supervised admin actions via URL params, in order:
  // 1. ?program-start=fresh — archive everything to the sync repo, then wipe
  //    local history and reset the staircase: official day zero.
  // 2. ?set-contrast=0.2 — manual contrast set (e.g. doctor's balance point).
  //
  // BOTH require a one-time token: &once=<any-unique-string>. Each token is
  // consumed on first use, and a URL without one is IGNORED. Reason: the
  // Quest browser resurfaces old URLs from history — a replayed
  // ?set-contrast link once silently undid a legitimate double-vision
  // back-off. Admin links must never be replayable.
  const qp = new URLSearchParams(location.search);
  const CONSUMED_KEY = 'vt.admin.consumed.v1';
  const onceToken = qp.get('once');
  const consumed = JSON.parse(localStorage.getItem(CONSUMED_KEY) || '[]');
  let adminActed = false;
  const adminAllowed = (name) => {
    if (qp.get(name) === null) return false;
    if (!onceToken) {
      console.warn(`[vt] ${name} ignored: no once= token (stale/replayed link?)`);
      return false;
    }
    if (consumed.includes(onceToken)) {
      console.warn(`[vt] ${name} ignored: once= token already used`);
      return false;
    }
    return true;
  };

  if (adminAllowed('program-start') && qp.get('program-start') === 'fresh') {
    const arch = await archiveSnapshot('preprogram');
    if (getSyncConfig() && arch.state !== 'ok') {
      alert('Program start ABORTED: could not archive old data (' + (arch.error || arch.state) + '). Nothing was deleted.');
    } else {
      adminActed = true;
      store.resetAll();
      staircase.reset();
      localStorage.setItem('vt.program.v1', JSON.stringify({ startDay: localDay() }));
      console.log('[vt] program started fresh; archive:', arch.path || 'no sync configured');
    }
  }

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

  // Supervised one-time contrast set via URL (?set-contrast=0.2&once=...),
  // for remote corrections. Logged in the staircase history like any change.
  if (adminAllowed('set-contrast')) {
    const scParam = parseFloat(qp.get('set-contrast'));
    if (!Number.isNaN(scParam)) {
      adminActed = true;
      const to = staircase.setManual(scParam, 'manual-set-url');
      console.log(`[vt] contrast manually set to ${to}`);
    }
  }
  if (adminActed) {
    consumed.push(onceToken);
    localStorage.setItem(CONSUMED_KEY, JSON.stringify(consumed));
    // strip params so a reload of this tab can't even attempt a replay
    history.replaceState(null, '', location.pathname + (qp.has('emulator') ? '?emulator' : ''));
  }

  // Desktop 2D info
  function refreshHudEl() {
    const st = syncStatus();
    const syncLine = getSyncConfig()
      ? `auto-sync: ${st.state}${st.ts ? ' (' + new Date(st.ts).toLocaleString() + ')' : ''}`
      : 'auto-sync: not set up (Sync setup button, top right)';
    hudEl.textContent = [
      'Vision Trainer',
      `strong-eye contrast: ${staircase.contrast().toFixed(2)} · weak eye: ${weakEyeName}`,
      'Put the headset on and click Enter VR. Add ?emulator for desktop testing.',
      syncLine,
    ].join('\n');
  }
  refreshHudEl();

  // catch anything a crashed/closed prior session didn't upload
  if (getSyncConfig()) syncNow('app-load').then(refreshHudEl);

  // Prefer 90 Hz (spec targets 72-90): less sample-and-hold smear on fast
  // weak-eye objects like the brick breaker ball.
  let appliedFrameRate = null;
  renderer.xr.addEventListener('sessionstart', () => {
    try {
      const session = renderer.xr.getSession();
      const rates = session.supportedFrameRates;
      if (rates?.length && session.updateTargetFrameRate) {
        const best = Math.max(...[...rates].filter((r) => r <= 91));
        if (best > 0) {
          session
            .updateTargetFrameRate(best)
            .then(() => {
              appliedFrameRate = best;
              console.log(`[vt] target frame rate ${best} Hz`);
            })
            .catch(() => {});
        }
      }
    } catch {
      /* frame-rate control unsupported — keep default */
    }
    sessionFlow().catch((e) => {
      console.error('[vt] session flow error', e);
    });
  });

  async function sessionFlow() {
    const played = { any: false, brick: false, vergence: false };
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
    if (appliedFrameRate) store.logEvent('display', { frameRate: appliedFrameRate });

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
          { id: 'bubble', label: 'Bubble pop' },
          { id: 'brick', label: 'Brick breaker' },
          { id: 'ring', label: 'Ring toss' },
          { id: 'vergence', label: 'Vergence trainer' },
          { id: 'end', label: 'End session', color: '#b03030' },
        ],
      );
      if (choice === 'end' || endRequested) break;
      if (choice === 'calibration') {
        await calibration.run(ctx);
        played.any = true;
      } else if (choice === 'bubble') {
        await bubblepop.run(ctx);
        played.any = true;
      } else if (choice === 'brick') {
        await brickbreaker.run(ctx);
        played.any = true;
        played.brick = true;
      } else if (choice === 'ring') {
        await ringtoss.run(ctx);
        played.any = true;
      } else if (choice === 'vergence') {
        await vergence.run(ctx);
        played.any = true;
        played.vergence = true;
      }
    }
    if (played.any) await endOfSessionCheckin(played);
    await endSession();
  }

  // End-of-session check-in: subjective symptoms, asked in-headset and
  // logged on-device so nothing needs manual note-taking. A double-vision
  // report backs the staircase off, same as the B/Y stop — unless a stop
  // already lowered it this session (no double punishment).
  async function endOfSessionCheckin(played) {
    // The vergence exercise MAKES the target double on purpose — that must
    // not be reported (or back the staircase off) as a symptom.
    const dv = await ui.panel(
      played.vergence
        ? 'Quick check-in — recorded for your eye doctor.\nNOT counting the vergence exercise (doubling there is the point), any double vision during play, even briefly?'
        : 'Quick check-in — recorded for your eye doctor.\nAny double vision during play, even briefly?',
      [
        { id: 'none', label: 'None' },
        { id: 'brief', label: 'Briefly' },
        { id: 'often', label: 'A lot', color: '#b03030' },
      ],
    );
    const strain = await ui.panel(
      'Eye strain, headache, or other discomfort?',
      [
        { id: 'none', label: 'None' },
        { id: 'mild', label: 'Mild' },
        { id: 'strong', label: 'Strong', color: '#b03030' },
      ],
    );
    let paddle = null;
    if (played.brick) {
      paddle = await ui.panel(
        'The faint paddle (strong eye): how visible was it today?',
        [
          { id: 'easy', label: 'Easy to see' },
          { id: 'hard', label: 'Hard but usable' },
          { id: 'invisible', label: 'Nearly invisible' },
        ],
      );
    }
    store.logEvent('checkin', { doubleVision: dv, strain, paddleVisibility: paddle });

    const alreadyBackedOff = store
      .currentEvents()
      .some((e) => e.type === 'double-vision');
    if (dv !== 'none' && !alreadyBackedOff) {
      const before = staircase.contrast();
      const after = staircase.backOff('checkin-double-vision', { report: dv });
      store.logEvent('double-vision', {
        activity: 'checkin',
        contrastBefore: before,
        contrastAfter: after,
      });
      await ui.panel(
        `Because you reported double vision, strong-eye contrast is lowered for next time: ${before.toFixed(2)} → ${after.toFixed(2)}.\nIf it keeps happening, tell your eye doctor.`,
        [{ id: 'ok', label: 'OK' }],
      );
    }
    if (strain === 'strong') {
      await ui.panel(
        'Strong discomfort is worth a shorter session tomorrow — and mention it to your eye doctor.',
        [{ id: 'ok', label: 'OK' }],
      );
    }
  }

  async function endSession() {
    store.tick(safety.activeMinutes());
    store.endSession(staircase.contrast());
    syncNow('session-end').then(refreshHudEl);
    const session = renderer.xr.getSession();
    if (session) await session.end().catch(() => {});
  }

  const clock = new THREE.Clock();
  let lastPeriodicSyncMs = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (renderer.xr.isPresenting) {
      safety.update(dt, renderer.xr.getSession());
      ui.update();
      for (const fn of frameFns) fn(dt);
      // crash protection: snapshot to the private repo every 5 min of play
      if (
        getSyncConfig() &&
        safety.activityName &&
        safety.activeMs - lastPeriodicSyncMs >= 5 * 60_000
      ) {
        lastPeriodicSyncMs = safety.activeMs;
        store.tick(safety.activeMinutes());
        syncNow('periodic');
      }
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
