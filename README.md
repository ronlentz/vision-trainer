# Vision Trainer (WebXR / Meta Quest)

Dichoptic (per-eye) vision training app. Plain JavaScript + Three.js + WebXR.

Current features:

- **Safety systems** (always active): DOUBLE VISION / STOP on the B or Y
  controller button (pauses, logs, lowers strong-eye contrast one step),
  forced break every 10 min, hard session cap at 25 min, per-session
  pre-check and start banner.
- **Calibration + suppression check**: ring to the weak eye only, then a
  fusion check (frame to one eye, cross to the other).
- **Bubble pop** (main staircase driver): bubbles → weak eye (full
  contrast), drifting distractor field → strong eye (attenuated);
  point-and-trigger to pop; accuracy = popped / (popped + escaped).
- **Brick breaker**: paddles (one per hand) → strong eye
  (contrast-attenuated), ball and bricks → weak eye (full contrast).
- **Ring toss**: target ring → weak eye, thrown ball → both eyes; depth
  judgment through fusion. Scored per-game, excluded from the staircase.
- **Vergence trainer**: fused target approaches/recedes; trigger marks the
  split (break) and re-fusion (recovery) distances, 3 rounds, logged.
- **Doctor report**: 2D-page button producing a one-page HTML summary
  (contrast trend headline) plus a CSV that opens in Excel.
- **Program start**: `?program-start=fresh` archives all data to the sync
  repo then resets history and staircase — official day zero. Combine with
  `?set-contrast=` to apply a measured balance point.
- **Adaptive staircase** (PEDIG protocol values): strong-eye contrast starts
  0.20, adjusts ±0.10 once per completed day (≥30 min play required;
  success ratio ≥0.75 raises, below lowers; floor 0.10, ceiling 1.0).
  Every adjustment is logged with its inputs.
- All state in `localStorage`; JSON export/import buttons on the 2D page.
- `?smoke` URL flag: the original per-eye rendering smoke test
  (red cube = left eye, blue cube = right eye).

## Run locally (desktop, no headset)

```
npm install
npm run dev
```

Open http://localhost:5173/?emulator — the `?emulator` flag loads the IWER
WebXR emulator (Quest 2 profile). Click ENTER VR; the HUD prints the
PASS/FAIL line.

## Run on a Quest on the same network

```
npm run dev:lan
```

Serves over HTTPS via mkcert (first run installs a local dev CA). Open
`https://<this-machine's-LAN-IP>:5173` in the Quest browser and click through
the one-time certificate warning.

## Deploy

Pushing to `main` builds and publishes via GitHub Actions
(`.github/workflows/deploy.yml`) to GitHub Pages. A `netlify.toml` is
included as an alternative target.
