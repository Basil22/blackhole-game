# Phase 27 Research — Relativistic Black Hole Visual Audit & Prototype

A read-only research + isolated-prototype investigation into how the Black Hole
game's black hole is rendered versus how reference implementations produce a
"real" lensed black hole, with the goal of delivering an evidence-based
recommendation (KEEP / IMPROVE / REPLACE / HYBRID) for the production renderer.

**Status: delivered (research only — no production changes).**
Deliverables: `PHASE27_RESEARCH.md`, `PHASE27_REPORT.md`, and the isolated
prototype in `blackhole-game/phase26/`.

> Naming note: this work was internally tracked as "Phase 26" in the working
> todo list, but the existing `PHASE26_REPORT.md`/AGENTS.md Phase 26 is the
> completed **Android packaging** phase. To avoid a collision these research
> deliverables are named **Phase 27**.

---

## 1. Acceptance criteria (from the task)

1. Audit two reference repos (oseiskar/black-hole, chrismatgit/black-hole-simulation).
2. Document the current renderer (`js/render/blackhole.js`).
3. Build an isolated 4-mode prototype: CURRENT / A / B / HYBRID.
4. Benchmark on mobile viewports (360x800, 390x844, 414x896, 1280x720) at
   LOW/MEDIUM/HIGH presets — no unverified "60 FPS" claims.
5. Capture multi-angle screenshots (front / 30 / 60 / side / top / bottom).
6. Acceptance pixel-probes.
7. Safety: never touch production renderer/gameplay/physics/trajectory/aiming/
   telemetry/scoring/missions/progression/input/camera/audio/UI/mobile controls.
   No ray-traced-everything; evaluate cheap approaches. Mobile-first.
8. Target look: black shadow, real lensing, disk wraps over/under shadow (not
   ball+disk), no donut/top-view, no seam, no gray halo, no artificial white
   photon ring, asymmetric, readable during gameplay.
9. Final recommendation with evidence (KEEP / IMPROVE / REPLACE / HYBRID).

---

## 2. Reference repository audit (Part A)

Both repos are **MIT-licensed**, so their techniques may be reused **with
attribution** (credits below + this notice).

### 2.1 oseiskar/black-hole (clone at `/tmp/opencode/bh-ref-a`)
- **License:** MIT — `COPYRIGHT.md`, Copyright (c) 2015 Otto Seiskari.
- **Core:** `raytracer.glsl` (422 lines) + `main.js` + `three-js-monkey-patch.js`.
- **Technique:** per-pixel Schwarzschild **geodesic raytracer**. Rays are
  integrated in **u = 1/r** coordinates with a leapfrog scheme
  (`u += du*step; ddu = -u*(1 - 1.5*u*u); du += ddu*step`). The accretion disk
  is a plane (z=0); the shadow is **implicit** (any ray reaching `u = 1`
  returns black). Doppler/beaming/redshift shift disk color. `NSTEPS`
  40/100/200 quality tiers.
- **Cost model:** full-screen per-pixel ray march, resolution-proportional.
- **Look:** genuine gravitational lensing — the shadow bends background stars
  and folds the far side of the disk over the void (the "light bends around a
  blackness" look).

### 2.2 chrismatgit/black-hole-simulation (clone at `/tmp/opencode/bh-ref-b`)
- **License:** MIT — `LICENSE`, Copyright (c) 2025 Chris Matabaro.
- **Core:** React/Vite TS app; `canvasFragmentShader.ts` (334 lines).
- **Technique:** per-pixel **explicit Runge-Kutta 4** integration of the
  relativistic orbital equation
  `geodesic_equation = -(3/2)*h2*pos/|pos|^5`, with step size scaling with
  `dist^2`. Procedural **FBM** disk, Doppler + gravitational redshift,
  `uMaxIterations` + `uStepSize = 2.5/max_iters`. Full-resolution per-pixel.
- **Cost model:** heavier than A — RK4 evaluates 4 force evaluations per step.
- **Look:** a denser, scientific-looking accretion disk with a pronounced
  near-side bright arc; our port rendered too dim (see §5) to be usable.

**License notice for any production reuse:** techniques from both repos carry
their original MIT copyrights (Otto Seiskari, 2015; Chris Matabaro, 2025) and
must be retained if adapted into the game.

---

## 3. Current renderer audit (Part B)

`js/render/blackhole.js` in the **current tree** is the OLD pre-6E baseline (153
lines). It builds a **black event-horizon sphere + a flat tilted accretion ring**
(disc `rotation.x = -0.52` / `diskGroup.rotation.x = -1.4` in the prototype port)
**+ a camera-facing photon-ring billboard + a glow sprite**. There is **no
gravitational lensing** — the apparent "bending" is only the far half of a flat
tilted ring being occluded by the near hemisphere of the black sphere.

Cost: ~6 draw calls, resolution-independent geometry.

### Measured visual signature (front view, cross-section through image center)
- Shadow span ~95 h × ~59 v px (an ellipse — the flat disk/slanted look).
- **Top rim (U) = 0** → the region above the shadow is dead-dark: the flat disk
  provides no far-side wrap. This is the classic **ball+disk** read that fails
  the "disk wraps over/under shadow" target.
- Left/right/bottom rims bright (the flat disk's own glow).

So the current renderer does **not** satisfy the target look on its own terms.

---

## 4. Isolated prototype (Part C/D)

`blackhole-game/phase26/` is a fully isolated harness — **no production files
are modified or imported** except the bundled `js/vendor-three.min.js` used only
by the prototype page.

Structure:
- `index.html` — shell loading `../js/vendor-three.min.js` + `harness.js`.
- `harness.js` — camera orbit/zoom/animation, quality presets, `renderOnce()`,
  `getStats()`, `setOrbit()`. Query: `?m=&q=&angle=&dist=&w=&h=`.
- `common.js` — starfield + glow helpers (geometry modes).
- `bgtex.js` — procedural background texture (shader modes).
- `modes/current.js` — faithful reproduction of the production baseline.
- `modes/ref_a.js` — **Reference A**: oseiskar-style geodesic leapfrog raytracer.
- `modes/ref_b.js` — **Reference B**: chrismatgit-style RK4 raytracer.
- `modes/hybrid.js` — **HYBRID**: CURRENT geometry + shader-based tangential
  lensing-shear on the disk.

### Robustness fix applied to Reference A
The (u,phi) leapfrog parametrization degenerates when a ray is near-parallel to
the radial direction (the tangent becomes NaN). At high camera elevation
(≥60°, reachable in gameplay — the camera clamps `phi` to [0.15, π−0.15] in
`js/game/input.js`) this produced NaN background with no shadow. Added a
**photon-sphere shadow fallback**: any ray whose straight-line impact parameter
`b0 < 2.6` (≈ 3√3/2 Schwarzschild radii) is black. This is physically correct
(those rays MUST fall in) and keeps the silhouette consistent across elevations.
Circular `~280px` shadow verified at top view.

---

## 5. Visual comparison (front view, cross-section through center)

Screenshots: `phase26/shots/<MODE>_<angle>_medium.png`.

| Metric | CURRENT | Ref A | Ref B | HYBRID |
|---|---|---|---|---|
| Shadow span h×v (px) | 95×59 | 191×191 | 485×216 | 95×57 |
| Center luminance | 0 | 0 | 8.3 | 0 |
| Top rim (U) lum | **0** | **8** | 5.7 | **0** |
| Bottom rim (D) lum | 202 | 0 | 9.3 | 82 |
| Left/Right rim | 194/194 | 74/64 | 1.3/12 | 166/207 |
| Far-side wrap over void | **none** | **yes** | none | none |
| Lens signature | flat ball+disk | genuine lensing | dim, unusable | flat ball+disk |

- **Ref A** is the only mode with a **nonzero top rim = far-side plasma wrapping
  above the shadow** — the authentic "light bent over the void" signature. Its
  shadow is a healthy circle (191×191).
- **CURRENT** and **HYBRID** both show **dead-dark tops (U=0)** = flat ball+disk.
  HYBRID's shear made the bottom (near-side) disk brighter and added inner-rim
  heating, but did **not** create the top wrap.
- **Ref B** is too dim to be usable (all rims ≤ 12) and its dark region floods
  the image; not a candidate.

6-angle review: Ref A renders the lensed disk at front/30° and a correct shadow
silhouette at 60°/side/top/bottom (no donut — the flat z=0 disk plane simply
isn't encountered from top, which matches the "no top-view donut" preference).

---

## 6. Performance (Part F/G) — measured, honest

Method: each render followed by a forced `gl.readPixels` flush so SwiftShader
(system WebGL) actually rasterizes (otherwise `renderOnce` only meters CPU
submission, ~0.1 ms, which is misleading for shader modes). This is **software
WebGL**; the numbers overstate absolute cost (readback overhead) but the
**resolution scaling and mode ordering are the meaningful signal**. Figures are
`renderOnce`+flush wall ms.

| Viewport | CURRENT | Ref A | Ref B | HYBRID |
|---|---|---|---|---|
| 360×800 | ~16–20 | ~103–134 | ~180–237 | ~20–22 |
| 390×844 | ~17–26 | ~124–140 | ~220–237 | ~24–33 |
| 414×896 | ~17–35 | ~141–160 | ~250–268 | ~23–31 |
| 1280×720 | ~16–28 | **~341–399** | **~910–948** | ~22–33 |

Key findings:
1. **Ref A and Ref B are resolution-bound** — cost scales with pixel count
   (1280×720 ≈ 3.2× the pixel count of 360×800; A cost rises ~3×, B ~5×).
2. **Ref B (RK4) is ~2× more expensive than Ref A (leapfrog)** and the heavier
   of the two.
3. **CURRENT and HYBRID are resolution-independent geometry** — ~16–35 ms at
   every viewport (the floor is readback overhead; actual GPU cost is far
   lower). This is what makes them viable on constrained mobile GPUs.
4. **Neither ray-tracer is viable for real-time mobile at usable resolution.**
   Even the cheaper A at 360×800 is ~100 ms+ (worse on a real slow GPU; the
   trend holds regardless of the readback floor). To use A/B on mobile you would
   need a reduced-resolution pass + upscale + heavy iteration capping, which
   erodes the very lensing fidelity that makes them attractive.

**No "60 FPS" claim is made.** These are software-WebGL headless measurements
used only to establish scaling and relative cost.

---

## 7. Recommendation rationale

See `PHASE27_REPORT.md` for the full recommendation. In brief:
- The current renderer (CURRENT) is **cheap and mobile-safe** but visually fails
  the target ("ball+disk", no over-the-void wrap).
- True per-pixel geodesic lensing (Ref A) delivers the authentic look but is
  **not mobile-real-time**.
- **Ref B is both visually dimmer and ~2× more expensive than A** — dominated.
- This points to a **HYBRID with an admission**: pure geometry can't bend light
  over the void, so a recommendation is offered with a clear trade-off framing
  (visual fidelity vs mobile cost).
```
