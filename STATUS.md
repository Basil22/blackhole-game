# BLACK HOLE — Project Status & Roadmap

## What the game is

A physics-accurate black hole sandbox. Throw asteroids, astronauts, starships,
and planets into a black hole and watch real Newtonian tidal forces stretch and
tear them apart. Pure browser game (Three.js / WebGL), installable as a PWA,
packaged as an Android APK via Capacitor. No build step.

---

## Completed features

### Core engine (Phases 1-3)

- Real Newtonian gravity on every point mass (`F = -GM/r^2`)
- Spring-mass objects: asteroid (6-12 pts), astronaut (10 pts skeleton),
  starship (hull + wings + cockpit), planet (30-particle sphere)
- Material-specific tearing: springs break at strain threshold
- Event horizon consumption with horizon-rim accretion glow
- Fixed-timestep physics (1/240s) — stable at any time scale
- 3D mesh visualizer: capsules, spheres, blades that deform with the sim
- Fragment-aware rendering: union-find over alive springs, bounding ellipsoids
- Particle system: tears, accretion flashes, horizon-rim ignition, launch trails
- Pre-allocated pool (700 particles, single draw call)

### Black hole rendering

- Tilted accretion disk with fire-palette shader (white-hot inner to dark outer)
- Photon ring (thin bright circle at the horizon)
- Gravitational lensing arcs (top + bottom billboard half-rings)
- Soft outer glow sprite
- Proximity-driven brightness (disk + glow react to nearby matter)
- Flash + agitate responses on consumption and tears

### Camera & controls (Phase 11-13, 17)

- Orbit camera (drag to rotate, phi-clamped)
- Pinch zoom with slider sync
- Slingshot drag-to-aim with arrow preview
- Trajectory prediction line (predicted path fades on launch)
- CANCEL button (back out of an aim)
- Keyboard shortcuts: Space (throw), Enter (confirm), Escape (cancel),
  S (slowmo), R (respawn)
- Zoom slider: LEFT = far, RIGHT = close
- Wake Lock API: screen stays on during aim/flight

### Aiming & guidance (Phase 11-13, 15, 18)

- Drag-to-launch mapping with orbital sweet spot
- Real-time trajectory prediction (classifies ESCAPING / FLYBY / ORBITAL /
  CAPTURED / HORIZON_CROSSING)
- Compact aiming HUD chip (state + distance readout)
- Aim-high feedback (entered powerful tail of the envelope)
- Launch trail puff (directional particles on release)
- Prediction path dissolves instead of blinking out

### Scoring system (Phase 7+)

- 5 scored categories: Precision, Tidal, Destruction, Survival, Orbital
- Near-horizon survival bonus
- Normalized 0-1 scoring with config-driven weights
- Score formatted with thousands separators
- Contextual annotations per category (Phase C: "2.1x stretch", "3 tears", etc.)
- Normalized fill bars on score breakdown rows (Phase C)

### Mission system (Phase 7-9)

- 7 curated missions in the catalog:
  - Gentle Approach (near-horizon pass)
  - Break Free (achieve escape trajectory)
  - Spaghetti Test (stretch to 2x)
  - Shredder (5+ tears)
  - Find the Orbit (orbital insertion)
  - Total Annihilation (full consumption + 1500 pts)
  - Grazing the Void (survive within 1.5x horizon — optional post-campaign)
- Mission evaluator: pure function from telemetry + score
- Mission selector modal with difficulty dots + recommended object
- Mission types: STATE, NEAR_HORIZON, SURVIVE_NEAR_HORIZON, SCORE,
  TEAR_COUNT, STRETCH

### Campaign & progression (Phase 8-9, 19)

- 4-level campaign: First Contact, Deep Dive, Breaking Point, Event Horizon
- Linear unlock progression (complete required missions to advance)
- Object unlocks per level (astronaut at LV.2, ship at LV.3, planet at LV.4)
- Campaign chip + level selector modal
- Mission flow planner (completed/already/failed/nudge states)
- Persistent localStorage state (defensive normalization, schema versioned)

### Challenge system (Phase 10)

- Per-object difficulty profiles (EASY/BALANCED/HARD/EXTREME)
- Per-mission challenge cards with difficulty dots + labels
- Recommended object advisor (match mission type to object strengths)

### Score persistence & personal bests (Phase A)

- localStorage-backed score history keyed by mission ID
- Best score, best breakdown, best stars, object used, throw counter
- NEW BEST badge in result panel
- Previous best score display
- Stars update independently of score bests

### Star ratings (Phase B)

- 3-star rating system per mission
- Thresholds based on mission difficulty and score percentage
- Star display in result panel (filled + empty star characters)
- Accessible aria-labels

### Daily challenges (Phase E)

- Deterministic daily challenge generator (same date = same challenge globally)
- Date-seeded hash selects template + object + target
- Templates: SCORE, TEAR_COUNT, STRETCH, NEAR_HORIZON, STATE
- Streak tracking with localStorage persistence
- Daily challenge chip UI
- Parallel evaluation alongside regular missions

### Interactive tutorial (Phase F)

- 6-step first-play tutorial overlay
- Steps: throw, aim, watch, slowmo (optional), object (optional), mission (optional)
- Highlights target controls with pulsing outline
- Skip button, localStorage completion persistence
- Mounts after opening screen completes

### Visual effects (Phase D, G)

- Comic book text FX: CHOMP/GULP/NOM/RIP/SHRED/ZOOM/WHOOSH popups
  on tears, consumptions, and escapes
- Screen shake CSS animation on consumption events
- Reduced-motion respect (no FX when prefers-reduced-motion)
- Motion trails behind flying objects (pre-allocated THREE.Line buffer)

### Audio & haptics (Phase 16, H)

- Procedural Web Audio synth (no samples, no external library)
- Lazy initialization on first user gesture (mobile autoplay rules)
- Ambient drone with proximity-driven tension
- 17 semantic sound events: select, slider, cancel, aim-start, aim-state,
  aim-high, launch, horizon, tear, capture, escape, mission-complete,
  mission-failed, mission-unlock, star-reveal, new-best, orbit-insert
- Per-event throttle rules (no machine-gun cascades)
- Per-object tear timbre (rock=dry, ship=metallic, planet=rumble)
- Haptic feedback via navigator.vibrate (semantic gestures, reduced-motion aware)
- Haptics ON/OFF setting

### UI / UX (Phase 14, 17, 20-21, 23)

- Monochrome design system (black + white, text carries all state)
- Centralized button sizing system (icon 44px, control 44px, action 48px)
- Opening screen with title, PLAY button, settings access
- Camera dive intro (accelerating approach + exposure + bounce)
- Skip Intro setting
- Reduced motion setting (system pref OR explicit toggle)
- Settings modal (audio, haptics, skip intro, reduced motion)
- Menu modal (how to play, statistics, settings)
- Object slot + collapsible picker panel
- Result panel with animated count-up, staggered row reveal
- Photo capture with native share sheet (fallback: download)
- Intro hint ("DRAG TO AIM - RELEASE TO THROW")
- Flash notification
- Statistics modal: missions completed, total stars, daily streak,
  per-mission best scores (Phase I)

### Platform (Phase 26)

- Android APK via Capacitor
- Back button handling + lifecycle management
- Error diagnostics overlay for headless APK testing
- PWA manifest + service worker

---

## Known issues / tech debt

- `ComicFX` references `THREE` as a global (not imported) — works because
  vendor-three.min.js is a script tag, but would break in a bundled build
- No automated browser-level test suite (node tests cover pure logic only)
- PLAN.md and README.md reference the original Unity plan and are outdated
- Phase report files (11-26) are historical artifacts; could be archived
- The scoring `annotateCategory` function accesses fields that category
  functions attach to breakdown rows — works but the contract is implicit

---

## Future roadmap

### MVP polish (do first)

- [ ] Full playtest pass on Android + iOS Safari + desktop Chrome
- [ ] Fix any runtime errors surfaced by the error diagnostics overlay
- [ ] Performance profiling on mid-range Android (target 60fps)
- [ ] Accessibility audit (screen reader flow, focus management)
- [ ] Update README.md and PLAN.md to reflect current state

### Phase 1: Daily login rewards

- [ ] Daily login calendar UI (7-day cycle with escalating rewards)
- [ ] Login streak tracking (localStorage, synced with daily challenge streak)
- [ ] Reward types: in-game currency, temporary boosts, cosmetic unlocks
- [ ] "Claim" animation + sound feedback
- [ ] Missed-day handling (streak resets, but calendar continues)

### Phase 2: In-game currency system

- [ ] Currency model: earn through gameplay (missions, daily challenges,
  login rewards, high scores, star collection)
- [ ] Currency display in HUD (persistent counter, animated on earn)
- [ ] Earn rates:
  - Mission first completion: 100-500 coins (scaled by difficulty)
  - Star ratings: 50 coins per star
  - Daily challenge completion: 100 coins + streak bonus
  - Daily login: 25-200 coins (escalating with streak)
  - High score improvement: 10% of score delta
- [ ] Currency persistence (localStorage, schema versioned)
- [ ] Transaction history (debug view)

### Phase 3: Object skins / cosmetics shop

- [ ] Skin system: visual variants for each object (mesh color, material,
  particle trail color, tear effect color)
- [ ] Skin catalog: 3-5 skins per object (one free default + purchasable)
  - Asteroid: Default, Metallic, Crystalline, Molten, Dark Matter
  - Astronaut: Default, Gold Suit, Neon, Stealth, Cosmic
  - Starship: Default, Chrome, Warship, Vintage, Phantom
  - Planet: Default, Ice World, Lava, Ocean, Nebula
- [ ] Shop UI: browsable grid per object, preview, price, buy button
- [ ] Equipped skin persistence
- [ ] Skin preview in the object picker
- [ ] Unlock animation + sound

### Phase 4: Premium currency-only objects

- [ ] New throwable objects (unlockable only with premium currency):
  - Comet: long tail, low mass, fast — unique trail visuals
  - Space Station: large multi-segment structure, dramatic tears
  - Binary Star: two connected massive bodies, mutual interaction
  - Neutron Star: tiny but extremely dense, unique gravity interaction
- [ ] Object preview in a locked state (silhouette + price)
- [ ] Purchase flow with confirmation dialog

### Phase 5: In-app purchases (real money)

- [ ] Currency packs:
  - Small (500 coins)
  - Medium (1500 coins + 20% bonus)
  - Large (5000 coins + 50% bonus)
- [ ] Capacitor in-app purchase plugin integration
- [ ] Google Play Billing Library (Android)
- [ ] Apple StoreKit (iOS, when iOS build is added)
- [ ] Purchase verification (receipt validation)
- [ ] Restore purchases flow
- [ ] "No ads" premium purchase option
- [ ] Terms of service + privacy policy pages
- [ ] Age-appropriate design compliance (if targeting under-18)

### Phase 6: Google Ads integration

- [ ] AdMob SDK integration via Capacitor plugin
- [ ] Ad placements:
  - Banner ad on the result screen (below THROW AGAIN)
  - Interstitial ad every N throws (configurable, start at every 5)
  - Rewarded video: "Watch ad for 2x coins on this throw"
  - Rewarded video: "Watch ad to retry daily challenge"
- [ ] Ad frequency capping (no more than 1 interstitial per 3 minutes)
- [ ] "Remove Ads" in-app purchase (disables all ad placements)
- [ ] GDPR consent dialog (EU users)
- [ ] Ad loading + fallback (graceful degradation if no fill)
- [ ] Analytics: track ad impressions, clicks, revenue

### Phase 7: Social & competitive features

- [ ] Global leaderboard per mission (anonymous, opt-in)
- [ ] Weekly leaderboard reset
- [ ] Share score card (image with score + stars + mission name)
- [ ] Friend challenge: share a daily challenge link
- [ ] Achievement system (lifetime milestones):
  - "First Blood" — complete your first mission
  - "Streak Master" — 7-day daily streak
  - "Three Star General" — 3 stars on all campaign missions
  - "Orbital Mechanic" — 10 orbital insertions
  - "The Shredder" — 100 total tears
  - "Deep Pockets" — earn 10,000 coins
  - "Collector" — own 10 skins

### Phase 8: Content expansion

- [ ] New black hole types:
  - Supermassive (gentle stretch, slow fall — different gameplay feel)
  - Spinning (Kerr — frame dragging effect on trajectories)
  - Binary black hole (two horizons, complex orbits)
- [ ] New campaign chapters (5+ missions each)
- [ ] Seasonal events (limited-time missions, exclusive skins)
- [ ] Boss challenges (survive N seconds near a hostile black hole)

### Phase 9: Platform expansion

- [ ] iOS build (Capacitor + Apple Developer account)
- [ ] App Store submission
- [ ] Google Play Store listing (screenshots, description, rating)
- [ ] Desktop wrapper (Electron or Tauri) for Steam/itch.io
- [ ] Cloud save (sync progress across devices)
- [ ] Push notifications (daily challenge reminder, streak about to break)

### Phase 10: Analytics & optimization

- [ ] Event tracking (throws, mission completions, purchases, ad views)
- [ ] Funnel analysis (install -> first throw -> first mission -> first purchase)
- [ ] A/B testing framework for pricing, ad frequency, difficulty
- [ ] Crash reporting (Sentry or equivalent)
- [ ] Performance monitoring (frame time percentiles per device class)
- [ ] Retention metrics (D1, D7, D30)

---

## Architecture notes for future phases

### Currency system design

```
Currency
  |-- earned (gameplay)
  |     |-- missions (first completion)
  |     |-- stars
  |     |-- daily challenges
  |     |-- login rewards
  |     |-- high score improvements
  |
  |-- purchased (IAP)
  |     |-- small / medium / large packs
  |
  |-- spent
        |-- skins (permanent unlock)
        |-- premium objects (permanent unlock)
        |-- ad removal (permanent)
```

All currency state lives in localStorage with the same defensive
normalization pattern used by progression/campaign/settings. The
currency module is pure (no DOM, no three.js) so it can be unit tested
in node. Transaction log is append-only for auditability.

### Ad integration order

1. Rewarded video first (least intrusive, highest user value)
2. Banner on result screen (low friction, consistent revenue)
3. Interstitial after throws (highest revenue, most intrusive — tune carefully)

### Skin system architecture

Skins are pure data (color overrides, material params). The existing
`ObjectVisualizer` + `builders.js` already parameterize color and material
per object. Skins extend this with a skin ID that maps to alternate
color/material configs. No new mesh geometry needed for color-only skins;
material skins (metallic, glass) need shader variants.
