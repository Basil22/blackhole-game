// game/sim.js — fixed-timestep time integration for the game loop.

export const PHYS_DT = 1 / 240;
const MAX_STEPS = 6;

// Accumulate real time (scaled by timeScale) and emit a small number of fixed
// physics steps. Returns how many steps to run.
export function makeStepper() {
  let accumulator = 0;
  return {
    stepCount(dtReal) {
      accumulator += dtReal;
      let n = 0;
      while (accumulator >= PHYS_DT && n < MAX_STEPS) {
        n++;
        accumulator -= PHYS_DT;
      }
      if (n >= MAX_STEPS) accumulator = 0;
      return n;
    },
  };
}