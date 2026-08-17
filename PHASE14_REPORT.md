# PHASE 14 — Monochrome UI / Visual Identity Overhaul

Date: 2026-08-18 · Game dir: `blackhole-game/`

## 1. UI / branding changes

- The generic name **"Event Horizon — Black Hole Sandbox"** is gone from every surface:
  `<title>`, top-bar wordmark, help modal, and the PWA manifest now read **BLACK HOLE**
  (manifest `name`/`short_name` = "Black Hole").
- Centralized branding module **`js/ui/theme.js`** — `BRAND.name`, `shortName`,
  `tagline` are the single source of truth; `applyBranding()` repoints
  `document.title` and any `[data-brand]` element. `js/main.js` calls it on boot.
- Top-bar wordmark: uppercase, tight-tracked, white-on-black geometric sans
  (13px / weight 800 / letter-spacing 0.24em). No gradients, no shadows, no logo
  artwork — pure typography. Help modal uses a stacked display treatment
  (`BLACK` over `HOLE`) with a `NEWTONIAN SPAGHETTIFICATION SANDBOX` kicker.
- All emoji removed from UI source: picker icons, share/photo buttons, slow-mo glyphs,
  help text, flash messages (`⚫ Consumed…` → `CONSUMED BY THE SINGULARITY`,
  `📸 Frame captured` → `FRAME CAPTURED`). Verified by scan + a dedicated test suite.

## 2. Color system

- Strictly grayscale CSS variable ramp defined once in `:root` (mirrors
  `COLORS` in `js/ui/theme.js`): `--ui-black #000`, `--ui-ink #050505`,
  `--ui-surface / -panel / -raised` (black alpha ramps), `--ui-white #fff`,
  `--ui-off-white #f2f2f2`, `--ui-gray-1…4` (#d8 → #333), `--ui-dim #8f`,
  `--ui-border / -border-strong / -border-bright` (white alpha ramps).
- Every legacy accent is gone from the stylesheet: amber `#ffb060/#ff7a30/#ffd8a8`,
  green `#7ce0a0`, red `#ff6b5e/#ff4d4d`, blue `#8a9bff/#3a8fdd`, gold `#ffd166`,
  the old navy surfaces `#131a2e/#0d1120/#2a3450` — asserted absent by the UI test
  suite. Slider `accent-color` (amber/blue) removed.
- **State meaning is carried by text** (CURRENT/COMPLETED/LOCKED, state labels,
  difficulty labels). The old `tonal-*` color classes survive only as monochrome
  weight/brightness variants (neutral = gray-2, success = white, special/danger =
  white bold); the result headline uses a white left-border tag for the alarm cue.
- Scope respected: the black hole plasma/accretion disk and all in-world visuals are
  untouched and remain colorful.

## 3. Typography

- Font stack centralized in `TYPO.stack` and `--font-ui`:
  `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  (no external CDN dependency).
- Explicit hierarchy:
  - **DISPLAY** — wordmark (13px/800/0.24em caps), help brand-display (34px/800/0.14em),
    result headline (22px/800).
  - **HEADING** — panel headings / modal h2–h3 (uppercase, tracked 0.1–0.3em).
  - **BODY** — descriptions/hints at 11–13px, gray-1/gray-2, line-height 1.4–1.55.
  - **LABEL** — SCORE/MISSION/DIFFICULTY/SIZE/ZOOM (8–10px/800, tracked 0.14–0.3em, caps).
  - **MICRO** — counters/values (tabular-nums, gray-3).
- Text shadows removed except the existing short result reveal; letter-spacing + weight
  contrast carries the hierarchy.

## 4. Button redesign

- One shared language for `.ctrl-btn`, `.icon-btn`, `.help-fab`, `.ms-close`, `.rs-again`:
  black background, white/gray thin border, **2px radius**, compact padding, white text.
  Hover/focus-visible inverts to white background + black text; `:active` translates
  down 1px. Disabled = black surface + gray-3 text + faint border.
- THROW (primary): black + white border, white text; while **aiming** it inverts and
  runs a subtle 1.2s white-focus pulse (scale ≤ ~1.01, opacity/border only).
- SLOW-MO: square 46×46, `:on` inverts; the glyph swap (play → rewind) is pure CSS
  class toggling (`.slowmo-btn.on .ico-play{display:none}`), no emoji text swaps.
- Touch targets: icon buttons 44×44, THROW min-height 46, chip/list rows min-height 44,
  help FAB 44×44, slider inputs 44px hit height. All were ≥ 44px before; none shrank.

## 5. Dialog / result panel redesign

- Result panel (`#result`) and help modal share the console language: near-black
  `--ui-surface-panel`, thin `--ui-border-strong`, **3px radius**, modest
  `0 18px 48px rgba(0,0,0,0.7)` shadow (no giant glow).
- Result hierarchy: `rs-object` kicker (gray-3, tracked caps) → `rs-headline`
  (white display; danger outcomes get a white left-tag) → **SCORE** (white 40px
  tabular total + gray-3 `/ max`) → mission outcome box (black, thin border) →
  five rows as thin bottom-bordered lines (label tracked caps, score white) →
  **THROW AGAIN** (full-width primary). Staggered reveal + 800ms count-up preserved;
  `data-total` set immediately; hides on cancel; reduced-motion honored.

## 6. Mission selector redesign

- `#mission-modal` + `.mission-modal-box`: near-black panel, thin border, 3px radius.
- Rows (`.ms-option`) are flat technical list rows: black, 1px `--ui-border`, 2px
  radius, 44px min-height, hover brightens the border.
- States are explicit text + border/marker only (never color): **LOCKED** (dashed
  border, dimmed, disabled, gray title), **COMPLETED** (white check SVG marker +
  COMPLETED label), **CURRENT** (bright border + filled-dot marker + bold CURRENT
  label), plus `.active` (white border) for the selected mission.
- Difficulty in the detail card stays textual: `DIFFICULTY` kicker + monochrome
  `●●●○○` dots (gray-1) + label + `aria-label="Difficulty N of 5 (…)"`.
- Recommendation row unchanged semantically (RECOMMENDED + object name + reason).

## 7. Object picker redesign

- `.obj-btn` cards: black translucent surface, 1px `--ui-border`, 2px radius,
  72×52px, stacked `[icon] / NAME / TIER`. Active card = white border + faint white
  fill + white icon/name; tier label dims to gray-2. No large rounded cards, no
  amber active state.
- The per-object difficulty/tier labels (EASY…EXTREME from the challenge layer) are
  kept as text; `object-info` still summarizes the recommended identity.
- Behavior untouched: same ids/catalog, same click → `selectObject`.

## 8. Icon system

- New **`js/ui/icons.js`**: 15 monochrome stroke icons (rock, astronaut, ship, planet,
  camera, zoom, reset, crosshair, launch, play, rewind, share, close, question,
  check) as 24×24 inline SVG `currentColor` paths with square caps/joins and a
  uniform 1.7px stroke. No emoji, no Unicode stand-ins, no external library.
- `iconForObject(id)` maps catalog ids → icons; the picker renders the SVG.
- Mission selector uses the `check` icon for COMPLETED (replaces the `✓` glyph).
- Buttons carry `aria-label`; decorative SVGs carry `aria-hidden="true"` +
  `focusable="false"`.

## 9. HUD redesign

- Top bar: centered wordmark, two square icon buttons (share/capture) top-right.
- Bottom HUD: black vertical gradient, thin; picker cards, SIZE/ZOOM sliders
  (custom monochrome range: 2px gray-4 track, white 16px square thumb), object info
  line, bottom controls.
- Guidance chip (`#guidance-hud`): black surface, thin border, 3px radius, tracked
  caps state label + gray closest-distance (monochrome tonal variants).
- Mission chip: black surface, thin border, 3px radius, `MISSION · N / M` kicker +
  white title; still opens the selector; positioned clear of the black hole, arrow,
  trajectory, and the top-center guidance/readout band.
- Readout + flash: same console surfaces, white/gray text.
- Photo mode (`setHudVisible`) still hides all of the above; unchanged behavior.

## 10. Responsive verification

- `verify17.mjs` mobile loops (390×844 + 360×800, all four objects): guidance shown
  while aiming, camera never drifts, **0 horizontal overflow**, result panel opens,
  throws finalize HORIZON/ALL_MASS_CONSUMED, 0 console errors.
- `verify16_mobile.mjs`: 0 failures at both viewports; no overflow at rest or after
  slider drag; slider drag still zooms; all four objects full-loop green.
- New screenshots at 1280×720, 390×844, 360×800 show the title clear of the HUD,
  the mission chip and guidance HUD visible, the result/selector dialogs fully
  contained, and the black hole visible in every gameplay state.
- Touch targets kept ≥ 44px (see §4).

## 11. Accessibility verification

- All controls remain semantic `<button>` elements (picker, chip, throw, slow-mo,
  share, photo, help, close, again, mission rows) — asserted in the test suite.
- Dialogs keep `role="dialog"` + `aria-modal="true"` (mission selector, result),
  `aria-haspopup="dialog"` on the chip, `aria-live="polite"` on the guidance HUD.
- Mission states are always text (CURRENT/COMPLETED/LOCKED) — never color alone.
- Difficulty is textual and carries `aria-label`.
- Icons are decorative (`aria-hidden`), with `aria-label` on the owning controls.
- `:focus-visible` white outline defined globally.
- No emoji anywhere, so no screen-reader emoji noise.

## 12. Reduced-motion verification

- `@media (prefers-reduced-motion: reduce)` kills all transitions/animations
  (`transition:none!important; animation:none!important`) and forces the result
  panel to its final state (opacity 1 / no transform / no animation) so the
  count-up and stagger are skipped; the result `_animate` path also short-circuits
  to instant text when `matchMedia` reports reduce.
- Motion budget elsewhere is opacity/translate/scale≤1.02/color-inversion only — no
  bounce/elastic easings anywhere in the stylesheet (asserted).

## 13. Performance considerations

- No per-frame DOM work, no canvas post-processing, no backdrop-filter, no external
  icon library, no new animation loops. The redesigned elements are static CSS +
  a handful of inline SVGs created once.
- The icon system is pure string functions called once at picker build time;
  `missionui` still does class/textContent toggles only. The 30-test UI suite runs
  in the same milliseconds-scale as the rest of the node suites.
- No changes to `loop.js`, the renderer, or any per-frame code path.

## 14. Files changed

| File | Change |
|---|---|
| `js/ui/theme.js` | **new** — branding + color/radius/typography tokens + `applyBranding()` |
| `js/ui/icons.js` | **new** — 15-icon monochrome stroke SVG system |
| `index.html` | branding, inline SVG icons (share/photo/slow-mo/help), stacked brand display, emoji-free help copy |
| `css/style.css` | full monochrome rewrite (token ramp, typography, buttons, dialogs, picker, HUD, sliders, radius system, reduced-motion) |
| `js/main.js` | imports `applyBranding` + sets title/wordmark on boot |
| `js/game/ui.js` | picker renders SVG icons (via `iconForObject`), slow-mo icon swap via class, emoji-free flash messages |
| `js/game/missionui.js` | COMPLETED marker now the SVG `check` icon |
| `manifest.webmanifest` | renamed to Black Hole, black theme/background |
| `tests/game/ui_identity.test.js` | **new** — 30-test monochrome identity suite |
| `tests/run_ui_identity.js` | **new** — runner |

## 15. Files explicitly NOT changed

- `js/physics.js`, `js/objects.js` (catalog + builders untouched; the emoji `icon`
  fields remain as dead presentation data to honor the frozen-catalog rule)
- `js/game/trajectory.js`, `js/game/aiming/**` (incl. `mapping.js` Phase 13)
- `js/game/telemetry`/`js/game/scoring`/`js/game/missions`/`js/game/progression`/
  `js/game/challenges` (except missionui’s purely-presentational marker)
- `js/game/loop.js`, `js/game/sim.js`, `js/game/spawn.js`, `js/game/input.js`
  (camera/input system untouched), `js/game/readout.js` (no change needed)
- `js/game/presentation.js` (pure mapping unchanged; `stateTone` still returns
  success/special/danger/neutral — styling is what changed)
- `js/game/result.js`, `js/game/guidehud.js` (structure/logic untouched; the tone
  classes they emit are now styled monochrome)
- `js/render/**` — **the black hole renderer is untouched**; plasma stays colorful.

## 16. Test counts

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
| **ui_identity (Phase 14, new)** | **30** | **pass** |
| **Total** | **318** | **0 failures** |

(288 pre-existing + 30 new; no existing test regressed.)

## 17. Headless verification

- `verify17.mjs` (A–W): **0 failures, 0 console/page errors** — gameplay full loops
  (single-source velocity, real missions, scoring/presentation/progression contract),
  mobile 390×844 + 360×800 × 4 objects, THROW AGAIN flow.
- `verify8_8000.mjs` (camera regression): **0 failures** — slider-no-leak, canvas
  orbit, release-over-slider, pointercancel, blur, visibilitychange, touch orbit,
  pinch zoom.
- `verify16_mobile.mjs`: **0 failures** — both viewports, no overflow, slider zoom,
  four-object loops.
- `probe14.mjs` (new): pixel-decodes all 13 screenshots and asserts **0 saturated
  hue pixels** in every UI region (title, top buttons, picker, THROW core, sliders,
  guidance chip, result panel, mission selector, mobile panels) — the only color
  in the frames is the intentional world plasma.

## 18. Screenshots inspected

Captured to `/tmp/opencode/pup/shots14/`:
`DESKTOP_A_IDLE`, `DESKTOP_B_AIM`, `DESKTOP_C_APPROACH`, `DESKTOP_D_CRITICAL`,
`DESKTOP_E_CONSUMPTION`, `DESKTOP_OBJECT_PICKER`, `DESKTOP_RESULT_PANEL`,
`DESKTOP_MISSION_SELECTOR`, `MOBILE_390x844_{IDLE,AIM,RESULT,MISSION}`,
`MOBILE_360x800_{IDLE,AIM,RESULT,MISSION}`.

Visual acceptance was performed via `probe14.mjs` pixel analysis (this session’s
model has no image input, so the "human-in-the-loop" check is replaced by an
equivalent programmatic check): every UI region is verified grayscale (avg color
spread 0.0–13 across all shots, 0.00% saturated pixels), the world stays colorful,
and the on-frame regions confirmed present (title glyphs white on black, THROW
border visible, panel/modal bodies centered). The style review plus zero-overflow
+ zero-console-error browser checks stand in for the visual pass; a maintainer
with an image-capable view is encouraged to open the PNGs in
`/tmp/opencode/pup/shots14/`.

## 19. Known limitations

- **Semi-transparent HUD bleed:** the bottom/top HUD gradients and translucent
  surfaces sit over the (intentionally colorful) plasma, so at gameplay moments the
  area *around* a button can show faint world color through the alpha. The opaque
  UI chrome itself is pure grayscale (verified on the button cores). This matches
  the "black transparent surfaces over a cinematic world" brief.
- **No bundled font:** the stack falls back to `system-ui` when Inter isn’t local —
  the design leans on weight/spacing, which the system stack renders consistently.
  No CDN was added per the brief.
- **Icon set is small but sufficient** for this phase (objects, camera, zoom, reset,
  mission, throw, slow-mo, share, close, check, question). No favicon/manifest icon
  redesign was attempted (out of scope; the brief said no complicated logo yet).
- The `objects.js` `icon` emoji fields remain as inert data to keep the object
  catalog frozen; they are never rendered.

## 20. Final acceptance status

- **MINIMAL / MONOCHROME / TECHNICAL / CINEMATIC / MODERN / PREMIUM /
  BLOCKY-HARD-EDGED** — delivered: 2–4px radius system, thin borders, white-on-black
  typographic wordmark, console-style dialogs, flat list rows, stroke icons, custom
  sliders, and a strictly grayscale token ramp; all emoji and all legacy saturated
  accents removed from UI source.
- **NOT generic / NOT colorful / NOT rounded / NOT emoji / NOT default HTML** —
  verified by the 30-test identity suite (emoji scan, legacy-color scan, radius
  scan, semantic-button scan, state-text scan) plus the screenshot pixel probe.
- Physics, trajectory, aiming, telemetry, scoring, guidance, missions, progression,
  challenges, spaghettification, camera input, and the black-hole renderer are all
  unchanged. 318 node tests green; verify17 / verify8 / verify16 all 0 failures.
- Phase 14 complete. **Phase 15 is intentionally NOT started.**
