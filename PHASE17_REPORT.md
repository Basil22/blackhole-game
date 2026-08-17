# Phase 17 Report — Responsive Gameplay Controls + Zoom Semantics + CANCEL

**Status: COMPLETE.** All node suites green (369 tests), runtime verification green
at 4 viewports, all prior-phase regressions green, zero console errors.

---

## 1. What changed

Three coordinated changes, all in the presentation/control layer:

1. **Zoom-slider semantics reversed** — the slider now reads **LEFT = ZOOM OUT,
   RIGHT = ZOOM IN** (`0` = farthest `1200`, `100` = closest `96`). The camera
   range and every pinch/orbit/damping behavior are untouched; only the pure
   slider→distance mapping flipped.
2. **CANCEL action for aiming** — a real semantic button replaces THROW while
   aiming and backs out without launching, without finalizing anything, and
   without touching telemetry/score/mission/progression. Also reachable via
   **Escape** while aiming.
3. **Responsive control layout** — on small screens the HUD cluster is tightened
   (SIZE→ZOOM gap closed, wider sliders, tighter padding) while every touch
   target stays ≥44px and the home-indicator safe area is respected.

No physics, trajectory, telemetry, scoring, mission, progression, black-hole
renderer, camera mechanics, aiming mapping, or guidance behavior changed.

---

## 2. Zoom-slider semantics (inverted mapping)

`js/game/input.js` now exports two pure helpers:

```js
export function distFromSlider(v) {          // 0 → 1200 (OUT), 100 → 96 (IN)
  const p = Math.max(0, Math.min(100, v)) / 100;
  return MAX_DIST - p * (MAX_DIST - MIN_DIST);
}
export function sliderFromDist(d) {
  return Math.round(((MAX_DIST - d) / (MAX_DIST - MIN_DIST)) * 100);
}
export { MIN_DIST, MAX_DIST };               // range UNCHANGED: 96 … 1200
```

| Slider | Distance |
|---|---|
| 0 (far left) | 1200 (ZOOM OUT) |
| 25 | 924 |
| 50 | 648 |
| 75 | 372 |
| 100 (far right) | 96 (ZOOM IN) |

**Proof the camera range is unchanged:** `MIN_DIST = 96`, `MAX_DIST = 1200`
are exported and asserted by the node suite; the endpoints land exactly on them;
`sliderFromDist(distFromSlider(v)) === v` for all sample points; the pinch path
still uses the same `Math.max(MIN_DIST, Math.min(MAX_DIST, …))` clamp.

### Bug fixed along the way
The `#zoom-val` readout was only refreshed on boot and pinch, not on manual
slider drags — dragging the slider left the label stale. The slider `input`
handler now updates the label (`input.js` `_bindSlider`), so the readout always
reflects the slider, which is essential when direction was just reversed.

---

## 3. CANCEL implementation

- **`js/game/main.js`** — new `cancelAim()` (placed after `toggleSlowmo()`
  specifically so the Phase-16 source-slice guards that treat the
  `disposeObject()` reset path as audio-silent stay intact):

```js
cancelAim() {
  if (this.state !== 'aim') return;
  this._disposeHeld();
  this._clearGuidance();          // predicted path + guidance chip
  this.aim.active = false; this.aim.dx = 0; this.aim.dy = 0;
  this.aimArrow.hide();
  this.state = 'idle';
  this.audio?.cancel();           // subtle UI tick only
  this.onUiState({ state: 'idle' });
}
```

- **`js/game/input.js`** — `Escape` → `onCancelAim()` only while aiming.
- **`js/game/ui.js`** — `#cancel-btn` click → `game.cancelAim()`; the
  `#bottom-controls` row toggles an `.aiming` class so CSS swaps the row.
- **`index.html`** — semantic `<button id="cancel-btn">` with the existing
  monochrome `close` icon + `aria-label="Cancel aiming"`, `type="button"`.
- **`css/style.css`** — `.cancel-btn` (secondary language: black bg, thin
  `--ui-border-strong` border, `close` icon, no red, no pill); hidden by
  default; shown `inline-flex` only under `#bottom-controls.aiming`.

### State restoration (what survives a CANCEL)
| Item | After CANCEL |
|---|---|
| Object selection | **kept** (e.g. Planet stays selected) |
| Size | **kept** (e.g. 3.0 stays) |
| Aim visuals (arrow, predicted path, guidance) | cleared |
| Held preview | disposed (rebuilt on next THROW) |
| `state` | `idle` |
| THROW / slow-mo row | restored |

### Proof CANCEL is not a throw
Node suite + `verify17_controls.mjs` assert that after CANCEL: `throwCount`
unchanged, `objects.length === 0`, `lastTelemetry`/`lastScore` byte-identical to
before, no `createThrowTelemetry`/`finalizeThrow`/`calculateThrowScore` call,
mission/progression snapshots unchanged, and even a leftover drag-pointer
release after CANCEL does **not** launch (`endDrag` sees `isAiming()===false`).

---

## 4. Audio / haptics

- New catalog event `cancel` (`sounds.js`): `{ amp: 0.05, dur: 0.05, kind:
  'tick' }`, haptic `'tap'` — a deliberate subtle UI confirmation.
- `Feedback.cancel()` wrapper + `createAudioSystem().cancel()` convenience.
- CANCEL **never** emits launch/capture/escape/horizon/mission signals
  (source-guarded in `tests/game/responsive_controls.test.js`).
- `disposeObject()` (the reset path) stays **fully silent** as Phase 15/16
  intended; `audio_feedback.test.js` source slice remains green.

---

## 5. Responsive layout

Small screens (≤480px) get a tightened HUD cluster via pure CSS media query:

```css
@media (max-width: 480px) {
  #hud { gap: 4px; padding: 4px 8px calc(8px + env(safe-area-inset-bottom)) 8px; }
  #size-row, #zoom-row { gap: 6px; }
  #size-slider, #zoom-slider { width: min(44vw, 176px); height: 44px; }
  .obj-btn { min-height: 48px; padding: 4px 4px 5px; }
  #object-info { min-height: 12px; }
}
```

**Before → after (360×800, measured via DOM rects):**

| Row | Before | After |
|---|---|---|
| picker top / height | 558 / 60 | 572 / 58 |
| size row y | 624 | 634 |
| zoom row y | 674 | 682 |
| object info height | 14 | 12 |
| HUD gap | 6px | 4px |
| SIZE→ZOOM inter-row gap | 6px | **4px** |
| slider width | 140px | ~158px (44vw) |
| horizontal overflow | 0 | 0 |

The slider rows now fill the width instead of drifting toward center, and the
dead gap between SIZE and ZOOM is gone on phones. Desktop (1280×720) layout is
unchanged (6px gap retained, no width override).

Touch targets verified ≥44px at all viewports: THROW 44, SLOW-MO 46, both
sliders 44, help FAB 44, mission chip ≥44, object picker ≥48 (post-shift),
CANCEL inherits `.ctrl-btn` 44px min-height. `env(safe-area-inset-bottom)` is
honored by `#hud` (and the ≤480px override keeps it).

No JS viewport polling / `matchMedia` / `innerWidth` anywhere in UI or game
code — layout is CSS media-queries only (source-guarded).

---

## 6. Accessibility

- CANCEL is a semantic `<button type="button">` with `aria-label="Cancel aiming"`
  and a `title`; it's focusable and reachable by keyboard (Tab), and **Escape**
  cancels aim as a keyboard path.
- The close icon is `aria-hidden="true"`/`focusable="false"` (decorative;
  label carries meaning) per the existing stroke-icon system.
- Monochrome identity preserved — no color is the carrier of state (CANCEL is
  secondary to THROW purely by weight/position, not hue).
- `prefers-reduced-motion` continues to kill the `aim-pulse` animation and all
  transitions; the CANCEL swap is a plain display change (no animation).

---

## 7. Mobile + desktop viewport verification

`/tmp/opencode/pup/verify17_controls.mjs` runs the full flow at **360×800,
390×844, 414×896, and 1280×720**:

- no horizontal overflow at rest / while aiming / after cancel;
- all control targets ≥44px and inside the viewport;
- CANCEL hidden idle ↔ visible aiming (row swap);
- 11-step zoom flow: endpoints 1200/96 exact, monotonic intermediates
  (924/648/372), `#zoom-val` follows the slider, out-of-range clamps, pinch
  still zooms on the unchanged dist path and re-syncs slider+label;
- 17-step cancel flow: planet+size selected → THROW → aiming verified
  (guidance/held/arrow/path) → drag on canvas → CANCEL → idle, visuals
  cleared, not a throw, telemetry/score/progression untouched, object+size
  retained, no accidental launch from the leftover drag, Escape cancels too,
  a second real throw launches, counts exactly +1, finalizes, and the result
  panel opens;
- canvas drag still orbits; clicking CANCEL/THROW/slider/picker never starts
  camera orbit.

**Result: 0 failures, 0 page errors** (only the known headless
`navigator.vibrate` platform notice, filtered).

---

## 8. Camera regression

- `verify8_8000.mjs` (slider-leak, release-over-slider, pointercancel, blur,
  visibilitychange, touch orbit, pinch): **0 failures, 0 errors**.
- New assertions: camera position unchanged across CANCEL/THROW clicks; camera
  orientation (theta/phi) unchanged across slow-mo + picker interactions;
  canvas drag still orbits; a release right after CANCEL cannot launch.

---

## 9. Test counts (before → after)

| Suite | Before | After |
|---|---|---|
| node suites (17 runners) | 342 | **361** |
| legacy `physics.test.js` | 8 | 8 |
| **Total** | **350** | **369** |

New: `tests/game/responsive_controls.test.js` (19 tests:
zoom mapping 6, CANCEL semantics 6, CANCEL button 3, audio CANCEL 2,
responsive layout 3 — all previously existing tests still green, including the
Phase-16 audio guards which now cover the 13th catalog event).
Runner: `tests/run_responsive_controls.js`.

---

## 10. Console errors

Zero app console/page errors across all verification runs (headless
`navigator.vibrate` platform notice excluded — it is a Chrome automation
artifact, not an app error).

---

## 11. Screenshots

`/tmp/opencode/pup/shots17/` — 7 states × 4 viewports (28 PNGs):
`A_IDLE`, `B_ZOOM`, `C_AIMING` (CANCEL visible), `D_AFTER_CANCEL`,
`E_FINAL`, `F_ZOOM_OUT`, `G_ZOOM_IN`.
`probe17.mjs` (monochrome UI identity) over all 28: **0 failures** — every UI
region ≤0.40% saturated pixels (only the in-world plasma at desktop reaches
0.40% at the controls-region box edge; plasma is intentionally excluded from
the identity probe).

---

## 12. Bugs fixed

1. `#zoom-val` readout went stale on manual slider drags (only boot + pinch
   updated it) — now synced in the slider `input` handler.
2. (Phase-16 regression re-check) Zoom-direction reversal did not break the
   existing slider/pinch regression assertions — verified.

---

## 13. Files changed

- `js/game/input.js` — exported pure zoom helpers (inverted), slider label
  sync, `Escape` → `onCancelAim`.
- `js/game/main.js` — `cancelAim()`; `onCancelAim` callback.
- `js/game/ui.js` — CANCEL button wiring; `.aiming` row toggle.
- `index.html` — `#cancel-btn` (close icon, aria-label).
- `css/style.css` — CANCEL styles + row swap; ≤480px responsive cluster;
  safe-area retained.
- `js/audio/sounds.js` — `cancel` event + haptic map entry.
- `js/audio/feedback.js` — `Feedback.cancel()`.
- `js/audio/index.js` — `cancel()` convenience.
- `tests/game/audio_feedback.test.js` — catalog 12→13, emit lists updated.
- `tests/game/responsive_controls.test.js`, `tests/run_responsive_controls.js`
  — new Phase-17 suite.

## 14. Frozen systems (untouched, verified by suite)

`js/physics.js`, trajectory calcs/classifier, telemetry, scoring, missions,
progression, challenge recommendation, spaghettification, black-hole renderer,
camera mechanics (limits/orbit/pinch/damping/touch), aiming mapping, guidance
calculations, all Phase-11/13 envelope. Node suites for all of these are green.

## 15. Verification commands

```bash
node tests/run_responsive_controls.js        # 19 green
# full node suite: 17 runners, 361 + 8 legacy = 369 green
node /tmp/opencode/pup/verify17_controls.mjs # 0 failures, 0 page errors
node /tmp/opencode/pup/probe17.mjs           # monochrome identity, 0 failures
node /tmp/opencode/pup/verify8_8000.mjs      # camera regression, 0 failures
node /tmp/opencode/pup/verify16_mobile.mjs   # mobile loop, 0 failures
node /tmp/opencode/pup/verify_feel15.mjs     # ALL GREEN
node /tmp/opencode/pup/verify16_audio.mjs    # ALL GREEN
```

## 16. Limitations

- CANCEL during a *live* aim drag requires a second tap (releasing the drag
  is the launch gesture by design); the leftover release after CANCEL is
  provably a no-op. Multi-finger drag-cancel is possible but the primary path
  is: press THROW → change mind → tap CANCEL.
- The ≤480px cluster is a CSS-only tightening; no per-device font tuning was
  attempted (labels remain legible and targets ≥44px).
- Zoom slider now spans 0–100 with the inverted mapping; the `#zoom-val`
  number is the slider position (0 = OUT, 100 = IN), not a distance readout.
