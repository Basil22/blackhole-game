// render/objects/visualizer.js — ObjectVisualizer: builds the real 3D meshes
// for a physics object (rock/human/ship/planet) and deforms them frame-by-frame
// from the point network. When a spring tears, its segment hides and the pieces
// separate physically — the tear is real, not animated.
//
// Parts:
//   - segment = capsule/cylinder between two physics points
//   - ball    = sphere following a point (helmet, visor, cockpit)
//   - blade   = flat swept shape between two points (wings, fins)
//   - com     = one stretched solid per CONNECTED FRAGMENT (rock, planet)
//   - cloud   = one instanced sphere set for leftover single points
//
// Com/rock/planet rendering is fragment-aware: the graph of alive springs is
// union-find'ed each frame, the largest fragment gets the primary solid, other
// fragments get bounded spare solids, and any leftover single points render as
// an instanced point-cloud. All solids are bounding ellipsoids of the fragment's
// ACTUAL point positions (no amplification), so the mesh follows the physics.
// Mesh count is bounded (primary + 4 spare + 1 instance mesh), no per-frame
// allocation, no mesh-per-point.

import { _v1, _v2, _mid, _dir, _up, _quat, unitGeometry, placeAlong } from './geometry.js';
import { buildRock, buildHuman, buildShip, buildPlanet } from './builders.js';

const BUILDERS = { rock: buildRock, human: buildHuman, ship: buildShip, planet: buildPlanet };

const SPARE_COMS = 4;

export class ObjectVisualizer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.parts = [];
    this.materials = [];
    this.world = null;
    this.meta = null;
    this._hr = 40;
    this._comParts = [];
    this._cloudMesh = null;
    this._radial = new THREE.Vector3();
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

    const build = BUILDERS[meta.kind];
    if (build) build(this, world, meta);

    // fragment-aware rig for com-built objects (rock, planet)
    if (this._comParts.length) this._initFragmentRig(world, meta);
  }

  _springRest(world, ia, ib) {
    for (const s of world.springs) {
      if ((s.a === ia && s.b === ib) || (s.a === ib && s.b === ia)) return s.rest;
    }
    return 2;
  }

  _addPart(part) {
    if (!part.mesh) return;
    if (part.type === 'com') this._comParts.push(part);
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
        // 'com' and 'cloud' handled by _updateFragments
      }
    }
    if (this._comParts.length) this._updateFragments(world);
  }

  _updSegment(p, b) {
    const a = b[p.a], bb = b[p.b];
    if (!a.alive || !bb.alive) { p.mesh.visible = false; return; }
    p.mesh.visible = true;
    _v1.copy(a.pos); _v2.copy(bb.pos);
    _mid.copy(_v1).add(_v2).multiplyScalar(0.5);
    _dir.copy(_v2).sub(_v1);
    const len = _dir.length() || 1e-4;
    // follow the physics: the segment spans the two real points at TRUE length.
    // thinning = volume-conserving spaghettification cross-section.
    const restLen = p.restLen || p.radius * 2;
    const stretch = len / Math.max(restLen, 1e-3);
    // Volume-conserving cross-section thinning: cap stretch factor so segments
    // don't become infinitely thin threads (they should tear before reaching this).
    const amp = Math.min(3, Math.max(stretch, 1));
    const cross = p.radius * Math.max(0.12, Math.min(1, 1 / Math.sqrt(amp)));
    placeAlong(p.mesh, _mid, _dir, len, cross);
    // Absorption visual: fade + color shift based on capture progress of endpoints
    const capA = a.captureProgress || 0, capB = bb.captureProgress || 0;
    const cap = Math.max(capA, capB);
    if (cap > 0 && p.mesh.material) {
      p.mesh.material.opacity = Math.max(0.05, 1 - cap * 0.9);
      p.mesh.material.transparent = true;
      // Color shift: base → warm orange → dim red as stretch + capture increase
      const stretchGlow = Math.min(1, (stretch - 1) / 4);
      const r = Math.min(1, p.mesh.material._baseR != null ? p.mesh.material._baseR : 0.8);
      const shift = Math.max(stretchGlow, cap);
      if (shift > 0.1) {
        p.mesh.material.emissive = p.mesh.material.emissive || new THREE.Color();
        p.mesh.material.emissive.setRGB(shift * 0.6, shift * 0.15, 0);
        p.mesh.material.emissiveIntensity = shift * 0.8;
      }
    }
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
    // Shrink + fade as the point is being absorbed
    const cap = a.captureProgress || 0;
    const scale = p.radius * (1 - cap * 0.8);
    p.mesh.scale.setScalar(Math.max(0.01, scale));
    if (cap > 0 && p.mesh.material) {
      p.mesh.material.opacity = Math.max(0.05, 1 - cap * 0.9);
      p.mesh.material.transparent = true;
    }
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
    _dir.normalize();
    _quat.setFromUnitVectors(_up, _dir);
    p.mesh.quaternion.copy(_quat);
    p.mesh.scale.set(p.chord, len, p.thick);
    // Absorption visual for blades
    const capA = a.captureProgress || 0, capB = t.captureProgress || 0;
    const cap = Math.max(capA, capB);
    if (cap > 0 && p.mesh.material) {
      p.mesh.material.opacity = Math.max(0.05, 1 - cap * 0.9);
      p.mesh.material.transparent = true;
    }
  }

  // ---------- fragment-aware com rendering ----------
  // union-find over alive springs -> connected fragments; the primary solid
  // tracks the largest fragment and each extra fragment gets a spare com until
  // the pool is exhausted (leftovers become point-cloud instances). Every
  // ellipsoid is the fragment's true bounding shape, so no amplification and no
  // bridging of disconnected pieces.

  _initFragmentRig(world, meta) {
    const n = world.bodies.length;
    this._uf = new Int32Array(n);       // union-find parent (-1 = unset)
    this._ufC = new Int32Array(n);      // component id per body
    this._ufRoot = new Int32Array(n);   // root -> component id map
    this._ufSet = new Uint8Array(n);    // covered-by-com flag
    this._order = new Int32Array(n);
    this._stCnt = new Int32Array(n);
    this._stMass = new Float64Array(n);
    this._stX = new Float64Array(n);
    this._stY = new Float64Array(n);
    this._stZ = new Float64Array(n);
    this._stMin = new Float64Array(n);
    this._stMax = new Float64Array(n);
    this._stTrans = new Float64Array(n);
    this._stCX = new Float64Array(n);
    this._stCY = new Float64Array(n);
    this._stCZ = new Float64Array(n);

    const primary = this._comParts[0].mesh;
    // spare solids share the primary geometry + material (1 material total)
    for (let k = 1; k <= SPARE_COMS; k++) {
      const com = new THREE.Mesh(primary.geometry, primary.material);
      com.visible = false;
      this._addPart({ type: 'com', mesh: com, baseRadius: this._comParts[0].baseRadius });
    }
    const cloud = new THREE.InstancedMesh(primary.geometry, primary.material, n);
    cloud.count = 0;
    cloud.frustumCulled = false; // points move — stale bounding sphere would cull
    this._cloudMesh = cloud;
    cloud.instanceMatrix.array.fill(0);
    this._addPart({ type: 'cloud', mesh: cloud });
  }

  _updateFragments(world) {
    const b = world.bodies;
    const n = b.length;
    const parent = this._uf;
    const comp = this._ufC;

    for (let i = 0; i < n; i++) parent[i] = -1;

    const find = (x) => {
      let r = x;
      while (parent[r] !== r) r = parent[r];
      while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx; }
      return r;
    };

    // union alive spring endpoints
    for (const s of world.springs) {
      if (!s.alive) continue;
      const a = s.a, bb = s.b;
      if (!b[a].alive || !b[bb].alive) continue;
      if (parent[a] === -1) parent[a] = a;
      if (parent[bb] === -1) parent[bb] = bb;
      const ra = find(a), rb = find(bb);
      if (ra !== rb) parent[ra] = rb;
    }

    // assign component ids (single alive points become their own component)
    const rootMap = this._ufRoot;
    let cCount = 0;
    for (let i = 0; i < n; i++) {
      if (!b[i].alive) { comp[i] = -1; continue; }
      const r = parent[i] === -1 ? i : find(i);
      let id = -1;
      for (let k = 0; k < cCount; k++) if (rootMap[k] === r) { id = k; break; }
      if (id === -1) { id = cCount; rootMap[cCount] = r; cCount++; }
      comp[i] = id;
    }

    const comParts = this._comParts;
    if (cCount === 0) {
      for (const p of comParts) p.mesh.visible = false;
      if (this._cloudMesh) this._cloudMesh.count = 0;
      return;
    }

    // accumulate per-component stats
    const cnt = this._stCnt, mass = this._stMass;
    const sx = this._stX, sy = this._stY, sz = this._stZ;
    for (let k = 0; k < cCount; k++) { cnt[k] = 0; mass[k] = 0; sx[k] = 0; sy[k] = 0; sz[k] = 0; }
    for (let i = 0; i < n; i++) {
      const c = comp[i];
      if (c < 0) continue;
      const pt = b[i];
      cnt[c]++;
      mass[c] += pt.mass;
      sx[c] += pt.pos.x * pt.mass;
      sy[c] += pt.pos.y * pt.mass;
      sz[c] += pt.pos.z * pt.mass;
    }

    // radial span + transverse radius per component, measured from fragment COM
    for (let k = 0; k < cCount; k++) {
      if (cnt[k] < 1) continue;
      const m = mass[k];
      const cx = sx[k] / m, cy = sy[k] / m, cz = sz[k] / m;
      // Measure span along the longest axis of the fragment (PCA-lite: use the
      // axis from the COM to the BH center as the primary, then compute spread).
      const rl = Math.hypot(cx, cy, cz) || 1e-6;
      const ux = cx / rl, uy = cy / rl, uz = cz / rl;
      let minD = Infinity, maxD = -Infinity, trans2 = 0;
      for (let i = 0; i < n; i++) {
        if (comp[i] !== k) continue;
        // relative to fragment COM (not world origin) for accurate sizing
        const px = b[i].pos.x - cx, py = b[i].pos.y - cy, pz = b[i].pos.z - cz;
        const d = px * ux + py * uy + pz * uz;
        if (d < minD) minD = d;
        if (d > maxD) maxD = d;
        const perp2 = px * px + py * py + pz * pz - d * d;
        if (perp2 > trans2) trans2 = perp2;
      }
      this._stMin[k] = minD;
      this._stMax[k] = maxD;
      this._stTrans[k] = Math.sqrt(Math.max(trans2, 0));
      this._stCX[k] = cx; this._stCY[k] = cy; this._stCZ[k] = cz;
    }

    // order components by mass (largest first -> primary solid)
    const order = this._order;
    for (let k = 0; k < cCount; k++) order[k] = k;
    for (let i = 0; i < cCount; i++) {
      let best = i;
      for (let j = i + 1; j < cCount; j++) if (mass[order[j]] > mass[order[best]]) best = j;
      if (best !== i) { const t = order[i]; order[i] = order[best]; order[best] = t; }
    }

    // base radius for scaling cap — fragments never render larger than the
    // original object. Also scale cap per fragment by its mass fraction.
    const baseR = this._comParts[0].baseRadius || 5;
    const totalMass = mass.reduce ? (() => { let s = 0; for (let k = 0; k < cCount; k++) s += mass[k]; return s; })() : 1;

    // assign com solids (components with >=2 points, in mass order)
    const covered = this._ufSet;
    covered.fill(0);
    let assigned = 0;
    const comCount = comParts.length;
    for (let oi = 0; oi < cCount && assigned < comCount; oi++) {
      const k = order[oi];
      if (cnt[k] < 2) continue; // singles go to the point-cloud, never a com
      const part = comParts[assigned];
      const span = this._stMax[k] - this._stMin[k];
      const trans = this._stTrans[k];

      // Scale cap: fragment size proportional to its mass fraction of the
      // original, never exceeding the base radius. This prevents fragments
      // from appearing larger than the original object after tearing.
      const massFrac = totalMass > 0 ? mass[k] / totalMass : 1;
      const maxR = baseR * Math.max(massFrac, 0.15); // floor 15% so tiny fragments are visible
      const rScale = Math.min(Math.max(span / 2, 0.01), maxR);
      // Transverse: cap to the same limit, and enforce a minimum so the mesh
      // doesn't collapse to a flat disc (prevents 2D/3D flickering).
      const tScale = Math.min(Math.max(trans, rScale * 0.25), maxR);

      const cx = this._stCX[k], cy = this._stCY[k], cz = this._stCZ[k];
      const dist = Math.hypot(cx, cy, cz) || 1e-6;
      this._radial.set(cx / dist, cy / dist, cz / dist);
      part.mesh.visible = true;
      part.mesh.position.set(cx, cy, cz);
      _quat.setFromUnitVectors(_up, this._radial);
      part.mesh.quaternion.copy(_quat);
      part.mesh.scale.set(tScale, rScale, tScale);
      for (let i = 0; i < n; i++) if (comp[i] === k) covered[i] = 1;
      assigned++;
    }
    for (let k = assigned; k < comCount; k++) comParts[k].mesh.visible = false;

    // point-cloud instances for every alive point not covered by a com
    let inst = 0;
    for (let i = 0; i < n; i++) {
      if (comp[i] < 0 || covered[i]) continue;
      const pt = b[i];
      const s = Math.max(pt.radius * 1.2, 0.06);
      const o = inst * 16;
      const arr = this._cloudMesh.instanceMatrix.array;
      arr[o] = s; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = s; arr[o + 11] = 0;
      arr[o + 12] = pt.pos.x; arr[o + 13] = pt.pos.y; arr[o + 14] = pt.pos.z; arr[o + 15] = 1;
      inst++;
    }
    this._cloudMesh.count = inst;
    if (inst) this._cloudMesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const m of this.materials) m.dispose();
    this.materials.length = 0;
    this.parts.length = 0;
    this._comParts.length = 0;
    this._cloudMesh = null;
    this.group.clear();
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}