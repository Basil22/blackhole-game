// game/guidance/path.js — the rendered predicted trajectory. One THREE.Line with
// one preallocated BufferGeometry: positions + vertex-colors are written into
// existing Float32Array in-place and re-tiled via drawRange. No mesh-per-sample,
// no per-frame allocation, one draw call. Styles stay in the existing warm
// language (amber like the aim arrow) and shift to red near the horizon rim so
// a captured throw visually "dives into" the hole instead of stopping abruptly.
// A short POST-LAUNCH ghost fade keeps the prediction visually handoff-adjacent
// to the real flight: on launch the path dissolves over ~0.35 s instead of
// blinking out, so the real object visibly continues the line it was shown.
// Pure presentation: update(guidance) and hide() cancel any running fade.
//
// Phase 18 — learnability pass (presentation only, physics untouched). The same
// EXISTING classification + closest-approach data now drive subtle monochrome
// distinctions so the player reads intent without any numbers:
//   - one tiny near-white marker sits at the predicted closest approach (the
//     "wrap point"), visible only when the pass stays outside the horizon
//   - a few samples at the apex brighten toward near-white when the path wraps
//     (ORBITAL/FLYBY) — the curve's turning point reads before release
//   - an ESCAPING path gets a short near-white tail + a small outward tick so
//     it visibly "continues" beyond the black-hole region
//   - a very close, non-diving pass (between ~1.04× and ~1.7× the horizon)
//     breathes subtly (opacity pulse) — a quiet danger signal, disabled under
//     prefers-reduced-motion. CAPTURE keeps its existing inward red emphasis.

const OPACITY = 0.85;
const FADE = 0.35; // seconds — long enough to read, short enough to not linger

// Pure ghost-fade curve, exported for the node feel suite (this module's top
// level is THREE-free — only the class methods touch the renderer).
export function ghostOpacity(p) {
  const t = Math.min(1, Math.max(0, p));
  return OPACITY * (1 - t * t); // ease-out dissolve, quick off the launch
}
export { OPACITY, FADE };

// ---- Phase 18 pure presentation helpers (THREE-free, node-testable) ----
// These read ONLY the existing classification + closest approach; they never
// create new states, physics, or thresholds.

// Map the existing trajectory state to a presentation emphasis family.
export function stateMode(state) {
  switch (state) {
    case 'ORBITAL': return 'orbital';
    case 'ESCAPING': return 'escape';
    case 'CAPTURED':
    case 'HORIZON_CROSSING': return 'capture';
    default: return 'flyby'; // FLYBY / UNKNOWN keep the clean curve
  }
}

// A close-but-not-diving pass breathes. Between ~1.04× and ~1.7× horizon.
export function grazingBand(closestDist, horizon) {
  if (!(closestDist > 0) || !(horizon > 0)) return false;
  return closestDist >= horizon * 1.04 && closestDist <= horizon * 1.7;
}

// Show the closest-approach marker only when the pass stays outside the rim.
export function closestMarkerVisible(closestDist, horizon) {
  return !!(closestDist > 0) && horizon > 0 && closestDist > horizon * 1.05;
}

// Number of ESCAPING tail samples that brighten toward near-white (a bounded,
// short directional continuation cue — never a wall).
export function escapeTailLength(count) {
  return Math.max(0, Math.min(6, count));
}

export class TrajectoryPath {
  constructor(scene, { horizonRadius = 40, maxPoints = 200 } = {}) {
    this.scene = scene;
    this.horizonRadius = horizonRadius;
    this.maxPoints = maxPoints;

    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(maxPoints * 3), 3);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(maxPoints * 3), 3);
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('color', this.colAttr);
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: OPACITY,
      depthWrite: false,   // stays visible over the disk glow
      depthTest: true,
    });

    this.line = new THREE.Line(this.geometry, this.material);
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);

    // Phase 18 — one tiny reused near-white marker at the predicted closest
    // approach ("wrap point"). Static geometry, shown/hidden on update(), never
    // part of the line — so players pick out where the curve bends closest.
    this.marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.75, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xfff4d0, transparent: true, opacity: 0.9, depthWrite: false,
      }),
    );
    this.marker.visible = false;
    this.marker.frustumCulled = false;
    scene.add(this.marker);

    this._fadeT = FADE;                 // fade timer reaches FADE ⇒ done
    this._reduceMotion = typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

    // Phase 18 — breathing opacity for a grazing (close, non-diving) pass.
    // State is derived purely from the EXISTING closest-approach data. The
    // pulse is gated by reduced-motion and by any running ghost fade.
    this._pulseMode = null;             // 'graze' | null
    this._pulseT = 0;
  }

  // Render a guidance result: samples become the line, the trailing portion
  // inside the horizon rim (1.2× horizon) turns red to mark the swallow mouth.
  // Phase 18 adds ONLY presentation derived from the same existing data:
  // closest-approach marker, apex highlight, ESCAPING tail/continuation, and
  // the grazing pulse state. No new physics, states, or threshold semantics.
  update(guidance) {
    if (!guidance || !guidance.samples || guidance.samples.length === 0) {
      this.hide();
      return;
    }
    this._fadeT = FADE; // a fresh prediction cancels any outgoing ghost fade
    this.material.opacity = OPACITY;
    const radius = guidance.horizonRadius || this.horizonRadius;
    const rim2 = (radius * 1.2) * (radius * 1.2);
    const n = Math.min(guidance.samples.length, this.maxPoints);

    // ---- Phase 18 presentation modes (derived, not new physics) ----
    const close = guidance.closestApproach;
    const cd = close && close.distance > 0 ? close.distance : 0;
    const mode = stateMode(guidance.state);
    // A dive is already read via the red rim — never mark a swallow mouth with
    // a "wrap point". This also covers captured ellipses whose periapsis sits
    // outside the reference window: they are still going to be swallowed, so
    // the marker stays off.
    const markerOn = closestMarkerVisible(cd, radius) && mode !== 'capture';
    const tail = mode === 'escape' ? escapeTailLength(n) : 0;
    // ESCAPING continuation tick: extend one extra, clearly-styled segment just
    // past the last sample so the path visibly keeps heading outward. Written
    // into the existing buffer (never beyond maxPoints), direction from the
    // averaged tail velocity so a single noisy sample can't jitter it.
    let extra = 0;
    let ex = 0; let ey = 0; let ez = 0;
    const near = close && close.position && close.position.x !== undefined
      ? close.position : null;
    if (mode === 'escape' && n > 1) {
      const s0 = guidance.samples[n - 1].position;
      const k = Math.min(3, n);
      let vx = 0; let vy = 0; let vz = 0; let vn = 0;
      for (let j = 0; j < k; j++) {
        const v = guidance.samples[n - 1 - j].velocity;
        if (v) { vx += v.x; vy += v.y; vz += v.z; vn += 1; }
      }
      if (vn > 0 && (vx || vy || vz)) {
        const inv = 1 / Math.hypot(vx, vy, vz);
        vx *= inv; vy *= inv; vz *= inv;
        if (n + tail + 1 <= this.maxPoints) {
          ex = s0.x + vx * 14; ey = s0.y + vy * 14; ez = s0.z + vz * 14;
          extra = 1;
        }
      }
    }

    // ---- Phase 18 apex highlight radius (world units) ----
    const APEX_R = 20;
    const apexOn = markerOn && (mode === 'orbital' || mode === 'flyby');

    const pa = this.posAttr.array;
    const ca = this.colAttr.array;
    for (let i = 0; i < n; i++) {
      const s = guidance.samples[i].position;
      const i3 = i * 3;
      pa[i3] = s.x; pa[i3 + 1] = s.y; pa[i3 + 2] = s.z;
      const r2 = s.x * s.x + s.y * s.y + s.z * s.z;
      const tailOn = tail > 0 && i >= n - tail;
      if (r2 <= rim2) {
        ca[i3] = 1.0; ca[i3 + 1] = 0.25; ca[i3 + 2] = 0.15;   // heat: diving in
      } else if (tailOn) {
        ca[i3] = 1.0; ca[i3 + 1] = 0.92; ca[i3 + 2] = 0.6;    // near-white exit
      } else if (apexOn && near) {
        const dx = s.x - near.x, dy = s.y - near.y, dz = s.z - near.z;
        if (dx * dx + dy * dy + dz * dz <= APEX_R * APEX_R) {
          ca[i3] = 1.0; ca[i3 + 1] = 0.92; ca[i3 + 2] = 0.6;  // wrap point
        } else {
          ca[i3] = 0.98; ca[i3 + 1] = 0.62; ca[i3 + 2] = 0.12;  // amber
        }
      } else {
        ca[i3] = 0.98; ca[i3 + 1] = 0.62; ca[i3 + 2] = 0.12;  // amber aim language
      }
    }
    let drawn = n;
    if (extra) {
      const i3 = n * 3;
      pa[i3] = ex; pa[i3 + 1] = ey; pa[i3 + 2] = ez;
      ca[i3] = 1.0; ca[i3 + 1] = 0.92; ca[i3 + 2] = 0.6;
      drawn = n + 1;
    }
    this.geometry.setDrawRange(0, drawn);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.line.visible = drawn > 1;

    // Closest-approach marker (Phase 18): only for passes that stay outside the
    // horizon — a dive into the hole already reads via the red rim.
    if (markerOn && near) {
      this.marker.position.set(near.x, near.y, near.z);
      this.marker.visible = true;
    } else {
      this.marker.visible = false;
    }

    // Grazing pulse mode — derived from the existing closest-approach distance.
    this._pulseMode = grazingBand(cd, radius) && mode !== 'capture' ? 'graze' : null;
    this._pulseT = 0;
  }

  hide() {
    this._fadeT = FADE; // hide is immediate — cancel any in-flight ghost fade
    this.line.visible = false;
    this.marker.visible = false;
  }

  // Begin the post-launch ghost fade. With prefers-reduced-motion the path is
  // dropped instantly (the fade is a pure cosmetic dissolve, never a delay).
  fadeOut() {
    if (this._reduceMotion || !this.line.visible) { this.hide(); return; }
    this._fadeT = 0;
  }

  // Per-frame tick for the ghost fade AND the grazing pulse; no-op unless one
  // is active. Called from the render loop with the real frame delta. (Named
  // `tick`, NOT `update`, so it never shadows the `update(guidance)` render
  // method above.) The pulse is a subtle opacity breath (±0.07) on a very close
  // non-diving pass, disabled under prefers-reduced-motion and never fights an
  // outgoing ghost fade (the fade owns opacity while it is running).
  tick(dt) {
    if (this._pulseMode === 'graze' && !this._reduceMotion
        && this.line.visible && this._fadeT >= FADE) {
      this._pulseT += dt;
      this.material.opacity = Math.min(1, Math.max(0,
        OPACITY + 0.07 * Math.sin(this._pulseT * 4)));
    }
    if (this._fadeT >= FADE || !this.line.visible) return;
    this._fadeT = Math.min(FADE, this._fadeT + dt);
    if (this._fadeT >= FADE) {
      this._fadeT = FADE;
      this.line.visible = false;
      this.marker.visible = false;
      this.material.opacity = OPACITY; // restored for the next aim
      return;
    }
    const p = this._fadeT / FADE;
    this.material.opacity = ghostOpacity(p); // ease out, quick dissolve
  }

  dispose() {
    this._fadeT = FADE;
    this.line.visible = false;
    this.marker.visible = false;
    this.scene.remove(this.line);
    this.scene.remove(this.marker);
    this.geometry.dispose();
    this.material.dispose();
    this.marker.geometry.dispose();
    this.marker.material.dispose();
  }
}