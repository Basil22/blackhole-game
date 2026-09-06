// game/aiming/simProfile.js — measured real-sim survival bands per object.
// Three.js-free, DOM-free, deterministic. The point-mass guidance prediction is
// analytically generous: the REAL spring-mass sim (tidal energy losses + in-flight
// drag) swallows far more throws than the orbit equation predicts. These numbers
// are measured by bisecting the full sim (size 1, dy=0):
//   orbitFloor — lowest tangential multiple where the object is NOT consumed.
//                Below it (real sim) the object plunges into the horizon.
//   escapeAt   — the shared ESCAPE_TANGF from mapping.js (the real escape rim).
// Everything at or above escapeAt escapes; orbitFloor .. escapeAt is a surviving
// bound pass. Between them the real outcome arcs from a swallowed pass to a
// clean wide orbit as power rises — one monotone band, honest to the sim.

import { ESCAPE_TANGF } from './mapping.js';

export const OBJECT_SIM_PROFILES = Object.freeze({
  rock:   Object.freeze({ orbitFloor: 1.03, escapeAt: ESCAPE_TANGF }),
  human:  Object.freeze({ orbitFloor: 1.25, escapeAt: ESCAPE_TANGF }),
  ship:   Object.freeze({ orbitFloor: 1.25, escapeAt: ESCAPE_TANGF }),
  planet: Object.freeze({ orbitFloor: 1.27, escapeAt: ESCAPE_TANGF }),
});