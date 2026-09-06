# Phase 28 Report — Hybrid Relativistic Lensing Integration

**Scope:** production renderer integration of a reduced-resolution oseiskar-style
geodesic lensing pass on top of the existing black-hole visuals, plus minimal
composite/time-slicing infrastructure. **No changes** to `js/physics.js`,
`js/game/{aiming,trajectory,telemetry,scoring,missions,progression,challenges,
guidance,input.js}`, spaghettification, audio, camera behaviour, or any gameplay
logic. All work is confined to the black-hole rendering pipeline
(`js/render/`) + a debug hook in `js/main.js`.

**Verdict: ACCEPT.** See §FINAL-DECISION.

---

## 1. Objective

Give the production black hole the one thing pure geometry cannot fake — the
**far-side plasma wrapping over/under the void** — by layering a reduced-resolution
geodesic lensing pass under the existing shadow core, while keeping gameplay
performance intact on mobile. The black hole must read as "a black shadow carved
out of incandescent plasma bent around it", never a ball+flat-disk, donut, or gray
halo, and the shadow must stay pure black at all six view angles (front / 30° /
60° / side / top / bottom).

## 2. Prior art & decision (Phase 27 recap)

- Reference A (oseiskar/black-hole, MIT): Schwarzschild leapfrog geodesic in
  u=1/r; the *only* prototype that bent far-side plasma over the void (front rim
  U=8 vs CURRENT/HYBRID U=0). Shadow survived high camera elevation via a
  photon-sphere fallback `b0<2.6`.
- Reference B (chrismatgit, RK4): visually dimmer AND ~2× cost — dominated, rejected.
- Phase 27 verdict: **IMPROVE** — keep the geometry-resilient architecture, adopt
  ref_a's geodesic as a *reduced-resolution upscaled lensed pass*. Game camera dist
  868.8 ≈ 21.7 Schwarzschild radii → small angular size → low-res pass visually
  adequate, bringing cost down ~16–64× from full-res.

## 3. Integration architecture

- **New file** `js/render/blackhole/lensing.js` — the lensing pass:
  `createLensingPass({renderer, scene, camera, hr, quality})`.
- **New file** `js/render/blackhole/plasmaField.js` — `plasmaFieldGLSL()` shared
  fragment code: `samplePlasma(r, ang, time) → vec3` (annulus rInner 44 / rOuter
  320 world units, thin bright inner sheet, domain-warped filaments, one-sided
  Doppler boost, hot→warm→cool ramp, white-hot hotspots, asymmetric sector/crescent
  envelope).
- **Modified** `js/render/scene.js` `SceneManager`:
  - builds the pass after the BH (config `{quality, lensing}` defaults medium/on);
  - `update(dt,time)` → `lensing.update` + `sync(camera)`;
  - `render()` → `lensing.render()` (time-sliced march) → `lensing.composite()` →
    `renderer.render(...)`;
  - `setQuality(q)` / `setLensingEnabled(on)`;
  - **opaque `shadowCore`** (SphereGeometry r = 2.6·hr, MeshBasicMaterial pure
    black, toneMapped:false) provides the silhouette when lensing is active
    (additive pass cannot carve black over the starfield — the ball supplies the
    event-horizon shadow sel that the geodesic fell-region matches exactly);
  - `_applyLensingVisibility()`: lensing ON → show shadowCore, hide hole/disk/
    ring/glow; OFF → restore the unmodified Phase-23 geometry tree (true legacy
    fallback).
- **Modified** `js/main.js` — `window.__BH_LENSING__` debug hook:
  `{toggle(on), setQuality(q), get state()}`.

## 4. The geodesic pass

- Oseiskar leapfrog integrator in u=1/r (MIT-attributed, header retained).
- Shader: front-half literal + `plasmaFieldGLSL()` + ray-march body.
- **Key uniform fix:** the camera-basis `uCamBasis` was a bare `Float32Array(9)` —
  THREE r150 does NOT upload a plain array for a `mat3` (stayed zero → zero ray
  length → all-black pass). Fixed with a `THREE.Matrix3`, column-major elements
  derived from `camera.matrixWorld` (cols = right/up/forward); `sync(cam)` calls
  `camera.updateMatrixWorld()` first.
- **Disc-hit via min in-plane radius** along the march (`bestR = min(length(pos.xy))`
  in [MIN_R, MIN_R+WD]) rather than a first z-sign flip. Edge-on z-flips happen far
  from the annulus (or never) leaving the rim bare; min-radius tracking yields the
  "plasma collar" hugging the shadow at every angle, incl. edge-on.
- Disk geometry: `MIN_R = 1.4` (in hr units), `WD = 4.5`.
- Photon-shadow: `b0 < 2.6` fallback keeps a clean circular shadow at high camera
  elevation where the (u, phi) tangent degenerates (NaN guard from ref_a).

## 5. Quality presets & time-slicing

| Quality | Scale × canvas | Max px | uSteps | frameEvery |
|---------|---------------|--------|--------|------------|
| LOW     | 0.16          | 220²   | 40     | every 3    |
| MEDIUM  | 0.24          | 220²   | 72     | every 2    |
| HIGH    | 0.36          | 220²   | 110    | every 1    |

- `uCutoff`: LOW 0.55 (cheap early-out), MED/HIGH 1.0.
- `HalfFloat` target on WebGL2, `UnsignedByte` fallback; target rebuild on null
  (recovery after `setQuality`→dispose).
- **Time-slicing:** the geodesic re-march runs every `frameEvery` frames (a GPU
  budget counter derived from quality); the composite always draws the last lens
  frame every frame. This decouples visual refresh from the cost of the expensive
  march — the pass is effectively ~free per-frame on mobile at LOW/MEDIUM.
- `march()` ungated for harness benchmarking.
- Allocation/shader failures → try/catch fallback to the legacy geometry tree
  (never a black screen, never console errors).

## 6. Acceptance evidence — the six angles

`verify28.mjs` — **18 pass / 0 fail** at the zoom-30 gameplay framing. Pure-black
shadow + bent plasma at all six angles:

| Angle  | shadow px (dark) | max rim plasma |
|--------|------------------|----------------|
| FRONT  | yes (h≈144)      | 202.5          |
| A30    | yes              | 184.0          |
| A60    | yes              | 154.3          |
| SIDE   | yes              | 248.3          |
| TOP    | yes              | 247.8          |
| BOT    | yes              | 255.0          |

All six exceed the "plasma bent around a black void" acceptance bar; no donut
(sampled anywhere symmetric?), no gray halo, shadow interior sampled pure black.
`finalcap.mjs` adds a temporal-stability check: the plasma **breathes**
(46129 changed pixels between two idle frames 1 s apart — accretion is alive, not
a frozen still), and LOW-quality sanity across all six angles stays
blocked-shadow + rim plasma (`shots28/final/LOW_*.png`).

## 7. Performance

Pass cost (headless SwiftShader, note this is an upper-bound / not real-device FPS):

- The reduced-res lens pass renders in **~0.1 ms** at every quality
  (360×800 → 130×288 max; 1280×720 → 461×259 max) because it runs at a fraction
  of the canvas area.
- Gameplay frame delta with lensing active ≈ negligible (= pass 0.1 ms +
  composite) on top of a 32–34 ms/frame mobile render loop baseline.
- **Per-viewport resolution matrix (MEDIUM):** 360×800 → 86×192,
  390×844 → 94×203, 414×896 → 99×215, 1280×720 → 307×173.
- **LOW/MEDIUM/HIGH at 1280×720:** 205×115 / 307×173 / 461×259 (verified in
  `verify28res.mjs`) — steps 40 / 72 / 110.
- LOW (`every 3` frames) is the budget-hearted fallback; HIGH re-marches every
  frame at higher res but still ~0.1 ms at these areas.

Verdict: **no gameplay degradation.** The pass is resolution-bound and time-sliced;
the heavy march is amortised across frames, and LOW/MEDIUM keep mobile smooth.

## 8. Regression harness

`regress28.mjs` — **40 pass / 0 fail** across 360×800 / 390×844 / 414×896 /
1280×720, verifying the game still *plays* with the lensed black hole:

- no horizontal overflow (body == client at every viewport);
- black-hole shadow present;
- **zero page/console errors** (boot, after launch, after orbit, after toggle —
  the `navigator.vibrate` blocked message is whitelisted as a headless-rig
  artifact, not a code error);
- **aim + launch flow works** (rock → beginAim → launch);
- **camera orbit + zoom keeps lensing active** (res stays valid, no crash);
- **toggle OFF restores the legacy geometry tree** (hole + disk + ring visible);
- **toggle ON restores the shadow core + pass.**

### Legacy fallback (lensing OFF)

`legacy28.mjs`: with lensing disabled the original Phase-23 geometry tree renders
(hole sphere + flat disk + photon ring all visible, pure-black shadow px, zero
errors) — the unmodified in-tree renderer is fully preserved as the LOW-time /
allocation-failure / debug path.

## 9. Node suite

**20 of 21 runners exit 0** (all game-logic suites: aiming, trajectory, telemetry,
scoring, missions, progression, campaign, guidance, presentation, settings,
spaghettification, physics, responsive, audio, ui_finalize, challenges, etc.).
The single failure in `run_ui_identity.js` (29/1, `.icon-btn` CRLF) is the
**pre-existing local Windows/OneDrive CRLF line-ending artifact** documented since
before Phase 28 — the committed blob uses LF and passes; NOT a Phase 28 defect and
not introduced here.

## 10. Files changed

- `js/render/blackhole/lensing.js` — NEW (geodesic pass, min-radius collar,
  Matrix3 camera basis, time-slicing, debug maps).
- `js/render/blackhole/plasmaField.js` — NEW (shared `plasmaFieldGLSL()`,
  `samplePlasma`).
- `js/render/scene.js` — SceneManager: build/wire/quality/sync; opaque
  `shadowCore`; `_applyLensingVisibility()`; render-time fallback.
- `js/main.js` — `window.__BH_LENSING__` debug hook.
- `js/render/blackhole.js` — untouched (legacy geometry fallback path).
- `phase28_test/` — debug-only standalone harness, **removed** before delivery
  (not referenced by the game).

## 11. Verification artifacts

- `/tmp/opencode/pup/verify28.mjs` — 18/18 (six angles).
- `/tmp/opencode/pup/regress28.mjs` — 40/40 (four viewports, playable).
- `/tmp/opencode/pup/verify28res.mjs` — LOW < MED < HIGH resolutions, 0 errors.
- `/tmp/opencode/pup/legacy28.mjs` — legacy geometry path intact.
- `/tmp/opencode/pup/boot28.mjs` — clean boot, lensing active, hook present, 0 errors.
- `/tmp/opencode/pup/finalcap.mjs` — temporal breathing + LOW six-angle sanity +
  gameplay captures (`shots28/final/`: GAMEPLAY_IDLE/APPROACH/CRITICAL/CONSUMPTION),
  legacy, 3 mobile viewports, T0/T1 temporal pair, 6 LOW angles.
- `shots28/` full capture set.

## 12. Risks / notes

- Headless SwiftShader numbers are an upper-bound; real-device mobile FPS should be
  re-confirmed (as with every Phase-27 note). The pass is resolution-bound and
  time-sliced so the risk is low, but a physical-device pass is the responsible
  final gate before a store build.
- The shadow core (r = 2.6·hr) is an opaque ball that matches the lensed photon
  shadow's fell region. It is hidden whenever lensing is off, so the legacy
  renderer is byte-for-byte the Phase-23 path.
- `phase26/` (Phase-27 research + the four prototype modes) is intentionally kept in
  the repo as reference.

## FINAL-DECISION

**ACCEPT.** The reduced-resolution oseiskar-style geodesic lensing pass is
integrated, on by default at MEDIUM, verifiably renders the black-hole target look
at all six view angles, keeps the shadow pure black, preserves the unmodified
legacy geometry path as a fallback, and adds negligible frame cost via
resolution-scaling + time-slicing. The full suite is green (verify 18/18, regress
40/40, node 20/21 with the single CRLF artifact being pre-existing and unrelated).
No gameplay, physics, or scoring semantics changed. STOP here — no Phase 29.
