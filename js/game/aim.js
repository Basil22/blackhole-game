// game/aim.js — the orange slingshot arrow: points along the launch velocity
// with a length that scales with how far around the hole the object will arc.

import { launchVelocity } from './trajectory.js';

export class AimArrow {
  constructor(scene) {
    const dir = new THREE.Vector3();
    const origin = new THREE.Vector3();
    this.arrow = new THREE.ArrowHelper(dir, origin, 32, 0xffaa00, 6.4, 4.8);
    this.arrow.visible = false;
    scene.add(this.arrow);
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
    // arrow length scales with tangential speed (how far around the hole it arcs)
    const len = Math.min(144, Math.max(25, vel.length() * 0.55));
    this.arrow.position.copy(spawnPos);
    this.arrow.setDirection(dir);
    this.arrow.setLength(len, 6.4, 4.8);
  }
}