// objects.js — Chain templates for throwable objects.
// Each builder creates the point/spring network in a world, scaled by `size`,
// and returns metadata for the renderer (colors, radii, joint structure).
import { buildStar } from './physics.js';

// All objects are built in local space, then translated/rotated by the caller
// so they point radially toward the black hole for maximum spaghettification drama.

export const CATALOG = [
  {
    id: 'rock',
    name: 'Asteroid',
    icon: '🪨',
    desc: 'A lumpy asteroid. Sturdy — stretches hard before snapping.',
    build: (world, origin, size = 1) => {
      // compact lumpy cluster (not a chain) so it looks like a boulder at rest,
      // then tidally stretches into a stream near the hole.
      const radius = 2.5 * size;
      const idx = buildStar(world, origin, {
        points: 12,
        radius,
        stiffness: 250 * size,
        damping: 8,
        breakStrain: 1.2,
        shellBreakStrain: 1.8,
        mass: 1.2 * size,
        color: 0x9a8f7c,
      });
      return { indices: idx, kind: 'rock', size, color: 0x8d8578, baseRadius: radius };
    },
  },
  {
    id: 'human',
    name: 'Astronaut',
    icon: '👨‍🚀',
    desc: 'An articulated astronaut. Arms, legs, and suit stretch and tear under tidal stress.',
    build: (world, origin, size = 1) => {
      const s = size;
      // Figure runs along +z (away from the hole at spawn): feet at the low end,
      // head at the high end. y is front(+)/back(-), x is left(-)/right(+).
      const at = (dx, dy, dz) =>
        world.addPoint({ x: origin.x + dx * s, y: origin.y + dy * s, z: origin.z + dz * s }, 0.6 * s, 0.22 * s);
      const lHip = at(-0.28, 0, 0);
      const rHip = at(0.28, 0, 0);
      const pelvis = at(0, 0, 0.1);
      const waist = at(0, 0, 0.7);
      const chest = at(0, 0.03, 1.3);
      const shoulders = at(0, 0, 1.9);
      const head = at(0, 0.03, 2.35);
      const lKnee = at(-0.36, 0, -0.85);
      const rKnee = at(0.36, 0, -0.85);
      const lFoot = at(-0.36, 0, -1.55);
      const rFoot = at(0.36, 0, -1.55);
      const shL = at(-0.42, 0.05, 1.85);
      const shR = at(0.42, 0.05, 1.85);
      const elbL = at(-0.85, 0.22, 1.6);
      const elbR = at(0.85, 0.22, 1.6);
      const handL = at(-1.15, 0.3, 0.9);
      const handR = at(1.15, 0.3, 0.9);
      const pack = at(-0.3, -0.18, 1.25);
      const stiff = 180 * s, damp = 4;
      const spr = (a, b, st, br = 1.5) => world.addSpring(a, b, st, damp, br, 0xd8d8e8);
      // pelvis ring
      spr(pelvis, lHip, stiff); spr(pelvis, rHip, stiff);
      spr(lHip, waist, stiff); spr(rHip, waist, stiff);
      // legs
      spr(lHip, lKnee, stiff); spr(lKnee, lFoot, stiff);
      spr(rHip, rKnee, stiff); spr(rKnee, rFoot, stiff);
      // torso
      spr(pelvis, waist, stiff); spr(waist, chest, stiff); spr(chest, shoulders, stiff);
      // arms
      spr(chest, shL, stiff); spr(chest, shR, stiff);
      spr(shL, head, stiff); spr(shR, head, stiff);
      spr(shL, elbL, stiff); spr(elbL, handL, stiff);
      spr(shR, elbR, stiff); spr(elbR, handR, stiff);
      // backpack
      spr(chest, pack, 140 * s);
      const all = [lHip, rHip, pelvis, waist, chest, shoulders, head, lKnee, rKnee, lFoot, rFoot, shL, shR, elbL, elbR, handL, handR, pack];
      return {
        indices: all, kind: 'human', size: s, color: 0xe8ecf5,
        skeleton: {
          pelvis, waist, chest, shoulders, head,
          armL: [shL, elbL, handL], armR: [shR, elbR, handR],
          legL: [lHip, lKnee, lFoot], legR: [rHip, rKnee, rFoot],
          pack,
        },
      };
    },
  },
  {
    id: 'ship',
    name: 'Starship',
    icon: '🚀',
    desc: 'A starship. Hull, swept wings, and fins — wings shear off first under tidal stress.',
    build: (world, origin, size = 1) => {
      const s = size, len = 12 * s;
      const idx = [];
      const addPt = (dx, dy, dz, m, r) =>
        world.addPoint({ x: origin.x + dx, y: origin.y + dy, z: origin.z + dz }, m, r);
      const nose = addPt(0, 0, 0, 3 * s, 0.9 * s);
      const mid = addPt(0, 0, len * 0.45, 3.5 * s, 1.1 * s);
      const tail = addPt(0, 0, len, 3 * s, 1.0 * s);
      // swept wings with a slight dihedral (tips up) so they read in 3D
      const wingL = addPt(-6.5 * s, 0.25 * s, len * 0.42, 1.2 * s, 0.3 * s);
      const wingR = addPt(6.5 * s, 0.25 * s, len * 0.42, 1.2 * s, 0.3 * s);
      // vertical stabilizers give the hull a real cross-section
      const finTop = addPt(0, 1.9 * s, len * 0.40, 1.2 * s, 0.3 * s);
      const finBot = addPt(0, -1.4 * s, len * 0.40, 1.2 * s, 0.3 * s);
      for (const i of [nose, mid, tail, wingL, wingR, finTop, finBot]) idx.push(i);

      const stiff = 450 * s, damp = 6;
      const spr = (a, b, st, br, color) => world.addSpring(a, b, st, damp, br, color);
      spr(nose, mid, stiff, 1.5, 0x8fa8c8);
      spr(mid, tail, stiff, 1.5, 0x8fa8c8);
      spr(mid, finTop, 300 * s, 1.2, 0x5a6a80);
      spr(mid, finBot, 300 * s, 1.2, 0x5a6a80);
      spr(mid, wingL, 120 * s, 0.8, 0xd06050);
      spr(mid, wingR, 120 * s, 0.8, 0xd06050);
      return {
        indices: idx, kind: 'ship', size: s, color: 0x8fa8c8, baseRadius: 1.1 * s,
        special: { nose, mid, tail, wingL, wingR, finTop, finBot },
      };
    },
  },
  {
    id: 'planet',
    name: 'Planet',
    icon: '🌍',
    desc: 'A fragile sphere of 30 particles. Tidal forces shred it into a stream.',
    build: (world, origin, size = 1) => {
      const radius = 5 * size;
      const idx = buildStar(world, origin, {
        points: 30,
        radius,
        stiffness: 20 * size,
        damping: 0.4,
        breakStrain: 0.5,
        shellBreakStrain: 0.8,
        brace: true,
        mass: size,
        color: 0x7ab8ff,
      });
      return { indices: idx, kind: 'planet', size, color: 0x7ab8ff, baseRadius: radius };
    },
  },
];

export function getObjectDef(id) {
  return CATALOG.find((d) => d.id === id);
}
