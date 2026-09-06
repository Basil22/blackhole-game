# PHASE 29 REPORT — Escape Reachability + Guidance Honesty

**Status:** delivered · FINAL
**Scope:** aim-mapping reshape, guidance-verdict honesty, escape score bonus, honest mission
difficulty tags. No physics/trajectory/scoring semantics changed beyond additive escape credit.
**Project:** Black Hole (Three.js) — `blackhole-game/`

---

## 1. Problem Statement

Three dishonesty seams made the game's hard outcomes punish players instead of rewarding them:

1. **Escape sat at a full-width razor.** Analytic point-mass √2 put the escape boundary near the
   very top of the swipe (dx ~306 of 340). OSEK: skimming within ~5% of a swipe. Meanwhile the
   *measured* real-sim threshold (finite-size objects, drag, spaghettification) was `tangFrac
   1.60` ≈ dx 250 — but guidance used the analytic verdict, so the game **lied**: dx 285–305
   told the player "free" while the sim still pulled it back.
2. **A proud ESCAPING throw scored worse than an accidental plunge.** Phase-25 audit: ESCAPING
   paid 82–250 total, while any careless HORIZON_CROSSING plunge paid 3.6k+ and a close tearing
   pass 7k+. The cold score punished exactly the outcome the "Break Free" mission celebrates.
3. **The ORBITAL band was absurdly wide and mis-tagged.** dx 25–280 produced an analytic orbit
   with periapsis saturating, so "Find the Orbit" (difficulty 4 = HARD) was nearly as easy as
   the welcome-mat capture missions.

## 2. Aim Envelope Reshape (`js/game/aiming/mapping.js`)

Escape now begins at **dx 250 of 340 (~74% of a swipe)** — the MEASURED real-sim threshold
where all 4 objects genuinely escape (5/5 throws), not the analytic √2.

- New anchors: `captureAt {dx 25, rp 42}`, `precisionAt {dx 40, rp 56}`, `circularAt {dx 150,
  rp 384.5}`, `escapeAt {dx 250, tangFrac 1.60}`.
- `ESCAPE_TANGF = 1.60`; `tangMax` 1.65 → **2.0** (dx 340 = a bounded "deep escape" tail).
- `tangFracFromDx` / `aimToVelocity` signatures unchanged — only the mapping constants move.

Per-object measured floors (`js/game/aiming/simProfile.js`, NEW): `rock {1.03, 1.60}`,
`human {1.25, 1.60}`, `ship {1.25, 1.60}`, `planet {1.27, 1.60}` — `orbitFloor` = first
non-consumed gesture, `escapeAt` = measured 5/5 escape.

## 3. Guidance Honesty (`js/game/guidance/guidance.js`)

`calculateGuidance` now accepts `simProfile` (on the launch object or in `options`) and corrects
the analytic verdict to the measured bands:

- `tf < orbitFloor` → **HORIZON_CROSSING** (was CAPTURED/ORBITAL analytic mid-bands).
- `orbitFloor ≤ tf < escapeAt` → **ORBITAL** (kills the analytic-√2 false "free"/ESCAPING claims).
- HORIZON_CROSSING closest distance clamped to ≤ 1.5×HR (a swallowed pass is *right there*).
- Rendered path samples stay analytic — an aspirational preview, not a physics claim.

`main.js` wires `simProfile: OBJECT_SIM_PROFILES[this.currentId]`; `evaluateAim`/`canEscape`/
`canOrbit` gained the same optional `simProfile`.

Guidance verdict == real-sim verdict at the three anchors (dx 100 → HORIZON_CROSSING,
dx 200 → ORBITAL, dx 250 → ESCAPING), rock and ship.

## 4. Escape-Survival Score Bonus (`js/game/scoring/`)

New category **HARD-WON ESCAPE** (`escapeSurvivalMax 800`), the pressure-signal inverted:

- Eligible = surviving `ESCAPING` with `velocityRatio ≥ 1` (real escape, not telemetry fluke).
- Credit = `1 − normalize01((velocityRatio − 1.13)/(1.414 − 1.13))`:
  a **rim-thread** (≈1.135) gets ~full credit; a **blasé full-power fling** (≥1.414) banks zero.
- `maxTotal` 10600 → **11400** (600 near-horizon + 800 escape). Tests pin 11400.

Measured real-sim totals (drag 0.1/1.6, all finite):

| Gesture | Outcome | Total | Escape bonus |
|---|---|---|---|
| rock dx250 | ESCAPING (rim) | **884** | 797 |
| ship dx250 | ESCAPING (rim) | **902** | 773 |
| rock dx300 | ESCAPING | 441 | 354 |
| rock dx340 | ESCAPING fling | 304 | 0 |
| rock dx200 | ORBITAL | 1420 | 0 |
| rock dx100/lower | HORIZON_CROSSING plunge | ~2.8–7.4k | 0 |

An escape near the rim now outscores the old 82–250 baseline by 3–10×; a dramatic close tearing
pass still tops the table (spaghettification is the show), but the game no longer actively
punishes the cleanest happy ending.

## 5. Honest Difficulty Tags (`js/game/missions/catalog.js`)

- **orbit-01: 4 → 2** (BALANCED). The ORBITAL band is a wide mid-swipe ramp (rock ~dx155–249),
  nothing like the razor it used to be. Challenges test unpinned alongside.
- **escape-01 stays 5** — now genuinely explicit at 74% of a swipe, still the biggest gesture.
- **score-01/02 targets kept 1200/3000.** Calibration hit a ladder wall: target 4500 would have
  *inverted* the ladder vs High Roller's 3000, and the swallow-trough (dx100 ≈ 2838) left no
  honest band between 1200 and 3000 without painstaking risk. Phase 24 already tuned these two
  as "achievable but not trivial" — they were honest before and after Phase 29.

## 6. Gate & Verification

- **`tests/run_phase29_gate.js`** (6 checks): real-sim bands at every anchor (dx 100 swallow /
  200 orbit / 250 escape, rock + ship); escape ≤ 74% of swipe at tangFrac 1.60; per-object
  orbit floors rise with softness; all 7 missions reachable with human-scale gestures on their
  recommended object; Grazing completes within a few throws (object builds are stochastic —
  `Math.random` point layout, so the razor-close pass is retried); guidance verdict == measured
  real-sim verdict at dx 100/200/250.
- **`tests/run_all.js`** aggregate: **22/22 runners green** (0 failures; `run_ui_identity` is the
  pre-existing Windows/OneDrive CRLF `.icon-btn` artifact, whitelisted).

New/changed tests: `scoring.test.js` (nested `initial` override + escape-bonus trio),
`scoring_integration.test.js` (real-sim escape earns the bonus, plunge never does; sums to
total), `challenges.test.js` (orbit-01 label BALANCED), `aiming_ux`/`aiming_difficulty`/
`feel`/`presentation` fixtures retuned to the honest band edges.

## 7. Out of Scope / Notes

- Physics, trajectory, spaghettification, audio, camera, and loop unchanged.
- Object builds are stochastic (`Math.random` point placement) — existing behavior, surfaced by
  the razor-close Grazing case; the mission remains practically reachable (partial survival
  counts since Phase 25).
- Puppeteer viewport/visual harnesses require the un-run browser environment (no
  `/tmp/opencode/pup` here); the node gate is this phase's verification scope.