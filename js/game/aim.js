// game/aim.js — the warm slingshot arrow: points along the launch velocity
// with a length that scales with how far around the hole the object will arc.
// Pale-amber strokes read clearly against the bright plasma disk; the cone is
// near-white so the aim point pops.

import { launchVelocity } from './trajectory.js';

export class AimArrow {
  constructor(scene) {
    const dir = new THREE.Vector3();
    const origin = new THREE.Vector3();
    // Brighter shaft + a fatter, near-white head so the arrow stays legible
    // where the trajectory line and plasma overlap (Phase 15 readability pass).
    this.arrow = new THREE.ArrowHelper(dir, origin, 32, 0xffc860, 8.0, 6.5);
    this.arrow.visible = false;
    scene.add(this.arrow);
    this.arrow.line.material.color.setHex(0xffc860);
    this.arrow.cone.material.color.setHex(0xfff4d0);
    // Phase 18 — power-driven shaft color. Preallocated so update() (which runs
    // per pointer move, not per frame) never allocates.
    this._amber = new THREE.Color(0xffc860);
    this._pale = new THREE.Color(0xfff4d0);
  }

  show(spawnPos) {
    this.arrow.position.copy(spawnPos);
    this.arrow.visible = true;
    this.update(spawnPos, null, { dx: 0, dy: 0 });
  }

  hide() {
    this.arrow.visible = false;
  }

  update(spawnPos, world, aim) {
    if (!this.arrow.visible || !world) return;
    const vel = launchVelocity(world, spawnPos, aim);
    const dir = vel.clone().normalize();
    // Arrow length scales with power — speed relative to v_circ, normalized
    // across the reachable tangential band 0.35…1.62 (matches js/game/aiming).
    // A full-power pull reads as a long arrow instead of saturating on raw
    // speed, so the player can see they are in escape range.
    const vCirc = Math.sqrt(world.mu / spawnPos.length());
    const frac = vel.length() / vCirc;
    const power = Math.max(0, Math.min(1, (frac - 0.35) / (1.62 - 0.35)));
    const len = 25 + power * 119; // 25…144 px
    // Phase 18 — shaft brightens toward near-white as the pull enters the
    // powerful tail of the envelope (power ~0.72→1.0). Subtle, stays warm.
    const blend = (power - 0.72) / 0.28;
    if (blend > 0) {
      this.arrow.line.material.color.copy(this._amber).lerp(this._pale, blend);
    } else {
      this.arrow.line.material.color.copy(this._amber);
    }
    this.arrow.position.copy(spawnPos);
    this.arrow.setDirection(dir);
    this.arrow.setLength(len, 8.0, 6.5);
  }
}