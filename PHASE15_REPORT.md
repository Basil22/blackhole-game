# PHASE 15 — Gameplay Feel & Throw Feedback Polish

Date: 2026-08-18 · Game dir: `blackhole-game/`

## 1. Goal & scope

Make the act of throwing **read as a game** without touching a single frozen
system. Phase 13 (aiming control) and Phase 14 (monochrome UI) fixed *what* the
player can do and *how it looks*; Phase 15 polishes *how it feels*:
- the predicted path used to **blink out** the instant you released — the real
  object started flying from a line that simply vanished;
- launch had **zero feedback** — no particle, no cue, the arrow just hid;
- tears (the game's signature moment) read as an 8-dot dribble;
- the aim arrow's amber on bright plasma washed out, and its head was small
  enough to lose on a phone.

All changes are **presentation-only**: `js/physics.js`, aiming/mapping, guidance
(compute), trajectory, telemetry, scoring, missions, progression, challenges,
objects.js physics params, spaghettification/spring/tear mechanics,
`classifyTrajectory()` / `predictTrajectory()` / `calculateGuidance()` /
`velocityRelativeToEscape()`, mission evaluation, camera/input, and
`js/render/blackhole.js` are untouched. No new gameplay states, no new systems,
no audio, no per-frame allocation, no post-processing.

## 2. Feel audit method

Because the sim is (by design) real Newtonian gravity, "feel" was audited two
ways:
1. **Code audit** — read the full presentation layer (`aim.js`, `path.js`,
   `loop.js`, `main.js`, `spawn.js`, `visualizer.js`, `particles.js`,
   `guidehud.js`, `result.js`, `input.js`) and documented the as-is behavior.
2. **Runtime baseline** — `feel15.mjs` drove the real game through
   IDLE → AIM → APPROACH → CRITICAL → TEAR → CONSUMPTION → RESULT at desktop +
   both mobile viewports, plus a direct-opacity sampler (`verify_feel15.mjs`)
   that proved the *before* state (path invisible immediately on launch, no
   ghost, 0 launch particles, 8-dot tears).

The session's model cannot view images, so the visual pass is recorded
programmatically (pixel probes — see §24) exactly as Phase 14 did.

## 3. Audit findings (as-is baseline)

| Moment | As-is behavior |
|---|---|
| Aim arrow | `ArrowHelper` amber `0xffaa00`, head 6.4×4.8, len 25–144; comment called it "orange" |
| Trajectory path | one preallocated Line, opacity 0.85, amber → red inside 1.2×horizon; **hidden instantly on launch** |
| Launch | arrow hides + path hides; **no particle, no continuity cue** |
| Tear | `particles.tear()`: 8 dots, speed 1.5, size 0.5, life 1.2 |
| Consumption | `horizonRim` glow + `bh.flash()` — already strong, **kept unchanged** |
| Proximity | `setProximity` glare already ramps the hole as matter closes in — **kept unchanged** |
| Guidance chip | monochrome text (state + closest distance) while aiming — **kept unchanged** |

## 4. Launch handoff ghost (predicted → real continuity)

The single biggest feel gap: at release the path vanished and the real object
simply "was flying". Now the predicted path **dissolves over 0.35 s** right
after launch, so the object visibly continues the exact line the player was
shown. Implementation (`js/game/guidance/path.js`):
- `fadeOut()` arms the dissolve (no-op → `hide()` when nothing to fade).
- `tick(dt)` (new per-frame tick, called from `loop.js` once a frame) drives
  `material.opacity` along the ease-out curve; when done it hides the line and
  **restores opacity to 0.85** for the next aim.
- `update(guidance)` and `hide()` cancel any running fade — a fresh aim or a
  reset is always a clean slate.
- **Reduced motion**: with `prefers-reduced-motion: reduce`, `fadeOut()` drops
  the path instantly (the dissolve is purely cosmetic, never a delay).
- Zero per-frame cost when no fade is running: `tick()` early-returns on one
  comparison.

## 5. Ghost fade curve

Pure function `ghostOpacity(p)` (exported for the node suite; `path.js` top
level is THREE-free):
- `p = 0` → `0.85` (full opacity at the moment of release)
- `p = 0.5` → `0.85 × (1 − 0.25) = 0.6375`
- `p = 1` → `0`
- ease-out (`1 − t²`) — quick off the launch, gentle tail.

Node tests assert the exact endpoints, monotone non-increasing behavior, and
clamping for out-of-range inputs.

## 6. Launch impulse trail

New `ParticleSystem.launchTrail(pos, vel, color)` (`js/render/objects/
particles.js`): six small droplets **biased along the launch direction**
(10–32% of launch speed, ±30% spread), ~0.45 s life, drawn in the **object's
own color** (`colorFor(kind)` in `spawn.js`), gravity ~0. The release now reads
as an impulse — the object separates from a dissolving streak — instead of a
silent sprite pop. Bounded: 6 particles per throw, far under the 700 cap.

## 7. Tear feedback boost

`tear()` went from 8 dots (speed 1.5, size 0.5, life 1.2) to:
- **14** color-chunk particles (speed 2.6, size 0.6, life 1.0) — the torn
  fragments visibly kick away at the snap;
- **3 white hot-spark particles** (speed 4.4, size 0.22, life 0.5) riding the
  biggest chunks — a crisp "snap" flash against the plasma.

Worst case budgeted: a full 31-point planet tear storm ≈ 13 tears × 17 ≈ 221
particles (measured peak in the runtime harness: 699, which includes a
concurrent consumption flash — still under `MAX = 700`; the cap itself is
untouched).

## 8. Aim arrow readability

`js/game/aim.js`:
- shaft `0xffaa00` → **`0xffc860`** (pale amber that holds contrast over the
  bright plasma disk);
- cone → **`0xfff4d0`** (near-white aim point that pops);
- head `6.4×4.8` → **`8.0×6.5`** (legible at mobile sizes);
- the stale `setLength(len, 6.4, 4.8)` in `update()` (which re-applied the old
  head every drag) updated to match the new geometry.

Color stays in the world-space amber "slingshot language" — the Phase 14
monochrome identity governs UI chrome only, and this pass adds no UI color.

## 9. What was deliberately NOT changed (and why)

- **Aiming/launch velocity** (`aiming/mapping.js`, `trajectory.js`,
  `aim.dx/dy` × 0.9 in `main.js`) — feel is solved visually, not by retuning
  the physics; Phase 13's periapsis-linear envelope stays byte-identical.
- **Physics / spaghettification constants / spring–tear mechanics** — Phase 12's
  calibration (breakStrain 0.38, brace, shellBreakStrain) must not be
  re-broken "for feel".
- **`classifyTrajectory` / `predictTrajectory` / `calculateGuidance` /
  `velocityRelativeToEscape`** — prediction is still purely informational.
- **Telemetry / scoring / missions / progression / challenges** — nothing the
  player "feels" is allowed to change the score or the campaign.
- **Camera / input** (`input.js`) — no camera auto-motion that could fight the
  player's orbit.
- **Black hole renderer** (`js/render/blackhole.js`) — `setProximity`,
  `flash()`, `agitate()` hooks were already the escalation machinery and are
  consumed as before.

## 10. Interaction with Phases 13 & 14

- Phase 13 mapping verified unchanged by the new feel suite (anchors asserted:
  tangMin 0.35, tangMax 1.62, tangSpan 340, escapeAt dx 272 @ √2, circularAt
  dx 258, radGain, yBias).
- Phase 14 monochrome identity preserved: `probe15.mjs` re-asserts **0.00%
  saturated pixels in every UI region** on the new Phase 15 screenshots; the
  only colors on screen are the intentional world plasma + the in-world
  arrow/trajectory/tear effects.
- `verify17` A–W (which includes the Phase 14 UI/identity checks) still passes
  0 failures after the feel pass.

## 11. Reduced motion

- Ghost fade: `TrajectoryPath` reads `prefers-reduced-motion: reduce`; under it
  `fadeOut()` hides the path instantly and restores opacity immediately
  (verified: `{"v":false,"o":0.85}` 80 ms after launch).
- Launch trail and tear bursts are transient world-space particles, unaffected
  by the CSS reduced-motion rules (which continue to disable all DOM
  transitions/animations as in Phase 14).

## 12. Performance budget

| Effect | Cost |
|---|---|
| Ghost `tick(dt)` | 1 comparison/frame when idle; a few opacity writes for ≤ 0.35 s after a launch |
| Launch trail | 6 particles, once per throw |
| Tear burst | 14+3 particles per tear (~221 worst case for a planet storm) |
| Arrow | static geometry change, no per-frame work |
| All | no new draw calls, no per-frame allocation, no post-processing, no mesh-per-fragment |

## 13. Bug found & fixed during the pass: method shadowing

The first implementation named the ghost tick `update(dt)` — **shadowing** the
existing `update(guidance)` render method (same name, different signature).
The result was a silent no-op: the path never rendered while aiming, which
surfaced as "path invisible" in the runtime harness (trace showed
`_updateGuidance` → `trajPath.update` resolving to the fade tick). Fixed by
renaming the tick to `tick(dt)`, and the feel suite now asserts **both**
`update(guidance)` and `tick(dt)` exist, so this class of footgun is caught.

## 14. Bug found & fixed during the pass: setLength override

`AimArrow.update()` called `arrow.setLength(len, 6.4, 4.8)` — the constructor's
new 8.0/6.5 head was silently reverted on the very first drag update. (In this
THREE build, `ArrowHelper` stores head geometry in `cone.scale`
(y = headLength, x/z = headWidth) rather than named fields.) Fixed the call
site to 8.0/6.5; the runtime harness verifies the live cone scale.

## 15. Files changed

| File | Change |
|---|---|
| `js/game/guidance/path.js` | ghost fade (`fadeOut`/`tick`), exported `OPACITY`/`FADE`/`ghostOpacity`, fade-cancel in `update`/`hide`, reduced-motion guard |
| `js/game/loop.js` | one line: `game.trajPath.tick(dtReal)` |
| `js/game/main.js` | `launch()` clears prediction state but calls `trajPath.fadeOut()` + `particles.launchTrail(...)` instead of `_clearGuidance()`; `disposeObject()` keeps the instant hide |
| `js/render/objects/particles.js` | new `launchTrail`; `tear()` boosted (14 + 3 white sparks) |
| `js/game/aim.js` | arrow palette (`0xffc860`/`0xfff4d0`), head 8.0×6.5, `setLength` updated |
| `tests/game/feel.test.js` | **new** — 9-test Phase 15 feel suite |
| `tests/run_feel.js` | **new** — runner |

## 16. Files explicitly NOT changed

- `js/physics.js` + `js/physics/**` (world, integrate, shapes, trajectory,
  telemetry, vectors, masses)
- `js/game/aiming/**` incl. `mapping.js` (Phase 13) and `trajectory.js`
- `js/game/guidance/guidance.js` (pure compute) — only its sibling `path.js`
  (render) changed
- `js/game/scoring/**`, `js/game/missions/**`, `js/game/progression/**`,
  `js/game/challenges/**`, `js/game/telemetry/**`
- `js/objects.js` physics params; `js/game/spawn.js`, `js/game/input.js`,
  `js/game/sim.js`, `js/game/readout.js`, `js/game/guidehud.js`,
  `js/game/result.js`, `js/game/presentation.js`, `js/game/ui.js`,
  `js/game/missionui.js`
- `js/render/blackhole.js`, `js/render/scene.js`, `js/render/starfield.js`,
  `js/render/lights.js`, `js/render/objects/visualizer.js`
- `index.html`, `css/style.css`, `js/ui/**`, `manifest.webmanifest`

## 17. New node suite (`feel.test.js`) — what it guards

1. Ghost fade curve: exact endpoints, midpoint, clamping, monotone decrease.
2. Fade is short (0.35 s) and reduced-motion aware in source; `update(guidance)`
   and `tick(dt)` both exist (guards the §13 shadowing bug).
3. **Frozen tuning unchanged**: PHYS_DT 1/240, horizon 40, scoring weights sum
   to 1, the exact 6 TRAJECTORY states, all Phase 13 mapping anchors, mu
   12.288e6, despawn 560.
4. **No new imports into frozen layers** added by the feel pass (allowed set =
   the pre-existing single-source-of-truth edges only).
5. Launch clears prediction state but fades the path (no `_clearGuidance` in
   `launch()`; `disposeObject()` still hides instantly); loop ticks the fade.
6. Aim arrow palette + head geometry in source.
7. Particle effects stay bounded (MAX 700 untouched) with the boosted tear and
   `launchTrail` present; `burst`/`_emit` signatures unchanged.
8. Presentation files stay emoji-free; UI theme files remain grayscale.
9. `path.js` top level is THREE-free (importable in node) — the pure-fade
   exports are testable without a renderer.

## 18. Node test counts

| Suite | Tests | Result |
|---|---:|---|
| physics (base) | 8 | pass |
| aiming (Phase 11) | 19 | pass |
| aiming_difficulty (Phase 13) | 22 | pass |
| challenges | 17 | pass |
| guidance | 9 | pass |
| missions | 25 | pass |
| physics_audit | 29 | pass |
| physics_telemetry | 25 | pass |
| physics_trajectory | 31 | pass |
| presentation | 12 | pass |
| progression | 36 | pass |
| progression_flow | 16 | pass |
| scoring | 17 | pass |
| spaghettification | 22 | pass |
| ui_identity (Phase 14) | 30 | pass |
| **feel (Phase 15, new)** | **9** | **pass** |
| **Total** | **327** | **0 failures** |

(318 pre-existing + 9 new; no existing test regressed.)

## 19. Runtime feel verification (`verify_feel15.mjs`)

Runs the live game headlessly and asserts 19 checks:
- **Arrow** — shaft `#ffc860`, cone `#fff4d0`, live `cone.scale.y === 8` /
  `cone.scale.x === 6.5`, visible while aiming.
- **Launch impulse** — particle count 0 → 6 right after launch.
- **Ghost fade** — path visible while aiming; still visible immediately after
  launch; **opacity strictly decreases** (sampled 0.802 → 0.154 across ~10
  frames); fully hidden within ~1 s; material opacity restored to 0.85.
- **Tear feedback** — planet deep plunge tears; particle count peaks at 699
  (under the 700 cap); white snap sparks present.
- **Reduced motion** — with `--force-prefers-reduced-motion`, launch hides the
  path instantly and restores opacity at once.
- **Zero console/page errors** through the whole run.

All green.

## 20. Headless regression: gameplay (`verify17.mjs`)

A–W, **0 failures, 0 console/page errors**: single-source launch velocity bit-
matches guidance, real BREAK FREE + FIND THE ORBIT missions complete end-to-end,
scoring/presentation/progression contracts, mobile loops (390×844 + 360×800 ×
4 objects) with guidance shown, camera never drifting, 0 overflow, THROW AGAIN
flow. The feel pass changed no gameplay path.

## 21. Headless regression: camera (`verify8_8000.mjs`)

**0 failures** — slider-no-leak, canvas orbit, release-over-slider, pointerup/
pause, pointercancel, blur, visibilitychange, touch orbit, pinch zoom. Input
layer untouched.

## 22. Headless regression: mobile (`verify16_mobile.mjs`)

**0 failures** at 390×844 and 360×800 — no overflow at rest or after slider
drag, slider zoom works, all four objects full-loop green (human 6 tears /
32.42 stretch, planet 43 tears / 47.48 stretch, results land, panel opens).

## 23. Screenshot checkpoints (`feel15.mjs` → `shots15/`)

Captured at 1280×720, 390×844, 360×800:
`A_IDLE`, `B_AIM`, `C_APPROACH`, `D_CRITICAL`, `E_TEAR`, `F_CONSUMPTION`,
`G_RESULT`, `H_LAUNCH_GHOST` (path mid-dissolve ~60 ms post-launch),
`I_MISSION_SELECTOR`, `J_OBJECT_PICKER`, `K_TRAJECTORY_RIM`, `L_MISSION_COMPLETE`
plus `MOBILE_{390x844,360x800}_{IDLE,AIM,RESULT}`. The `H_LAUNCH_GHOST` frames
are the before/after proof: pre-pass the path was gone at this instant;
post-pass the warm dissolve trail is present (see §24).

## 24. Pixel probe results (`probe15.mjs`)

Every PNG is decoded in-browser and analyzed:
- **UI monochrome preserved** — title, top buttons, picker, THROW core, sliders:
  **0.00% saturated-hue pixels** on all 25 shots (Phase 14 identity intact).
- **Ghost trail visible** — all `H_LAUNCH_GHOST` frames contain warm amber
  trajectory pixels (0.60–0.96% of frame) — the predicted path is mid-dissolve,
  not blinked out.
- **Tear sparks present** — all `E_TEAR` frames contain white hot-spark pixels
  (0.643–1.664%).
- **Aim trajectory present** — `B_AIM` / `K_TRAJECTORY_RIM` carry the amber
  trajectory language (0.59–0.61%).

## 25. Known limitations

- **The dissolve is world-space**, so `prefers-reduced-motion` users get an
  instant hide (correct, but the continuity cue is lost for them — a conscious
  a11y trade, same as Phase 12/14 motion policy).
- **Launch trail is subtle by design** (6 short droplets) — it reads as an
  impulse, not an explosion; it is not configurable from a menu.
- **Tear spark color** is fixed near-white; it intentionally matches the
  trajectory's "heat" language rather than per-object colors.
- Visual acceptance again relied on programmatic probes + live-object numeric
  verification because the session's model has no image input; a maintainer
  with an image-capable view is encouraged to open `/tmp/opencode/pup/shots15/`.
- No audio (per the Phase 15 envelope) — feedback remains 100% visual.

## 26. Final acceptance status

- **Launch now has a handoff**: the predicted path dissolves onto the real
  flight instead of blinking out, and a directional color puff marks release.
- **Tears read**: 14-chunk burst + white snap sparks, bounded under the
  untouched 700-particle cap.
- **Aim reads**: brighter pale-amber arrow with a near-white, larger head at
  every zoom and on both mobile viewports.
- Frozen systems byte-identical (asserted by the feel suite): physics, aiming/
  mapping, guidance compute, trajectory, telemetry, scoring, missions,
  progression, challenges, spaghettification, camera, black-hole renderer.
- 327 node tests green (318 + 9 new); `verify_feel15` 19/19; `verify17` 0
  failures; `verify8_8000` 0 failures; `verify16_mobile` 0 failures; probe15
  all monochrome + ghost/spark/trajectory present.
- Phase 15 complete.

## 27. Next phase

**Phase 16 is intentionally NOT started.** The envelope (no onboarding/tutorial/
XP/currency/achievements/audio-lock) is respected; the game ships with real
Newtonian physics, the Phase 13 control envelope, the Phase 14 monochrome
identity, and the Phase 15 feel pass — all verified green.
