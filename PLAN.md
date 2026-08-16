# Event Horizon — Black Hole Sandbox (Web Build)

**Game:** Throw things into a black hole, watch realistic spaghettification.
**Engine:** Three.js (WebGL) — browser + mobile PWA, no install needed.
**Timeline:** Built in one working session (was scoped for 7 evenings; web path collapsed it).
**Physics fidelity:** Real Newtonian gravity + tidal stretching via spring-mass chains. No full GR rendering.

> This plan originally targeted Unity/Android. The project shipped as a **pure web game** instead:
> the full game — physics, rendering, UI — is running and verified. See `README.md` to play it.

---

## ⚡ STATUS: DONE + v2 polish — how to play

```bash
cd blackhole-game
python3 serve.py 8000
# open http://localhost:8000/ (or your machine's LAN IP on your phone)
```

**Phone access:** type `http://` explicitly (`http://192.168.0.6:8000/`), because Android
Chrome force-upgrades bare IPs to HTTPS. If the phone is on a different network / the Wi-Fi
is "Public" / the router has AP isolation, run a tunnel for a real HTTPS URL:
`cloudflared tunnel --url http://localhost:8000` and open the `*.trycloudflare.com` URL.

**v2 additions:** SIZE slider (0.3×–3×, scales real chain geometry + mass), real 3D meshes per
object (boulder / articulated astronaut / hull+nose+cockpit+wings ship / planet) that deform
with the physics, Doppler-beamed accretion disk + photon ring, vertex-colored starfield,
hemisphere lighting, cinematic vignette. Fixed a mobile freeze: thrown objects could leave the
game stuck in aim mode (visualizer was built with color-only metadata → TypeError in the
mesh rebuild). All 4 objects verified headless: mesh build → stretch → tear → consume → idle.

Everything below documents what was built and the physics model used.

---

## 1. Scope Decision (what "realistic" means here)

We ship **real physics for the fall and the stretch**, not full general relativity rendering.

| Feature | In week one? | Notes |
|---|---|---|
| Real `F = -GM/r²` gravity on every mass point | YES | Core of the sim |
| Tidal spaghettification (differential gravity) | YES | Emerges from point-mass chains |
| Event horizon at `r_s = 2GM/c²` | YES | Kill boundary + accretion flash |
| Material-strength tearing into debris stream | YES | Chain snaps at tension threshold |
| Slow-motion playback | YES | The feature that makes stretch visible |
| Cinematic vs low-poly quality toggle | YES | Two-tier rendering, same physics |
| Photo mode / share-clip capture | YES | Screenshot + screen recording share |
| Accretion disk + glow shader | YES | Emissive disk, simplified (no true lensing) |
| Gravitational lensing post-effect | OPTIONAL | Cheap fisheye-style effect, off on low tier |
| Planet tidal disruption | RISKY | 30-particle self-gravity ball; cut to "big rock" if it eats the night |
| Audio design | BASIC | Sound effects only, no music unless time |
| Progression / missions / scoring | NO | Post-launch |
| iOS | NO | Post-launch |

---

## 2. Physics Model

### 2.1 Units & scale

- Work in **game units = arbitrary**. Pick black hole mass so the horizon radius is visually sensible: `r_s ≈ 20–40` world units, spawn distance `≈ 150–250` units.
- Constant of gravity `G` chosen such that a free-fall from spawn takes ~3–5 real seconds (tunable) at 1× speed.
- All simulations run at fixed timestep (substep `Physics`-style) so slow-mo doesn't destabilize springs: simulate at fixed dt, scale `Time.timeScale` for playback.

### 2.2 Black hole

- Schwarzschild (non-rotating) to keep it simple and correct. Config as a `ScriptableObject`:
  - `mass` → sets `r_s`
  - `accretionDiskColor`, `diskRadiusInner/Outer`, `flashIntensity`
- Optional future: Kerr (rotating) + frame dragging — **out of scope week one**.

### 2.3 Throwable object = spring-mass chain

Every object is a set of **point masses** connected by **springs** (custom `SpringMassSim`, not Unity physics for the internal structure — keeps it deterministic and cheap):

- Each point: position, velocity, mass, `materialStrength`.
- Force per point: gravity `-GM·m/|r|² · r̂` + spring forces + damping.
- Tearing: if a spring's extension exceeds `strength`, delete that link → the chain parts.
- Horizon consumption: when a point's `|r| < r_s`, remove it and spawn a small accretion particle burst. When all points consumed → object gone.

### 2.4 Object models (chain configurations)

| Object | Model | Strength |
|---|---|---|
| Rock / debris | 6–12 point chain, random lumps | High — often survives into the hole intact-ish, stretches hard |
| Human / astronaut | ~10-point skeleton chain (head→toes), limbs implicit | Low — snaps into a debris line early |
| Spaceship | 2–4 rigid parts, weak breakable joints | Medium — wings/joints snap first, then stretch |
| Planet | 30-particle sphere, weak self-gravity + cohesion | Very low — shreds into a stream (RISKY, see 3.4) |

### 2.5 The "real" parameters people will ask about

Document in a `README` in-game or settings panel:
- Tidal force on an object of length L at radius r: `F_tidal ≈ 2GM·L/r³`
- Event horizon: `r_s = 2GM/c²`
- Roche-like disruption criterion: tidal force > object's internal cohesion → tears
- Stellar vs supermassive: small BH → spaghettifies *inside* horizon violently; big BH → gentle, slow stretch. We expose both via black-hole mass presets. **This is a great differentiator and it's just a mass knob.**

---

## 3. Rendering

### 3.1 Quality toggle (`QualityController`)

One entry point flips every setting. Two tiers:

| Setting | Cinematic (mid/high) | Low-poly (low range) |
|---|---|---|
| Mesh swap | PBR/skinned models | Flat-shaded primitives (cuboid human, blocky ship) |
| Materials | PBR + emissive | Unlit/flat colors |
| Bloom + tonemapping | On (URP) | Off |
| Accretion disk | Emissive disk + glow | Flat-colored ring |
| Lensing post-fx | Optional on | Off |
| Particle budgets | High (stars, flash, debris) | Reduced |
| Render scale | 1.0 | 0.75–0.85 |

UI: a settings screen that applies `QualityController.Apply(Cinematic|LowPoly)` at runtime. Same `SpringMassSim` underneath → identical gameplay.

### 3.2 Camera

- Orbit camera around black hole (touch drag to rotate, pinch to zoom).
- Optional follow-cam locked onto the falling object.
- Slow-mo button + photo mode (hide UI, screenshot to gallery, "share" intent).

---

## 4. Project Layout (Unity)

```
Assets/
  Scripts/
    Core/          GameManager, SceneBootstrap, BlackHoleConfig (ScriptableObject)
    Physics/       SpringMassSim, PointMass, SpringConstraint, TearResolver, HorizonConsumer
    Objects/       ThrowableObject, ObjectCatalog, ObjectConfig (chain templates per object)
    Camera/        OrbitCamera, FollowCamera, PhotoMode
    Quality/       QualityController, MeshSwapper
    FX/            AccretionFlash, DebrisStreamParticles
    UI/            ObjectPicker, ThrowController, SlowMotion, SettingsScreen
  Prefabs/
    BlackHole/     HoleVisual, AccretionDisk, LensPostFX
    Throwables/    Rock, Human, Ship, Planet
  Config/          BlackHolePresets.asset (stellar + supermassive), ObjectCatalog.asset
```

---

## 5. Evening-by-Evening Checklist

### Evening 1 — Core scene + first fall
- [ ] Unity project (URP, Android build target, IL2CPP)
- [ ] Black hole visual: dark sphere (horizon) + emissive accretion disk shader
- [ ] Orbit camera (drag rotate, pinch zoom)
- [ ] Single falling mass point: real gravity, horizon consumption + flash
- [ ] Spawn/re-throw loop
- **Definition of done:** throw a point, watch it fall, see the flash at the horizon.

### Evening 2 — Spring-mass chains + tearing
- [ ] `SpringMassSim` fixed-timestep solver
- [ ] Rock as 6–12 point chain, stretch under tidal force
- [ ] Tear resolver (break links past material strength)
- [ ] Debris stream particles
- **DoD:** a rock visibly stretches, then snaps into a stream, then flashes at horizon.

### Evening 3 — Human + ship, object picker, throw gesture
- [ ] Human skeleton chain (~10 points, low strength)
- [ ] Ship (2–4 parts, breakable joints)
- [ ] UI: horizontal object picker
- [ ] Drag-to-throw gesture (drag sets launch velocity/direction)
- **DoD:** pick human, fling it, watch it rip and stretch.

### Evening 4 — Planet + slow-mo + photo mode
- [ ] Planet: 30-particle cohesion ball (RISK — cut to "big rock" if overrunning)
- [ ] Slow-motion toggle (timeScale scaling with stable sim)
- [ ] Photo mode (hide UI, screenshot, share intent)
- **DoD:** slow-mo a human stretch, grab a shareable frame.

### Evening 5 — Quality toggle + performance pass
- [ ] `QualityController` cinematic/low-poly switch
- [ ] Mesh + material + particle + render-scale swap
- [ ] Perf test on a mid-range Android device (frame time, memory)
- **DoD:** same throw plays on both tiers at 60fps.

### Evening 6 — Polish + build
- [ ] Accretion flash, starfield background, sound effects
- [ ] Black-hole mass presets (stellar vs supermassive) in UI
- [ ] Android build (APK), sideload test on real device
- **DoD:** installable APK, two quality tiers, all four objects.

### Evening 7 — Buffer / launch
- [ ] Fix whatever broke; playtest flow end-to-end
- [ ] App icon, name, screenshots
- [ ] (Optional) Google Play listing; otherwise sideload-ready APK
- **DoD:** releasable build in hand.

---

## 6. Risks & Cuts

1. **Planet (evening 4) is the only true risk.** If self-gravity sim is unstable, ship "big rock" instead and add real planet post-launch.
2. **Slow-mo destabilizing springs** → solve with fixed sim timestep + `timeScale`; if still jittery, cap slow-mo to 0.25× not 0.05×.
3. **Dev-only evenings** → every DoD above is independently shippable; we can stop after any evening and still have a fun demo.
4. **App store** → Android sideload needs nothing; Play listing needs ~$25 one-time + a weekend of review. Sideload it for week one.

---

## 7. Reference Physics (cheat-sheet)

- Gravity on a point: `a = -GM/|r|² · r̂`
- Event horizon: `r_s = 2GM/c²`
- Tidal acceleration across length L: `a_tidal ≈ 2GM·L/r³`
- Spaghettification is most dramatic for **small** black holes (strong tides close in).
- Free-fall as seen by the falling object (proper time) reaches the horizon in finite time — use this (not coordinate time) so the fall looks fast and satisfying.

---

## 8. Open Items (decide before Evening 1)

- [ ] Black hole mass preset values (stellar `~10 M☉` vs supermassive `~10⁶ M☉`) in game units
- [ ] Exact object list for the picker (rock, human, ship, planet/big-rock?)
- [ ] Unity version + URP version (recommend Unity 2022 LTS or newer LTS)
- [ ] App name (suggestions: **Event Horizon**, **Spaghettify**, **Tidal Rip**, **Singularity Sandbox**)
