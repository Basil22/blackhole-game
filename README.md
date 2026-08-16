# Event Horizon — Black Hole Sandbox

Real spaghettification in your browser. Throw asteroids, astronauts, starships, and planets
into a black hole and watch tidal forces tear them apart — physics-accurate gravity,
spring-mass materials, and a real event horizon.

## Play it

```bash
python3 serve.py 8000
```

- Desktop: open `http://localhost:8000/`
- Phone (same Wi-Fi): open `http://<your-machine-ip>:8000/` — **type the `http://` explicitly**;
  Android Chrome force-upgrades plain-IP URLs to HTTPS, which this dev server doesn't do.
  Installable as a PWA (Add to Home Screen → fullscreen, works offline once cached).
- Phone (any network): run a tunnel so the browser gets a real `https://` URL:
  `cloudflared tunnel --url http://localhost:8000` → open the printed `*.trycloudflare.com` URL.
  (Bypasses Wi-Fi "Public" profiles and router AP isolation too.)

No build step. No dependencies beyond a browser with WebGL.

## Controls

| Action | How |
|---|---|
| Pick object | Tap asteroid / astronaut / ship / planet |
| Size | **SIZE** slider (0.3×–3×) scales the object's real physical size before throwing |
| Aim | Tap **THROW**, then drag on screen (arrow shows direction + power) |
| Launch | Release the drag |
| Slow-mo | Tap **SLOW-MO** (0.25×) — this is the feature that makes the stretch visible |
| Orbit camera | Drag empty space |
| Zoom | Pinch (or two-finger drag) |
| Capture frame | 📸 button |
| Share frame | 📤 button |

## The physics (real)

- Newtonian gravity on every point: `a = -GM/|r|² · r̂` with `GM = 12.288×10⁶`
- Objects are networks of **point masses joined by damped springs**
- Inner points fall faster than outer points → **tidal stretching (spaghettification)** emerges
  from the physics, not an animation
- Springs snap when strain exceeds material strength → object **tears** into a debris stream
- Points that cross the event horizon (`r_s = 40` units) are **consumed** → a horizon-edge
  accretion glow, sized to the hole and to the object, so even an object BIGGER than the hole
  visibly ignites at the rim instead of dissolving with invisible pops
- A live readout shows **tidal stretch %, tears, and distance** while an object is in flight

## Object material strengths (tuned so each behaves differently)

| Object | Stiffness | Break strain | What you see |
|---|---|---|---|
| Asteroid | 500 | 0.30 | Stretches ~2× then snaps into chunks |
| Astronaut | 400 | 0.10 | Stretches ~2.5–3×, snaps into ~5–7 pieces fast |
| Starship | 1000 (fuselage), 250 (wings) | 0.12 | Wings shear off first, fuselage stretches |
| Planet | 60 | 0.07 | 30-particle sphere shreds into a debris stream |

Black hole preset: stellar-mass (`GM = 12.288×10⁶`, horizon radius 40 units — 1.6× the
scene's normal object scale, so even planets are dwarfed by the hole). The default camera
is tilted so the accretion disk passes in front of AND behind the hole (the classic shot).

## Project layout

```
index.html               entry point
js/physics.js            pure spring-mass sim (NO three.js dep — unit-tested in node)
js/objects.js            throwable chain templates
js/render/scene.js       three.js scene, black hole, disk shader, starfield
js/render/objects.js     real-mesh visualizer (capsules/spheres/wings that deform with the sim), particle FX
js/game/main.js          game controller: loop, fixed-timestep sim, input, telemetry
js/game/ui.js            HUD: picker, throw/slowmo/photo/settings
tests/physics.test.js    node unit tests — run: node tests/physics.test.js
serve.py                 zero-dep static server (python3)
manifest.webmanifest     PWA manifest (icons in assets/)
```

## Run the physics tests

```bash
node tests/physics.test.js
```

8 tests covering: free-fall to horizon, spaghettification stretch, tearing, stable circular
orbits, planet shredding, horizon consumption, and NaN-freedom.

## Notes / limits

- Newtonian gravity, not full GR — no true gravitational lensing or photon sphere (documented
  decision; the visual disk is a shader approximation).
- `r_s` and `GM` are decoupled game-unit knobs (a fully physical setup would tie them via `c`).
- The physics module (`physics.js`) is kept three.js-free so it stays unit-testable in node.

## Changelog

- **v3** — Black hole enlarged to dominate the scene: whole game self-similarly scaled ×1.6
  (`GM` 3e6→12.288e6, horizon 25→40, camera/spawn/zoom/despawn all ×1.6) so planets and even
  size-10 objects are dwarfed, with the reference band framing preserved (centroid 48.0%). Objects
  bigger than the hole now get a proper swallow: matter ignites a horizon-edge accretion glow at
  the rim (`ParticleSystem.horizonRim`) sized to the hole and boosted by the object's radius,
  instead of invisible sub-pixel pops.
- **v3.1** — Removed the Cinematic/Low-poly graphics toggle; the game now always renders the
  full-quality path (lower geometry detail tier, glow/photon-ring toggles, and quality wiring all
  stripped from `scene.js`, `objects.js`, `main.js`, `ui.js`).
- **v2** — Size slider (scales real chain geometry + mass), real 3D meshes per object
  (rock boulder, articulated astronaut, hull+nose+cockpit+wings starship, planet) that deform
  with the physics instead of point-sphere "atom" models; Doppler-beamed accretion disk,
  photon-ring rim, vertex-colored starfield, hemisphere lighting, cinematic vignette.
  Fixed a mobile freeze where a thrown object left the game stuck in aim mode (the visualizer
  was built with only a color instead of its full mesh metadata).
