# Black Hole — Game & Styling Briefing

You are working on **Black Hole**, a web-based physics sandbox game built with Three.js (ES modules, no bundler). The game lives in `blackhole-game/` inside this repo. Run it with `python3 serve.py 8000` → `http://localhost:8000/`. Extend the existing codebase following its exact conventions and phase discipline below.

## What the game is

The player throws objects (asteroid, astronaut, ship, planet) toward a black hole and watches real **spaghettification** — spring-mass objects stretch, tear apart, and get consumed at the event horizon. Gravity is real Newtonian physics (no general relativity). Presentation has a 4-level **campaign ladder** on top of a mission system, plus an aim/throw interaction, slow-motion, camera orbit/zoom, photo capture, and a settings + title screen.

## Physics model (do not casually change — tuned and frozen)

- `mu = 12.288e6`, horizon radius `hr = 40`, fixed timestep `1/240` s, scene self-similar-scaled ×1.6.
- Objects are networks of spring-connected masses; tidal stretch tears springs past a material break-strain. All tuned constants live in `js/objects.js`, `js/physics.js`, `js/physics/shapes.js`.
- Trajectory-classification + prediction, throw telemetry, scoring (max ~11400), mission evaluators, campaign progression, and an aiming-guidance layer are all separated pure modules under `js/physics/` and `js/game/`. None of them should be touched casually.
- **Scoring/telemetry/campaign/audio/haptics/orbit/zoom are all "owned" systems** — visual-only work must never alter their behavior.

## Architecture (file map)

- `js/physics.js` — sim, trajectories, telemetry, closest approach (Three.js-free).
- `js/objects.js` — object templates `{indices, kind, color}`.
- `js/render/` — Three.js scene, black-hole renderer (`blackhole.js` = legacy geometry fallback), hybrid lensing pass (`blackhole/lensing.js`, `blackhole/plasmaField.js`), object visualizer.
- `js/game/` — loop, input, main Game shell, UI, result panel, mission/guidance/comic/settings/campaign layers, HUD.
- `js/audio/sounds.js` + `haptics.js`; `js/main.js` app shell wiring + debug hooks (`window.__game`, `window.__audio`, `window.__settings`, `window.__opening`, `window.__comic`).
- Node test suites: one runner per feature under `tests/run_*.js`, aggregate via `node tests/run_all.js` (currently ~23 runners).

## Current visual identity — the "monochrome technical instrument" language

This is the most important styling rule: **black + white + grays only, hard edges, 2–3px radii, uppercase micro-typography, letter-spaced labels. Color is NEVER the carrier of state — text is.** The ONLY accent color in the whole app is amber `#ffd07d` (the BH plasma/aim family), reused solely for the capture BOOM comic word. No emoji anywhere in the UI or comic words (ASCII text only). State is always communicated with explicit text labels (LOCKED, CURRENT, FAIL, ON/OFF) plus weight/border effects — never color alone.

Design tokens live in `:root` of `css/style.css` (mirrored by `js/ui/theme.js`):
- Surfaces: `--ui-black #000`, `--ui-ink #050505`, translucent `--ui-surface` panels, `--ui-surface-panel rgba(8,8,8,.97)`.
- Whites/grays: `--ui-white`, `--ui-off-white`, `--ui-gray-1 … -4`, `--ui-dim`.
- Borders: `--ui-border rgba(255,255,255,.18)`, `--ui-border-strong .4`, `--ui-border-bright .65`.
- Radii: 2px buttons/cards, 3px panels/chips.
- Buttons: `--btn-icon 44px`, `--btn-min-h 44px` (secondary), `--btn-min-h-action 48px` (primary), `--btn-stroke 1.7px`.
- Shared HUD card width: `--chip-w: clamp(150px,46vw,180px)` (mobile `clamp(136px,52vw,176px)`).
- Font: Inter / system-ui stack.

### Button system (Phase 21)
Every control uses `.icon-btn` (44×44, black bg, 1px `--ui-border-strong` border, white icon) or `.ctrl-btn` (min-height 44px, 12px/800-weight/0.16em letter-spacing uppercase text, 2px radius). `.ctrl-btn.primary` = 48px min-height, white border, min-width 120px. Hover/focus/active invert to white bg + black text; `:active` nudges down 1px. Disabled = gray text + faint border. THROW/PLAY/DONE are primary; CANCEL/SETTINGS are secondary.

### UI layout inventory
- **Top bar:** centered Pascal-case wordmark **`Black Hole`** (NOT the uppercase `BRAND.name`); top-right `#photo-btn` (icon-only capture, no share).
- **Top-left:** `#menu-btn` FAB (hamburger) → MENU modal with HOW TO PLAY + SETTINGS rows.
- **Right side:** two identical 3-row cards — `#level-chip` at `top:78px`, `#mission-chip` at `top:140px`. Shared structure: kicker (LABEL + counter), title (nowrap/ellipsis), object line. Both slide out (`translateX(100%+24px)`, opacity 0) while aiming/flying (`body.gameplay-active`).
- **Bottom HUD**, fixed gradient, max-width 480px column: SIZE slider row → ZOOM slider row (LEFT=OUT/FAR, RIGHT=IN/NEAR; 0→100 maps linearly to camera distance 96→1200; default camera dist 868.8 = slider 30) → object row.
- **Bottom controls row:** `#obj-slot` (collapsed picker; opens a column panel with head label + 44px X + 4 tiles) → `#slowmo-btn` (single icon, `.on` = white fill) → `#throw-btn` (primary). While aiming, THROW/slowmo/obj-slot hide and `#cancel-btn` appears (secondary, close icon + CANCEL, never red).
- **Overlays:** aiming guidance chip (`#guidance-hud`, top center under title), live physics readout, one-shot `DRAG TO AIM · RELEASE TO THROW` hint, mission/level modals (dark panel, rows with CURRENT/COMPLETED/LOCKED states, DONE primary), result panel (count-up total, breakdown rows, THROW AGAIN primary, mission outcome block, campaign-reward block, `.rs-close` 44px X), help modal, settings modal (`role="switch"` toggle rows with ON/OFF text), menu modal, opening title screen (PLAY primary + SETTINGS secondary stacked, brand `BLACK HOLE` + `SPACE STUDIO`).

### Opening / title experience
First launch = full intro: PLAY fades the `#opening` overlay while the camera dives along the extended zoom axis (pure eased dive from slider −30/dist 1531 → settle at slider 30/dist 868.8, ~1.5 s with a sine overshoot) → settle → gameplay idle. Skip Intro in Settings → 150ms fade. Reduced motion → plain 320ms fade (no dive/exposure/bounce). Exposure pulse = CSS class on `#vignette` only.

### Phase 29 comic feedback (most recent — presentation-only)
At most 5 pooled "impact words" (`WHOOSH!`, `BOOM!`, `CRACK!`, `STREEETCH!`, `BYE!`, `NICE!`, `OOF!`, …) over a cheap screen shake. Words are WHITE 900-weight uppercase with a 2px black stroke (`-webkit-text-stroke` + 9-direction hard text-shadow), `clamp(26px,8.5vw,42px)`, rendered in the `#comic-fx` overlay (`position:fixed; inset:0; z-index:38; pointer-events:none`). World anchors are projected through the game camera each frame then clamped into a safe screen band that clears the HUD chips/bottom controls. The lone amber `.accent` (#ffd07d) is used ONLY for the capture BOOM. Shake = small translate keyframes on `#canvas-container` via `body.comic-shake-s/m/l` classes (0.16/0.18/0.22s), killed globally under `prefers-reduced-motion`. Everything in `js/game/comic/` (`comic.js` pure core, `renderer.js` DOM adapter, `index.js` barrel). Word lifecycles respect reduced motion (×0.45, no bounce/drift, no shake — but text still appears; reduced motion removes motion, never content).

### Responsive & touch (hard requirements, verified)
- No horizontal overflow at 360×800 / 390×844 / 414×896 / 1280×720.
- Every touch target ≥44px; primary actions (THROW/PLAY/DONE) ≥48px.
- `env(safe-area-inset-*)` used everywhere fixed elements touch edges.
- ≤480px: sliders `min(44vw,176px)`, HUD gap compresses, object picker becomes a centered stacked dialog, `--chip-w` narrows.
- Zero permissions, `touch-action:none`, `user-select:none`, tap highlight transparent.
- Photo mode (`UI.setHudVisible(false)`) hides ALL HUD including the comic overlay.

### Motion & reduced motion
Global `@media (prefers-reduced-motion: reduce)` kills all transitions/animations. Individual features ALSO gate internally: aim-pulse, result reveal, opening dive/exposure, chip slide-out, comic lifecycles/shake.

## Hard rules for any change
1. **Presentation-only changes** must never alter physics, trajectory, scoring, missions, progression, campaign, audio, haptics, camera, zoom, input, or the game state machine (`loop.js` state count stays as-is).
2. **Never use color as the sole state carrier**; never introduce new colors besides the monochrome ramp + `#ffd07d`.
3. **Never add emoji**; comic words must be uppercase ASCII.
4. `loop.js` stays 6 states (IDLE/AIM/FLYING/TRAJECTORY/TELEMETRY/RESULT pattern); game/UI words stay monochrome.
5. Respect the existing naming: exports like `distFromSlider`/`sliderFromDist`, `tangFracFromDx`, `objectLevelIndex`, etc.
6. Keep the layer tests green: `node tests/run_all.js` must stay ≥ the current 23/23 green runners.

## Current phase status
Through Phase 29 (comic feedback). All phases delivered: 6E optics rebuild, 12 spaghettification overhaul, 14 monochrome identity, 17 responsive controls + CANCEL, 18 aiming learnability, 19 campaign, 20 opening + settings, 21 UI cleanup + layout, 23 UI finalize + zoom-30 camera, 24/25 balance + mobile result UX, 26 Android packaging, 28 + 28.1 hybrid relativistic lensing, 29 comic feedback. **STOP — no new phase should auto-start.**