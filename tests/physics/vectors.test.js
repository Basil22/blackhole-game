// physics/vectors.test.js — V3 ops
import assert from 'node:assert';
import { V3 } from '../../js/physics.js';
import { test } from './support.js';

test('V3: make/clone/set/copy round-trip', () => {
  const a = V3.make(1, 2, 3);
  const b = V3.clone(a);
  assertEqual(a, b);
  V3.set(a, 5, 6, 7);
  assertEqual(a, V3.make(5, 6, 7));
  const c = V3.make(9, 9, 9);
  V3.copy(c, a);
  assertEqual(c, a);
});

test('V3: add/sub/scale/dot/lerp', () => {
  const a = V3.make(1, 2, 3);
  const b = V3.make(4, 5, 6);
  const o = V3.make();
  V3.add(o, a, b);
  assertEqual(o, V3.make(5, 7, 9));
  V3.sub(o, a, b);
  assertEqual(o, V3.make(-3, -3, -3));
  V3.scale(o, a, 2);
  assertEqual(o, V3.make(2, 4, 6));
  assert.strictEqual(V3.dot(a, b), 4 + 10 + 18);
  V3.lerp(o, a, b, 1);
  assertEqual(o, b);
  V3.lerp(o, a, b, 0);
  assertEqual(o, a);
});

test('V3: normalize/length/lengthSq', () => {
  const a = V3.make(3, 4, 0);
  assert.strictEqual(V3.length(a), 5);
  assert.strictEqual(V3.lengthSq(a), 25);
  V3.normalize(a, a);
  assert.ok(Math.abs(V3.length(a) - 1) < 1e-15);
});

function assertEqual(got, want) {
  assert.strictEqual(got.x, want.x);
  assert.strictEqual(got.y, want.y);
  assert.strictEqual(got.z, want.z);
}