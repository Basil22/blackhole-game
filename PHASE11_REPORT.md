# Phase 11 Report — Trajectory Control Envelope Rebalance

Goal: make ESCAPING (BREAK FREE) and ORBITAL (FIND THE ORBIT) physically
reachable through deliberate drag control, without touching physics,
classification, telemetry, scoring, missions, progression, or renderer.
Verified headless on desktop + mobile.

## 1. Root cause

Pre-Phase-11 the input→launch mapping produced launch speeds of only
**63–94** (0.35–0.52 × vCirc) across the entire drag envelope. The control
envelope was:

- tangential speed multiple `tangFrac`: 0.35 … 0.43
- radial speed multiple `radFrac`: 0.05 … 0.30

Escape at the spawn requires **≥√2 = 1.414 × vCirc** and a circular orbit needs
**≈1.0 × vCirc** tangential — both mathematically OUTSIDE the reachable
envelope. Every throw was CAPTURED; the two missions were impossible. The
input gain (dx/dy × 0.0004 — a fixed pixel constant) saturated far below the
physics requirement.

## 2. Speed range before / after

| | tangential (×vCirc) | radial (×vCirc) | launch speed | verdicts reachable |
|---|---|---|---|---|
| Before | 0.35 … 0.43 | 0.05 … 0.30 | 63 … 94 | CAPTURED only |
| After  | 0.35 … 1.62 | −0.06 … 0.42 | 62.7 … 289.6 | CAPTURED, ORBITAL, ESCAPING |

Escape threshold (√2·vCirc ≈ 252.8) sits at a mid-envelope drag, so escape is
hard but deliberate — not free at max drag.

## 3. Angular range before / after

- Before: the tiny radial band forced an always-inward bias; no meaningful
  launch-direction choices between deep-dive and flyby.
- After: dy<0 gives a slight outward bias (helps orbit/escape), dy>0 gives
  deliberate dives up to 0.42·vCirc inward (precision captures). Between them
  a full grand sweep of near-horizon passes, orbits, and escapes.

## 4. Example ESCAPING state(s)

- Drag `dx=340, dy=0` → tangFrac 1.62, speed 289.6, guidance + real telemetry
  both `ESCAPING`, 0 points consumed.
- Drag `dx=285, dy=0` → tangFrac ~1.41, just past the √2 threshold, speed 252.9.
- Drag `dx=280, dy=0` → 249.6 — still ORBITAL (just under). The threshold is
  crisp: 280 ORBITAL / 285 ESCAPING.

## 5. Example ORBITAL state(s)

- Drag `dx=170, dy=0` → tangFrac 0.99, speed 176.1, periapsis 362.5, guidance
  ORBITAL; real throw stays ORBITAL when RESET mid-orbit.
- Drag `dx≈142, dy=0` (dxForTangFrac(1.0)) → a precise circular-orbit gesture.
- Drag `dx=40, dy=130` (verify13's near-horizon gesture) → 91.6 (0.51·vCirc),
  ORBITAL with periapsis 54.8 — still completes Touch the Edge.

## 6. Exact drag gestures

- **BREAK FREE:** pull straight back (dy≈0) past roughly 80% of the slider
  width (dx ≥ 285). Described in-game by the arrow: it grows to full length
  only inside escape range.
- **FIND THE ORBIT:** pull about 40% of the width (dx≈142–170) horizontal with
  little-to-no dive — a sideways nudge into a loop.
- **Touch the Edge:** the same near-horizon gesture as before, works unchanged.

## 7. Guidance === real initial state

Build `aimToVelocity` and the existing `calculateGuidance` consume the SAME
`launchVelocity(spawnPos, aim)` for prediction and the live sim's `launch()`.
Headless-proven (verify14 section F): guidance velocity (176.09, 2.89, −6.21) is
bit-identical (≤1e-6) to telemetry's recorded initial COM velocity, and
guidance.launchSpeed 176.2 === real 176.2.

## 8. Tests

244 node tests passed, 0 failed (225 baseline + 19 new `tests/game/aiming.test.js`).
The 19 new tests cover: determinism, monotonic ramps, bounded extremes,
direction, escape (0/35…) + real-sim ESCAPING, the crisp 280/285 threshold,
orbit + real-sim unconsumed ORBITAL reset, guidance===launch speed, no input
mutation, no world mutation, mobile parity (viewport-free), dxForTangFrac
inverse, and 3 integration flows (near-horizon / escape / orbit via PLAYER_RESET).

## 9. Headless results

`node /tmp/opencode/pup/verify14.mjs` — **0 failures, 0 console errors**.
Desktop 1280×720 (A low-power non-escape, B arrow power readout 60→144 px,
C real BREAK FREE complete, D real orbit + RESET → FIND THE ORBIT complete,
E deterministic escape threshold, F guidance===real velocity) + Mobile
390×844 and 360×800 (aim visuals present, camera static while aiming, result
opens, no overflow).

## 10. Mobile results

Same mapping (constant 340px span) works identically at 360×800 and 390×844:
aim works, trajectory/arrow/HUD render, camera does NOT drag while aiming,
real throw completes and the result panel opens without horizontal overflow.

## 11. Camera regression

`node /tmp/opencode/pup/verify8_8000.mjs` — **failures: 0, page errors: none**.
Slider zoom leaves orbit state clean, releasing over the slider clears
`cameraDragActive`, pointercancel / window blur / visibilitychange all clean
up, touch orbit + pinch zoom still work.

## 12. Performance observations

Aim mapping is O(1) pure arithmetic (no allocation in the hot path;
`aimToVelocity` returns a fresh plain object). Guidance prediction is
unchanged (capped 10 s / 200 samples; throttled by launchChanged). No
per-frame DOM; arrow length update is a plain `arrow.setLength` call on aim
move only.

## 13. Every changed file

- `js/game/aiming/mapping.js` — NEW pure input→launch mapping (`AIM_MAPPING`),
  `aimFractions`, `aimToVelocity`, `dxForTangFrac`, `escapeDrag`. Three.js-free.
- `js/game/aiming/evaluate.js` — NEW `evaluateAim` + `canEscape`/`canOrbit`.
- `js/game/aiming/index.js` — NEW barrel export.
- `js/game/trajectory.js` — now adapts `aimToVelocity` → `THREE.Vector3`;
  single source of truth for guidance AND the real launch (unchanged API).
- `js/game/aim.js` — arrow length now power-scaled (25…144 px) so escape
  range is visible at full pull.
- `tests/game/aiming.test.js` — NEW 19 tests; `tests/run_aiming.js` runner.
- `audit11.mjs`, `audit11b.mjs`, `audit11c.mjs`, `audit11d.mjs` — audit
  artifacts (envelope scan, orbit/reset timing, real-sim mapping validation).

## 14. Explicit NO list (untouched)

- Physically/classifier/telemetry/scoring: `js/physics.js`, `js/physics/`,
  `js/game/scoring/`, `js/game/missions/`, `js/game/progression/`,
  `js/game/challenges/`, `js/game/presentation.js`.
- Renderer: `js/render/blackhole.js` (baseline mtime 2026-08-17 08:37,
  unmodified). No new render objects, no mission rewording, no auto-aim, no
  fake ESCAPING/ORBITAL, no physics cheats, no XP/levels/currency.