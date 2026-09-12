// render/starfield.js — distant point-cloud star layers.
// Stars live far OUTSIDE the camera's max orbit (dist 96-1200), so the
// camera can never pass near one — that would render a giant white square.

export function makeStarLayer(count, size, opacity, minR = 1600, maxR = 3400) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = minR + Math.random() * (maxR - minR);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    // natural star hues: white, blue-white, warm yellow, faint red giants
    const roll = Math.random();
    if (roll < 0.5) c.setRGB(1, 1, 1);
    else if (roll < 0.7) c.setRGB(0.75, 0.85, 1);
    else if (roll < 0.88) c.setRGB(1, 0.95, 0.8);
    else c.setRGB(1, 0.75, 0.65);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    vertexColors: true,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity,
  });
  return new THREE.Points(geo, mat);
}
