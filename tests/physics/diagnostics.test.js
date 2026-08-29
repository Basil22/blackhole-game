// physics/diagnostics.test.js — diagnose() metrics + tidal measurement
import assert from 'node:assert';
import { BlackHoleWorld, diagnose, buildChain } from '../../js/physics.js';
import { test } from './support.js';

const MU = 3e6;
const HORIZON = 25;

test('diagnose() reports the full metric set', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
  buildChain(w, { x: 0, y: 0, z: 120 }, { x: 0, y: 0, z: 132 }, 6, { stiffness: 800, damping: 8, breakStrain: 0.2 });
  for (let i = 0; i < 30; i++) w.step();
  const d = diagnose(w);
  const keys = ['simTime', 'aliveCount', 'aliveMass', 'totalMass', 'springCount', 'com',
    'maxSpringExtension', 'maxStrain', 'maxVelocity', 'maxVelocityIndex', 'minDistToBH',
    'minDistIndex', 'maxTidalAccelDiff'];
  const missing = keys.filter((k) => !(k in d));
  assert.deepStrictEqual(missing, [], `diagnose missing keys: ${missing.join(', ')}`);
  assert.ok(Number.isFinite(d.simTime) && Number.isFinite(d.aliveMass) && Number.isFinite(d.maxStrain));
  assert.ok(d.aliveCount <= w.bodies.length, 'aliveCount cannot exceed bodies');
});

test('tidal differential acceleration is measured by diagnose()', () => {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HORIZON });
  buildChain(w, { x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: 112 }, 2, { stiffness: 800, damping: 8, breakStrain: 100 });
  const d = diagnose(w);
  const g1 = MU / (100 * 100), g2 = MU / (112 * 112);
  const tidalDiff = g1 - g2; // inner point feels the stronger pull
  assert.ok(d.maxTidalAccelDiff > tidalDiff * 0.9 && d.maxTidalAccelDiff < tidalDiff * 1.1,
    `tidal diff ${d.maxTidalAccelDiff.toFixed(3)} vs expected ~${tidalDiff.toFixed(3)}`);
});