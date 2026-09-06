# Phase 27 Report — Relativistic Black Hole Visual Research & Recommendation

**Scope:** read-only research + isolated prototype. No production renderer,
gameplay, physics, trajectory, aiming, telemetry, scoring, missions,
progression, input, camera, audio, UI, or mobile-control code was modified.
Prototype lives in `blackhole-game/phase26/`; nothing there is imported by the
game.

---

## Summary of the decision

**Recommendation: IMPROVE (toward a reduced-resolution lensed pass), not a
pure geometry re-skin.**

- **KEEP the geometry-resilient, mobile-safe architecture** of the current
  renderer: it is resolution-independent, ~16–35 ms software-WebGL floor at
  every mobile viewport, and already carries the gameplay-facing shadow
  silhouette + accretion glow.
- **ADOPT the oseiskar-style geodesic lensing technique (Reference A) as a
  reduced-resolution, upscaled "lensed pass"** layered under/around the existing
  gameplay geometry — to get the one thing pure geometry cannot fake: the
  **far-side plasma wrapping over the void** (a dead-dark top otherwise reads as
  a flat ball+disk).
- **REJECT Reference B (chrismatgit RK4):** it is visually dimmer **and** ~2×
  more expensive than Reference A (see §PERF) — dominated on both axes.
- **REJECT the production baseline as final** ("KEEP" alone): measured top rim =
  0 (no far-side wrap) fails the explicit target look.

This is an **IMPROVE** (hybrid-ingest), not a full KEEP or REPLACE, because a
full-screen per-pixel geodesic raytracer is **not real-time viable on mobile** at
usable resolution (see §PERF), while the current pure-geometry approach can't
achieve the lensed look unaided.

---

## Evidence

### Visual (front view, center cross-section, `phase26/shots/*_front_medium.png`)

| Metric | CURRENT | Ref A | Ref B | HYBRID |
|---|---|---|---|---|
| Shadow span h×v (px) | 95×59 | 191×191 | 485×216 | 95×57 |
| Top rim (U) lum | **0** | **8** | 5.7 | **0** |
| Bottom rim (D) lum | 202 | 0 | 9.3 | 82 |
| Lens "wrap over void" | none | **yes** | none | none |

- Reference A is the **only** mode with the authentic lensed signature: the
  far-side accretion plasma is visible **above** the shadow (U=8 > D=0), i.e.
  light folds over the void. Verified shadow is a clean circle (191×191) and, at
  high elevation, a correct photon-sphere silhouette (~280 px at top view).
- CURRENT and HYBRID both have a dead-dark top (U=0) — flat ball+disk read, the
  exact failure the target look forbids. HYBRID's fragment-shear brightened the
  near-side disk but cannot create the over-the-void wrap, because the disk is
  still a flat plane occluded by a sphere.
- Reference B is too dim to use (all rims ≤ 12 lum) and floods the image.

### Performance (software-WebGL headless, renderOnce + forced readback flush)

> Numbers are not "real-device FPS"; they're only used to establish **scaling**
> and **relative ordering**. Resolution independence is the mobile-relevant
> property.

| Viewport | CURRENT | Ref A | Ref B | HYBRID |
|---|---|---|---|---|
| 360×800 | ~16–20 ms | ~103–134 | ~180–237 | ~20–22 |
| 390×844 | ~17–26 | ~124–140 | ~220–237 | ~24–33 |
| 414×896 | ~17–35 | ~141–160 | ~250–268 | ~23–31 |
| 1280×720 | ~16–28 | ~341–399 | ~910–948 | ~22–33 |

1. **Ref A/B are resolution-bound** (cost ∝ pixel count). Ref B (RK4) is ~2× the
   cost of Ref A (leapfrog) and dimmer.
2. **CURRENT/HYBRID are resolution-independent** — the cheap, mobile-safe regime.
3. **The lensed pass must be rendered at reduced resolution and upscaled.** At
   the game's default camera (dist ≈ 868.8 = 21.7 Schwarzschild radii) the hole
   subtends a small angular size, so a 1/4–1/8 internal resolution lensed pass is
   visually adequate and brings Ref-A-class per-frame cost down by ~16–64× versus
   the full-res full-screen numbers above.

### Acceptance checks

- No production file modified (verified by diff; prototype isolated to
  `phase26/`).
- No ray-traced-everything at full game resolution — the recommended path uses a
  reduced-res lensed pass.
- Mobile-first benchmarked across 360×800/390×844/414×896/1280×720 at
  LOW/MEDIUM/HIGH; no unverified 60 FPS claims (software-WebGL numbers labeled
  as such).
- 6 angles captured (front/30/60/side/top/bottom) for all 4 modes → `shots/`.
- Target look: Ref A satisfies black shadow + real lensing + wrap over/under +
  no white photon ring + asymmetry. (Flat-plane top view has no donut, matching
  the "no top-view" preference.)

---

## Concrete recommended path (if adopted later — NOT done in this phase)

1. Port Reference A's geodesic shader as a **reduced-resolution fullscreen pass**
   (e.g. `min(canvasW,canvasH)*0.25`), rendered into a low-res render target,
   then upscaled with bilinear filtering behind the existing gameplay geometry
   (the black sphere already provides the crisp parallax-correct silhouette in
   front).
2. Keep the current glow/accretion visuals and the horizon-edge consumption glow
   on top.
3. Gate the lensed pass by the existing quality presets (LOW=off or 1/8,
   MEDIUM=1/5, HIGH=1/3) and by `prefers-reduced-motion`.
4. Retain attribution: "Lensing-GLSL technique (c) Otto Seiskari 2015, MIT" in
   the shader header if the oseiskar equations are used.
5. **Device-test** (real Android phone) before shipping: software-WebGL here can
   only establish scaling, not a real-device frame budget.

---

## What was NOT done
- No production renderer/gameplay/physics/UI changes.
- No full-res ray-tracing everywhere.
- No monetization/skins/supernovas/scope creep.
- No further phase after this (STOPS here).

## Files
- `phase26/` — isolated prototype (index.html, harness.js, common.js, bgtex.js,
  modes/{current,ref_a,ref_b,hybrid}.js).
- `phase26/shots/` — 4 modes × 6 angles screenshot matrix.
- `PHASE27_RESEARCH.md` — full audit + study + performance methodology.
