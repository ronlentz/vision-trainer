// Minimal VR UI: canvas-textured text panels with raycast buttons, driven by
// controller trigger (select). Everything renders on layer 0 (both eyes).
import * as THREE from 'three';

const PX_PER_M = 1000;

function makeTextMesh(text, wPx, hPx, { bg = '#2a2a2e', fg = '#ffffff', font = 34, radius = 24 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = wPx;
  canvas.height = hPx;
  const ctx = canvas.getContext('2d');

  const draw = (t, opts = {}) => {
    const b = opts.bg || bg;
    const f = opts.fg || fg;
    ctx.clearRect(0, 0, wPx, hPx);
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.roundRect(0, 0, wPx, hPx, radius);
    ctx.fill();
    ctx.fillStyle = f;
    ctx.font = `${opts.font || font}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // wrap: split paragraphs on \n, wrap each to width
    const maxW = wPx - 60;
    const lines = [];
    for (const para of String(t).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const probe = line ? line + ' ' + word : word;
        if (ctx.measureText(probe).width > maxW && line) {
          lines.push(line);
          line = word;
        } else {
          line = probe;
        }
      }
      lines.push(line);
    }
    const lh = (opts.font || font) * 1.35;
    const y0 = hPx / 2 - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => ctx.fillText(l, wPx / 2, y0 + i * lh));
    tex.needsUpdate = true;
  };

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(wPx / PX_PER_M, hPx / PX_PER_M),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  draw(text);
  mesh.userData.redraw = draw;
  return mesh;
}

export class UI {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.buttons = [];
    this.busy = false;
    this.lastPanelText = '';
    this._raycaster = new THREE.Raycaster();
    this._raycaster.layers.set(0);
    this._tmpMat = new THREE.Matrix4();

    this.controllers = [];
    for (let i = 0; i < 2; i++) {
      const c = renderer.xr.getController(i);
      const rayGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -3),
      ]);
      const ray = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
      ray.name = 'uiRay'; // activities may shorten it to the aimed target
      c.add(ray);
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      c.add(tip);
      c.addEventListener('selectstart', () => this._select(c));
      scene.add(c);
      this.controllers.push(c);
    }
  }

  _hit(controller) {
    if (this.buttons.length === 0) return null;
    this._tmpMat.identity().extractRotation(controller.matrixWorld);
    this._raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this._raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this._tmpMat);
    const hits = this._raycaster.intersectObjects(this.buttons, false);
    return hits.length ? hits[0].object : null;
  }

  _select(controller) {
    const b = this._hit(controller);
    if (b && b.userData.onClick && !b.userData.disabled) b.userData.onClick();
  }

  // Called from console/debug: press a button by (partial) label.
  debugPress(label) {
    const b = this.buttons.find((x) =>
      x.userData.label.toLowerCase().includes(label.toLowerCase()),
    );
    if (b && !b.userData.disabled) {
      b.userData.onClick();
      return `pressed: ${b.userData.label}`;
    }
    return `no enabled button matching "${label}" — have: ${this.buttons
      .map((x) => x.userData.label + (x.userData.disabled ? ' (disabled)' : ''))
      .join(', ')}`;
  }

  update() {
    // hover highlight
    const hovered = new Set();
    for (const c of this.controllers) {
      const b = this._hit(c);
      if (b) hovered.add(b);
    }
    for (const b of this.buttons) {
      const want = hovered.has(b) && !b.userData.disabled ? 1.08 : 1.0;
      b.scale.setScalar(want);
    }
  }

  // Show a panel with text + buttons; resolves with the pressed button's id.
  // opts: { y, z, minShowMs } — minShowMs guards against accidental clicks.
  panel(text, buttonDefs, opts = {}) {
    return new Promise((resolve) => {
      this.busy = true;
      this.lastPanelText = text;
      const g = new THREE.Group();
      const body = makeTextMesh(text, 1100, 460, { font: 36 });
      g.add(body);

      const shownAt = performance.now();
      const minShowMs = opts.minShowMs ?? 400;
      const cleanup = (id) => {
        this.buttons = this.buttons.filter((b) => !btnMeshes.includes(b));
        this.root.remove(g);
        g.traverse((o) => {
          if (o.material) {
            o.material.map?.dispose();
            o.material.dispose();
          }
          o.geometry?.dispose();
        });
        this.busy = false;
        resolve(id);
      };

      const btnMeshes = [];
      const n = buttonDefs.length;
      const perRow = n > 3 ? 3 : n; // wrap wide menus into rows of 3
      buttonDefs.forEach((def, i) => {
        const w = 420;
        const btn = makeTextMesh(def.label, w, 130, {
          bg: def.color || '#3d6ef7',
          font: 40,
        });
        const rowIdx = Math.floor(i / perRow);
        const col = i % perRow;
        const rowCount = Math.min(perRow, n - rowIdx * perRow);
        btn.position.set(
          (col - (rowCount - 1) / 2) * ((w / PX_PER_M) + 0.06),
          -0.36 - rowIdx * 0.16,
          0.01,
        );
        btn.userData.label = def.label;
        btn.userData.disabled = !!def.disabled;
        if (def.disabled) btn.userData.redraw(def.label, { bg: '#555555', fg: '#999999' });
        btn.userData.enable = () => {
          btn.userData.disabled = false;
          btn.userData.redraw(def.label, { bg: def.color || '#3d6ef7' });
        };
        btn.userData.onClick = () => {
          if (performance.now() - shownAt < minShowMs) return;
          cleanup(def.id);
        };
        g.add(btn);
        btnMeshes.push(btn);
        this.buttons.push(btn);
      });

      g.position.set(0, opts.y ?? 1.45, opts.z ?? -1.25);
      this.root.add(g);
      // expose for countdown-style panels
      this._activePanel = { group: g, body, btnMeshes, setText: (t) => { this.lastPanelText = t; body.userData.redraw(t); } };
    });
  }

  activePanel() {
    return this._activePanel;
  }

  // Small persistent HUD line (score/time), layer 0.
  makeHud() {
    const mesh = makeTextMesh('', 900, 90, { bg: 'rgba(20,20,24,0.85)', font: 40 });
    mesh.position.set(0, 2.0, -1.4);
    this.root.add(mesh);
    return {
      mesh,
      set: (t) => mesh.userData.redraw(t),
      dispose: () => this.root.remove(mesh),
    };
  }
}
