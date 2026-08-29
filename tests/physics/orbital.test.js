// physics/orbital.test.js — escape velocity + two-body orbital quantities.
import assert from 'node:assert';
import { escapeVelocityAt, velocityRelativeToEscape, orbitalInfo } from '../../js/physics.js';
import { test } from './support.js';

const MU = 12.288e6;

test('escapeVelocityAt matches sqrt(2mu/r)', () => {
  for (const r of [40, 100, 300, 1000]) {
    assert.strictEqual(escapeVelocityAt(MU, r), Math.sqrt((2 * MU) / r), `r=${r}`);
  }
});

test('velocityRelativeToEscape verdicts: below / at / above', () => {
  const pos = { x: 0, y: 0, z: 300 };
  const vEsc = escapeVelocityAt(MU, 300);
  const below = velocityRelativeToEscape({ mu: MU, pos, vel: { x: 0, y: 0, z: vEsc / 2 } });
  assert.strictEqual(below.verdict, 'below');
  assert.ok(below.ratio < 1);
  const at = velocityRelativeToEscape({ mu: MU, pos, vel: { x: 0, y: 0, z: vEsc } });
  assert.strictEqual(at.verdict, 'at');
  assert.ok(Math.abs(at.ratio - 1) < 1e-9);
  const above = velocityRelativeToEscape({ mu: MU, pos, vel: { x: 0, y: 0, z: vEsc * 1.5 } });
  assert.strictEqual(above.verdict, 'above');
  assert.ok(above.ratio > 1);
});

test('orbitalInfo energy sign separates bound from unbound', () => {
  const bound = orbitalInfo({ mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 200, y: 0, z: 0 } });
  assert.ok(bound.energy < 0 && bound.bound === true);
  const unbound = orbitalInfo({ mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 0, y: 0, z: 600 } });
  assert.ok(unbound.energy > 0 && unbound.bound === false);
});

test('orbitalInfo angular momentum: tangential nonzero, radial zero', () => {
  const tan = orbitalInfo({ mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 200, y: 0, z: 0 } });
  assert.ok(tan.angularMomentum > 0, 'tangential motion carries angular momentum');
  const rad = orbitalInfo({ mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 0, y: 0, z: -200 } });
  assert.ok(rad.angularMomentum < 1e-6, 'radial motion has ~zero angular momentum');
});

test('orbitalInfo periapsis of a near-circular orbit ≈ start radius', () => {
  const o = orbitalInfo({ mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: Math.sqrt(MU / 300), y: 0, z: 0 } });
  assert.ok(Math.abs(o.periapsis - 300) < 1, `expected periapsis ~300, got ${o.periapsis}`);
  assert.ok(o.apoapsis > o.periapsis, 'apoapsis beyond periapsis');
});

test('orbitalInfo radialDirection from r . v', () => {
  assert.strictEqual(orbitalInfo({ mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 0, y: 0, z: -50 } }).radialDirection, 'infalling');
  assert.strictEqual(orbitalInfo({ mu: MU, pos: { x: 0, y: 0, z: 300 }, vel: { x: 0, y: 0, z: 50 } }).radialDirection, 'outgoing');
});