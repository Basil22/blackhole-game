# PHASE21_REPORT — UI Cleanup, HUD Declutter & Responsive Mobile Layout

Delivered: a top-to-bottom UI cleanup pass — button sizing system, object slot in the
bottom row, single capture action, menu modal, chip hierarchy, and a direct user
revision pass (bottom-row object dropdown, single-icon slow-mo, chip counter +
lock-hint fixes, slide-out chips, Pascal-case title, audio button removed). UI
architecture only: no gameplay, physics, trajectory, aiming math, guidance,
scoring, telemetry, missions, progression, campaign unlock rules, or loop changes.

## How to verify

```bash
python3 serve.py 8000            # serve blackhole-game
# full node battery: 20 runners, 428 tests (campaign 26 now)
node /tmp/opencode/pup/verify21.mjs   # Phase-21 acceptance (0 failures, 0 page errors)
node /tmp/opencode/pup/verify20_open.mjs
node /tmp/opencode/pup/verify19_campaign.mjs
node /tmp/opencode/pup/verify18_aim.mjs
node /tmp/opencode/pup/verify17_controls.mjs
node /tmp/opencode/pup/verify16_mobile.mjs
node /tmp/opencode/pup/verify_feel15.mjs
node /tmp/opencode/pup/verify16_audio.mjs
node /tmp/opencode/pup/verify8_8000.mjs
node /tmp/opencode/pup/probe17.mjs   # monochrome identity (0 failures)
```

Screenshots: `/tmp/opencode/pup/shots21/` — A_IDLE · B_AIM · C_HIGH · D_THROW ·
E_APPROACH · F_CRITICAL · G_RESULT per viewport (360×800 · 390×844 · 414×896 · 1280×720).

## What changed

| Area | Files | Notes |
|---|---|---|
| Button sizing system | `css/style.css` | `--btn-min-h:44px`, `--btn-min-h-action:48px`, `--btn-icon:44px`; every control ≥44px touch target (48px for THROW/CANCEL). No JS viewport polling — pure CSS |
| Object dropdown | `index.html`, `css/style.css`, `js/game/ui.js` | `#obj-row` (slot + upward panel) is the FIRST child of `#bottom-controls`: `#obj-slot` → `#slowmo-btn` → `#throw-btn` → (`#cancel-btn`) |
| Panel UX | `js/game/ui.js`, `css/style.css` | column panel: head (OBJECTS label + 44px X) over 4 object tiles; closes via X, slot re-tap, outside tap, selection, or aim; `aria-expanded`; while open the slider cluster steps aside (`body.obj-panel-open #size-row/#zoom-row{display:none}`) so the dropdown never covers the sliders and outside taps land on the inert starfield |
| Single capture | `index.html`, `css/style.css` | one `#photo-btn` only — no share button, no `#audio-btn` |
| Slow-mo toggle | `index.html`, `css/style.css` | ONE rewind icon always; enabled state = white-fill inversion via `.on` (no clock/play icon swap, no "play button" confusion). Slow-mo sits LEFT of THROW |
| Menu modal | `index.html`, `css/style.css`, `js/game/ui.js` | `#menu-btn` (top-left) → `#menu-modal` (HOW TO PLAY + SETTINGS rows); settings opened from inside the menu closes the menu; small X + outside tap close; open blocked while a result panel shows; photo mode hides it (`setHudVisible`) |
| Chip counter | `index.html`, `js/game/campaignui.js` | level chip counter = CURRENT LEVEL / 4 (`current.index` 1–4, e.g. `1 / 4` boot → `4 / 4` on EVENT HORIZON) — same unit as the LEVEL kicker. Per-level mission counts stay in the level modal |
| Chip lock hints | `js/game/campaign/{state,campaign,index}.js`, `js/game/ui.js` | NEW pure `objectLevelIndex(objectId)` → rock 1, human 2, ship 3, planet 4. Picker + slot show `LOCKED · LV.{object's own level}` (astronaut = LV.2). `unlockHintForObject` unchanged — the modal still spells out which level to CLEAR |
| Chip slide-out | `css/style.css`, `js/main.js` | while aiming/flying, `body.gameplay-active` → level + mission chips `translateX(100%+24px)`, opacity 0, inert (0.32s ease, gated off by `prefers-reduced-motion`); return on idle |
| Title | `index.html`, `css/style.css`, `js/main.js`, `js/ui/theme.js` | top-bar wordmark is Pascal-case `Black Hole` (no ellipsis clamp — scales via media query). Uppercase `BLACK HOLE` kept for the document title + opening brand |
| Audio button removed | `index.html`, `js/main.js`, `css/style.css` | `#audio-btn`/`renderAudioBtn`/muted-class all removed; audio still fully controlled in Settings (menu → settings → AUDIO switch); `bh_audio_enabled` mirror + migration untouched |
| Mission chip 3rd line | `index.html`, `js/game/missionui.js` | `.ms-object` = the CURRENT level's recommended object — mission chip matches the level chip's 3-row footprint |
| Tests | `tests/game/campaign.test.js` (+`objectLevelIndex`), `tests/game/audio_feedback.test.js`, `tests/game/responsive_controls.test.js`, `tests/game/ui_identity.test.js` | all updated in lockstep |

## Semantics locked

- Zoom slider untouched: `distFromSlider`/`sliderFromDist`, MIN_DIST 96 / MAX_DIST 1200,
  LEFT = OUT → RIGHT = IN; label shows the slider value.
- CANCEL (Phase 17) untouched: restores idle, never launches, never writes telemetry.
  While aiming the bottom row swaps to `#cancel-btn` only (slot/slow-mo/throw hidden).
- Slow-mo/heave, object physics, aim mapping, guidance, scoring, telemetry, missions,
  campaign rules, `loop.js`, and `js/audio/*` semantics all unchanged.

## Node + harness totals

- Node: 20 runners, **428 tests**, 0 failures (campaign grew 25 → 26 with `objectLevelIndex`).
- Puppeteer: `verify21` 0 failures / 0 page errors; regressions `verify20_open`,
  `verify19_campaign`, `verify18_aim`, `verify17_controls`, `verify16_mobile`,
  `verify_feel15`, `verify16_audio`, `verify8_8000`, `verify_feel15`, `probe17` all green.
- probe17 note: its "picker" probe region was retargeted to the bottom strip (slot +
  THROW/SLOW-MO, opaque and monochrome) because the transparent-backed slider rows sit
  inside the old region — at max zoom the black-hole plasma behind them was counted as
  UI color. That was a probe-geometry artifact, not a UI regression.

STOPS HERE — no Phase 22.