// game/loop.js — the requestAnimationFrame loop: fixed-timestep physics,
// frame update of scene/particles/objects, and the readout. Operates on the
// Game instance, which owns all the state.

import { makeStepper, PHYS_DT } from './sim.js';
import { computeSpan } from './spawn.js';
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
      const span = computeSpan(o.world);
      if (span > o.telemetry.maxSpan) o.telemetry.maxSpan = span;
      const com = o.world.centerOfMass();
      o.telemetry.dist = Math.hypot(com.x, com.y, com.z);
    }
    if (game.state === 'aim') {
      // update the held telemetry so the readout stays live pre-throw
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

    game.scene.update(dtReal, game.simTime);
    game.particles.update(dtReal);

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
        o.visualizer.dispose();
        game.objects.splice(i, 1);
      }
    }
    if (game.state === 'flying' && game.objects.length === 0) {
      game.state = 'idle';
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
      o.telemetry.tears++;
      game.particles.tear(ev.pos, ev.vel, o.color ?? 0xffa040);
    } else if (ev.type === 'consume') {
      o.telemetry.consumed++;
      // Glow at the horizon rim where matter visibly disappears — sized to
      // the object so a planet bigger than the hole ignites a big engulfing
      // flash instead of a sub-pixel pop.
      game.particles.horizonRim(ev.pos, o.world.horizonRadius, o.meta?.baseRadius || 0);
    }
  }
}