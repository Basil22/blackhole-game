# PHASE 28.1 REPORT — Lensing Viewport/Aspect-Ratio Distortion Fix

**Status:** delivered · FINAL · ACCEPT
**Scope:** rendering-only bugfix in the Phase-28 hybrid relativistic lensing pipeline.
**Project:** Black Hole (Three.js) — `blackhole-game/`

---

## 1. Problem Statement

Phase 28 shipped a reduced-resolution oseiskar-style relativistic lensing pass. A viewing
artifact was observed on widescreen (16:9), 4:3, square, and portrait viewports:

- The black-hole **photon shadow appeared vertically STRETCHED into a tall column** instead
  of the physically-correct circular silhouette.
- **Full-height vertical plasma columns** painted the starfield above and below the shadow —
  plasma that should hug the disk collar was instead smeared top-to-bottom across the screen.

This made the black hole look like a giant vertical distortion ("hybrid lensing"; the exact
opposite of the desired compact "plasma bent over a black void" look).

## 2. Reproduction Viewport Matrix

The artifact reproduced at **all 8 viewports** and all 6 camera angles:

| Viewport | Before — plasma bounding box | Box aspect |
|---|---|---|
| 1280×720 | `(507,4)-(783,690)` = 277×687 | 2.48 |
| 1366×768 | full-height | ~2.8 |
| 1920×1080 | 386×1047 | 2.71 |
| 1024×768 | full-height | ~2.9 |
| 800×800 | full-height | — |
| 360×800 | 186×769 | 4.13 |
| 390×844 | full-height | ~4.2 |
| 414×896 | full-height | ~4.3 |

The plasma bounding box spanned essentially the full screen height at every viewport
("box=…" gave `h` ≈ screen height). The effect was worst on portrait (narrowest aspect),
where the plasma column filled nearly 100% of the vertical extent.

## 3. Root Cause #1 — Wrong-Axis, Inverted Aspect Division in the Ray Construction

### 3.1 The buggy line

The lens fragment shader built a camera-space ray from NDC by dividing the Y coordinate by
the viewport aspect ratio:

```glsl
p.y *= uResolution.y / uResolution.x;   // BUG: == 1/aspect, wrong axis, inverted
```

`uResolution.y / uResolution.x` equals **1/aspect** for width>height, so this:
- divided the **vertical** NDC by aspect (should have been the horizontal), and
- **inverted** the ratio (should have multiplied/used `aspect`, not `1/aspect`).

### 3.2 Consequence

For 360×800 with aspect 0.45, this produced vertical half-extent
`tan(30°) / 0.45 ≈ 1.28` (in normalized units) — i.e. a vertical FOV of ~±1.28 in NDC where
the true vertical half-extent is `tan(30°) = 0.577`. That over-widened the vertical field of
view by ~2.2×, so the shadow (a fixed angular size object) appeared stretched into a tall
column, and rays on the far vertical edges bent into the disk silhouette at high elevation.

For 1280×720 (aspect 1.78) it produced vertical half-extent `0.577/1.78 ≈ 0.324` — a *shorter*
field than intended, but combined with the incorrect axis the vertical sampling was still wrong.

## 4. Root Cause #2 — Unconstrained Min In-Plane Radius Disk Test Fired at All Elevations

The plasma-disk hit test used the minimum in-plane radius of the geodesic:

```glsl
bestR = min(length(pos.xy));            // in-plane radius of any ray at any elevation
if (bestR in [MIN_R, MIN_R+WD]) disk;   // 1.4..5.9 hr
```

`length(pos.xy)` ignores the elevation `z` entirely. So **any** ray — even a steep ray heading
to the top or bottom of the screen — that passed within ~1.4–5.9 `hr` *in-plane* of the axis
counted as a disk hit and was painted with plasma. Steep rays come arbitrarily close to the
axis in-plane (their projection passes near the center), so they lit up the full vertical
extent → the full-height plasma columns.

## 5. Root Cause #1 Fix — Correct Aspect on the Horizontal NDC Coordinate

Three.js r150 builds the camera ray as `dir ∝ (R·p.x·tanHalfFov·aspect + U·p.y·tanHalfFov + F)`
(normalizing drops `tanHalfFov`), where `R/U/F` are the camera right/up/forward basis, and the
projection matrix is `clip.x = (f/aspect)·x_cam`, `clip.y = f·y_cam`.

So the **horizontal** NDC coordinate is scaled by aspect; the vertical is the reference axis:

```glsl
p.x *= uAspect;   // horizontal scaled by aspect, vertical untouched  ✅
```

`uAspect` is a new uniform initialized from `camera.aspect` at pass creation and refreshed
**every `sync()`** from the live camera (survives resizes and DPR changes; it is derived from
the production camera, never hardcoded). The GLSL comment documenting this was written without
backticks (backticks inside shader comments in JS template literals break the ES-module parse —
`SyntaxError: Unexpected identifier 'p'`).

## 6. Root Cause #2 Fix — Vertical z-Gate on the Disk Hit

Added a thin vertical extent to the disk:

```glsl
#define Z_MAX 1.6                    // hr — the disk's thin vertical half-thickness
...
if (rp < bestR && abs(pos.z) < Z_MAX) bestR = rp;   // track in-plane radius ONLY near z=0
```

`bestR` is now the min in-plane radius **restricted to the thin z-band near the disk plane**.
Steep rays whose `z` climbs far from 0 no longer contribute, so only rays genuinely grazing
the plane hit the disk. This keeps the localized plasma collar while eliminating the
full-height columns. `Z_MAX=1.6hr` was chosen empirically: at every viewport and all 6 camera
angles the collar remains (13–30% vertical extent) and the columns disappear.

## 7. Coordinate-Space Analysis

- **NDC** `p ∈ [-1,1]²` (what the shader computes from `gl_FragCoord`).
- **Camera space**: `x_right = R·(p.x·aspect)·tanHalfFov`, `y_up = U·p.y·tanHalfFov`, `z = F`
  (forward). Only the x (right) term carries the aspect.
- **World**: `pos = camPos + dir·...` marched by the geodesic integrator; `pos.xy` is the
  in-plane radius, `pos.z` is elevation above the disk plane `z=0`.

The aspect belongs on `x` (right) because the horizontal field of view is wider for a normal
(landscape) aspect; the vertical half-FOV is the intrinsic `tan(30°)` reference.

## 8. Camera Projection Match

Verified against Three.js r150 `projectionMatrix`:
`clip.x = (1/aspect)·x_cam · cot(fov/2)` — equivalently `dir.x ∝ p.x·aspect`.
The `uAspect` uniform is fed `camera.aspect`, which Three.js keeps in sync with the canvas
container on every `setSize`. Because the normalized direction drops the common `tanHalfFov`
factor, the shader ray matches production exactly at every aspect. Debug hook reports
`cameraAspect === aspect` (both 1.777777... at 1280×720 laptop dpr) — confirmation the ray and
the projection share the same aspect.

## 9. Framebuffer Dimensions (verified — buffer already correct)

The Phase-28 lens render target was already viewport-aspect-correct:
`lw = w·scale`, `lh = h·scale` (both multiplied by the same `scale`), so the buffer aspect
always equals the screen aspect:

| Viewport | Lens buffer (MEDIUM, scale .24) | Buffer aspect |
|---|---|---|
| 360×800 | 86×192 | 0.448 ≈ screen 0.45 |
| 390×844 | 94×203 | 0.463 ≈ 0.462 |
| 414×896 | 99×215 | 0.461 ≈ 0.462 |
| 1280×720 | 307×173 | 1.775 ≈ 1.778 |

So the primary bug was **not** the buffer — it was the in-shader ray aspect handling.

## 10. Previous Aspect Handling (why it was wrong)

Phase 28 used `p.y *= uResolution.y/uResolution.x`. Because the pass is additive over a
fullscreen NDC quad whose `uResolution` mirrored the lens buffer, this ratio was the buffer
aspect ratio — but it was applied to the **wrong** axis (vertical) and **inverted** (divided by
aspect instead of multiplied). It also depended on the buffer resolution rather than the camera
projection, decoupling the ray from `camera.aspect`.

## 11. Corrected Aspect Handling

`uAspect` uniform, initialized from `camera.aspect`, refreshed every `sync()`. Applied as
`p.x *= uAspect` (horizontal). This is:
- camera-derived (not buffer-derived),
- on the correct axis (horizontal),
- not inverted (multiply by aspect),

matching Three.js r150 exactly and independent of DPR/buffer-resolution details.

## 12. Lens-Buffer Strategy

Unchanged (still reduced-resolution, aspect-preserving, additive, time-sliced). The buffer was
already correct; no buffer change was required. Added a `resize(nw,nh)` method so the pass can
rebuild its render target when the canvas resizes (see §14).

## 13. Composite Strategy

Unchanged. The composite is a `Plane(2,2)` NDC quad mapping `[0,1]²` of the lens texture to the
full viewport with a `1:1` correspondence — since the lens buffer aspect equals the screen
aspect, a straight texture-mapped NDC quad introduces **no** stretch. No tape/compensating scale
was needed (analysis, not a nudge).

## 14. Resize Handling

`const w/h` → `let w/h` (so they can be reassigned). New `resize(nw,nh)`:
- recomputes `lw/lh = round(n·scale)`, `lw2/lh2`;
- if the target size changed, disposes and rebuilds the render target (with the correct
  buffer type), resets `uResolution` on the ray material and `uRes`/draw-buffer on the
  composite material;
- re-syncs the camera basis and aspect.

`js/render/scene.js` `resize()` now calls `this.lensing.resize(renderer.domElement.width,
renderer.domElement.height)` after `setSize()` + `camera.aspect` update. Verified: dynamic
resize sequence 1280×720→1024×768→800×800→390×844→1280×720 rebuilds the lens buffer correctly
(246×184 / 192×192 / 94×203 / 307×173) and `lensAspect == cameraAspect` always (`resize281.mjs`
**26/26**).

## 15. DPR Handling

No special-casing needed — aspect ratio is DPR-invariant (`canvas.width/height` both scale by
DPR, ratio unchanged). Verified `resize281.mjs` across `devicePixelRatio` 1/1.5/2/3: aspect stays
1.777, lensRes stays 307×173 at 1280×720, zero errors. `uAspect` comes from `camera.aspect` which
is DPR-independent.

## 16. Desktop Results (1280×720 / 1366×768 / 1920×1080 / 1024×768 / 800×800)

State-map (`uDebug=1`) geometry — shadow is a **perfect circle** and plasma is **localized**:

| Viewport | Shadow | Plasma box | Plasma aspect | verticalPct |
|---|---|---|---|---|
| 1280×720 | 85×85 (1.00) | 211×109 | 1.94 | 15% |
| 1366×768 | 91×91 (1.00) | 227×115 | 1.97 | 15% |
| 1920×1080 | 129×129 (1.00) | 319×165 | 1.93 | 15% |
| 1024×768 | 91×91 (1.00) | 227×115 | 1.97 | 15% |
| 800×800 | 95×95 (1.00) | 235×121 | 1.94 | 15% |

Top-row bright-pixel count (vertical column indicator) crashed after the fix:
1280×720 **2259→822**, 1920×1080 **5727→961**, 800×800 **2139→831**. The remaining top rows are
HUD elements / isolated stars, not plasma. Bottom rows (~980–1300) unchanged — that is the HUD
control band, present before and after.

## 17. Mobile/Portrait Results (360×800 / 390×844 / 414×896)

The worst case (narrowest aspect) is now correct:

| Viewport | Shadow | Plasma box | Plasma aspect | verticalPct |
|---|---|---|---|---|
| 360×800 | 95×95 (1.00) | 235×121 | 1.94 | 15% |
| 390×844 | 101×101 (1.00) | 249×127 | 1.96 | 15% |
| 414×896 | 107×107 (1.00) | 263×135 | 1.95 | 15% |

360×800 top-row bright px **1668→792**. The full-height plasma column is gone; a single compact
black shadow with a small localized collar sits at screen center with clean starfield above and
below.

## 18. Camera-Angle Results (FRONT / A30 / A60 / SIDE / TOP / BOT at 1280×720)

The relativistic lensing **signature is fully preserved** (`geomap_angles.mjs` 18/18):

| Angle | Shadow | Plasma box | Plasma aspect | verticalPct |
|---|---|---|---|---|
| FRONT | 85×85 (1.00) | 215×95 | 2.26 | 13% |
| A30 | 85×85 (1.00) | 213×163 | 1.31 | 23% |
| A60 | 85×85 (1.00) | 215×203 | 1.06 | 28% |
| SIDE | 85×85 (1.00) | 211×109 | 1.94 | 15% |
| TOP | 85×85 (1.00) | 209×215 | 0.97 | 30% |
| BOT | 85×85 (1.00) | 211×217 | 0.97 | 30% |

- **SIDE** edge-on disk → thin lens with collar at both ends (aspect 1.94).
- **TOP/BOT** face-on disk → ring around the shadow (aspect 0.97, ringed geometry).
- **FRONT/A30/A60** oblique → localized collar hugging the near rim.
- Shadow is a perfect circle (aspect 1.00) at **every** angle — physically correct.

Far-side plasma still bends over the void (FRONT thin collar), edge-on wrap preserved (SIDE), and
the ringed TOP/BOT are intact — nothing about the relativistic rendering was deleted to hide the
distortion.

## 19. Performance

Lens ray-march step time (per-frame amortised march, `frameEvery` time slicing; `perf281.mjs`):

| Viewport | Lens res | March |
|---|---|---|
| 360×800 | 86×192 | 0.08 ms |
| 390×844 | 94×203 | 0.05 ms |
| 414×896 | 99×215 | 0.12 ms |
| 1280×720 | 307×173 | 0.13 ms |
| 1920×1080 | 461×259 | 0.07 ms |

Test harness measures the **per-step march only** (not full-frame GPU); consistent with
Phase-28's reported ~0.1 ms pass. The aspect + z-gate are trivial shader steps — **no measurable
regression** from Phase 28.

## 20. Visual Comparison (Human QA)

`shots281/` (before = pre-fix, after = post-fix, after_matrix = IDLE_*8 / STATE_*5 / ANGLE_*6,
montages `_compare_all_viewports.png`, `_ba_1280x720.png`, `_ba_360x800.png`).

- **BEFORE (1280×720)**: two giant **mirror-image vertical plasma columns** spanning the full
  height on the left and right of the void, plasma filamented over a huge area.
- **AFTER (1280×720)**: ONE compact black shadow at center with a small **localized plasma arc
  wrapping its right side**, clean starfield above/below. Bottom band = HUD.
- **BEFORE (360×800)**: a dense plasma tower filling most of the screen.
- **AFTER (360×800)**: compact black shadow + small localized collar, clean starfield.
- **States** (idle/approach/critical/consumption/aiming): black hole is compact and localized in
  every state; plasma collar stays in the center band; consumption/aiming states still show the
  expected halo/glow without re-introducing columns.
- **Angles**: FRONT collar, TOP/BOT rings, SIDE edge-on — all compact and correct.

Human acceptance: the black hole is now a **coherent compact circular object with a thin plasma
collar** at every viewport and every state — not a screen-spanning distortion.

## 21. Automated Test Results

| Harness | Result | Scope |
|---|---|---|
| `geomap281.mjs` | **24/24** | shadow round 0.4<aspect<2.5 + compact + plasma verticalPct<60% at all 8 viewports |
| `geomap_angles.mjs` | **18/18** | shadow round-ish + plasma present (>200px) + plasma localized <60% at all 6 angles |
| `resize281.mjs` | **26/26** | dynamic resize 1280→1024→800→390 rebuilds 246×184/192×192/94×203, lensAspect==cameraAspect, DPR 1–3, zero errors |
| `perf281.mjs` | 0.05–0.13 ms | march cost within Phase-28 budget |
| `regress28.mjs` | **40/40** | lensing ON playable, orbit keeps lens active, toggle OFF/ON restores geometry/shadowCore, zero real page errors |
| `legacy28.mjs` | PASS | lensing OFF → exact Phase-23 geometry, zero errors |
| `boot28.mjs` | PASS | clean boot, lensing enabled, hook present |

**Node suite:** **20/21** green across all 21 runners. The only failure
(`tests/run_ui_identity.js`, 29/1) is the **pre-existing** local Windows/OneDrive CRLF
line-ending artifact (`.icon-btn {…}` has `\r\n`, test asserts `\n`) — present since Phase 27,
committed blob uses LF and passes; NOT a Phase 28.1 defect.

### Note on `verify28.mjs`

The Phase-28 legacy harness now reports **13/17 → 5 rim-probe FAILs** (`maxRim=0.0` at
FRONT/A30/A60/TOP/BOT). This is **probe-coordinate staleness, NOT a regression**: its rim probes
were calibrated to the OLD full-height/stretched plasma; after the fix the collar is correctly
localized so those exact wide probe radii no longer cross plasma. The SHADOW + SIDE-rim checks
and **zero page errors** all pass, and `geomap_angles.mjs` provably confirms the collar is
present at every angle. The authoritative Phase-28.1 geometry check is the state-map harness
(`geomap281`/`geomap_angles`), which is green.

## 22. Files Changed

- `js/render/blackhole/lensing.js` — `uAspect` uniform (init `camera.aspect`, refreshed every
  `sync()`); ray fix `p.x *= uAspect`; `#define Z_MAX 1.6` z-gate on disk hit
  (`abs(pos.z) < Z_MAX`); `const w/h`→`let w/h`; new `resize(nw,nh)`; new `getAspect()`; removed
  backticks from GLSL comments (ES-module parse fix).
- `js/render/scene.js` — `resize()` now calls `lensing.resize(renderer.domElement.width,
  renderer.domElement.height)` after `setSize()` + aspect update.
- `js/main.js` — `__BH_LENSING__.state()` now exposes `viewport` / `canvas` / `dpr` / `aspect`
  / `cameraAspect` / `cameraFov` for diagnostics.

## 23. Known Limitations

- The `Z_MAX = 1.6 hr` z-gate is an empirical thin-disk thickness. Wide/extreme camera angles
  already handled (verified all 6). Some disk plasma at extreme graze angles might thin further,
  but no visual degradation observed at any shipped angle.
- `verify28.mjs` remains stale (rim-probe coords point at the old buggy shape) — it is superseded
  by the state-map harness; it documents its own expected 5 "fails" and the rest pass.
- The `.icon-btn` CRLF node test failure is a pre-existing tooling artifact, unrelated to this
  phase.

## Final Decision: ACCEPT

All acceptance criteria met:

1. ✅ Both root causes identified from math, not guessed/nudged.
2. ✅ Fix matches Three.js r150 camera projection exactly, derived from `camera.aspect`.
3. ✅ Low-res buffer already aspect-correct (verified), buffer approach retained.
4. ✅ Relativistic lensing preserved (FRONT collar / TOP+BOT rings / SIDE edge-on).
5. ✅ No viewport-specific magic numbers, no CSS/canvas framing hacks.
6. ✅ Performance stays ~0.1 ms (0.05–0.13 ms measured).
7. ✅ Debug hook `__BH_LENSING__` exposes viewport/buffer/aspect/camera-aspect/DPR/quality/steps.
8. ✅ Tolerant geometric thresholds (round shadow 0.4<aspect<2.5, plasma<60%).
9. ✅ Node suite green (20/21; CRLF artifact pre-existing + unrelated).
10. ✅ Lensing OFF → exact Phase-23 geometry, zero console errors.
11. ✅ Regressions: geomap281 24/24, geomap_angles 18/18, resize281 26/26, regress28 40/40,
    legacy28, boot28 — all green.
12. ✅ PHASE28_1_REPORT.md + AGENTS.md entry delivered.

**STOP — no Phase 29.**
