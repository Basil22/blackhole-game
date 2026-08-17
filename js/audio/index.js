// audio/index.js — barrel for the BLACK HOLE audio layer.
//
// `createAudioSystem()` builds the three cooperating pieces and wires them
// together. The game calls semantic events through `feedback` only
// (`feedback.tap('select')`, `feedback.launch()`, ...); nothing else in the
// codebase touches AudioContext or navigator.vibrate directly.

import { AudioEngine } from './audio.js';
import { Haptics } from './haptics.js';
import { Feedback } from './feedback.js';

export { AudioEngine, Haptics, Feedback };
export { SOUNDS, HAPTIC_MAP, EVENT_CONFIG, objectTone } from './sounds.js';

export function createAudioSystem(env = {}) {
  const engine = env.engine || new AudioEngine();
  const haptics = env.haptics || new Haptics({
    vibrate: typeof navigator !== 'undefined' && navigator.vibrate
      ? navigator.vibrate.bind(navigator)
      : undefined,
  });
  const feedback = new Feedback({
    playSound: (name, opts) => engine.play(name, opts),
    vibrate: (gesture) => haptics[gesture] && haptics[gesture](),
  });

  return {
    engine,
    haptics,
    feedback,
    unlock: () => engine.unlock(),
    suspend: () => engine.suspend(),
    resume: () => engine.resume(),
    dispose: () => engine.dispose(),
    setMuted: (m) => {
      engine.setMuted(m);
      feedback.setMuted(m);
    },
    isMuted: () => engine.isMuted(),
    setProximity: (k) => engine.setProximity(k),
    // convenience for the game layer
    tap: (name, opts) => feedback.tap(name, opts),
    play: (name, opts) => feedback.play(name, opts),
    launch: (opts) => feedback.launch(opts),
    horizon: () => feedback.horizon(),
    tear: (opts) => feedback.tear(opts),
    capture: () => feedback.capture(),
    escape: () => feedback.escape(),
    missionComplete: () => feedback.missionComplete(),
    missionFailed: () => feedback.missionFailed(),
    missionUnlock: () => feedback.missionUnlock(),
    aimStart: () => feedback.aimStart(),
    aimState: () => feedback.aimState(),
    aimHigh: () => feedback.aimHigh(),
    slider: () => feedback.slider(),
    cancel: () => feedback.cancel(),
  };
}
