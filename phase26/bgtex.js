// phase26/bgtex.js — shared procedural background texture for the raytracer
// modes. Independent of any external image asset.

export function makeBackgroundTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = '#000';
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const b = 60 + Math.random() * 195;
    const s = 0.6 + Math.random() * 2.2;
    x.fillStyle = `rgb(${b},${b},${b * 0.9 + 8})`;
    x.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  // A diffuse starfield haze so the shadow silhouette is legible against the
  // background even where no individual bright star happens to land (sparse
  // stars otherwise merge with the near-black shadow in measurements/ASCII).
  x.fillStyle = 'rgba(120,135,190,0.14)';
  for (let i = 0; i < 3000; i++) {
    x.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
  }
  const g = x.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, 'rgba(70,80,130,0)');
  g.addColorStop(0.5, 'rgba(120,130,190,0.12)');
  g.addColorStop(1, 'rgba(70,80,130,0)');
  x.fillStyle = g;
  for (let i = 0; i < 7; i++) {
    x.save();
    x.translate(size / 2, size / 2);
    x.rotate(i * 0.65);
    x.fillRect(-size, -8, size * 2, 16);
    x.restore();
  }
  return new THREE.CanvasTexture(c);
}
