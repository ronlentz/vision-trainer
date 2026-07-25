# Vision Trainer — WebXR Per-Eye Rendering Smoke Test

A minimal WebXR (Meta Quest) test that verifies per-eye rendering with
Three.js layers:

- Red cube → layer 1 → LEFT eye only
- Blue cube → layer 2 → RIGHT eye only
- Grid + white sphere → layer 0 → both eyes

In the headset: enter VR and close one eye at a time — exactly one cube
should disappear. An on-screen HUD also self-checks the per-eye camera
layer masks and prints PASS/FAIL.

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
