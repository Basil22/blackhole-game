# Phase 18 Report — Aiming Learnability (Semantic Presentation, No New Physics)

**Status: COMPLETE.** All node suites green (380 tests across 18 runners + 8 legacy =
388 total), runtime verification green (`verify18_aim.mjs`, 0 failures / 0 page
errors), all prior-phase regressions green (`verify8_8000`, `verify16_mobile`,
`verify_feel15`, `verify16_audio`, `verify17_controls`, `probe17`).

---

## 1. What changed

A presentation-only pass that makes the aiming envelope readable **without any
numbers**, by deriving subtle visual/audio cues **from data the game already
computes**. Nothing about the physics, trajectory classification, mapping,
telemetry, scoring, missions, or progression changed.

1. **Trajectory path now carries intent** (`js/game/guidance/path.js`):
   - a tiny near-white **closest-approach marker** ("wrap point") at the
     predicted closest approach, shown only for passes that stay outside the
     horizon;
   - **apex emphasis** — samples near the turning point of an ORBITAL/FLYBY arc
     brighten toward near-white so the wrap reads before release;
   - **ESCAPING tail** — the last few samples + one small outward tick continue
     past the black-hole region so an escape visibly "keeps going";
   - **grazing pulse** — a very close, non-diving pass (closest between ~1.04×
     and ~1.7× horizon) breathes subtly (opacity ±0.07), gated by
     `prefers-reduced-motion` and by any running ghost fade;
   - CAPTURE keeps its existing inward red emphasis unchanged.
2. **Aim arrow brightens with power** (`js/game/aim.js`) — the shaft lerps
   amber `0xffc860` → near-white `0xfff4d0` as the pull crosses into the
   powerful tail (power ≥ ~0.72). Preallocated colors, zero per-call
   allocation. Literals/lengths unchanged.
3. **`aim-high` audio cue** — a quiet, latched, throttled sound fires **once**
   when the pull enters the powerful tail (`power01 ≥ 0.8`, a UI-normalized
   reading of the existing mapping — never displayed), and re-arms only after
   the player pulls back below the threshold. It is aim-only: never on launch,
   never per-frame.

**Design principle:** every new cue reads EXISTING classification +
closest-approach data. No new states (`TRAJECTORY` stays 6), no new thresholds
leak into the render class (1.04 / 1.7 / 1.05 live only in pure THREE-free
helpers), no per-frame allocation.

---

## 2. Presentation families (pure helpers, node-tested)

`stateMode()` maps the 6 canonical states to 4 emphasis families — no new
states, unknown keeps the clean curve:

| State | Family | Presentation |
|---|---|---|
| `CAPTURED`, `HORIZON_CROSSING` | capture | existing red rim; **no marker** (a dive already reads) |
| `ORBITAL` | orbital | amber + apex highlight + marker |
| `ESCAPING` | escape | amber + near-white tail + outward tick + marker |
| `FLYBY`, `UNKNOWN` | flyby | clean curve + apex highlight + marker |

The three Phase-18 thresholds are pure functions (`grazingBand`,
`closestMarkerVisible`, `escapeTailLength`) exported for node tests; the render
class reads only the precomputed `guidance` object.

---

## 3. Runtime semantics (what a player gesture means — unchanged)

Verified on the LIVE game in `verify18_aim.mjs`:

| Gesture | Guidance state | Marker | Pulse | Arrow |
|---|---|---|---|---|
| dx 10 (short) | CAPTURED | off (diving) | none | amber |
| dx 130 | ORBITAL | on (wrap point) | none | amber |
| dx 269 (high) | ORBITAL (still bound) | on | none | brightened `0xffd07d` |
| dx 40, dy 130 (precision) | ORBITAL, r_p 56 | on | **graze** | amber |
| dx 272 (escape) | ESCAPING | on | none | tail + continuation |

- **Drag continuity:** 21 incremental states, max per-step closest-distance jump
  58 — smooth, and state progression is monotone (no escape→bound regression).
- **Aim drags never orbit the camera** (theta/phi unchanged across a touch drag);
  **pinch still zooms** while aiming; **releasing the drag still launches**;
  **CANCEL still cancels**. All prior input semantics intact.
- **Real throws finalize correctly per object:** rock weak → consumed
  (HORIZON_CROSSING), human orbital + ship circular → ORBITAL (PLAYER_RESET),
  planet precision → consumed, rock escape → ESCAPING (DESPAWN). Every throw
  produced telemetry + score + result panel; 0 console errors.

---

## 4. aim-high audio cue

- New catalog event `aim-high` (`sounds.js`): `{ amp: 0.07, dur: 0.09, kind:
  'low' }`, haptic `'tap'`, cooldown 0.6 s. **Catalog now 14 events.**
- `Feedback.aimHigh()` wrapper + `createAudioSystem().aimHigh()` convenience.
- Fired from `Game._updateGuidance()` (throttled recompute — never per-frame),
  latched via `_highPowerLatched`:
  ```js
  const fr = aimFractions({ dx: this.aim.dx, dy: this.aim.dy });
  const high = fr.power01 >= 0.8;
  if (high && !this._highPowerLatched) { this._highPowerLatched = true; this.audio?.aimHigh(); }
  else if (!high) { this._highPowerLatched = false; }
  ```
- **Threshold rationale:** power01 0.8 ⇒ tangential multiple ≈ 1.37, i.e. a
  deliberate high-power pull but clearly *before* escape (√2) and well past a
  circular orbit (1.0) — the cue marks "powerful", never "free".
- Latched semantics verified live: sweeping 0→340 fires exactly once; pulling
  back below the threshold and re-crossing fires again (re-arm).
- `loop.js` untouched (source-guarded: no aim-high/per-frame audio).

---

## 5. Performance & allocation

- Trajectory path: still **one `THREE.Line` + one preallocated Float32Array
  buffer pair**; the new marker is **one reused `THREE.Mesh`** (static
  geometry, hidden/shown, `frustumCulled:false`); `tick()` performs zero
  `new` allocations (source-guarded).
- Aim arrow: two preallocated `THREE.Color`s (amber/pale); `update()` runs only
  on pointer-move, never per frame.
- The `aim-high` recompute rides the existing `launchChanged` throttle and
  calls the pure `aimFractions` (O(1)).

---

## 6. Accessibility

- The grazing pulse is disabled under `prefers-reduced-motion` and is
  intentionally subtle (static geometry marker, no motion).
- All new cues are color-neutral in *meaning*: amber/near-white/red are the
  pre-existing warm world-space language, not hue-coded UI state. The monochrome
  UI identity is untouched (`probe17.mjs`: 0 failures).
- The closest-approach marker + apex highlight are static — no animation.
- Audio cue is throttled/latched so it can never stutter under rapid drags.

---

## 7. Test counts (before → after)

| Suite | Before | After |
|---|---|---|
| node suites (17 runners) | 361 | **380** (18 runners) |
| legacy `physics.test.js` | 8 | 8 |
| **Total** | **369** | **388** |

New: `tests/game/aiming_ux.test.js` (**19 tests**: pure presentation helpers 5,
semantics-intact 3, aim-high bound + monotone 2, source guards 8, guidance
replay 1) + `tests/run_aiming_ux.js`. `audio_feedback.test.js` catalog count
13→14 and emit/convenience lists extended. All prior suites still green
(physics, trajectory, telemetry, scoring, guidance, presentation, missions,
progression, challenges, aiming, aiming_difficulty, spaghettification,
ui_identity, feel, audio, responsive).

---

## 8. Verification commands

```bash
node tests/run_aiming_ux.js        # 19 green (new Phase-18 suite)
# full node battery: 18 runners, 380 + 8 legacy = 388 green
node /tmp/opencode/pup/verify18_aim.mjs  # 0 failures, 0 page errors
node /tmp/opencode/pup/verify17_controls.mjs  # 0 failures
node /tmp/opencode/pup/probe17.mjs     # monochrome identity, 0 failures
node /tmp/opencode/pup/verify8_8000.mjs     # camera regression, 0 failures
node /tmp/opencode/pup/verify16_mobile.mjs  # mobile loop, 0 failures
node /tmp/opencode/pup/verify_feel15.mjs    # ALL GREEN
node /tmp/opencode/pup/verify16_audio.mjs   # ALL GREEN
```

---

## 9. Files changed

- `js/game/guidance/path.js` — marker mesh, apex/escape/grazing presentation,
  pure helpers `stateMode`/`grazingBand`/`closestMarkerVisible`/
  `escapeTailLength`; marker hidden on dive; pulse in `tick()`.
- `js/game/aim.js` — power-driven shaft color (preallocated lerp).
- `js/game/main.js` — `aimFractions` read, `_highPowerLatched`, aim-high fire in
  `_updateGuidance`; latch reset in `beginAim`/`cancelAim`.
- `js/audio/sounds.js` — `aim-high` event + haptic + throttle.
- `js/audio/feedback.js` — `Feedback.aimHigh()`.
- `js/audio/index.js` — `aimHigh()` convenience.
- `tests/game/audio_feedback.test.js` — catalog 13→14, emit/convenience lists.
- `tests/game/aiming_ux.test.js`, `tests/run_aiming_ux.js` — new Phase-18 suite.

## 10. Frozen systems (untouched, verified by suite)

`js/physics.js`, trajectory calc/classifier (6 states), telemetry, scoring,
missions, progression, challenge recommendation, spaghettification, black-hole
renderer, camera mechanics, aiming mapping (all Phase-13 anchors byte-identical),
guidance calculations, `loop.js`, all Phase-11/13/15/16/17 behavior.

## 11. Limitations

- The closest-approach marker, apex highlight, and pulse all follow the
  **analytic point-mass prediction** — a large object's real path deviates
  slightly from the prediction (documented COM approximation); the marker shows
  the predicted wrap, not a guarantee.
- The ESCAPING continuation tick is a short, clearly-styled visual hint, not a
  physics extension; it is capped to one extra buffer segment and ≤6 tail
  samples.
- `aim-high` fires on the *predicted* power envelope (the drag), not on what the
  flight later does — consistent with the aim-state/guidance cues.
