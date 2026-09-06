// phase26/common.js — shared starfields + tiny helpers for the prototype modes.

export function makeStarfield(scene) {
  const g = new THREE.BufferGeometry();
  const N = 600;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 4000;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 4000;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 4000;
    const c = 0.5 + Math.random() * 0.5;
    col[i * 3] = c; col[i * 3 + 1] = c; col[i * 3 + 2] = c;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({
    size: 3, sizeAttenuation: true, vertexColors: true,
    depthWrite: false, transparent: true, opacity: 0.9,
  });
  const pts = new THREE.Points(g, m);
  scene.add(pts);
  return pts;
}

export function makeGlow(scene, radius, color, opacity) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},0.9)`);
  grad.addColorStop(0.4, `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},0.25)`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(radius, radius, 1);
  scene.add(s);
  return s;
}

// Soft radial falloff around the horizon for ring meshes so the rim reads as a
// lensed edge rather than a hard geometric circle.
export const RING_AA = `
  float rimsoft(float r, float inner, float outer) {
    float t = clamp((r - inner) / (outer - inner), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }
`;
