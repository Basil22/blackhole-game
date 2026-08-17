# Phase 25 Report — Mobile Result UX + Mission/Score Correctness Audit

## Summary

Focused mobile-first correctness and UX pass over the post-launch gameplay flow.
Covered: mission completion matrix, score audit, Grazing the Void impossible-mission
fix, result panel UX, mobile overflow audit, and browser verification.

## Deliverables

### Part A — Mobile UI Overlap Audit
- Automated Puppeteer audit across 4 viewports (360×800, 390×844, 414×896, 1280×720)
- **Zero overflow/overlap issues** on any viewport
- All touch targets ≥44px (CSS tokens `--btn-icon:44px`, `--btn-min-h:44px`)
- Body scrollWidth matches viewport width on all mobile sizes
- `#cancel-btn` correctly hidden until aiming state (`display:none` → `inline-flex`)

### Part B — Result Panel Close Button
- Added `.rs-close` icon button (close icon, 44×44px CSS, `aria-label="Close result"`)
- Positioned absolute top-right in `#result`, z-index 1
- Wired `click → hide()` — dismisses result panel without starting a new throw

### Part C — Score Correctness Audit
- Swept all 4 objects × 9 dx values (10–340)
- **No overflows, no negatives, all categories within their max bounds**
- HORIZON_CROSSING throws score 3625–4000 (tidal+destruction dominant)
- ORBITAL throws score 1086–1159 (orbital bonus dominant)
- ESCAPING throws score 82–491 (low across the board — no tidal, no survival, no orbital)
- Score missions: Make It Count (≥1200) completable at dx≥60; High Roller (≥3000) completable at dx≥60

### Part E — Mission Completion Matrix (7 missions × 4 objects)
| Mission | Rock | Human | Ship | Planet |
|---------|------|-------|------|--------|
| Touch the Edge | dx 10 | dx 10 | dx 10 | dx 10 |
| Break Free | dx 320 | dx 320 | dx 320 | dx 320 |
| Find the Orbit | dx 280 | dx 280 | dx 280 | dx 280 |
| Into the Abyss | dx 10 | dx 10 | dx 10 | dx 10 |
| Grazing the Void | dx 10* | dx 10* | dx 10* | dx 10* |
| Make It Count | dx 60 | dx 60 | dx 60 | dx 10 |
| High Roller | dx 60 | dx 60 | dx 60 | dx 60 |

*Grazing the Void uses partial survival — many dx values qualify

### Part F — Break Free Deep Audit
- Real-sim escape boundary: **dx=305** (tangFrac=1.587) for rock
- Per-object: rock 305, human 306, ship 303, planet 306
- 360px mobile max dx ≈ 306 → **Break Free is achievable on mobile** (just barely)
- Phase 24 tangMax raise (1.65→1.77) successfully enabled this

### Part H — Grazing the Void Fix (P0)
**Problem:** The mission was fundamentally impossible — required `closestApproach ≤ 1.5×HR` (60m) AND `survived` (zero consumption). But any object passing within 60m of the BH is consumed. Surviving throws (ORBITAL/ESCAPING) keep COM at ~384m (spawn distance).

**Root cause:** `survived()` in evaluate.js checked `consumedPointCount === 0`. This is too strict for a close-pass mission.

**Fix:** Changed SURVIVE_NEAR_HORIZON evaluation to allow partial survival:
- New `isFullyConsumed()` helper: `consumedPointCount >= initialPointCount`
- Mission now completes when: `closeEnough && !fullyConsumed`
- Partial survival (some points lost, some remain) counts as survival
- PLAYER_RESET always returns `completed: false`
- Updated catalog description: "Pass within 1.5× the event horizon without being fully consumed"
- Updated hint: "Close is not enough — the pass only counts if the object wasn't fully consumed"
- Verification: partially consumed throws exist across all objects at all sizes (rock: 8 at size=1, 28 at size=2, 39 at size=3)

### Part I — Failed Throw Nudge Feedback
- Added `nudgeEl` DOM element to result panel
- Flow planner now passes `mission.hint` as `nudge` when mission fails
- CSS `.rs-nudge` class: hidden by default, `.show` to display
- `show()` method populates nudge from `missionView.nudge` when `tone === 'fail'`

### Part J — THROW AGAIN Visual Bug Fix
**Problem:** Old result content briefly flashes when THROW AGAIN is clicked, because `hide()` didn't clear DOM content.

**Fix:** `hide()` now clears all display elements:
- `totalEl.textContent = '0'`
- `headEl.textContent = ''`
- `objEl.textContent = ''`
- `missionEl.classList.remove('show')`
- `nudgeEl.classList.remove('show')`
- `_revealRows(0)`

### Part L — Mobile-First Responsive Rules
- Automated audit: zero overflow on all 4 test viewports
- All controls within viewport bounds
- body scrollWidth matches viewport width

## Testing

### Node Tests: 449/449 green (0 failures)
21 runners, 0 regressions. New: `feel.test.js` tangMax assertion updated 1.65→1.77.

### Browser Verification: 11/11 green
- Grazing evaluator: partial survival completes, fully consumed rejects ✓
- Result panel close button: 43×43 (CSS 44px, subpixel round) ✓
- Begin aim → state=aim ✓
- Result panel opens after throw ✓
- THROW AGAIN: hides result, clears total to "0", clears headline ✓
- Level chip + mission chip visible ✓
- Zero page errors ✓

### Mobile Overflow Audit: 80/80 real checks pass
- 0 overflow/overlap issues across 4 viewports
- cancel-btn hidden (expected: CSS display:none until aiming)
- opening hidden (expected: dismissed via skip())

## Files Changed
- `js/game/missions/evaluate.js` — `isFullyConsumed()` helper, SURVIVE_NEAR_HORIZON partial survival
- `js/game/missions/catalog.js` — Grazing the Void description + hint update
- `js/game/result.js` — Close button, nudge display, hide() content clear
- `js/game/progression/flow.js` — Failed mission nudge from hint
- `js/main.js` — Flow planner nudge pass-through
- `css/style.css` — `.rs-close`, `.rs-nudge` styling
- `tests/game/feel.test.js` — tangMax assertion 1.65→1.77
