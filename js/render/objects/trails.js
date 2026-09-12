// render/objects/trails.js — object motion trails.
// Draws a fading ribbon/line behind flying objects using a single pre-allocated
// THREE.Line mesh. The trail records recent positions in a ring buffer and
// updates the geometry each frame. No per-frame allocations.

const MAX_TRAIL_POINTS = 60;

export class TrailSystem {
  constructor(scene) {
    this.scene = scene;
    this._trails = new Map(); // objectId -> trail state
  }

  // Start tracking a new flying object.
  add(id, color) {
    const positions = new Float32Array(MAX_TRAIL_POINTS * 3);
    const colors = new Float32Array(MAX_TRAIL_POINTS * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    // Use a simple line for the trail
    const mat = new THREE.LineBasicMaterial({
      color: typeof color === 'number' ? color : 0xffa040,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    this.scene.add(line);
    this._trails.set(id, {
      positions,
      geo,
      line,
      mat,
      head: 0,
      count: 0,
      lastPos: null,
    });
  }

  // Record a position sample for an object. Call each physics frame or at
  // a reduced rate for performance.
  record(id, pos) {
    const trail = this._trails.get(id);
    if (!trail) return;
    // Skip if the position hasn't moved enough (avoid cluttering on still objects)
    if (trail.lastPos) {
      const dx = pos.x - trail.lastPos.x;
      const dy = pos.y - trail.lastPos.y;
      const dz = pos.z - trail.lastPos.z;
      if (dx * dx + dy * dy + dz * dz < 0.01) return;
    }
    const i3 = trail.head * 3;
    trail.positions[i3] = pos.x;
    trail.positions[i3 + 1] = pos.y;
    trail.positions[i3 + 2] = pos.z;
    trail.head = (trail.head + 1) % MAX_TRAIL_POINTS;
    if (trail.count < MAX_TRAIL_POINTS) trail.count++;
    trail.lastPos = { x: pos.x, y: pos.y, z: pos.z };
  }

  // Update the trail geometry for rendering. Call once per visual frame.
  update() {
    for (const [, trail] of this._trails) {
      trail.geo.attributes.position.needsUpdate = true;
      trail.geo.setDrawRange(0, trail.count);
      // Fade opacity based on how much trail exists
      trail.mat.opacity = Math.min(0.45, trail.count * 0.01);
    }
  }

  // Remove a trail (when the object is gone).
  remove(id) {
    const trail = this._trails.get(id);
    if (!trail) return;
    this.scene.remove(trail.line);
    trail.geo.dispose();
    trail.mat.dispose();
    this._trails.delete(id);
  }

  // Clear all trails.
  clear() {
    for (const [id] of this._trails) this.remove(id);
  }

  dispose() {
    this.clear();
  }
}
