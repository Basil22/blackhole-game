// render/objects/geometry.js — shared scratch vectors, unit-shape cache,
// materials, and the place-along helper used by the object visualizers.

export const _v1 = new THREE.Vector3();
export const _v2 = new THREE.Vector3();
export const _mid = new THREE.Vector3();
export const _dir = new THREE.Vector3();
export const _up = new THREE.Vector3(0, 1, 0);
export const _quat = new THREE.Quaternion();

// ---------- unit shape cache ----------
const _geoCache = {};

export function unitGeometry(shape) {
  const key = shape;
  if (_geoCache[key]) return _geoCache[key];
  let g;
  switch (shape) {
    case 'asteroid': {
      // smooth lumpy potato — a proper asteroid, not jittered spikes
      g = new THREE.IcosahedronGeometry(1, 2);
      const pos = g.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const x = v.x, y = v.y, z = v.z;
        const n =
          0.16 * Math.sin(6.3 * x + 1.7) * Math.sin(4.1 * y) * Math.sin(5.2 * z + 2.9) +
          0.10 * Math.sin(9.0 * x - 2.2 + 3.6 * y) +
          0.07 * Math.cos(7.7 * z + 1.3 - 4.9 * x);
        v.multiplyScalar(1 + n);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      break;
    }
    case 'sphere':
      g = new THREE.SphereGeometry(1, 28, 20);
      break;
    case 'capsule':
      g = new THREE.CapsuleGeometry(1, 1, 6, 14);
      break;
    case 'cylinder':
      g = new THREE.CylinderGeometry(1, 1, 1, 24);
      break;
    case 'cone':
      g = new THREE.CylinderGeometry(0.45, 1, 1, 24);
      break;
    case 'blade':
      // Y-up flat blade: scaled to (chord, length, thickness) per part
      g = new THREE.BoxGeometry(1, 1, 0.12);
      break;
    default:
      g = new THREE.SphereGeometry(1, 8, 6);
  }
  _geoCache[key] = g;
  return g;
}

export function partMaterial(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.45,
    metalness: opts.metalness ?? 0.25,
    flatShading: false,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
}

// Orient mesh so +Y points along `dir`, place at `pos`, scale y by len.
export function placeAlong(mesh, pos, dir, len, crossR) {
  mesh.position.copy(pos);
  _quat.setFromUnitVectors(_up, dir.clone().normalize());
  mesh.quaternion.copy(_quat);
  mesh.scale.set(crossR, Math.max(len, 1e-4), crossR);
}