// physics/gravity.test.js — black hole gravity field
import assert from 'node:assert';
import { BlackHoleWorld, V3, gravityAcceleration } from '../../js/physics.js';
import { test } from './support.js';

const MU = 3e6;

function accel(v) {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: 25 });
  const out = V3.make(0, 0, 0);
  gravityAcceleration(w, out, v);
  return out;
}

test('gravity direction points toward the black hole', () => {
  const a = accel(V3.make(100, 0, 0));
  assert.ok(a.x < 0 && Math.abs(a.y) < 1e-9 && Math.abs(a.z) < 1e-9, `expected -x, got ${a.x}`);
  const b = accel(V3.make(-100, 50, 0));
  assert.ok(b.x > 0 && b.y < 0, `expected +x / -y, got ${b.x}, ${b.y}`);
});

test('gravity magnitude ≈ mu/r² at multiple distances', () => {
  for (const r of [30, 60, 120, 240]) {
    const a = accel(V3.make(r, 0, 0));
    const expect = MU / (r * r);
    const ratio = V3.length(a) / expect;
    assert.ok(ratio > 0.99 && ratio < 1.01, `r=${r}: got ${V3.length(a).toFixed(3)}, expect ${expect.toFixed(3)}`);
  }
});

test('gravity is softer (weaker) with distance — strictly decreasing', () => {
  const seq = [40, 80, 160, 320, 640].map((r) => V3.length(accel(V3.make(r, 0, 0))));
  for (let i = 1; i < seq.length; i++) {
    assert.ok(seq[i] < seq[i - 1], `expected strictly decreasing, ${seq[i]} >= ${seq[i - 1]}`);
  }
});

test('gravity near/at zero distance does not produce NaN or Infinity', () => {
  const p = accel(V3.make(1e-9, 0, 0));
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  const z = accel(V3.make(0, 0, 0));
  assert.ok(Number.isFinite(z.x) && Number.isFinite(z.y) && Number.isFinite(z.z));
});

test('tidal differential: acceleration ratio ≈ (r1/r2)²', () => {
  const r1 = 60, r2 = 120;
  const a1 = V3.length(accel(V3.make(r1, 0, 0)));
  const a2 = V3.length(accel(V3.make(r2, 0, 0)));
  const ratio = a1 / a2;
  const expect = (r2 / r1) ** 2; // a ∝ 1/r²
  assert.ok(Math.abs(ratio - expect) / expect < 0.01, `got ${ratio.toFixed(3)}, expect ${expect.toFixed(3)}`);
});