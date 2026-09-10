// sw.js — Service worker: cache-first for all static assets.
// Bumping CACHE_VERSION invalidates the old cache on activation.

const CACHE_VERSION = 'bh-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './manifest.webmanifest',
  './favicon.ico',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './js/vendor-three.min.js',
  './js/main.js',
  './js/objects.js',
  './js/physics.js',
  './js/physics/vec3.js',
  './js/physics/masses.js',
  './js/physics/world.js',
  './js/physics/integrate.js',
  './js/physics/shapes.js',
  './js/physics/diagnostics.js',
  './js/physics/trajectory/index.js',
  './js/physics/trajectory/closest.js',
  './js/physics/trajectory/orbital.js',
  './js/physics/trajectory/predict.js',
  './js/physics/trajectory/states.js',
  './js/physics/telemetry/index.js',
  './js/physics/telemetry/record.js',
  './js/physics/telemetry/span.js',
  './js/physics/telemetry/telemetry.js',
  './js/render/scene.js',
  './js/render/blackhole.js',
  './js/render/lights.js',
  './js/render/starfield.js',
  './js/render/objects.js',
  './js/render/objects/builders.js',
  './js/render/objects/geometry.js',
  './js/render/objects/particles.js',
  './js/render/objects/visualizer.js',
  './js/render/comicfx.js',
  './js/ui/icons.js',
  './js/ui/theme.js',
  './js/audio/index.js',
  './js/audio/audio.js',
  './js/audio/feedback.js',
  './js/audio/haptics.js',
  './js/audio/sounds.js',
  './js/game/main.js',
  './js/game/ui.js',
  './js/game/input.js',
  './js/game/aim.js',
  './js/game/loop.js',
  './js/game/sim.js',
  './js/game/spawn.js',
  './js/game/trajectory.js',
  './js/game/readout.js',
  './js/game/result.js',
  './js/game/presentation.js',
  './js/game/opening.js',
  './js/game/guidehud.js',
  './js/game/settingsui.js',
  './js/game/campaignui.js',
  './js/game/missionui.js',
  './js/game/android.js',
  './js/game/aiming/index.js',
  './js/game/aiming/mapping.js',
  './js/game/aiming/evaluate.js',
  './js/game/campaign/index.js',
  './js/game/campaign/campaign.js',
  './js/game/campaign/levels.js',
  './js/game/campaign/state.js',
  './js/game/campaign/storage.js',
  './js/game/challenges/index.js',
  './js/game/challenges/catalog.js',
  './js/game/challenges/evaluate.js',
  './js/game/challenges/profiles.js',
  './js/game/guidance/index.js',
  './js/game/guidance/guidance.js',
  './js/game/guidance/path.js',
  './js/game/missions/index.js',
  './js/game/missions/catalog.js',
  './js/game/missions/evaluate.js',
  './js/game/missions/mission.js',
  './js/game/progression/index.js',
  './js/game/progression/progression.js',
  './js/game/progression/flow.js',
  './js/game/progression/state.js',
  './js/game/progression/storage.js',
  './js/game/scoring/index.js',
  './js/game/scoring/score.js',
  './js/game/scoring/categories.js',
  './js/game/scoring/config.js',
  './js/game/settings/index.js',
  './js/game/settings/model.js',
  './js/game/settings/storage.js',
];

// Install: pre-cache all static assets.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: purge old caches.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first, fall back to network (then cache the response).
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Only cache same-origin, successful, non-opaque responses
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
