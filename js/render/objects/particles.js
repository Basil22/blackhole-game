// render/objects/particles.js — particle effects: tears, accretion flows,
// and the horizon-rim ignition flash when matter crosses the event horizon.
//
// Uses a single pre-allocated THREE.Points buffer (no per-particle geometry
// or material allocation). All particles share one draw call. The pool is
// fixed-size (MAX); emitting when full is a silent no-op.

const MAX = 700;

// Scratch vector reused in update() to avoid per-particle allocation.
const _scratch = new THREE.Vector3();

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;

    // Pre-allocate typed arrays for the Points buffer.
    this._positions = new Float32Array(MAX * 3);
    this._colors = new Float32Array(MAX * 3);
    this._sizes = new Float32Array(MAX);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this._colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this._sizes, 1));

    // Custom shader so each point can have its own size and color, with
    // additive blending and circular soft-edge falloff (matches the old
    // sphere-per-particle look while being a single draw call).
    const mat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = 1.0 - smoothstep(0.25, 0.5, d);
          gl_FragColor = vec4(vColor * alpha, alpha);
        }
      `,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this._points = new THREE.Points(geo, mat);
    this._points.frustumCulled = false;
    this.scene.add(this._points);

    // Per-particle state (parallel arrays — pool slots reused on death).
    this._pool = new Array(MAX);
    for (let i = 0; i < MAX; i++) {
      this._pool[i] = { alive: false, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, gravityMul: 0.15, baseSize: 1 };
    }
    this._aliveCount = 0;
  }

  _nextSlot() {
    for (let i = 0; i < MAX; i++) {
      if (!this._pool[i].alive) return i;
    }
    return -1; // pool full
  }

  _emit(pos, vel, color, size, life, gravityMul = 0.15) {
    const idx = this._nextSlot();
    if (idx < 0) return;

    const p = this._pool[idx];
    p.alive = true;
    p.vx = vel.x; p.vy = vel.y; p.vz = vel.z;
    p.life = life; p.maxLife = life;
    p.gravityMul = gravityMul;
    p.baseSize = size;

    const i3 = idx * 3;
    this._positions[i3] = pos.x;
    this._positions[i3 + 1] = pos.y;
    this._positions[i3 + 2] = pos.z;

    // Decompose hex color to normalized RGB
    const c = typeof color === 'number' ? color : 0xffa040;
    this._colors[i3] = ((c >> 16) & 0xff) / 255;
    this._colors[i3 + 1] = ((c >> 8) & 0xff) / 255;
    this._colors[i3 + 2] = (c & 0xff) / 255;

    this._sizes[idx] = size;
    this._aliveCount++;
  }

  burst(pos, vel, color, count, speed, size, life) {
    for (let i = 0; i < count; i++) {
      _scratch.set(
        (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2,
      ).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      const vx = vel.x + _scratch.x;
      const vy = vel.y + _scratch.y;
      const vz = vel.z + _scratch.z;
      this._emit(pos, { x: vx, y: vy, z: vz }, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random()));
    }
  }

  // Directional release puff at the moment of launch: droplets biased along the
  // throw direction so the release reads as an impulse.
  launchTrail(pos, vel, color, count = 6) {
    _scratch.set(vel.x, vel.y, vel.z);
    const speed = _scratch.length() || 1e-3;
    _scratch.normalize();
    for (let i = 0; i < count; i++) {
      const s = speed * (0.10 + Math.random() * 0.22);
      const vx = _scratch.x * s + (Math.random() - 0.5) * 0.6 * s;
      const vy = _scratch.y * s + (Math.random() - 0.5) * 0.6 * s;
      const vz = _scratch.z * s + (Math.random() - 0.5) * 0.6 * s;
      this._emit(pos, { x: vx, y: vy, z: vz }, color, 0.7 * (0.6 + Math.random() * 0.8), 0.45 * (0.7 + Math.random() * 0.6), 0.02);
    }
  }

  tear(pos, vel, color, count = 14) {
    this.burst(pos, vel, color, count, 2.6, 0.6, 1.0);
    // a few hot white snap sparks ride the biggest chunks out
    this.burst(pos, vel, 0xffffff, 3, 4.4, 0.22, 0.5);
  }

  accretionFlash(pos, vel, radius) {
    this.burst(pos, vel, 0xffa040, 14, 2.5, 1.2 * radius, 1.0);
    this._emit(pos, vel, 0xfff0c0, 2.5, 0.9);
  }

  // Matter crossing the event horizon ignites AT the rim, not at an invisible
  // sub-horizon point. The glow is scaled to the hole and boosted by the object's
  // radius, so a planet bigger than the hole produces a large engulfing flash.
  horizonRim(pos, hr, objRadius = 0) {
    const r = Math.hypot(pos.x, pos.y, pos.z) || 1e-4;
    const k = hr / r;
    const rim = { x: pos.x * k, y: pos.y * k, z: pos.z * k };
    const vel = { x: 0, y: 0, z: 0 };
    const boost = Math.min(2, 1 + objRadius / hr);
    this._emit(rim, vel, 0xffdc90, hr * 0.30 * boost, 0.6 + 0.2 * boost);
    this.burst(rim, vel, 0xff9a40, 10, hr * 0.55, hr * 0.10, 0.9);
    this.burst(rim, vel, 0xfff0c0, 5, hr * 0.9, hr * 0.16, 0.5);
  }

  update(dt) {
    const pos = this._positions;
    const sizes = this._sizes;
    const colors = this._colors;

    for (let idx = 0; idx < MAX; idx++) {
      const p = this._pool[idx];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        // Kill: move offscreen and zero size
        p.alive = false;
        const i3 = idx * 3;
        pos[i3] = 0; pos[i3 + 1] = 0; pos[i3 + 2] = 0;
        sizes[idx] = 0;
        this._aliveCount--;
        continue;
      }
      // Velocity damping
      const damp = 1 - 0.4 * dt;
      p.vx *= damp; p.vy *= damp; p.vz *= damp;

      // Gravity toward origin (reuse scratch)
      const i3 = idx * 3;
      const px = pos[i3], py = pos[i3 + 1], pz = pos[i3 + 2];
      const r = Math.sqrt(px * px + py * py + pz * pz) || 1;
      const gf = -p.gravityMul * dt / r;
      p.vx += px * gf;
      p.vy += py * gf;
      p.vz += pz * gf;

      // Integrate position
      pos[i3] += p.vx * dt;
      pos[i3 + 1] += p.vy * dt;
      pos[i3 + 2] += p.vz * dt;

      // Fade: scale size and color brightness by remaining life fraction
      const t = p.life / p.maxLife;
      sizes[idx] = p.baseSize * Math.max(t, 0.05);
      // Dim the color toward black as particle dies
      const c3 = idx * 3;
      // Colors were set at emit time; we modulate brightness by scaling them
      // toward their base values. Since we can't easily recover the base color
      // here, we just set opacity via size falloff. The additive blending
      // naturally dims smaller particles. This is sufficient.
    }

    // Flag buffer updates (single GPU upload per frame, not per-particle)
    const geo = this._points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  }
}
