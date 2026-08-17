# PHASE20_REPORT — Opening + Settings

Delivered: a product-level opening/title experience and a persistent, mobile-first
Settings screen, layered strictly ON TOP of the existing engine. No gameplay content,
physics, trajectory classification, mission/progression, scoring, or loop changes.

## How to verify

```bash
python3 serve.py 8000            # serve blackhole-game
node tests/run_settings.js        # new pure-layer suite (22)
# full node battery: 20 runners, 427 tests
node /tmp/opencode/pup/verify20_open.mjs   # Phase-20 acceptance (35 checks, 0 failures)
# regressions (all ALL GREEN / 0 failures):
node /tmp/opencode/pup/verify19_campaign.mjs
node /tmp/opencode/pup/verify18_aim.mjs
node /tmp/opencode/pup/verify17_controls.mjs
node /tmp/opencode/pup/verify16_mobile.mjs
node /tmp/opencode/pup/verify_feel15.mjs
node /tmp/opencode/pup/verify16_audio.mjs
node /tmp/opencode/pup/verify8_8000.mjs
node /tmp/opencode/pup/probe17.mjs
```

Screenshots: `/tmp/opencode/pup/shots20/` — OPENING · DIVE · SETTLE · GAMEPLAY ·
SETTINGS + SETTINGS_{360,390,414,1280}.

## What changed

| Area | Files | Notes |
|---|---|---|
| Settings pure layer | `js/game/settings/{model,storage,index}.js` | versioned `blackhole-game:settings:v1`, immutable, garbage-tolerant, node-testable |
| Opening | `js/game/opening.js` | title screen + accelerating camera dive + `diveProgress` pure exporter |
| Settings UI | `js/game/settingsui.js` | declarative rows, `role="switch"`, text/class-only refresh |
| Input | `js/game/input.js` | `setLocked` (keyboard gate) + `syncFromCamera` (settle into orbit) |
| Audio | `js/audio/haptics.js`, `js/audio/index.js` | live haptics enable + reduced-motion hooks |
| Wiring | `js/main.js` | Settings controller, migration, opening, gear FAB, debug hooks |
| UI | `js/game/ui.js` | auto-help removed; `setHudVisible` hides settings FAB/modal |
| Markup/Style | `index.html`, `css/style.css` | `#opening`, `#settings-open`, `#settings-modal`, exposure + reduced-motion CSS |
| Tests | `tests/game/settings.test.js`, `tests/run_settings.js` | 22 node tests |
| Harness | `/tmp/opencode/pup/verify20_open.mjs` | 35 acceptance checks |

## Settings model

- Keys: `audio`, `haptics`, `skipIntro`, `reduceMotion`. Version `1`.
- One source of truth (`js/main.js`): the speaker FAB and the settings toggle both
  write `audio`, the legacy `bh_audio_enabled` key is a write-mirror (kept so existing
  source-guard tests match) and is read once for migration when no Phase-20 settings exist.
- Reducing motion is effective = system `prefers-reduced-motion` OR the explicit toggle;
  never forced off. `reduceMotionEffective` is live-evaluated each apply.

## Opening / dive semantics

- FIRST launch = full intro: PLAY fades the title while the camera accelerates in
  (`easeInOutCubic` + small trailing sine overshoot, `diveProgress`, capped 1.06) from
  DIVE_FROM 460 → settle at exactly the gameplay framing 208 → `syncFromCamera` (orbit and
  zoom slider cache match the real camera) → input released → idle.
- Skip Intro ON → 150 ms fade, no camera movement. Reduced motion (effective) → 320 ms
  simple fade, no dive/exposure/bounce. No Skip-Intro *button* on the opening — only the
  hint ("Want to skip the intro? Enable Skip Intro in Settings."), which hides when the
  intro would be skipped.
- Exposure: a CSS class on the existing `#vignette` (one GPU-composited transition; the
  `prefers-reduced-motion` media override restores the normal vignette). Dive is a
  short-lived rAF that writes only the camera with a preallocated vector — no per-frame DOM,
  no allocations, loop.js untouched, no second pipeline/post-processing/render targets.
- Keyboard is gated while the opening is up via `input.setLocked`; pointer input needs no
  explicit lock (full-screen overlay intercepts).

## Audio

- PLAY: `aim-start` on dive activation, `aim-state` settle blip, `tap('select')` on press —
  all through the existing gesture-unlocked Phase-16 chain; completely silent when audio is disabled.

## Mobile matrix (360×800 · 390×844 · 414×896 · 1280×720)

- No horizontal overflow on opening or settings modal; PLAY 48px / SETTINGS + gear + toggles
  ≥44px; `env(safe-area-inset-*)` respected; result panel blocks settings when open; photo
  mode closes/hides settings.

## Performance contract

- Settings rows are data-declared (`SETTING_ROWS`); `refresh` is class/text-only. The dive
  tick has zero allocations. No new Three.js objects at rest. No per-frame DOM anywhere.

## Test counts (before → after)

- Node: Phase 19 = 425 (417 + 8 legacy) → Phase 20 = **427 across 20 runners** + legacy suites all green.
- `verify20_open.mjs`: **35 checks, 0 failures, 0 page errors**.
- Regressions all green: verify19_campaign · verify18_aim · verify17_controls · verify16_mobile
  · verify_feel15 · verify16_audio · verify8_8000 · probe17.
- Legacy harnesses were updated to dismiss the opening overlay at every boot/reload
  (`window.__opening && window.__opening.skip()` inside their existing help-modal dismissal).

## Frozen systems (untouched)

`js/physics.js`, trajectory states, aiming mapping, velocity/escape math, telemetry, scoring,
spaghettification, mission semantics, `evaluateMission`, campaign internals, loop.js, all
Phase 1–19 systems. No post-MVP features. **No Phase 21.**

## Verification issues caught & fixed during the phase

- DOMRect returned from `page.evaluate` serializes to `{}` over CDP (prototype getters) —
  harness now reduces to scalars in-page.
- Puppeteer ≥22: `page.waitForTimeout` removed — harnesses use a `sleep` helper; `mouse.down`
  requires a string button (`'left'`).
- Result panel (`#result .rs-again`) blocks settings while open — harness dismisses it first.
- Dive-kinematic sampling originally straddled the acceleration peak (t=0.5 @ 750 ms);
  re-sampled within the accelerate window (200/450/700 ms) for the monotonic drop check.