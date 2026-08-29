# Phase 19 Report — Campaign Layer (Levels, Unlocks, Persistence)

**Status: COMPLETE.** All node suites green (417 tests across 19 runners + 8
legacy = 425 total), runtime verification green (`verify19_campaign.mjs`, 62
checks, 0 failures / 0 page errors), and all prior-phase regressions green
(`verify8_8000`, `verify17_controls`, `verify18_aim`, `verify16_mobile`,
`verify_feel15`, `verify16_audio`, `probe17`).

---

## 1. What changed

A thin **progression layer** on top of the existing mission system: four fixed
levels, an object-unlock ladder (Asteroid → Astronaut → Starship → Planet), a
level selector, and best-effort localStorage persistence. The campaign never
evaluates missions itself — it reads the **already-completed mission ids** from
the existing `Progression` and derives everything else (current level, unlocked
objects, completion) from that single authoritative source.

The existing mission system stays fully authoritative. Campaign level
definitions reference mission ids; they never duplicate evaluation logic.
Mission semantics, physics, scoring, trajectory classification, telemetry,
and the aiming mapping are untouched (verified by the frozen-suites section).

---

## 2. The level table (declarative, immutable)

Defined in `js/game/campaign/levels.js` as a frozen `CAMPAIGN_LEVELS` array —
no `if (level === n)` anywhere. Each level declares `{id, index, title,
description, objectId, requiredMissionIds, unlocks}`.

| # | Level | Object | Required missions (cumulative) | Unlocks |
|---|---|---|---|---|
| 1 | FIRST CONTACT | Asteroid | near-horizon-01, survive-near-horizon-01, orbit-01 | Astronaut |
| 2 | THE HUMAN LIMIT | Astronaut | + escape-01, capture-01 | Starship |
| 3 | GRAVITY WELL | Starship | + score-01, score-02 | Planet |
| 4 | EVENT HORIZON | Planet | all 7 missions | campaign complete |

Initial availability: `ASTEROID = UNLOCKED`, everything else `LOCKED`. Level
completion unlocks the next level's object; clearing level 4 completes the
campaign.

---

## 3. Pure state model (`js/game/campaign/state.js`, node-tested)

- `createInitialCampaignState()` — `currentLevelId` = L1, `showIntro = true`.
- `normalizeCampaignState(raw)` — garbage / wrong version / unknown level id /
  future version falls back to the initial state; a stored `showIntro:false`
  is preserved and never re-enabled.
- `completedLevelIds(completedMissionIds)` — which levels are done, given the
  existing progression's completed-mission set.
- `isLevelUnlocked(id, completedMissionIds)` — L1 always; others require the
  previous level's id present in `completedLevelIds`.
- `isObjectUnlocked(objectId, completedMissionIds)` — an object is unlocked iff
  its own level is unlocked.
- `isCampaignComplete(...)` / `deepestUnlockedLevelId(...)` / `levelProgress(...)`
  (`done / required / complete`).
- `unlockLevelForObject(objectId)` → the level index that unlocks it (0 =
  already unlocked); `unlockHintForObject(...)` → `CLEAR LEVEL n`.
- `selectLevel(state, id)` — immutable, rejects locked/unknown levels.
- All functions are pure: inputs are never mutated, results deterministic.

---

## 4. Storage (`js/game/campaign/storage.js`)

`CAMPAIGN_STORAGE_KEY = 'blackhole-game:campaign:v1'`. Best-effort:
`load/save/clear` swallow corruption, `null`, missing backend, or throwing
`localStorage` — the game never breaks when storage is unavailable. Only
non-derivable bits are stored: `currentLevelId` and `showIntro`. Unlock state
is always recomputed from progression (so it can never go stale or out of
sync).

---

## 5. Controller (`js/game/campaign/campaign.js`)

`Campaign` wires state + storage:

- `recordMissionComplete(prev, now)` — takes the **before/after** completed-
  mission snapshots, so `alreadyCompleted` is computed *before* the new
  completion is counted. Returns `{changed, newLevels, unlockedObjects,
  currentLevelId, currentLevelChanged, campaignComplete, lastLevel}`.
- Auto-advances the current level to the deepest unlocked level; replays are
  idempotent (no re-unlock, no re-advance, no duplicate rewards).
- `selectLevel(id)` persists only on change; `currentLevel()` clamps to the
  deepest unlocked level if a stored selection is stale.
- `dismissIntro()` — one-shot, persisted; `reset()` restores a clean start.
- `snapshot()` — frozen `{version, currentLevelId, showIntro}` (no live refs).

---

## 6. Mission integration (single authoritative source)

`Progression.completedMissionIds` (existing) is the campaign's only input.
`evaluateMission` is untouched; mission ids used by the levels are exactly the
7 `MISSION_ORDER` ids. A single real throw can cascade: finishing `orbit-01`
completes Level 1 **and** Level 2 at once (overlapping required sets), so the
result panel shows one reward block per level (Section 9).

---

## 7. Campaign UI (`js/game/campaignui.js`)

DOM built once, no per-frame work, no polling, no Three.js objects.

- **`#level-chip`** — `LV {n} · {TITLE} · {OBJECT}` + `done / required`
  counter. Opens the level modal.
- **`#level-modal`** — one row per level: `CURRENT` / `COMPLETED` / `LOCKED ·
  CLEAR LEVEL n`, plus a stroke `✓` (monochrome `icon('check')`, never emoji).
  Selecting a level auto-selects its object via the `onSelectLevel` callback.
  Locked rows are disabled + `aria-disabled`; never conveyed by color alone.
- **`#intro-hint`** — one-shot "DRAG TO AIM · RELEASE TO THROW" that shows at
  idle, hides on aiming, and permanently dismisses on the first real launch
  (persists `showIntro`). Keyed only to explicit game states; object/size/
  slowmo/consumed events never touch it.
- Photo mode (`setHudVisible`) hides chip, modal, and intro.

---

## 8. Object picker gating (`js/game/ui.js`)

Each picker button now carries a `.obj-state` line (`CURRENT` / `UNLOCKED` /
`LOCKED · LV.n`) and locked objects are `disabled` + `.locked` +
`aria-disabled` — presentation/progression only. `game.selectObject(id)`
remains programmatically open (existing harnesses that drive all four kinds
still pass). `setObjectActive(id)` centralizes select + active + info.

---

## 9. Result panel rewards (`js/game/result.js`)

`show(telemetry, score, objectName, missionView, progressionView,
campaignRewards)` prebuilds 4 `rs-progression` blocks; the campaign rewards
array (one per newly completed level, in level order) wins over the single
mission-unlock line. A level block reads: `LEVEL COMPLETE · {TITLE}` /
`NEW OBJECT UNLOCKED — {NAME}` / next-level hint, or `CAMPAIGN COMPLETE —
YOU CONQUERED THE BLACK HOLE` on level 4.

---

## 10. Audio

Existing catalog stays 14 events. On object unlocks the game plays
`missionComplete` + `missionUnlock`. No new audio events were needed.

---

## 11. Accessibility & UI identity

- Locked = disabled + `aria-disabled` + text/icon, never color alone.
- All new targets ≥44px; `env(safe-area-inset-bottom)` honored; no horizontal
  overflow at 360/390/414/1280 (harness-verified).
- Respects `prefers-reduced-motion` (intro hint + modal transitions are
  opacity/translate only, consistent with the Phase-14 motion rules).
- Monochrome identity re-scanned: `campaignui.js` + `campaign/*` added to the
  UI-identity source set; the check icon is the stroke SVG system, no emoji.

---

## 12. Runtime & state guarantees

- No per-frame work in `loop.js` (untouched).
- Camera never moves from campaign UI interaction (chip open/close, locked
  level clicks — harness-verified).
- Replay through the real `onThrowEnded` path is idempotent (status
  `MISSION ALREADY COMPLETED`, zero reward blocks, no re-advance).
- `resetCampaign()` dev hook restores a clean start (progression + campaign).
- Debug hooks: `window.__campaignUI`, `window.__game.campaign` (snapshot),
  `window.__game.resetCampaign()`.

---

## 13. Frozen systems (untouched, verified by suites)

`js/physics.js` (sim), trajectory physics + `classifyTrajectory` (6 states),
aiming mapping + velocity/escape calc, telemetry, scoring,
`evaluateMission`/mission semantics, spaghettification constants, object
mass/springs/break thresholds. The frozen suites listed in Section 16 guard
all of these.

---

## 14. What this phase did NOT add

No XP, currency, shops, achievements, leaderboards, accounts, backend, object
expansion, supernova/star/galaxy collisions, or post-MVP features. The
campaign is a fixed 4-level ladder; no Phase 20.

---

## 15. Test counts (before → after)

| Suite | Before | After |
|---|---|---|
| campaign (new) | — | 25 |
| ui_identity | 27 | 30 |
| remaining 17 runners | unchanged | unchanged |

Total: **417 node + 8 legacy = 425** (was 388 node + 8 legacy = 396).

---

## 16. Verification commands

```bash
# node battery (19 runners)
node tests/run_campaign.js        # + ui_identity, progression, progression_flow,
#                                 #   missions, challenges, aiming, aiming_difficulty,
#                                 #   aiming_ux, audio_feedback, feel, guidance,
#                                 #   presentation, responsive_controls, scoring,
#                                 #   physics_audit, physics_trajectory,
#                                 #   physics_telemetry, spaghettification,
#                                 #   physics.test.js

# headless acceptance (server: python3 serve.py 8000)
node /tmp/opencode/pup/verify19_campaign.mjs    # 62 checks, 0 failures, 0 page errors

# regressions
node /tmp/opencode/pup/verify8_8000.mjs  node /tmp/opencode/pup/verify17_controls.mjs
node /tmp/opencode/pup/verify18_aim.mjs  node /tmp/opencode/pup/verify16_mobile.mjs
node /tmp/opencode/pup/probe17.mjs       node /tmp/opencode/pup/verify_feel15.mjs
node /tmp/opencode/pup/verify16_audio.mjs
```

---

## 17. Files changed (new marked ★)

| File | Change |
|---|---|
| ★ `js/game/campaign/levels.js` | declarative immutable level table |
| ★ `js/game/campaign/state.js` | pure unlock/completion/progress functions |
| ★ `js/game/campaign/storage.js` | best-effort localStorage |
| ★ `js/game/campaign/campaign.js` | controller: record/select/persist/reset |
| ★ `js/game/campaign/index.js` | barrel export |
| ★ `js/game/campaignui.js` | level chip + modal + intro hint |
| `js/game/ui.js` | picker lock states, `setObjectActive`, `refreshObjectPicker` |
| `js/game/result.js` | multi-block campaign rewards |
| `js/main.js` | campaign wiring, reward building, debug hooks |
| `index.html` | `#level-chip`, `#level-modal`, `#intro-hint` |
| `css/style.css` | `.lv-*`, `.obj-state`, `.obj-btn.locked`, `.intro-hint` |
| ★ `tests/game/campaign.test.js` | 25 tests |
| ★ `tests/run_campaign.js` | runner |

---

## 18. Limitations

- Unlock state is single-device localStorage; no cloud sync (out of scope).
- The level ladder is fixed at four levels; extending means editing the
  declarative table, not adding code paths.
- Campaign completion (level 4) is a terminal flag only — no post-campaign
  reward loop (out of scope).

---

## 19. Verification issues caught & fixed

- **Module parse error** on boot: `campaignUI` was declared both `let` (top)
  and `const` (later) in `js/main.js` — the harness's `boot()` timeout traced
  to a page parse error. Fixed by reusing the top-level binding.
- **Intro hint never appeared**: no idle event is emitted at boot, and
  object/size events were clearing it. The constructor now seeds the hint when
  `showIntro` is pending, and `onGameState` reacts only to explicit
  `aim/idle/flying` states.
- **Stale audio harness**: `verify16_audio.mjs` section B clicked the planet
  picker button, which is now campaign-locked (disabled) at boot — updated to
  click the unlocked rock; locked objects correctly emit no select audio.

---

## 20. Screenshots

`/tmp/opencode/pup/shots19/` — A_BOOT, mid-campaign states, F_AFTER_REAL_THROW,
M_MODAL_{360,390,414,1280} (harness-generated; DOM/WebGL assertions, not
visual inspection, drive acceptance).
