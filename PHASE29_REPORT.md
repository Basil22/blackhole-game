# PHASE 29 REPORT — Comic Visual Feedback

**Status:** delivered · FINAL · ACCEPT
**Scope:** presentation-only. A restrained comic-book visual feedback layer (comic words +
cheap motion effects) on top of the existing modern monochrome UI. No physics, gravity,
integrator, timestep, trajectory classification, telemetry, scoring, mission evaluator,
campaign/progression, unlock rules, aiming/mapping, camera/input/zoom, mobile controls,
opening, settings, audio, or gameplay state-machine changes. `loop.js` touched only to
**emit** presentation events (mirroring existing audio hooks).

> This phase reuses the Phase-29 number. The earlier **escape reachability + guidance
> honesty** delivery is preserved verbatim under `PHASE29_ESCAPE_REPORT.md`.

**Project:** Black Hole (Three.js) — `blackhole-game/`

---

## 1. What It Does

A short-lived, pooled set of comic "impact words" (e.g. `WHOOSH!` on launch,
`BOOM!`/`CRUNCH!`/`GONE!` on capture, `CRACK!`/`SNAP!`/`RIP!` on tears,
`STREEETCH!` on strong radial stretch, `WHOOSH!`/`BYE!`/`NOPE!` on escape, and
`NICE!`/`CLEAN!`/`NAILED IT!` or `OOF!`/`TOO CLOSE!`/`MISSED!` on mission outcome)
over a tiny, cheap screen-shake on the most violent moments. The words are the actual
text (BOOM! — **not** 💥) drawn in white with a black stroke over the existing
monochrome identity; the only color is the **existing amber `#ffd07d`** family, reused
solely for the capture `BOOM`. It is **event feedback**, never permanent UI — every
word is fully opaque for ~40ms and fades out within ~0.5–0.8 s.

## 2. Where It Hooks In (semantic mirrors of existing audio calls — presentation only)

| Event | Source | Same place as the audio cue |
|---|---|---|
| `launch` `WHOOSH!` | `Game.launch()` | `main.js:189` next to `audio.launch` |
| `tear` `CRACK!/SNAP!/RIP!` | `loop.js handleEvents` | same `if` as `audio.tear` (cooldown-throttled) |
| `stretch` `STREEETCH!` | `loop.js` flying-object update | once per object when `initialSpan>0 && maxStretch>=1.3`, live telemetry read |
| `capture` `BOOM!/CRUNCH!/GONE!` (amber + big shake) | `loop.js handleEvents` | same `if` as `audio.capture`; once per object per throw |
| `escape` `WHOOSH!/BYE!/NOPE!` | `loop.js` finalized throw | same `if` as `audio.escape` |
| `mission-success` / `mission-failed` | `js/main.js onThrowEnded` | same block as `audio.missionComplete/missionFailed`; never on `PLAYER_RESET` |

No event in the comic layer triggers (or duplicates) any audio or haptic — it runs in
the same guarded blocks so the existing muted/haptics settings keep working untouched.
No event writes telemetry, score, mission, progression, or physics.

## 3. Architecture

Everything lives under `js/game/comic/` and is a **pure presentation layer**:

- **`comic.js`** (pure, THREE-free, DOM-free — node-testable). `ComicCore` owns a small
  pool of "slots" with per-event `priority`, `duration`, `cooldown`, an IN/HOLD/OUT
  `keyframe(p)` motion model, deterministic per-event word rotation, and per-object
  flavor pools (`OBJECT_FLAVOR`: rock/human/ship/planet override generic words). Event
  definitions are in the frozen `COMIC_EVENTS` catalog via `MAX_SLOTS` (5) with a
  priority admission rule (mission-success 100 > capture/escape 80 > tear/impact 60 >
  stretch 50 > launch 40) — a more urgent event can bump a lesser one off the screen;
  a full pool rejects a lower-priority show. Reduced motion (`settings.reduceMotion
  effective`) shortens every lifecycle by `REDUCED_FACTOR 0.45`, removes the bounce
  overshoot + upward knock-back drift, and disables shake.
- **`renderer.js`** (DOM + THREE adapter). One full-viewport overlay
  `#comic-fx` (`position:fixed; inset:0; z-index:38; pointer-events:none`). A small
  element pool is driven each rAF via `keyframe`; **world anchors are projected through
  the game camera every frame** (`project()` → perspective → NDC → px, clamped into a
  safe screen band `SAFE_TOP 208` / `SAFE_BOTTOM 216` that clears the HUD chips and
  bottom controls), so words track the moving object / hole no matter how the camera
  orbits or zooms. The rAF loop runs only while a word is live (`activeCount()>0`),
  so the layer is genuinely idle-cost-free between effects. A tiny screen shake is
  applied via a `body.comic-shake-*` class (reduced-motion: skipped).
- **`js/game/comic/index.js`** — barrel.
- **CSS** (`css/style.css`, `Phase 29` block): `.comic-fx`, `.comic-word` (white,
  `-webkit-text-stroke: 2px #000`, hard text-shadow outline, `font-weight:900`,
  uppercase, `clamp`ed size, single amber `.accent` variant, monochrome + existing
  brand palette only), plus `comic-shake` keyframes (killed by the global
  `prefers-reduced-motion` rule).

**Wiring:** `Game` accepts an injected `comic` core (app shell constructs `comicCore`
from `settings.reduceMotionEffective`); Game builds the `ComicRenderer` against
`this.scene.camera`, so the layer is trivially testable (a bare `ComicCore` in node).
`applySettings` forwards `reduceMotionEffective` to `comicCore.setReducedMotion`.
Photo mode (`UI.setHudVisible(false)`) hides `#comic-fx` alongside the rest of the HUD.
Debug hook `window.__comic = {core, renderer, show}`.

## 4. Reduced-Motion & Mobile-Safety

- **Reduced motion:** preferences honored **and** amplified. CSS global
  `@media (prefers-reduced-motion: reduce)` already kills the CSS shake; the JS core
  additionally (a) shortens word lifecycles ×0.45, (b) never applies the bounce
  overshoot or upward drift, (c) omits the shake entirely. The **text still appears** —
  reduced motion removes motion, never content.
- **No overlap / no interception:** overlay is `pointer-events:none` (clicks pass
  through); words are clamped into the safe band that clears `#menu-btn`, `#photo-btn`,
  the level + mission chips (top), the sliders, object slot, slow-mo / THROW / CANCEL,
  and the Settings modal. No event fires while a result panel or modal is open
  (mission words use a dedicated top-right banner `#` clear of the result panel, which
  stays authoritative).
- **Pool / durable DOM:** at most a handful of pooled elements, so no runaway DOM; no
  canvas readbacks; no per-frame allocations.

## 5. Acceptance (all green)

- **Node:** `tests/game/comic.test.js` (25 tests) via `tests/run_comic.js` — catalog
  validity (priority/duration/cooldown/words, uppercase-ASCII, **no emoji in any word
  or any comic source file**), recognition, pool bound, deterministic rotation,
  per-object flavors + generic fallback, priority admission + bounded replacement,
  cooldown window + re-arm, keyframe IN/HOLD/OUT + monotone fade + overshoot-vs-
  reduced, reduce-factor duration, `show` options are read-only, no game/score/
  telemetry/mission dependence, and the adapter imports in node (no module-scope
  globals). All comic modules import **only** their own barrel (no engine/audio/
  physics deps).
- **Aggregate gate:** `node tests/run_all.js` **23/23 runners green (0 failures)** —
  `run_comic` added; `run_ui_identity` stays the pre-existing CRLF artifact.
- **Browser (`/tmp/opencode/verify29.mjs`):** **44/44 green, 0 real page errors** —
  overlay present + `pointer-events:none` + fixed z-index at **360×800 / 390×844 /
  414×896 / 1280×720**; no horizontal overflow; direct shows verify WHOOSH!/BOOM!/
  BYE!/NICE! with transforms + safe-band + accent + shake (applied then cleared);
  a **real start-to-finish capture throw** emits `WHOOSH! → STREEETCH! → BOOM! →
  NICE!` and completes the first mission; a real pointer-drag gesture launches and
  emits `WHOOSH!`; reduced-motion shortens lifecycles ×0.45, no shake, no overshoot;
  photo-mode `setHidden` toggles the overlay. Screenshots → `shots29/`
  (`/tmp/opencode/shots29/: LAUNCH/ESCAPE/CAPTURE/MISSION-1280.png,
  MISSION-CAPTURE-360.png` — valid 46–61 KB PNGs).

## 6. What Was NOT Changed

No physics (`js/physics.js` untouched), no trajectory/telemetry/scoring/missions/
progression/campaign logic, no aiming/mapping, no camera/zoom, no input, no mobile
controls, no opening, no audio/haptics semantics (the comic layer only observes; it
fires nothing of its own), no result-panel authority. `loop.js` and `main.js` were
touched **only to emit** presentation events adjacent to the existing audio hooks.

## 7. Known Limits (by design)

- The layer is presentation-only; future customization/skins are out of scope
  (roadmap only).
- The reduced-motion CSS also disables word *fade/scale* on systems that force the
  media query (JS still shortens + skips bounce, so the text is unaffected).
- Effects never fire during photo mode (words would be cropped out of a capture by
  design).

**Phase 29 (comic feedback) delivered. STOP — no Phase 30 auto-start.**
