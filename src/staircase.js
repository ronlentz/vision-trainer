// The adaptive staircase — the actual therapy. Values follow the published
// PEDIG binocular-treatment protocol (NCT02200211). Do not tune these.
//
//   - weak-eye contrast is ALWAYS 1.0 (never reduced, enforced in config)
//   - strong eye starts at config.startingContrast (0.20 default, or the
//     optometrist's measured balance point)
//   - step 0.10 up/down, floor 0.10, ceiling 1.0 (goal state)
//   - one adjustment per DAY, evaluated over that day's total play:
//       < 30 min play        → no change
//       target met           → +0.10
//       target missed        → -0.10
//
// The daily performance target is FIXED for the whole program so the contrast
// trend stays meaningful: overall success/attempts ratio ≥ 0.75 across that
// day's games (per spec's Bubble Pop example of ≥75% pop accuracy).

import config from './config.js';
import { localDay } from './store.js';

const KEY = 'vt.staircase.v1';
export const STEP = 0.1;
export const FLOOR = 0.1;
export const CEILING = 1.0;
export const MIN_DAILY_MINUTES = 30;
export const PERF_TARGET = 0.75; // fixed for the whole program

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s.contrast === 'number') return s;
  } catch {
    /* fall through */
  }
  return { contrast: config.startingContrast, evaluatedDays: [], log: [] };
}

let state = load();

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function setContrastLevel(next, reason, inputs) {
  const from = state.contrast;
  const to = Math.min(CEILING, Math.max(FLOOR, Math.round(next * 100) / 100));
  state.contrast = to;
  state.log.push({ ts: Date.now(), from, to, reason, inputs });
  save();
  return to;
}

export const staircase = {
  contrast: () => state.contrast,
  log: () => state.log,

  // DOUBLE VISION / STOP: back off one step immediately.
  backOff(reason, inputs = {}) {
    return setContrastLevel(state.contrast - STEP, reason, inputs);
  },

  // Supervised correction (e.g. undoing button-test back-offs, or applying
  // an optometrist-measured balance point). Always logged like any change.
  setManual(value, reason) {
    return setContrastLevel(value, reason, { manual: true });
  },

  // Called at app start: evaluate the most recent completed play day that has
  // not been evaluated yet (a day is complete once the local date has moved
  // on). One adjustment per day, driven by that day's full totals.
  evaluatePendingDay(store) {
    const today = localDay();
    const pending = store
      .playDays()
      .filter((d) => d < today && !state.evaluatedDays.includes(d));
    if (pending.length === 0) return null;
    const day = pending[pending.length - 1]; // most recent completed day
    // Mark every older pending day evaluated-without-adjustment so a long gap
    // can never queue up multiple adjustments.
    for (const d of pending) if (d !== day) state.evaluatedDays.push(d);

    const t = store.dayTotals(day);
    let result;
    if (t.minutes < MIN_DAILY_MINUTES) {
      result = { day, change: 'none', why: `only ${t.minutes} min (<${MIN_DAILY_MINUTES})` };
      state.log.push({ ts: Date.now(), from: state.contrast, to: state.contrast, reason: 'daily-eval-no-change', inputs: t });
    } else {
      const ratio = t.attempts > 0 ? t.success / t.attempts : 0;
      if (ratio >= PERF_TARGET) {
        setContrastLevel(state.contrast + STEP, 'daily-eval-raise', { ...t, ratio });
        result = { day, change: 'raise', why: `ratio ${ratio.toFixed(2)} ≥ ${PERF_TARGET}` };
      } else {
        setContrastLevel(state.contrast - STEP, 'daily-eval-lower', { ...t, ratio });
        result = { day, change: 'lower', why: `ratio ${ratio.toFixed(2)} < ${PERF_TARGET}` };
      }
    }
    state.evaluatedDays.push(day);
    save();
    return result;
  },
};
