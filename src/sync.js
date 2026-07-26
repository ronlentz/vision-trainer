// Optional auto-sync: pushes the full data snapshot to a PRIVATE GitHub repo
// via the contents API, so nobody has to remember to export.
//
// Setup is on-device only: a fine-grained token (scoped to the one private
// data repo, Contents read/write) is pasted into the 2D page once and stored
// in localStorage. The token is NEVER part of this public code, never
// included in the synced payload, and never leaves the device except to
// api.github.com.
import { store } from './store.js';

const CFG_KEY = 'vt.sync.v1';
const STATUS_KEY = 'vt.sync.status.v1';

export function getSyncConfig() {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY));
  } catch {
    return null;
  }
}

export function setSyncConfig(cfg) {
  if (!cfg) localStorage.removeItem(CFG_KEY);
  else localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

export function syncStatus() {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY)) || { state: 'never' };
  } catch {
    return { state: 'never' };
  }
}

function setStatus(s) {
  localStorage.setItem(STATUS_KEY, JSON.stringify({ ...s, ts: Date.now() }));
}

function b64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

async function ghPut(cfg, path, content, message, sha) {
  const body = { message, content: b64(content) };
  if (sha) body.sha = sha;
  return fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function ghGetSha(cfg, path) {
  const r = await fetch(
    `https://api.github.com/repos/${cfg.repo}/contents/${path}?ref=main`,
    { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' } },
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`sha lookup ${r.status}`);
  return (await r.json()).sha;
}

// One-shot archive (e.g. before a program-start reset) to a unique path.
export async function archiveSnapshot(tag) {
  const cfg = getSyncConfig();
  if (!cfg || !cfg.token || !cfg.repo) return { state: 'unconfigured' };
  const path = `data/archive/${tag}-${Date.now()}.json`;
  try {
    const r = await ghPut(cfg, path, store.exportJSON(), `archive: ${tag}`);
    if (!r.ok) throw new Error(`archive upload ${r.status}`);
    return { state: 'ok', path };
  } catch (e) {
    return { state: 'error', error: String(e.message || e) };
  }
}

let inFlight = false;

// Uploads the full snapshot to data/latest-<device>.json (overwritten each
// time — full history is inside the payload). Safe to call often; coalesces.
export async function syncNow(reason) {
  const cfg = getSyncConfig();
  if (!cfg || !cfg.token || !cfg.repo) return { state: 'unconfigured' };
  if (inFlight) return { state: 'in-flight' };
  inFlight = true;
  const path = `data/latest-${cfg.device || 'quest'}.json`;
  try {
    const payload = store.exportJSON(); // sessions + staircase, never the token
    const message = `sync: ${reason} (${new Date().toISOString()})`;
    let sha = await ghGetSha(cfg, path);
    let r = await ghPut(cfg, path, payload, message, sha);
    if (r.status === 409 || r.status === 422) {
      // sha raced; refresh once and retry
      sha = await ghGetSha(cfg, path);
      r = await ghPut(cfg, path, payload, message, sha);
    }
    if (!r.ok) throw new Error(`upload ${r.status}`);
    const st = { state: 'ok', reason };
    setStatus(st);
    return st;
  } catch (e) {
    const st = { state: 'error', reason, error: String(e.message || e) };
    setStatus(st);
    return st;
  } finally {
    inFlight = false;
  }
}
