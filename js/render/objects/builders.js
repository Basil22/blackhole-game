// render/objects/builders.js — per-kind mesh builders. Each function builds
// the parts (segments/balls/blades/com) for one object kind from its skeleton.

import { unitGeometry, partMaterial } from './geometry.js';

export function buildRock(vis, world, meta) {
  const mat = partMaterial(0x8d8578, { roughness: 0.9, metalness: 0.05 });
  const patchMat = partMaterial(0x5c5544, { roughness: 1, metalness: 0.0 });
  vis.materials.push(mat, patchMat);
  const mesh = new THREE.Mesh(unitGeometry('asteroid'), mat);
  vis._addPart({ type: 'com', mesh, baseRadius: meta.baseRadius ?? 2.5 });
}

export function buildHuman(vis, world, meta) {
  const sk = meta.skeleton;
  const s = meta.size ?? 1;
  const suitMat = partMaterial(0xe8ecf5, { roughness: 0.4, metalness: 0.2 });
  const limbMat = partMaterial(0x8fa8c8, { roughness: 0.45, metalness: 0.25 });
  const visorMat = partMaterial(0x1a1f30, { roughness: 0.1, metalness: 0.4, emissive: 0x2a80c0, emissiveIntensity: 0.5 });
  const packMat = partMaterial(0x5a6a80, { roughness: 0.5, metalness: 0.3 });
  vis.materials.push(suitMat, limbMat, visorMat, packMat);

  const seg = (a, b, radius, mat) => {
    const mesh = new THREE.Mesh(unitGeometry('capsule'), mat);
    vis._addPart({ type: 'segment', mesh, a, b, radius: radius * s, restLen: vis._springRest(world, a, b) });
  };
  const ball = (a, radius, mat, b, offset = 0) => {
    const mesh = new THREE.Mesh(unitGeometry('sphere'), mat);
    vis._addPart({ type: 'ball', mesh, a, b: b ?? null, offset, radius: radius * s });
  };

  // torso
  seg(sk.pelvis, sk.waist, 0.30, suitMat);
  seg(sk.waist, sk.chest, 0.34, suitMat);
  seg(sk.chest, sk.shoulders, 0.30, suitMat);
  // legs
  seg(sk.legL[0], sk.legL[1], 0.17, limbMat);
  seg(sk.legL[1], sk.legL[2], 0.15, limbMat);
  seg(sk.legR[0], sk.legR[1], 0.17, limbMat);
  seg(sk.legR[1], sk.legR[2], 0.15, limbMat);
  // arms
  seg(sk.armL[0], sk.armL[1], 0.13, limbMat);
  seg(sk.armL[1], sk.armL[2], 0.11, limbMat);
  seg(sk.armR[0], sk.armR[1], 0.13, limbMat);
  seg(sk.armR[1], sk.armR[2], 0.11, limbMat);
  // helmet + visor (visor offsets "front", toward the hole)
  ball(sk.head, 0.26, suitMat, sk.head, 0);
  ball(sk.head, 0.185, visorMat, sk.pelvis, 0.10 * s);
  // backpack + glove hands
  ball(sk.pack, 0.20, packMat);
  ball(sk.armL[2], 0.10, suitMat);
  ball(sk.armR[2], 0.10, suitMat);
}

export function buildShip(vis, world, meta) {
  const p = meta.special;
  const s = meta.size ?? 1;
  const hullMat = partMaterial(0x9fb4cc, { roughness: 0.35, metalness: 0.5 });
  const darkMat = partMaterial(0x5a6a80, { roughness: 0.4, metalness: 0.3 });
  const wingMat = partMaterial(0xd06050, { roughness: 0.4, metalness: 0.2 });
  const cockpitMat = partMaterial(0x8fd8ff, { roughness: 0.1, metalness: 0.2, emissive: 0x2a80c0, emissiveIntensity: 0.6 });
  vis.materials.push(hullMat, darkMat, wingMat, cockpitMat);

  // nose cone + main hull
  const nose = new THREE.Mesh(unitGeometry('cone'), hullMat);
  vis._addPart({ type: 'segment', mesh: nose, a: p.nose, b: p.mid, radius: 0.9 * s, restLen: vis._springRest(world, p.nose, p.mid) });
  const hull = new THREE.Mesh(unitGeometry('cylinder'), hullMat);
  vis._addPart({ type: 'segment', mesh: hull, a: p.mid, b: p.tail, radius: 1.1 * s, restLen: vis._springRest(world, p.mid, p.tail) });
  // cockpit on top of the hull
  const cockpit = new THREE.Mesh(unitGeometry('sphere'), cockpitMat);
  vis._addPart({ type: 'ball', mesh: cockpit, a: p.mid, b: p.finTop, offset: 0.5 * s, radius: 0.55 * s });
  // swept wings — real flat shapes spanning root->tip, thin section
  for (const tip of [p.wingL, p.wingR]) {
    const wing = new THREE.Mesh(unitGeometry('blade'), wingMat);
    vis._addPart({ type: 'blade', mesh: wing, a: p.mid, b: tip, chord: 3.2 * s, thick: 0.2 * s });
    const dot = new THREE.Mesh(unitGeometry('sphere'), darkMat);
    vis._addPart({ type: 'ball', mesh: dot, a: tip, radius: 0.28 * s });
  }
  // vertical stabilizers
  for (const tip of [p.finTop, p.finBot]) {
    const fin = new THREE.Mesh(unitGeometry('blade'), darkMat);
    vis._addPart({ type: 'blade', mesh: fin, a: p.mid, b: tip, chord: 2.2 * s, thick: 0.18 * s });
  }
}

export function buildPlanet(vis, world, meta) {
  const mat = partMaterial(0x7ab8ff, { roughness: 0.6, metalness: 0.0 });
  vis.materials.push(mat);
  const mesh = new THREE.Mesh(unitGeometry('sphere'), mat);
  vis._addPart({ type: 'com', mesh, baseRadius: meta.baseRadius ?? 5.0 });
}