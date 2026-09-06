# Phase 30 Report — Cartoon Visual Identity Overhaul

## Summary
Presentation-only pass that overhauls the entire visual identity from flat
monochrome to a cartoon "Warner Bros." language — rounded panels, saturated
7-colour palette, cartoony font, comic-book ink strokes — while leaving
physics, scoring, missions, campaigns, audio, haptics, camera controls,
zoom, input states, loop, and all gameplay logic untouched.

---

## Deliverables

### Palette (CSS + JS)
7-colour fixed palette in both `:root` (CSS) and `js/ui/theme.js` (JS):

| Name          | Hex     | Role |
|---------------|---------|------|
| Cadmium Orange| `#FF6B1A` | primary energy, explosions, throwing |
| Canary Yellow | `#FFE135` | highlights, bursts, aim, action CTA |
| Sky Blue      | `#4AC6FF` | cold contrast, chrome, escape words |
| Bubblegum Mag | `#FF3D8A` | comedic absurdity, stretch, teal-like word |
| Grass Green   | `#4CD97B` | success, unlock, mission success |
| Licorice Black| `#1A1A1A` | ink stroke, hard outlines, panel shadow |
| Paper Cream   | `#FFF8EC` | panel background, white words, chip fill |

Black hole renderer ramp: `#2D0A4E` (deep indigo) → `#FF3D8A` (magenta)
→ `#FFE135` (canary).

### Typography — Luckiest Guy
- `@font-face` subset to ASCII + `·×→` = 23 292 bytes (`luckiest-guy-latin-sub.woff2`)
- Preloaded via `<link rel="preload" as="font" type="font/woff2" crossorigin />`
- Applied everywhere: `--font-ui: 'Luckiest Guy', Impact, 'Arial Black', sans-serif`
- `Bangers`/`Fredoka`/`Baloo 2` kept as fallbacks but **not** shipped

### Radius tokens
| Token     | Old  | New (cartoon) |
|-----------|------|---------------|
| `--r-btn` | 2 px | 10 px         |
| `--r-panel`| 3 px| 18 px         |
| `--r-chip`| 3 px | 16 px         |
| `--r-card`| 2 px | 14 px         |
| `--r-input`| 2 px| 12 px         |

Pill radius (`999px`) is still banned. UI identity test updated to verify
10–18 px range.

### Buttons
- `.ctrl-btn.primary`: filled Cadmium Orange (`#FF6B1A`), 2 px Licorice ink
  outline, hover → Canary Yellow fill
- `.primary.aiming`: yellow with `--c-yellow` glow pulse
- `.primary:active`: squash-stretch `scale(0.94,0.9) translateY(1px)` (0.05 s)
- Regular buttons (`icon-btn`/`ctrl-btn`): black fill, invert white on hover
- `--btn-icon:44px / --btn-min-h:44px / --btn-min-h-action:48px` unchanged

### Focus / Accessibility
- `:focus-visible` outline → `var(--c-yellow)` (was white)
- Disabled state: `var(--ui-gray-3)` muted text, no change
- All mission state text remains written to DOM + state-specific CSS selectors
- All semantic `<button>` controls unchanged

---

## Black Hole Renderer (recolor only)

### Lensing pass (`js/render/blackhole/lensing.js`)
```glsl
uHot  = 0xFFE135  // canary inner collar
uWarm = 0xFF3D8A  // bubblegum magenta mid-disk
uCool = 0x2D0A4E  // deep indigo outer soak
```
No new passes, no geometry changes, no shader logic changes.

### Legacy geometry fallback (`js/render/blackhole.js`)
- Photon ring: `0xFFE135` (was `0xFFE8C0`)
- Glow sprite: magenta (`0xFF3D8A`, was `0xFFB060`)
- Disk shader `uColor`: `0xFF3D8A`, `uColorHot`: `0xFFE135`
- Glow canvas gradient: canary → magenta → transparent

### "Gulp" consumption pulse
Cheap 0.4 s scale pulse on the black void when matter is consumed:
- `bh.gulp()` (no-op legacy hook) → `scene._gulp = 1`
- Per-frame decay ×2.4/s; `shadowCore.scale` = `1 + 0.22 * sin(π * (1-t))`
- Wired via `loop.js` consume branch alongside existing `flash()`
- Reduced-motion: no JS mutation needed (pure numeric decay, no DOM animation)

---

## Comic feedback palette (`js/game/comic/`)

Each event now carries an explicit palette colour:

| Event           | Colour   | Meaning |
|-----------------|----------|---------|
| launch          | yellow   | energetic burst |
| tear            | orange   | material snap |
| impact          | orange   | collision |
| stretch         | magenta  | comedic absurdity |
| capture         | orange   | engulfing explosion (accent class = thicker ink) |
| escape          | blue     | cold-chrome freedom |
| mission-success | green    | success |
| mission-failed  | magenta  | playfully comedic |

Renderer applies `.c-{colour}` class to each word element; `.accent` class
additionally thickens the Licorice ink stroke (hero words). CSS:

```css
.comic-word              { color: #FFF8EC; -webkit-text-stroke: 2px #1A1A1A; }
.comic-word.c-orange     { color: var(--c-orange); }
.comic-word.c-yellow     { color: var(--c-yellow); }
.comic-word.c-blue       { color: var(--c-blue); }
.comic-word.c-magenta    { color: var(--c-magenta); }
.comic-word.c-green      { color: var(--c-green); }
.comic-word.accent       { -webkit-text-stroke-width: 3px; /* no colour override */ }
```

---

## Token overhaul (`js/ui/theme.js`)

| Export    | Phase 30 change |
|-----------|-----------------|
| `COLORS`  | `orange/yellow/blue/magenta/green/ink/white` + `accent` alias + `surface/surfacePanel/surfaceRaised/border/borderStrong` (indigo tints, not pure-black) |
| `RADIUS`  | 10/18/16/14/12 px (was 2/3/3/2/2) |
| `TYPO`    | `Luckiest Guy, Impact, 'Arial Black', sans-serif` (was Inter stack) |
| `BH_COLORS` | NEW: `core '#2D0A4E', mid '#FF3D8A', rim '#FFE135'` |

---

## UI surfaces / scrims
- All black scrims/overlays → indigo tints: `rgba(12,8,22,0.92)` (surface),
  `rgba(13,9,24,0.97)` (panel), `rgba(21,16,34,0.92)` (raised)
- HUD / top-bar gradient backgrounds → indigo `rgba(21,16,34,...)`
- Opening-screen background: `rgba(12,8,22,...)`
- Chip/panel hover tint → canary `rgba(255,225,53,...)`
- Active mission/level row → canary tinted background

---

## Test results

### Node suite: **23/23 runners green** (0 failures, 0 whitelisted)
`run_ui_identity` is now a full passing runner (the old CRLF whitelisting
artefact is gone — both test and stylesheet now ship LF).

Key test additions in `tests/game/ui_identity.test.js`:
- Cartoon palette 7-hex check (replaces the old "strictly grayscale" check)
- Radius 10–18 px range (replaces 2–4 px check)
- Primary button Cadmium Orange + Canary hover (replaces white-on-black check)
- No `#ffd07d` / no `--comic-accent` in CSS (Phase-29 artefact removed)
- Motion: bouncy easing keywords checked precisely (no false-positive from
  CSS comments)

Key test additions in `tests/game/comic.test.js`:
- Every event carries an allowed palette colour (`colorOf` / `colorOf('capture')==='orange'`)
- Slot carries the event colour onto the DOM contract
- Node total: **27/27 comic tests** (25 Phase-29 + 2 Phase-30 colour tests)

### Browser harness (`verify30.mjs`)
- Brand wordmark: `Black Hole` ✓
- Document title: `BLACK HOLE — Spaghettification Sandbox` ✓
- Font loaded: `Luckiest Guy` ✓
- Primary CTA bg: `rgb(255,107,26)` Cadmium Orange ✓
- Comic word colours:
  - `NICE!` → `rgb(76,217,123)` green ✓
  - `BOOM!` → `rgb(255,107,26)` orange (with thick accent stroke) ✓
  - `WHOOSH!` → `rgb(74,198,255)` sky blue ✓
- Lensing: `enabled:true quality:"medium"` ✓ (renderer untouched)
- CSS tokens: all 7 palette hexes + `--r-btn:10px` ✓
- Screenshots: `/tmp/opencode/pup/shots30/`
  - `OPENING_390.png` — Cadmium Orange PLAY button, indigo surface
  - `APPROACH_TITLE_TRUECOLOR.png` — black void, magenta/orange plasma collar
- 0 real page errors (navigator.vibrate headless artefact only)

---

## Files changed (new/edited)

### New
- `css/fonts/luckiest-guy-latin-sub.woff2` — 23 KB preloaded subset
- `PHASE30_REPORT.md`

### Edited
- `css/style.css` — full palette/radius/font/button/surface overhaul + comic
  word palette classes + accent stroke-thick rule (no colour override)
- `index.html` — font preload link
- `js/ui/theme.js` — cartoon palette + `BH_COLORS`
- `js/game/comic/comic.js` — per-event `color` + `colorOf()` export
- `js/game/comic/renderer.js` — `.c-{color}` class application
- `js/render/blackhole/lensing.js` — `uHot/uWarm/uCool` ramp
- `js/render/blackhole.js` — photon ring + glow + disk + gulp hook
- `js/render/scene.js` — gulp wiring + `shadowCore` scale pulse
- `js/game/loop.js` — `bh.gulp()` in consume branch
- `tests/game/ui_identity.test.js` — rewritten for Phase-30 palette
- `tests/game/comic.test.js` — +2 colour metadata tests
- `tests/run_all.js` — whitelist removed (ui_identity now passes unconditionally)

### Untouched (frozen)
- `js/physics.js`, `js/objects.js`, `js/game/loop.js` (state machine), `js/game/input.js`,
  `js/game/aiming/*`, `js/game/scoring/*`, `js/game/missions/*`, `js/game/campaign/*`,
  `js/game/settings/*`, `js/game/audio/*`, `js/audio/*`, `js/game/spawn.js`

---

## What this phase does NOT do
- No new physics, scoring, or gameplay mechanics
- No new camera controls, zoom changes, or input changes
- No new objects, missions, or campaigns
- No new audio, haptics, or telemetry
- No new BH geometry, passes, or lensing logic
- No new WebGL effects (bloom, Sobel, etc.)
- No JS viewport polling
- No particle systems beyond what exists
- No changes to `loop.js` state machine (6 states unchanged)

---

**Phase 30 complete. 23/23 node green, 0 real page errors.**
