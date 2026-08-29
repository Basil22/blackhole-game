# Phase 24 — Audit Findings (evidence-backed)

## Methodology
- Pure mapping analysis (`tests/map_missions.js`): aim dx \u2192 `classifyTrajectory` (point-mass COM launch).
- Real-sim throw audit (`tests/audit_missions_real.js`, `tests/audit_escape_reach.js`): drives the ACTUAL spring-mass sim + drag + tides + telemetry + scoring + `evaluateMission` for each object, sweeping dx 0..340, recording finalized `trajectoryState` + per-mission completion.

Constants: mu=12.288e6, spawn R=384.48, vCirc=178.77, vEsc=252.82 (\u221a2\u00b7vCirc at dx=272 per the mapping). Horizon=40. aim.dx = pointer\u0394 \u00d70.9 (clamped to span [0,340]).

---

## 1. MVP GAME LOOP
- Loop is sound and complete (OPENING\u2192PLAY\u2192pick object\u2192pick mission\u2192size/zoom\u2192AIM\u2192THROW\u2192result\u2192next). No dead-ends: result always dismisses on THROW AGAIN / beginAim; object picker always openable; cancel (CANCEL/Escape) returns to idle cleanly.
- Minor: after a completed campaign, the mission counter stays "7/7" and the NEXT block disappears silently — fine, but no explicit "campaign done, replay freely" affordance. (Presentation-only.)

## 2. CAMPAIGN STRUCTURE
- Coherent 4-level ladder (rock/human/ship/planet), object unlock tied to level completion. `state.js` pure + defensive.
- Tension: the campaign (Phase 19) and progression (Phase 8) are TWO parallel unlock systems. Progression is a strict single-chain "complete mission N unlocks N+1"; campaign is a 4-level set with overlapping requirement sets. They are kept consistent in `js/main.js` but the dual model is subtle. Not a bug, just complexity.

## 3. MISSION DIFFICULTY (headlines, with real-sim numbers)
All columns = "completes at these dx values":

| mission        | rock      | human     | ship      | planet    | verdict |
|----------------|-----------|-----------|-----------|-----------|---------|
| Touch the Edge (NH\u226460) | 0-266     | 0-266     | 0-266     | 0-262     | **TRIVIAL — completes on ~every throw** |
| Break Free (ESCAPING) | 330-340   | 330-340   | 326-340   | 332-340   | tight, fair; **unreachable on 360px phone** (max dx=324) |
| Into the Abyss (HORIZON_CROSS) | 147* | \u0175never | \u0175never  | 116-263   | **rock=fluke single dx; human/ship impossible** |
| Grazing (survive \u226460) | 0-266 | 0-266 | 0-266 | 0-263 | **TRIVIAL (shadows Touch the Edge)** |
| Find the Orbit (ORBITAL) | 177-328 | 267-329 | 257-325 | 71-331 | reasonably precise EXCEPT rock/human ORBIT band [177-328] / [267-329] is wide AND sits right under the escape cliff |
| Make It Count (\u2265100) | 0-340 | 0-329 | 0-340 | 0-* | **TRIVIAL — any near-horizon pass scores ~3180 from precision alone** |
| High Roller (\u22651000) | 0-329 | 0-329 | 0-325 | 0-* | **TRIVIAL — precision alone (\u22483180) beats it** |

* capture-01 for rock = dx 147 only (a single dx where the COM happens to be inside horizon at finalize but not consumed) — a coincidence, not playable.

Key conclusions:
- **Touch the Edge is accidental on every throw** because any bound orbit's COM dips inside 1.5\u00d7horizon=60 (closest reaches 3-40). It is not a "first contact" skill check.
- **Make It Count + High Roller are trivially satisfied by the PRECISION category** (~3180 per near-horizon pass), so they are auto-completions, not skill challenges. High Roller is tagged EXTREME but is the easiest mission.
- **Into the Abyss (capture) is broken/missing** for human and ship (never completes) — because a *surviving* object's finalized state is re-classified from its final COM, and a surviving bound throw ends ORBITAL/CAPTURED, but HORIZON_CROSSING only fires on actual consumption; grazing-throw COMs rarely sit inside the horizon at finalize without being consumed.
- **Break Free is fair but physically unreachable on 360px touch** (escape needs dx\u2265326; a 360px full-width drag \u00d70.9=324 < 326).

## 4. OBJECT\u00d7MISSION BALANCE
- Rock/human behave nearly identically (small masses, same drag class) — expected; differentiation is visual (rock sturdy vs human articulated), not mechanical.
- Planet diverges: wide ORBIT band [71-331], capture achievable [116-263], near-horizon [0-262]. Planet is its own mini-game (large/compliant). ship is the odd one: into-the-abyss never completes, escape needs dx 326 (tighter).
- No combination is "impossible" except human/ship \u2192 Into the Abyss (missing path) and 360px \u2192 Break Free.

## 5. FIRST-TIME PLAYER EXPERIENCE
- Intro hint = "DRAG TO AIM \u00b7 RELEASE TO THROW" (controls only). **Mission goal text is NOT shown on-screen during play.** The mission chip shows only the title ("BREAK FREE"); the description ("Escape the black hole") lives inside the mission selector modal. New players cannot see what they're aiming FOR mid-throw.
- Guidance HUD shows trajectory state + closest distance while aiming — good, but no notion of the *mission* goal (e.g. "escape needs full power").
- Opening cinematic gates input until PLAY — good.

## 6. RESULT\u2192NEXT ACTION
- Result panel shows: object, headline, score/max, mission status+title, progression/unlock line, THROW AGAIN. Solid.
- Weak: when a mission FAILED, the result shows "MISSION FAILED" but **no explicit retry guidance** (no "TRY WIDER" / no next-mission pointer when locked). THROW AGAIN resets cleanly but the player is left guessing what to change.
- Unlock line present; campaign-complete path exists. Replay after campaign-complete works (re-throw allowed).

## 7. REPLAYABILITY
- Good bones: 4 objects \u00d7 7 missions \u00d7 score; physics is deterministic; throws feel skill-expressive.
- Undermined by: many missions auto-complete (Touch the Edge, Make It Count, High Roller), so "replay to beat" collapses into "replay to 100% every box" trivially. Fix the trivial missions and replay value returns.

## 8. SCORE / PERFORMANCE
- Scoring categories weighted and normalized (precision 30%, tidal 25%, destruction 15%, survival 20%, orbital 10%, near-horizon bonus). Good spread.
- **Imbalance:** PRECISION (30% of 10600 = 3180) is awarded on ANY close pass and alone exceeds both score-01 (100) and score-02 (1000). So two score missions are non-challenges. The scoring math is fine; the *targets* are absurdly low vs the precision floor.
- No score-vs-mission contradiction observed. Deterministic.

## 9. MOBILE-FIRST GAMEPLAY
- Controls reachable; object menu fixed (Phase 24 UI fix). No overflow at 360/390/414 (verified via prior Phase 23 harness). Safe areas handled.
- **Critical:** Break Free unreachable on 360px (dx max 324 < escape 326) on a full-width drag. Needs an input-reach or escape-band adjustment.
- Pinch zoom + orbit drag properly gated (Phase 6B fix) — no accidental camera movement during aim (single-pointer aim path).
- THROW button exists as a non-drag alternative, but escape on 360 still needs a sufficient gesture; the button launches whatever the current aim vector is.

## 10. GAME-FEEL
- Aim arrow length scales with power (25-144px) + brightens near escape (Phase 18) — good power communication.
- Guidance line color-coded (red near horizon, amber orbital, apex marker) — good trajectory communication.
- Proximity ramps BH glare + drone; tears spawn particles + audio; horizon-crossing one-shot. Cohesive AIM\u2192COMMIT\u2192RELEASE\u2192APPROACH\u2192TIDAL\u2192RESULT feedback loop exists.

## 11. PERFORMANCE
- No per-frame DOM churn (readout/guidance-chip updates via textContent); no prediction-in-render; object visualizer uses union-find (Phase 12). No regressions introduced by this audit (node suites green).

## 12. ARCHITECTURE
- Clean separation holds: physics/trajectory/telemetry/scoring/guidance/aiming/missions/campaign/UI. `js/main.js` is the only composer. No UI-as-source-of-truth. Good.

---

## Prioritized issues (proposed Phase 24 scope, no physics constants changed)
P0 — gameplay-blocking / makes-a-mission-impossible-or-trivial:
1. **Touch the Edge is auto-trivial** (completes on ~every throw). Fix target to a genuine near-horizon *survived* pass with periapsis within a skill window, OR merge semantics. (MISSION CONTENT change — needs tests.)
2. **Score missions (Make It Count/High Roller) are auto-trivial** — precision floor (~3180) dwarfs targets (100/1000). Fix targets to real scores. (MISSION CONTENT change.)
3. **Into the Abyss impossible for human/ship** — HORIZON_CROSSING only fires on consumption, so a surviving near-grazing throw doesn't satisfy it. Mission definition vs. telemetry reality mismatch.
4. **Break Free unreachable on 360px** — escape needs dx\u2265326, 360px drag maxes at dx=324. Input-reach gap.

P1 — clarity / feel, no mechanics:
5. Show mission goal text on-screen during aim (chip description line or guidance hint).
6. Result "MISSION FAILED" should suggest a direction, not just reset.

P2 — presentation:
7. After campaign-complete, give an explicit replay affordance/cue.

## Out of scope (per instructions): NO physics-constant/trajectory-classifier changes without tests+justification; NO new monetization/X/CLD/leaderboards/backend.
