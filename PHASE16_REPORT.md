# PHASE 16 — Restrained Audio & Haptic Feedback Layer

## 1. Goal & scope
Add an atmospheric but **restrained, optional** audio + haptics layer to BLACK HOLE:
semantic sound events for select / slider / aim / launch / near-horizon / tear /
capture / escape / mission result / mission unlock, a lazy Web Audio engine, a
monochrome speaker toggle persisted in `localStorage`, throttling so nothing
becomes a machine-gun, and haptics through `navigator.vibrate` — mobile-first,
fully optional, and strictly one-way: **audio reads game state, never writes it**.

Phase 16 touches only `js/audio/` (new), `js/main.js`, `js/game/main.js`,
`js/game/loop.js`, `index.html`, `css/style.css`, `js/ui/icons.js`, plus new
tests. Physics, physics mechanics, aiming mapping, trajectory guidance,
telemetry, scoring, mission evaluation, progression, the black-hole renderer,
camera math/input, and throw mechanics are all untouched.

## 2. Sound design language
The audio vocabulary is a quiet scientific instrument, not a Hollywood score:
every event is short, low-level and descriptive — it answers *"what just
happened?"*, never *"something exciting is happening!"*. Guiding rules, from the
brief:

- No constant music. One very quiet, loopable ambient drone ("the void
  breathing") whose tension tracks matter on the horizon rim.
- Nothing bombastic: amplitudes are 0.04–0.19 of the master, no reverb-laden
  booms, no fanfares (mission-complete is 3 short notes at 392/523/659 Hz).
- **No machine-guns.** Tears and slider ticks are throttled (min spacing
  160 ms / 60 ms); horizon and capture are capped at once or ~0.5 s; a planet's
  spring cascade reads as a *sequence*, not a noise burst.
- Object differentiation is subtle per material: rock = dry, human =
  structural, ship = slightly metallic, planet = deeper rumble (see §4).
- Haptics reuse the same restraint: every gesture is a short pulse or brief
  pattern, halved under `prefers-reduced-motion`.

## 3. Architecture
```
js/audio/sounds.js    pure DATA: SOUNDS catalog, HAPTIC_MAP, EVENT_CONFIG, object tonalities
js/audio/haptics.js   semantic vibrate helpers (tap/launch/horizon/tear/capture/escape/success/failure)
js/audio/feedback.js  pure semantic layer: event → sound+haptic, throttle rules, mute flag
js/audio/audio.js     lazy Web Audio engine: shared AudioContext, master gain, synths, ambient drone
js/audio/index.js     barrel: createAudioSystem() wires all three + convenience methods
```
The game layer **only calls semantic events**: `game.audio?.tap('select')`,
`game.audio?.launch({ object })`, `...tear({ object })`, `...capture()`,
`...escape()`, `...horizon()`, `...aimStart()`, `...slider()`, plus the
mission-outcome methods. No raw `AudioContext` / `navigator.vibrate` exists
outside `js/audio/` (source-guarded, §17). Sounds are synthesized (oscillators +
one shared white-noise buffer) — zero sample files, zero external library.

## 4. `sounds.js` — palette + tone data
`SOUNDS` = 12 events, each `{ amp, dur, kind }`:
select (dry click) · slider (micro tick) · aim-start (low activation) ·
aim-state (soft two-tone blip, defined but un-wired — reserved) · launch (short
directional whoosh that pairs with the Phase-15 launch trail) · horizon (deep
tonal "dive") · tear (restrained snap) · capture (deep gravitational drop) ·
escape (restrained rising tone) · mission-complete (3-note minimal
confirmation) · mission-failed (short low) · mission-unlock (two mechanical
ticks).

`HAPTIC_MAP` maps every event to a gesture; `EVENT_CONFIG` sets per-event
cooldowns (tear 0.16 s, slider 0.06 s, aim-state 0.35 s, horizon/capture/escape
0.5 s, mission events 0.3 s). `OBJECT_TONE` biases the tear snap per material:
rock `{noise 1.35}`, human `{noise 0.85}`, ship `{noise 0.65, metal 1}`, planet
`{noise 0.45, low 1.7, rumble 1}`.

## 5. `audio.js` — Web Audio engine
- **Lazy init**: `unlock()` (from a user gesture) creates the `AudioContext`
  once; `available`/`unlocked` false until then; every later `unlock()` resumes
  the context (browsers re-suspend between gestures). If the store or the API is
  missing, `play` is a strict no-op — audio is enhancement only.
- Master gain node; `setMuted`/`setVolume` via `setTargetAtTime` (no clicks).
- **Ambient drone**: two detuned sub-sines (47/58.5 Hz) through a lowpass +
  a quiet 118 Hz overtone gain that swells with `setProximity(k)`
  (0.016 → 0.106 gain, cutoff 110 → 300 Hz). Driven **event-likely**, not
  per-frame: `setProximity` ignores changes < 0.004 and is called once per loop
  frame into an engine that self-throttles (~no allocations when nothing moved).
- Synths are tiny oscillator/gain/noise envelopes that auto-stop and disconnect
  on `onended` — no node leaks, no per-frame allocation.

## 6. `feedback.js` — semantic layer + throttling
`Feedback` owns event mapping, throttling and the mute flag (pure — importable
in node). Throttle gate uses `now() - last >= cooldown*1000` and records the
timestamp only on a *played* event, so a cascade re-checks against the last real
emission. Mute blocks both sound and haptics before emission.

## 7. `haptics.js`
Semantic gestures: tap 12 ms · launch 24 · horizon 35 · tear 16 · capture
[55,30,45] · escape [18,40,18] · success [14,30,14] · failure 30. Guards every
call (`available` check, try/catch), no long continuous vibration, and halves
patterns under `prefers-reduced-motion` (min 6 ms). Works on desktop Chrome
where `navigator.vibrate` is absent (no-op) and on mobile.

## 8. `index.js` barrel
`createAudioSystem()` = engine + haptics + feedback, exposing the convenience
API the game shell uses, including `setMuted`, `setProximity`, `unlock`,
`suspend`/`resume`, `dispose`.

## 9. Speaker toggle UI
- `js/ui/icons.js`: two 24×24 stroke-1.7 icons — `speaker-on` (box+cone+two
  waves) and `speaker-off` (box+cone+X), same monochrome `currentColor` language.
- `index.html`: `#audio-btn` added to `.top-right` **before** `#share-btn` so the
  mission chip at `top:78px` stays clear; `aria-label` toggles
  `Mute sound` / `Unmute sound`.
- `css/style.css`: `#audio-btn` 38×38 (the "quietest" control); muted state
  dims to `--ui-gray-3` with a faint border. On `max-width:420px` the cluster
  tightens (gap 4px; share/photo 40 px, audio 36 px) and the centered wordmark
  shrinks to 10 px / 0.12em with a 76 px `ellipsis` clamp so the third button
  never collides with the title (`audio_shots.mjs` + geometry probes: 10 px
  clearance at 360×800, 25 px at 390×844).
- `js/main.js`: toggle reads `localStorage['bh_audio_enabled']` at boot (default
  on), writes `"0"`/`"1"` on click, swaps icon + class + aria-label.

## 10. Gameplay wiring map (all one-way, all semantic)
| Event | Call site |
|---|---|
| `tap('select')` | `Game.selectObject` (picker) |
| `slider()` | `Game.setSize` (size-slider input) |
| `aimStart()` | `Game.beginAim` (THROW button / space / result-panel THROW AGAIN) |
| `launch({object})` | `Game.launch` (drag release / Enter) |
| `setProximity(prox)` + `horizon()` (once/throw) | `loop.js` frame, at the existing `setProximity` hook; horizon fires when `prox ≥ 0.92` (object ≤ ~1.24·horizon) |
| `tear({object})` | `loop.js handleEvents` on each tear (kind-timbred) |
| `capture()` | `loop.js handleEvents` on each consume |
| `escape()` | `loop.js` finalize: `DESPAWN && trajectoryState==='ESCAPING'` |
| mission-complete / unlock / failed | `js/main.js onThrowEnded`, gated off `PLAYER_RESET` |
| mute persistence / gesture unlock | boot + `#audio-btn` (js/main.js) |

The drone and horizon read only the existing read-only `computeProximity`
result; nothing here calls prediction or touches the sim.

## 11. Cancellation semantics (cancel = silent)
Phase-15b semantics preserved exactly: `disposeObject()` (the player reset /
cancel path) contains **no** audio call — source-guarded (§17) and runtime-
verified (§19 D). A cancelled aim produces no launch / capture / tear / horizon /
escape sound and no haptics; the next `beginAim` still emits only `aim-start`.

## 12. Ambient proximity drone
One shared low drone, super quiet (base 0.016) — the void breathing. Its gain
and filter follow `computeProximity` (0 → nothing near, 1 → matter on the rim),
so a planet diving in audibly narrows/tightens tension and the drone settles
back down after release. The `setProximity` engine call self-throttles
(>0.004 delta), never allocates per frame, and is a no-op when the context is
locked.

## 13. Audio lifecycle
- **First gesture unlock**: capture-phase `pointerdown`/`keydown` on window →
  `audio.unlock()` (idempotent). Before any gesture the engine is locked and
  `play` is silent — this satisfies mobile autoplay rules.
- **No background audio**: `visibilitychange→hidden` and `focus`→`blur`
  suspend; return/`focus` resume (only if already unlocked).
- **Reload**: mute preference survives via `localStorage`.
- **Photo/share mode** hides the whole top bar (existing `setHudVisible(false)`);
  result panel and mission selector play no ambient changes.
- If audio/haptics are unavailable the feature set simply doesn't exist
  (verified L/M, §19).

## 14. Bugs found & fixed during the pass
- **Throttle timestamp-0 bug (`feedback.js`)**: `this._last.get(name) || -Infinity`
  treated a recorded timestamp of `0` as "never played" because `0` is falsy —
  an event logged at `t=0` could never throttle. Fixed with `?? -Infinity`. This
  was caught by the *new* suite, showing the pure feedback layer is testable and
  the guard is worth it.
- **Haptics reduced-motion bug (`haptics.js`)**: `scale()` read the module-global
  `REDUCED_MOTION` (auto-detected at import time) instead of the instance flag —
  a test-supplied `reducedMotion:true` was ignored. Fixed: `scale(pattern, reduced)`.
- **Mobile title collision**: the third top-right button pushed the centered
  wordmark into the button cluster at ≤420 px (was fine with two buttons).
  Fixed in the existing media query (wordmark shrink + ellipsis clamp; cluster
  re-gap), verified by geometry probes at 360/390/420 px.

## 15. Files changed
- `js/audio/sounds.js` (new) · `js/audio/haptics.js` (new) ·
  `js/audio/feedback.js` (new) · `js/audio/audio.js` (new) ·
  `js/audio/index.js` (new)
- `js/game/main.js` (audio option + semantic calls in select/setSize/beginAim/
  launch; `_horizonSounded` reset)
- `js/game/loop.js` (`TERMINATION` import; tear/capture/escape calls; shared
  proximity → drone + once-per-throw horizon)
- `js/main.js` (audio boot: create, localStorage mute, toggle, gesture unlock,
  visibility/blur suspend-resume; `window.__audio` debug hook; mission-outcome
  sounds; pass `audio` to `Game`)
- `index.html` (`#audio-btn` before `#share-btn`)
- `css/style.css` (`#audio-btn` sizing + muted state; ≤420 px cluster + wordmark)
- `js/ui/icons.js` (`speaker-on` / `speaker-off`)
- `tests/game/audio_feedback.test.js` (new) · `tests/run_audio_feedback.js` (new)

## 16. Files explicitly NOT changed
`js/physics.js`, `js/physics/` (all), `js/game/aiming/`, `js/game/guidance/`,
`js/game/scoring/`, `js/game/missions/`, `js/game/progression/`,
`js/game/challenges/`, `js/game/presentation.js`, `js/game/result.js`,
`js/game/missionui.js`, `js/game/guidehud.js`, `js/game/trajectory.js`,
`js/game/input.js`, `js/game/sim.js`, `js/game/readout.js`,
`js/render/` (all), `js/objects.js`, `js/ui/theme.js`, `js/ui/readout…`.
The black hole renderer, camera math/input, throw mechanics, Phase-15 feel
values (ghost `OPACITY 0.85`/`FADE 0.35`, arrow `8.0,6.5`, tear cap 700) are all
unchanged.

## 17. New node suite (`audio_feedback.test.js`) — what it guards
23 tests across: catalog completeness + self-consistency (12 events; every
event mapped to a sound kind + haptic gesture; throttled set includes
tear/slider/horizon/capture/escape) · object tonalities · throttle gate behavior
(first fires, repeats blocked, cooldown releases, per-event not global) ·
semantic wrappers emit the right sound **and** haptic · mute blocks both ·
feedback purity (no state mutation possible) · AudioEngine lazy init + no-op
when unavailable + node allocation only when unmuted (fake AudioContext) ·
Haptics unavailable no-op + pattern lengths < 250 ms + reduced-motion halving ·
`createAudioSystem` end-to-end + convenience API · **source guards**: no raw
`AudioContext`/`navigator.vibrate` outside `js/audio/`, `js/audio/` never
imports game internals, cancel path has no audio call, launch is the only
sound-bearing spawn path, mission audio gated on `PLAYER_RESET`, escape only on
`DESPAWN+ESCAPING`, localStorage persistence + speaker-toggle presence + no
emoji anywhere in the audio layer.

## 18. Node test counts
| Suite | Tests |
|---|---|
| All 16 `run_*.js` suites (incl. new `run_audio_feedback.js`) | **342 passed, 0 failed** |
| `tests/physics.test.js` (legacy) | 8 passed |
| **Total** | **350 passed, 0 failed** (baseline 327 + 23 audio) |

## 19. Runtime audio verification (`verify16_audio.mjs`)
52 checks, ALL GREEN at `http://localhost:8000/` (SwiftShader headless Chrome):
A first-gesture unlock (locked before any gesture, unlocked + context after a
synthetic `pointerdown`) · B select sound + 12 ms haptic tap · C aim-start +
launch whoosh · D cancel (disposeObject) emits **zero** throw feedback, also
through AIM→CANCEL→AIM · E near-horizon deep event fires **exactly once** per
throw · F tears fire with object timbre and are throttled (measured min gap
173–188 ms ≥ 140 ms target, count 2–3 on a planet plunge) · G capture drop ·
H clean escape (rock dx330/dy−60 → `ESCAPING`, despawned) plays the rising tone
and **no** capture/tear/horizon · I first mission completion plays
mission-complete **and** mission-unlock · J the next failed mission plays
mission-failed · K default unmuted, toggle mutes + persists `"0"`, a muted
throw emits *zero* sound/haptic, un-mute persists `"1"` · L `AudioContext` deleted
→ engine unavailable, never unlocked, game still launches and flies · M
`navigator.vibrate` deleted → haptics unavailable, game still throws ·
N+O viewports 390×844, 360×800, 1280×720 → no horizontal overflow, toggle
visible + clear of mission chip and wordmark, share/photo present, toggle + throw
work · P zero app console/page errors.

## 20. Headless regression (all 0 failures, 0 console errors)
- `verify_feel15.mjs` (Phase 15 feel) — **ALL GREEN**
- `verify17.mjs` (Phase 17 challenge layer) — failures 0
- `verify8_8000.mjs` (camera input) — failures 0
- `verify16_mobile.mjs` (mobile) — failures 0
- `probe15.mjs` UI-saturation probe — all pass; every UI region (incl. the new
  top-right buttons) measures **0.00 %** saturated color

One honest note: Chrome logs a *platform* notice — `Blocked call to
navigator.vibrate because user hasn't tapped…` — when vibrate is called without
a transient user gesture (only reproducible in headless automation, which has no
finger). Our haptics layer degrades silently (`return false`, never throws), so
the four puppeteer harnesses filter exactly that known block as a non-app error;
real-world taps provide the gesture and the API works. This filter weakens no
node test and no app error is masked.

## 21. Screenshots + toggle verification
- `feel15.mjs` rerun → `shots15/` (all 23 Phase-15 checkpoints now show the
  speaker toggle; mission-chip/modal/result geometry unchanged).
- `audio_shots.mjs` → `shots16/`: 1280×720 / 390×844 / 360×800 × (idle,
  top-bar cluster, muted state), 9 PNGs.
- Toggle pixel-probe: unmuted button = white stroke `speaker-on` glyph
  (38×38), muted = `rgb(102,102,102)` `--ui-gray-3` `speaker-off` X — both
  states monochrome, no saturation.

## 22. Known limitations
- Web Audio is one shared `AudioContext`; iOS Safari reports context as
  suspended until the gesture unlock — the game starts silent and activates on
  first finger. This is exactly the documented behavior.
- Haptics are iOS-unavailable by design (guarded no-op); Android vibration
  respects browser/user vibration settings automatically.
- `aim-state` blip is defined in the catalog and reserved but not yet wired —
  the aim HUD's guidance state is already a visual + drone response.
- Sounds are synthesized; there is deliberately no balance/volume control beyond
  the single toggle (off = complete silence incl. drone + haptics).

## 23. Final acceptance status
- All spec runtime checks A–P green (§19); all node suites green (§18);
  all prior-phase regressions green (§20).
- The audio layer is strictly emissive (source-guarded + purity-tested, §17),
  enhancement-only (unavailable API paths verified L/M), throttled and
  cancellation-preserving (§6, §11).
- UI is monochrome and mobile-safe (§9, §12, §20).
- **Phase 16 is complete.**

## 24. STOP — no Phase 17
Phase 16 ships the restrained audio + haptics layer and is done. No Phase 17
begins: no gameplay balancing, no black-hole renderer changes, no UI redesign,
no music progression / XP / levels / currency / achievements. Further work on
this game is a deliberate, separate decision.