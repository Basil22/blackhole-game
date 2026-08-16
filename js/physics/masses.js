// physics/masses.js — the two primitives of the simulation: PointMass and Spring.

import { V3 } from './vec3.js';

export class PointMass {
  constructor(pos, mass = 1, radius = 0.5) {
    this.pos = V3.clone(pos);
    this.prev = V3.clone(pos);
    this.vel = V3.make();
    this.mass = mass;
    this.radius = radius;
    this.alive = true;
  }
}

export class Spring {
  constructor(a, b, restLength, stiffness, damping, breakStrain, color = 0xffffff) {
    this.a = a;          // index into bodies
    this.b = b;
    this.rest = restLength;
    this.stiff = stiffness;
    this.damp = damping;
    this.breakStrain = breakStrain; // max (len/rest) before snapping
    this.color = color;
    this.alive = true;
  }
}