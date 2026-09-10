// game/loop.js — the requestAnimationFrame loop: fixed-timestep physics,
// frame update of scene/particles/objects, and the readout. Operates on the
// Game instance, which owns all the state.

import { makeStepper, PHYS_DT } from './sim.js';
import { terminationFrom, TERMINATION } from '../physics.js';
import { calculateThrowScore } from './scoring/index.js';
import { updateReadout } from './readout.js';

export function startLoop(game) {
  const stepper = makeStepper();
  let lastT = performance.now();
  let raf = 0;

  const step = () => {
    for (const o of game.objects) {
      const events = o.world.step();
      game.simTime += PHYS_DT;
      handleEvents(game, o, events);
      o.telemetry.recordStep(); // span, closest appr., velocity, tidal, horizon band
    }
    if (game.state === 'aim' && game.held?.telemetry) {
      game.telemetry = game.held.telemetry;
    }
  };

  const loop = (now) => {
    if (game._disposed) return;
    const dtReal = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;

    // accumulate fixed-timestep physics
    const steps = stepper.stepCount(dtReal * game.timeScale);
    for (let i = 0; i < steps; i++) step();

    // proximity drives the black hole's glare AND the ambient audio drone —
    // same read-only computation, shared. Horizon-crossing is a discrete,
    // throttled, once-per-throw event (no per-frame audio allocations).
    const prox = computeProximity(game);
    game.scene.bh?.setProximity(prox);
    game.audio?.setProximity(prox);
    if (prox >= 0.92 && !game._horizonSounded) {
      game._horizonSounded = true;
      game.audio?.horizon();
    }
    game.scene.update(dtReal, game.simTime);
    game.particles.update(dtReal);
    game.trajPath.tick(dtReal);   // post-launch predicted-path ghost fade

    game._readoutTimer -= dtReal;
    if (game._readoutTimer <= 0) {
      game._readoutTimer = 0.2;
      updateReadout(game._readoutEl, game.telemetry, game.timeScale, game.objects.length > 0);
    }

    // update held preview (frozen in place while aiming)
    if (game.held) game.held.visualizer.update(game.held.world);

    // update flying objects, drop finished ones
    for (let i = game.objects.length - 1; i >= 0; i--) {
      const o = game.objects[i];
      o.visualizer.update(o.world);
      if (o.world.aliveCount() === 0) {
        // Finalize telemetry from what actually happened before disposal.
        const reason = terminationFrom(o.telemetry.consumedPointCount, o.telemetry.initialPointCount);
        game.lastTelemetry = o.telemetry.finalizeThrow(reason);
        // Score the finished throw from its telemetry (pure layer, no physics).
        game.lastScore = calculateThrowScore(game.lastTelemetry);
        // Restrained escape confirmation: a throw that left the scene cleanly
        // (never captured, never torn apart) gets one quiet rising tone.
        if (reason === TERMINATION.DESPAWN && game.lastTelemetry.trajectoryState === 'ESCAPING') {
          game.audio?.escape();
        }
        if (game.onThrowEnded) game.onThrowEnded(game.lastTelemetry, game.lastScore);
        o.visualizer.dispose();
        game.objects.splice(i, 1);
      }
    }
    if (game.state === 'flying' && game.objects.length === 0) {
      game.state = 'idle';
      game._releaseWakeLock();
      game.onUiState({ state: 'idle', consumed: true });
    }

    game.scene.render();
    raf = requestAnimationFrame(loop);
  };

  raf = requestAnimationFrame(loop);

  return () => cancelAnimationFrame(raf);
}

// Dispatch physics events (tears, consumptions) to particles + telemetry.
function handleEvents(game, o, events) {
  for (const ev of events) {
    if (ev.type === 'tear') {
      o.telemetry.recordTear();
      game.particles.tear(ev.pos, ev.vel, o.color ?? 0xffa040);
      // Filament jitter on the disk as matter rips apart.
      game.scene.bh?.agitate();
      // Restrained snap; throttled in the feedback layer so a spring cascade
      // can never become a machine-gun. Object kind biases the timbre.
      game.audio?.tear({ object: o.kind });
    } else if (ev.type === 'consume') {
      o.telemetry.recordConsumption(o.world.bodies[ev.index].mass);
      // Glow at the horizon rim where matter visibly disappears — sized to
      // the object so a planet bigger than the hole ignites a big engulfing
      // flash instead of a sub-pixel pop.
      game.particles.horizonRim(ev.pos, o.world.horizonRadius, o.meta?.baseRadius || 0);
      // Cinematic response: one short brightness kick on the hole set-piece.
      game.scene.bh?.flash();
      // Deep gravitational drop as matter is consumed.
      game.audio?.capture();
    }
  }
}

// 0 → nothing near the response zone, 1 → matter on the horizon rim. Drives the
// black hole's glare so your throw visibly "heats" the disk as it closes in.
// Read-only: computes from the live sim bodies, never mutates them.
function computeProximity(game) {
  const hr = game.config.horizonRadius;
  if (!hr) return 0;
  let best = 0;
  for (const o of game.objects) {
    for (const b of o.world.bodies) {
      const d = b.pos.x * b.pos.x + b.pos.y * b.pos.y + b.pos.z * b.pos.z;
      if (d <= 0) continue;
      const dist = Math.sqrt(d);
      if (dist > hr * 4) continue;
      const p = 1 - (dist - hr) / (hr * 3); // ramps from 0 at 4·hr to 1 at hr
      if (p > best) best = p;
    }
  }
  return Math.max(0, Math.min(1, best));
}