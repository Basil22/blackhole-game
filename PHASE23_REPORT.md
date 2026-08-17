# PHASE 23 — UI Finalization + Opening Camera Polish

**Status:** DELIVERED (FINAL). Supersedes nothing gameplay-side — UI-only + opening camera. No black-hole renderer, no gameplay/physics/loop content changes.

## Scope (from the Phase-23 spec, interpreted after a user decision)
- **Final gameplay zoom = 30** — the user locked "30 = slider value 30 → dist 868.8"
  (the extended Phase-17 zoom axis), NOT 30 pitch-degrees. Consequences:
  the default gameplay framing moves from the old close-up (dist 208 ≈ slider 90)
  to the wide establishing frame (dist 868.8 ≈ slider 30); the opening dive
  sweeps the EXTENDED axis −30 → +30 (start dist 1531.2 = farther than the
  normal slider max, pass through 0 = dist 1200, settle exactly at +30 =
  868.8). Skip-intro and reduced-motion land at 868.8 too.
- Identical Level + Mission HUD card dimensions, always, whatever the content.
- Opening content mathematically centered in the usable (safe-area) viewport.
- Opening buttons = the shared design-system buttons (no bespoke opening CSS).
- Camera + zoom UI always agree (never camera=30/UI=0 or camera=30/UI=19).

## What changed
### `css/style.css`
- **One shared compact-card component** (`:is(.level-chip, .mission-chip)`):
  identical width/height/padding/border/radius/type/rows/alignment guaranteed by
  a single grouped rule + a fixed `--chip-w` token
  (`clamp(150px, 46vw, 180px)` desktop, `clamp(136px, 52vw, 176px)` ≤480px).
  Rows are one shared def: kicker (`:is(.lv-kicker,.ms-kicker)` label +
  right-aligned counter via `margin-left:auto`), title (`:is(.lv-title,.ms-title)`),
  object (`:is(.lv-object,.ms-object)`) — all `white-space:nowrap; overflow:hidden;
  text-overflow:ellipsis` so longer mission names wrap/truncate, never resize the box.
  Per-card only the `top` offset differs (level 78px, mission 140px). The Phase-21
  throw-mode slide-out transition is untouched.
- **Opening true centering:** `#opening` now centers inside the usable viewport —
  flex `align-items/justify-content:center` PLUS `env(safe-area-inset-*)` padding
  (top/right/bottom/left) so notches/home-indicator shift the center. No magic offsets.
- **Opening buttons = shared buttons:** removed `.opening-play` (was 200px/48px)
  and `.opening-settings` (was 160px/44px) bespoke geometry entirely. PLAY is now
  exactly `.ctrl-btn.primary` (48px action token, same as THROW); SETTINGS exactly
  `.ctrl-btn` (44px, same as CANCEL).
- **Approach exposure:** new `body.intro-approach #vignette` — a slightly stronger
  peripheral brighten that only appears as the camera nears the settle framing
  (one class toggle at ~72% of the dive, GPU-composited, reduced-motion override added).

### `js/render/scene.js`
- Default camera `position.set(0, 9.6, 208)` → `(0, 9.6, 868.8)`: the settled
  gameplay framing IS zoom 30. The wide establishing frame the dive/skip/reduced
  paths all land on.

### `js/game/input.js`
- `syncFromCamera()` now also calls `this.syncZoomSlider(this.dist)` — after ANY
  settle (dive end, skip-intro, reduced-motion, harness `skip()`) the zoom slider
  + numeric label are re-derived from the camera. Camera is the source of truth;
  there is no camera=30/UI=0 or camera=30/UI=19 state.

### `js/game/opening.js`
- Replaced the old `DIVE_FROM=460`/`DIVE_TO=208` radial dive with the extended
  zoom-axis sweep: pure `diveDistFromSlider(s)` (= 1200 − s·11.04, negative s =
  farther than max), `DIVE_SLIDER_FROM=-30`, `DIVE_SLIDER_TO=30`, `DIVE_FROM=1531.2`,
  `DIVE_TO=868.8`, `GAMEPLAY_ZOOM=30`. `diveProgress(t)` (easeInOutCubic + trailing
  sine bounce, capped 1.06) unchanged; the tick computes `sl = −30 + 60·p` then
  `d = diveDistFromSlider(sl)` so overshoot carries past +30 (dips below 868.8,
  ~840) then settles exactly at 868.8. `DIVE_MS=1500` unchanged.
- **Approach exposure stage:** a `setTimeout` at `DIVE_MS·0.72` toggles
  `body.intro-approach` (removed in `_finishDive`/`_done`); zero per-frame DOM work.
- **`skip()` now settles the camera** at `(0, 9.6, DIVE_TO)` + `syncFromCamera()`
  before releasing — harness boots land at zoom 30 with UI agreement (previously
  they were left at the parked DIVE_FROM framing, which would have read −30).

### `index.html`
- No markup changes (opening buttons already carried the shared `ctrl-btn` /
  `ctrl-btn primary` classes).

### Harnesses
- `verify20_open.mjs`: updated dive/settle/overshoot/skip/reduced-motion assertions
  to the new framing (park 1531.2, settle 868.8, overshoot passes +30, etc.).
- `verify21.mjs`: the object-panel "outside tap" probe now taps a genuinely empty
  starfield point (was `(vw/2,120)`, which the now-fixed-width right-side cards
  began covering at 360px and would open the level modal instead of closing the panel).
- New `verify23.mjs` (35 checks) + new node suite.

## Node suite (Phase 23)
New `tests/game/ui_finalize.test.js` (9 tests) via `tests/run_ui_finalize.js`:
final zoom is 30 (dist 868.8, `sliderFromDist(868.8)=30`); dive axis −30→+30
monotonic and settle exact; cards are ONE shared component (grouped selector,
`--chip-w`, no content-driven width, truncation rows); slide-out preserved;
`syncFromCamera` pushes the zoom UI; scene default is 868.8; tick sweeps the
extended axis; opening buttons are the shared buttons (no bespoke geometry);
opening centered with safe-area.

## Verification
- **Node:** 21 runners, **437 tests, 0 failures** (was 428).
- **`verify23.mjs` (Phase 23):** 35 checks, 0 failures, 0 page errors.
  Per-viewport 360×800 / 390×844 / 414×896 / 1280×720: opening centered (dx/dy 0),
  PLAY 48px / SETTINGS 44px, no overflow; dive starts >1200 (z=1531.1), accelerates,
  overshoot min z=838.7, settles exactly 868.8 with slider+label 30; skip-intro and
  reduced-motion land at zoom 30 with UI agreement; cards identical box 180×52
  (176×52 mobile), same padding/border/radius/type, 3 rows, text rows truncate,
  long-mission stress never shifts width/height/position; card tap-target gap 10px;
  screenshots `shots23/` (OPENING/DIVE/SETTLE/GAMEPLAY/CARDS/SETTINGS_*/INPLAY_*).
- **`pixel23.mjs`:** BH plasma visible at zoom 30 (max strip lum 211), settle dist
  868 / slider 30 / label 30, cards render as dark surfaces, 0 failures.
- **Regressions:** `verify21`, `verify20_open`, `verify19_campaign`, `verify18_aim`,
  `verify17_controls`, `verify16_mobile`, `verify_feel15`, `verify16_audio`,
  `verify8_8000`, `probe17` — all green.

## Notes
- `run_spaghettification` flaked once in a batch run (21/1) then passed 7 consecutive
  isolated runs (22/0) — pre-existing Phase-12 tear-timing flake, physics untouched.
- No black-hole renderer, physics, telemetry, score, mission, progression, campaign,
  audio, or loop changes in this phase.
