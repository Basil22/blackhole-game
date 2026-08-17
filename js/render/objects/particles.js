// render/objects/particles.js — particle effects: tears, accretion flows,
// and the horizon-rim ignition flash when matter crosses the event horizon.

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.MAX = 700;
  }

  _emit(pos, vel, color, size, life, gravityMul = 0.15) {
    if (this.particles.length >= this.MAX) return;
    const geo = new THREE.SphereGeometry(size, 6, 5);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      vel: new THREE.Vector3(vel.x, vel.y, vel.z),
      life, maxLife: life, gravityMul, baseSize: size,
    });
  }

  burst(pos, vel, color, count, speed, size, life) {
    for (let i = 0; i < count; i++) {
      const jitter = new THREE.Vector3(
        (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2
      ).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      const v = new THREE.Vector3(vel.x, vel.y, vel.z).add(jitter);
      this._emit(pos, v, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random()));
    }
  }

  // Directional release puff at the moment of launch: droplets biased along the
  // throw direction so the release reads as an impulse — the object separates
  // from a dissolving streak — instead of a silent sprite pop.
  launchTrail(pos, vel, color, count = 6) {
    const dir = new THREE.Vector3(vel.x, vel.y, vel.z);
    const speed = dir.length() || 1e-3;
    dir.normalize();
    for (let i = 0; i < count; i++) {
      const s = speed * (0.10 + Math.random() * 0.22); // droplets trail behind
      const v = new THREE.Vector3(dir.x * s, dir.y * s, dir.z * s);
      v.add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6,
      ).multiplyScalar(s));
      this._emit(pos, v, color, 0.7 * (0.6 + Math.random() * 0.8), 0.45 * (0.7 + Math.random() * 0.6), 0.02);
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
    const rim = new THREE.Vector3(pos.x * k, pos.y * k, pos.z * k);
    const vel = { x: 0, y: 0, z: 0 };
    const boost = Math.min(2, 1 + objRadius / hr);
    this._emit(rim, vel, 0xffdc90, hr * 0.30 * boost, 0.6 + 0.2 * boost);
    this.burst(rim, vel, 0xff9a40, 10, hr * 0.55, hr * 0.10, 0.9);
    this.burst(rim, vel, 0xfff0c0, 5, hr * 0.9, hr * 0.16, 0.5);
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.multiplyScalar(1 - 0.4 * dt);
      const r = p.mesh.position.length() || 1;
      p.vel.addScaledVector(p.mesh.position.clone().multiplyScalar(-p.gravityMul / r), dt);
      p.mesh.position.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      p.mesh.scale.setScalar(Math.max(t, 0.05));
      p.mesh.material.opacity = t;
    }
  }
}