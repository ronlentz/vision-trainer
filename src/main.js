// Entry point.
//   default    → the trainer app
//   ?smoke     → per-eye rendering smoke test (regression check)
//   ?emulator  → additionally install the IWER WebXR emulator (Quest 2
//                profile) for desktop testing without a headset
async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.has('emulator')) {
    const { XRDevice, metaQuest2 } = await import('iwer');
    const device = new XRDevice(metaQuest2);
    device.installRuntime({ forceInstall: true });
    device.stereoEnabled = true;
    window.__iwerDevice = device;
  }
  if (params.has('smoke')) {
    (await import('./smoketest.js')).start();
  } else {
    (await import('./app.js')).start();
  }
}

boot();
