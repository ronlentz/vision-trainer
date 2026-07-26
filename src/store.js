// All state lives in localStorage. Sessions are persisted incrementally so a
// crash mid-session loses at most a few seconds of bookkeeping.

const KEY = 'vt.sessions.v1';

export function localDay(ts = Date.now()) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

function save(sessions) {
  localStorage.setItem(KEY, JSON.stringify(sessions));
}

let sessions = load();
let current = null;

export const store = {
  allSessions: () => sessions,

  startSession(contrast) {
    current = {
      id: `s${Date.now()}`,
      day: localDay(),
      startTs: Date.now(),
      endTs: null,
      activeMinutes: 0,
      activities: [],
      events: [],
      success: 0,
      attempts: 0,
      startContrast: contrast,
      finalContrast: contrast,
    };
    sessions.push(current);
    save(sessions);
    return current;
  },

  logEvent(type, data = {}) {
    if (!current) return;
    current.events.push({ ts: Date.now(), type, ...data });
    save(sessions);
  },

  currentEvents() {
    return current ? current.events : [];
  },

  addActivity(name) {
    if (!current) return;
    if (!current.activities.includes(name)) current.activities.push(name);
    save(sessions);
  },

  addResult(successDelta, attemptDelta) {
    if (!current) return;
    current.success += successDelta;
    current.attempts += attemptDelta;
    // saved by the periodic tick to avoid a write per brick
  },

  tick(activeMinutes) {
    if (!current) return;
    current.activeMinutes = Math.round(activeMinutes * 100) / 100;
    save(sessions);
  },

  endSession(finalContrast) {
    if (!current) return;
    current.endTs = Date.now();
    current.finalContrast = finalContrast;
    save(sessions);
    current = null;
  },

  // Totals for one calendar day, across all of that day's sessions.
  dayTotals(day) {
    const list = sessions.filter((s) => s.day === day);
    return {
      day,
      minutes: list.reduce((a, s) => a + (s.activeMinutes || 0), 0),
      success: list.reduce((a, s) => a + (s.success || 0), 0),
      attempts: list.reduce((a, s) => a + (s.attempts || 0), 0),
      doubleVisionEvents: list.reduce(
        (a, s) => a + s.events.filter((e) => e.type === 'double-vision').length,
        0,
      ),
    };
  },

  playDays() {
    return [...new Set(sessions.map((s) => s.day))].sort();
  },

  exportJSON() {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        sessions,
        staircase: JSON.parse(localStorage.getItem('vt.staircase.v1') || 'null'),
      },
      null,
      2,
    );
  },

  importJSON(text) {
    const data = JSON.parse(text);
    if (!Array.isArray(data.sessions)) throw new Error('bad import: no sessions array');
    sessions = data.sessions;
    save(sessions);
    if (data.staircase) localStorage.setItem('vt.staircase.v1', JSON.stringify(data.staircase));
  },
};
