// audit11.mjs — Phase 11A audit: sweep the CURRENT aim control space
// (aim.dx/dy) and compute launch speed, predicted state, periapsis, closest
// approach for each. Uses the exact pure prediction + classification the game
// uses. Answers: what states are reachable from the current input envelope?
import { BlackHoleWorld } from './js/physics.js';
import { calculateGuidance } from './js/game/guidance/index.js';

const MU = 12.288e6;
const HR = 40;
const R = Math.hypot(0, 19.2, 384);           // spawn radius
const vCirc = Math.sqrt(MU / R);
const vEsc = Math.sqrt(2 * MU / R);
console.log(`spawn R=${R.toFixed(2)}  vCirc=${vCirc.toFixed(2)}  vEsc=${vEsc.toFixed(2)}  escape=${(vEsc / vCirc).toFixed(3)}×vCirc`);

// Reimplementation of the CURRENT js/game/trajectory.js launchVelocity
// (identical math, self-contained so we can also scan beyond its clamps).
const up = { x: 0, y: 1, z: 0 };
const rad = { x: 0 / R, y: 19.2 / R, z: 384 / R };
const tang = {
  x: up.y * rad.z - up.z * rad.y,
  y: up.z * rad.x - up.x * rad.z,
  z: up.x * rad.y - up.y * rad.x,
};
const tlen = Math.hypot(tang.x, tang.y, tang.z);
const TANG = { x: tang.x / tlen, y: tang.y / tlen, z: tang.z / tlen };

function currentLaunch(dx, dy) {
  const tangFrac = Math.max(0.35, Math.min(0.43, 0.40 + dx * 0.0004));
  const radFrac = Math.max(0.05, Math.min(0.30, 0.12 + dy * 0.0004));
  return {
    vx: TANG.x * vCirc * tangFrac + rad.x * -vCirc * radFrac,
    vy: TANG.y * vCirc * tangFrac + (rad.y * -vCirc * radFrac) + 3.2,
    vz: TANG.z * vCirc * tangFrac + rad.z * -vCirc * radFrac,
    tangFrac, radFrac,
  };
}

function stateFor(vx, vy, vz) {
  const w = new BlackHoleWorld({ mu: MU, horizonRadius: HR });
  const g = calculateGuidance({ mu: MU, horizonRadius: HR, pos: { x: 0, y: 19.2, z: 384 }, vel: { x: vx, y: vy, z: vz } });
  return g.state;
}

console.log('\n=== CURRENT envelope ===');
// aim.dx range: what does the UI actually produce? drag accumulates dx*0.9 px.
// A full-width drag on 1280px ≈ 1280*0.9 ≈ 1150. On 390px phone ≈ 350.
for (const dx of [-2000, -500, -100, 0, 100, 500, 2000]) {
  for (const dy of [-2000, -500, -100, 0, 100, 500, 2000]) {
    const l = currentLaunch(dx, dy);
    const speed = Math.hypot(l.vx, l.vy, l.vz);
    const st = stateFor(l.vx, l.vy, l.vz);
    console.log(`dx=${String(dx).padStart(5)} dy=${String(dy).padStart(5)} tF=${l.tangFrac.toFixed(2)} rF=${l.radFrac.toFixed(2)} speed=${speed.toFixed(1)} (${(speed / vCirc).toFixed(2)}vc) -> ${st}`);
  }
  console.log('');
}

console.log('\n=== what raw speed would ESCAPING need? ===');
// tangential-only throw: state for speed = k * vCirc
for (const k of [0.5, 0.9, 1.0, 1.1, 1.3, 1.41, 1.5, 1.7, 2.0]) {
  const vx = TANG.x * vCirc * k;
  const vy = TANG.y * vCirc * k;
  const vz = TANG.z * vCirc * k;
  console.log(`k=${k.toFixed(2)} speed=${(vCirc * k).toFixed(1)} -> ${stateFor(vx, vy, vz)}`);
}
console.log('\n=== what tangential+small configs produce ORBITAL? ===');
for (const k of [0.98, 1.0, 1.02, 1.05]) {
  for (const rf of [0, 0.001, -0.001, 0.005]) {
    const vx = TANG.x * vCirc * k + rad.x * -vCirc * rf;
    const vy = TANG.y * vCirc * k + (rad.y * -vCirc * rf);
    const vz = TANG.z * vCirc * k + rad.z * -vCirc * rf;
    console.log(`k=${k.toFixed(2)} rf=${rf} speed=${(Math.hypot(vx, vy, vz)).toFixed(1)} -> ${stateFor(vx, vy, vz)}`);
  }
}