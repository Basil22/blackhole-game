// render/objects/visualizer.js — ObjectVisualizer: builds the real 3D meshes
// for a physics object (rock/human/ship/planet) and deforms them frame-by-frame
// from the point network. When a spring tears, its segment hides and the pieces
// separate physically — the tear is real, not animated.
//
// Parts:
//   - segment = capsule/cylinder between two physics points
//   - ball    = sphere following a point (helmet, visor, cockpit)
//   - blade   = flat swept shape between two points (wings, fins)
//   - com     = one stretched solid at the center of mass (rock, planet)

import { _v1, _v2, _mid, _dir, _up, _quat, unitGeometry, placeAlong } from './geometry.js';
import { buildRock, buildHuman, buildShip, buildPlanet } from './builders.js';

const BUILDERS = { rock: buildRock, human: buildHuman, ship: buildShip, planet: buildPlanet };

export class ObjectVisualizer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.parts = [];
    this.materials = [];
    this.world = null;
    this.meta = null;
    this._initialSpan = 1;
    this._hr = 40;
  }

  // ---------- build ----------
  build(world, meta) {
    this.rebuild(world, meta);
  }

  rebuild(world, meta) {
    this.clear();
    this.world = world;
    this.meta = meta;
    this._hr = world.horizonRadius || 40;

    // compute initial span along the object's long axis (z in local build space)
    this._initialSpan = this._computeInitialSpan(world, meta);

    const build = BUILDERS[meta.kind];
    if (build) build(this, world, meta);
  }

  _springRest(world, ia, ib) {
    for (const s of world.springs) {
      if ((s.a === ia && s.b === ib) || (s.a === ib && s.b === ia)) return s.rest;
    }
    return 2;
  }

  _computeInitialSpan(world, meta) {
    const b = world.bodies;
    let min = Infinity, max = -Infinity;
    for (const i of meta.indices) {
      const z = b[i].pos.z;
      if (z < min) min = z;
      if (z > max) max = z;
    }
    return Math.max(max - min, 0.001);
  }

  _addPart(part) {
    if (!part.mesh) return;
    this.group.add(part.mesh);
    this.parts.push(part);
  }

  // ---------- per-frame update ----------
  update(world) {
    const b = world.bodies;
    for (const p of this.parts) {
      switch (p.type) {
        case 'segment': this._updSegment(p, b); break;
        case 'ball': this._updBall(p, b); break;
        case 'blade': this._updBlade(p, b); break;
        case 'com': this._updCom(p, b); break;
      }
    }
  }

  _updSegment(p, b) {
    const a = b[p.a], bb = b[p.b];
    if (!a.alive || !bb.alive) { p.mesh.visible = false; return; }
    p.mesh.visible = true;
    _v1.copy(a.pos); _v2.copy(bb.pos);
    _mid.copy(_v1).add(_v2).multiplyScalar(0.5);
    _dir.copy(_v2).sub(_v1);
    const len = _dir.length() || 1e-4;
    // thinning as it stretches: real spaghettification volume trick.
    // stretch = len / restLen, cross ∝ 1/sqrt(stretch)
    // amplified the same way as the com blobs so chains read dramatic too
    const restLen = p.restLen || p.radius * 2;
    const stretch = len / Math.max(restLen, 1e-3);
    const dist = _mid.length();
    const prox = Math.min(1, (this._hr || 40) / Math.max(dist, 1));
    const amp = Math.min(12, Math.pow(Math.max(stretch, 1), 2.6) * (1 + 6 * prox * prox * prox));
    const cross = p.radius * Math.max(0.06, Math.min(1, 1 / Math.sqrt(Math.max(amp, 1))));
    placeAlong(p.mesh, _mid, _dir, restLen * Math.max(amp, 1), cross);
  }

  _updCom(p, b) {
    // center of mass + radial span
    let cx = 0, cy = 0, cz = 0, count = 0;
    for (const pt of b) { if (!pt.alive) continue; cx += pt.pos.x; cy += pt.pos.y; cz += pt.pos.z; count++; }
    if (!count) { p.mesh.visible = false; return; }
    p.mesh.visible = true;
    _v1.set(cx / count, cy / count, cz / count);
    // radial direction from hole (origin)
    _dir.copy(_v1).normalize();
    // span along radial
    let minD = Infinity, maxD = -Infinity;
    for (const pt of b) {
      if (!pt.alive) continue;
      const d = pt.pos.x * _dir.x + pt.pos.y * _dir.y + pt.pos.z * _dir.z;
      if (d < minD) minD = d;
      if (d > maxD) maxD = d;
    }
    const span = Math.max(maxD - minD, 0.001);
    const stretch = span / this._initialSpan;
    // volume-conserving spaghettification: length grows as it stretches,
    // cross-section shrinks as 1/sqrt(stretch). At rest stretch≈1 → sphere.
    // Visual amplification makes the elongation read clearly on screen.
    // Near the horizon the tide is huge and the plunge is fast, so amplify
    // with proximity to make the strand visibly elongate before consumption.
    const dist = _v1.length();
    const prox = Math.min(1, (this._hr || 40) / Math.max(dist, 1));
    const amp = Math.min(12, Math.pow(Math.max(stretch, 1), 2.6) * (1 + 6 * prox * prox * prox));
    const cross = p.baseRadius / Math.sqrt(Math.max(amp, 0.2));
    const len = p.baseRadius * amp;
    p.mesh.position.copy(_v1);
    _quat.setFromUnitVectors(_up, _dir);
    p.mesh.quaternion.copy(_quat);
    p.mesh.scale.set(cross, len, cross);
  }

  _updBall(p, b) {
    const a = b[p.a];
    if (!a.alive) { p.mesh.visible = false; return; }
    p.mesh.visible = true;
    _v1.copy(a.pos);
    if (p.b != null && b[p.b] && b[p.b].alive && p.offset) {
      _dir.copy(b[p.b].pos).sub(_v1).normalize();
      _v1.addScaledVector(_dir, p.offset);
    }
    p.mesh.position.copy(_v1);
    p.mesh.scale.setScalar(p.radius);
  }

  _updBlade(p, b) {
    const a = b[p.a], t = b[p.b];
    if (!a.alive || !t.alive) { p.mesh.visible = false; return; }
    p.mesh.visible = true;
    _v1.copy(a.pos); _v2.copy(t.pos);
    _mid.copy(_v1).add(_v2).multiplyScalar(0.5);
    _dir.copy(_v2).sub(_v1);
    const len = _dir.length() || 1e-4;
    p.mesh.position.copy(_mid);
    _quat.setFromUnitVectors(_up, _dir.clone().normalize());
    p.mesh.quaternion.copy(_quat);
    p.mesh.scale.set(p.chord, len, p.thick);
  }

  clear() {
    for (const m of this.materials) m.dispose();
    this.materials.length = 0;
    this.parts.length = 0;
    this.group.clear();
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}