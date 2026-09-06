// phase26/harness.js — shared isolated-prototype harness.
// Live area: fullscreen black hole + camera orbit + zoom, animation, quality
// presets, and performance measuring hooks. NOT the production game.
//
// URL query params:
//   ?m=CURRENT|A|B|HYBRID&q=low|medium|high&angle=front|30|60|side|top|bottom
//   &azim=deg&elev=deg&dist=d&w=width&h=height
//
// Exposes window.__PROTO = { mode, quality, setQuality, setOrbit, getStats,
// nextFrame } for the puppeteer harness.

const qs = new URLSearchParams(location.search);
export const PARAMS = {
  mode: (qs.get('m') || 'CURRENT').toUpperCase(),
  quality: qs.get('q') || 'medium',
  angle: qs.get('angle') || 'front',
  azim: parseFloat(qs.get('azim') || '0'),
  elev: parseFloat(qs.get('elev') || '0'),
  dist: parseFloat(qs.get('dist') || '500'),
};

// ---- renderer entry points. Each module exports:
//   create({scene, camera, hr, quality}) -> {
//     objects: [...],        // THREE objects added to scene already
//     update(dt, time),      // per-frame animation
//     setQuality(q),
//     setCamera(camera),     // called when camera moves (billboards etc.)
//     destroy(scene)         // remove everything
//   }
// And builds its own starfield so each mode is self-contained.

const MODE_QUIRKS = {
  CURRENT: () => import('./modes/current.js'),
  A: () => import('./modes/ref_a.js'),
  B: () => import('./modes/ref_b.js'),
  HYBRID: () => import('./modes/hybrid.js'),
};

const HR = 40;          // horizon radius, matches the game's world scale
const CAM_DIST_DEFAULT = 500;

// ---- angles (facing the hole): elevation in degrees, azimuth offset for variety
const ANGLE_DEFS = {
  front:   { azim: 0,   elev: 0 },
  angle30: { azim: 0,   elev: 30 },
  angle60: { azim: 0,   elev: 60 },
  side:    { azim: 20,  elev: 90 },
  top:     { azim: 0,   elev: 90 },
  bottom:  { azim: 0,   elev: -90 },
};

function applyAngle(camera, azimDeg, elevDeg, dist, target) {
  const toRad = (d) => (d * Math.PI) / 180;
  const a = toRad(azimDeg), e = toRad(elevDeg);
  camera.position.set(
    dist * Math.cos(e) * Math.sin(a),
    dist * Math.sin(e),
    dist * Math.cos(e) * Math.cos(a)
  );
  camera.lookAt(target);
}

export async function boot() {
  const container = document.getElementById('stage');
  const w = parseInt(qs.get('w') || container.clientWidth, 10);
  const h = parseInt(qs.get('h') || container.clientHeight, 10);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
  renderer.setSize(w, h);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 12000);
  const target = new THREE.Vector3(0, 0, 0);

  const modeFactory = MODE_QUIRKS[PARAMS.mode];
  const mod = await modeFactory();
  const mode = mod.create({ scene, camera, hr: HR, quality: PARAMS.quality, renderer });

  const angleDef = ANGLE_DEFS[PARAMS.angle] || ANGLE_DEFS.front;
  applyAngle(camera, angleDef.azim + PARAMS.azim, angleDef.elev + PARAMS.elev,
    PARAMS.dist || CAM_DIST_DEFAULT, target);

  container.appendChild(renderer.domElement);

  // ---- animation + measurement
  let raf = 0, last = performance.now(), clock = 0;
  let frames = 0, accMs = 0;
  const fps = { value: 0 };
  let liveMs = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    const t0 = performance.now();
    mode.update(dt, clock);
    mode.setCamera && mode.setCamera(camera);
    if (mode.render) mode.render(renderer, scene, camera);
    else renderer.render(scene, camera);
    const t1 = performance.now();
    liveMs = t1 - t0;
    frames++; accMs += t1 - t0;
    if (frames % 60 === 0) {
      fps.value = 1000 / (accMs / frames);
      frames = 0; accMs = 0;
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  window.__PROTO = {
    mode: PARAMS.mode,
    modeObj: mode,
    quality: PARAMS.quality,
    renderOnce() {
      mode.update(1 / 60, clock);
      if (mode.setCamera) mode.setCamera(camera);
      if (mode.render) mode.render(renderer, scene, camera);
      else renderer.render(scene, camera);
    },
    setQuality(q) {
      PARAMS.quality = q;
      mode.setQuality(q);
    },
    setOrbit(azim, elev, dist) {
      applyAngle(camera, azim, elev, dist || CAM_DIST_DEFAULT, target);
    },
    getStats: () => ({
      fps: Math.round(fps.value),
      frameMs: +liveMs.toFixed(3),
      draws: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      geoms: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs ? renderer.info.programs.length : -1,
      mode: PARAMS.mode,
      quality: PARAMS.quality,
      devicePixelRatio: window.devicePixelRatio,
      viewport: `${w}x${h}`,
    }),
    renderer,
    camera,
    scene,
    destroy() {
      cancelAnimationFrame(raf);
      mode.destroy(scene);
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      renderer.dispose();
    },
  };
  return window.__PROTO;
}
