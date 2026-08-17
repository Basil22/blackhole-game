// physics/vec3.js — minimal 3-vector math on plain {x,y,z} objects.
// No allocations beyond the caller-provided `out`.

export const V3 = {
  make(x = 0, y = 0, z = 0) { return { x, y, z }; },
  clone(v) { return { x: v.x, y: v.y, z: v.z }; },
  set(out, x, y, z) { out.x = x; out.y = y; out.z = z; return out; },
  copy(out, v) { out.x = v.x; out.y = v.y; out.z = v.z; return out; },
  add(out, a, b) { out.x = a.x + b.x; out.y = a.y + b.y; out.z = a.z + b.z; return out; },
  sub(out, a, b) { out.x = a.x - b.x; out.y = a.y - b.y; out.z = a.z - b.z; return out; },
  scale(out, a, s) { out.x = a.x * s; out.y = a.y * s; out.z = a.z * s; return out; },
  dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; },
  cross(out, a, b) {
    out.x = a.y * b.z - a.z * b.y;
    out.y = a.z * b.x - a.x * b.z;
    out.z = a.x * b.y - a.y * b.x;
    return out;
  },
  length(v) { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); },
  lengthSq(v) { return v.x * v.x + v.y * v.y + v.z * v.z; },
  normalize(out, v) {
    const l = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
    out.x = v.x / l; out.y = v.y / l; out.z = v.z / l;
    return out;
  },
  lerp(out, a, b, t) {
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    out.z = a.z + (b.z - a.z) * t;
    return out;
  },
};