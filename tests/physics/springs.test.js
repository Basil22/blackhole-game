// physics/springs.test.js — spring force model, exercised through the integrator.
import assert from 'node:assert';
import { BlackHoleWorld } from '../../js/physics.js';
import { test } from './support.js';

// World with gravity off so only spring forces act. Place everything at z=100 so
// r >> horizon (25) and no consumption interferes with the test.
function springWorld(ax, bx) {
  const w = new BlackHoleWorld({ mu: 0, horizonRadius: 25 });
  const a = w.addPoint({ x: ax, y: 0, z: 100 }, 1, 0.5);
  const b = w.addPoint({ x: bx, y: 0, z: 100 }, 1, 0.5);
  return { w, a, b };
}

test('spring at rest length produces ~zero force', () => {
  const { w, a, b } = springWorld(0, 5);
  w.addSpringLen(a, b, 5, 1000, 0, 100); // rest == actual distance
  w.step();
  assert.ok(Math.abs(w.bodies[a].vel.x) < 1e-9, 'rest-length spring must impart ~0 velocity');
  assert.strictEqual(w.bodies[b].vel.x, 0);
});

test('stretched spring pulls masses together', () => {
  const { w, a, b } = springWorld(0, 10); // rest 2 -> heavily stretched
  w.addSpringLen(a, b, 2, 1000, 0, 100);
  w.step();
  assert.ok(w.bodies[a].vel.x > 0, `a pulled toward b (+x), got ${w.bodies[a].vel.x}`);
  assert.ok(w.bodies[b].vel.x < 0, `b pulled toward a (-x), got ${w.bodies[b].vel.x}`);
  assert.ok(Math.abs(w.bodies[a].vel.x) > 1, 'force must be meaningful, not infinitesimal');
});

test('compressed spring pushes masses apart', () => {
  const { w, a, b } = springWorld(0, 5); // rest 10 -> compressed
  w.addSpringLen(a, b, 10, 1000, 0, 100);
  w.step();
  assert.ok(w.bodies[a].vel.x < 0, `a pushed away (-x), got ${w.bodies[a].vel.x}`);
  assert.ok(w.bodies[b].vel.x > 0, `b pushed away (+x), got ${w.bodies[b].vel.x}`);
});

test('spring forces are equal and opposite', () => {
  const { w, a, b } = springWorld(0, 7);
  w.addSpringLen(a, b, 5, 800, 2, 100);
  w.step();
  const va = w.bodies[a].vel.x, vb = w.bodies[b].vel.x;
  assert.ok(Math.abs(va + vb) < 1e-9, `equal masses must get equal-opposite impulses: ${va} vs ${vb}`);
  assert.ok(va !== 0 && vb !== 0, 'there must actually be a force');
});