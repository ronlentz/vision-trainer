# Vision Trainer (WebXR / Meta Quest)

Dichoptic (per-eye) vision training app. Plain JavaScript + Three.js + WebXR.

Current features:

- **Safety systems** (always active): DOUBLE VISION / STOP on the B or Y
  controller button (pauses, logs, lowers strong-eye contrast one step),
  forced break every 10 min, hard session cap at 25 min, per-session
  pre-check and start banner.
- **Calibration + suppression check**: ring to the weak eye only, then a
  fusion check (frame to one eye, cross to the other).
- **Brick breaker**: paddle → strong eye (contrast-attenuated), ball and
  bricks → weak eye (full contrast).
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
