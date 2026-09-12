// render/blackhole.js — the black hole set-piece: the black event-horizon
// sphere, the tilted accretion-disk shader, the camera-facing photon ring,
// gravitational lensing arcs (top + bottom), and the soft outer glow billboard.
// Tuned to approximate the Interstellar-style reference (deep orange-red disk,
// thin bright photon ring, lensed arcs bending over/under the shadow).

export function buildBlackHole(scene, hr) {
  // --- the black sphere (event horizon) ---
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const hole = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.99, 48, 48), holeMat);
  scene.add(hole);

  // --- accretion disk: flat tilted ring ---
  const diskInner = hr * 1.30;
  const diskOuter = hr * 3.5;
  const diskGroup = new THREE.Group();
  diskGroup.rotation.x = -1.4; // ~80° tilt: near-edge-on

  const diskGeom = new THREE.RingGeometry(diskInner, diskOuter, 128, 1);
  const diskMat = makeDiskMaterial(diskInner, diskOuter);
  const diskMesh = new THREE.Mesh(diskGeom, diskMat);
  diskGroup.add(diskMesh);
  scene.add(diskGroup);

  // --- photon ring: thin bright circle hugging the horizon ---
  const prGeo = new THREE.RingGeometry(hr * 1.03, hr * 1.10, 128, 1);
  const prMat = new THREE.MeshBasicMaterial({
    color: 0xffcc80,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const photonRing = new THREE.Mesh(prGeo, prMat);
  photonRing.renderOrder = 10;
  scene.add(photonRing);

  // --- gravitational lensing arcs (billboard) ---
  // Top arc: wide, bright — the dominant lensed "hat" shape.
  // Bottom arc: narrower but still clearly visible.
  const lensGroup = new THREE.Group();
  scene.add(lensGroup);

  const topArc = makeLensArc(hr, {
    innerR: hr * 1.06,
    outerR: hr * 1.8,     // subtle arc just above the shadow
    segments: 128,
    clip: 'top',
    opacity: 0.45,
    brightness: 0.9,
  });
  lensGroup.add(topArc.mesh);

  const bottomArc = makeLensArc(hr, {
    innerR: hr * 1.06,
    outerR: hr * 1.5,     // even smaller below
    segments: 128,
    clip: 'bottom',
    opacity: 0.35,
    brightness: 0.7,
  });
  lensGroup.add(bottomArc.mesh);

  // --- soft outer glow billboard ---
  const glowSprite = makeGlowSprite(hr * 6.0, 0xff7030, 0.8);
  glowSprite.renderOrder = -1;
  scene.add(glowSprite);

  // --- animation state ---
  let _proximity = 0;
  let _flashT = 0;
  let _agitateT = 0;

  return {
    hole,
    diskGroup,
    diskMat,
    diskMesh,
    photonRing,
    glowSprite,
    faceGroup: null,
    lensGroup,

    update(dt, time) {
      if (diskMat) diskMat.uniforms.uTime.value = time;
      diskGroup.rotation.z += dt * 0.02;

      // Lensing arcs spin slowly (billboard rotation around Z in screen space)
      topArc.mat.uniforms.uTime.value = time;
      bottomArc.mat.uniforms.uTime.value = time;
      // Stash spin angle for scene.js to compose with billboard quaternion.
      // Can't use rotation.z directly because scene.js overwrites the quaternion.
      lensGroup.userData.spinZ = time * 0.015;

      // Agitate: disk speed burst on tears
      if (_agitateT > 0) {
        _agitateT = Math.max(0, _agitateT - dt * 3.0);
        diskGroup.rotation.z += dt * _agitateT * 0.15;
      }

      // Flash decay
      if (_flashT > 0) {
        _flashT = Math.max(0, _flashT - dt * 3.5);
      }

      // Photon ring brightness
      prMat.opacity = 0.7 + _flashT * 0.3 + _proximity * 0.15;

      // Lensing arc brightness responds to proximity + flash
      const lensBright = 1 + _flashT * 0.3 + _proximity * 0.2;
      topArc.mat.uniforms.uBrightness.value = 0.9 * lensBright;
      bottomArc.mat.uniforms.uBrightness.value = 0.7 * lensBright;

      // Glow responds to proximity + flash
      const glowBase = 0.6 + _proximity * 0.25;
      glowSprite.material.opacity = glowBase + _flashT * 0.3;
    },

    setProximity(p) {
      _proximity = p;
    },

    flash() {
      _flashT = 1.0;
    },

    agitate() {
      _agitateT = Math.min(_agitateT + 0.4, 1.0);
    },
  };
}

// ---- Lensing arc: billboard half-ring simulating gravitationally bent light ----
// The key to matching the Interstellar look: the arc uses an angular fade that
// creates a "hat" or "lens" shape — widest at center (12/6 o'clock), narrowing
// toward the sides. The angular exponent is gentle so the arc stays fat and bright,
// not a thin wisp.
function makeLensArc(hr, opts) {
  const geo = new THREE.RingGeometry(opts.innerR, opts.outerR, opts.segments, 4);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uInner: { value: opts.innerR },
      uOuter: { value: opts.outerR },
      uTime: { value: 0 },
      uClipTop: { value: opts.clip === 'top' ? 1.0 : 0.0 },
      uOpacity: { value: opts.opacity },
      uBrightness: { value: opts.brightness },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uInner;
      uniform float uOuter;
      uniform float uTime;
      uniform float uClipTop;
      uniform float uOpacity;
      uniform float uBrightness;
      varying vec3 vPos;
      void main() {
        // Clip to top or bottom half
        if (uClipTop > 0.5 && vPos.y < 0.0) discard;
        if (uClipTop < 0.5 && vPos.y > 0.0) discard;

        float r = length(vPos.xy);
        float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
        float angle = atan(vPos.y, vPos.x);

        // Fire palette matching the main disk
        vec3 white  = vec3(1.0, 0.95, 0.80);
        vec3 orange = vec3(1.0, 0.50, 0.08);
        vec3 red    = vec3(0.85, 0.15, 0.03);
        vec3 dark   = vec3(0.30, 0.06, 0.02);

        vec3 col;
        if (t < 0.15) {
          col = mix(white, orange, t / 0.15);
        } else if (t < 0.45) {
          col = mix(orange, red, (t - 0.15) / 0.30);
        } else {
          col = mix(red, dark, (t - 0.45) / 0.55);
        }

        // Strong radial falloff — bright inner edge, fading outward
        float falloff = pow(1.0 - t, 1.0);

        // Angular shape: "hat" / lens curve.
        // |sin(angle)| gives max at 90°/270° (top/bottom center).
        // Gentle exponent (0.35) keeps the arc FAT — not a thin wisp.
        float sinA = abs(sin(angle));
        float angShape = pow(sinA, 0.35);

        // Turbulent streaks — same visual language as the main disk
        float band1 = sin(angle * 7.0 + uTime * 0.9 - t * 18.0);
        float band2 = sin(angle * 12.0 - uTime * 1.1 - t * 28.0);
        float shimmer = 1.0 + 0.22 * band1 * (1.0 - t) + 0.10 * band2 * (1.0 - t);

        col *= falloff * angShape * shimmer * uBrightness;

        // Smooth inner + outer edge fade
        float innerFade = smoothstep(0.0, 0.06, t);
        float outerFade = 1.0 - smoothstep(0.82, 1.0, t);
        float alpha = falloff * angShape * innerFade * outerFade * uOpacity;

        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 6;
  return { mesh, mat };
}

// ---- Main accretion disk shader ----
function makeDiskMaterial(inner, outer) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uInner: { value: inner },
      uOuter: { value: outer },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uInner;
      uniform float uOuter;
      uniform float uTime;
      varying vec3 vPos;
      void main() {
        float r = length(vPos.xy);
        float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
        float angle = atan(vPos.y, vPos.x);

        // -- color palette: white-hot inner -> bright orange -> deep red -> dark --
        vec3 white  = vec3(1.0, 0.95, 0.80);
        vec3 orange = vec3(1.0, 0.45, 0.05);
        vec3 red    = vec3(0.8, 0.12, 0.02);
        vec3 dark   = vec3(0.25, 0.04, 0.01);

        vec3 col;
        if (t < 0.15) {
          col = mix(white, orange, t / 0.15);
        } else if (t < 0.45) {
          col = mix(orange, red, (t - 0.15) / 0.30);
        } else {
          col = mix(red, dark, (t - 0.45) / 0.55);
        }

        // radial falloff: white-hot inner edge cooling outward
        float falloff = pow(1.0 - t, 1.2);

        // gentle brightness ripple
        float beam = 1.0 + 0.12 * cos(angle * 1.0 - uTime * 0.6);

        // turbulent swirl bands
        float band  = sin(angle * 8.0 + uTime * 0.9 - t * 20.0);
        float band2 = sin(angle * 14.0 - uTime * 1.3 - t * 34.0);
        float shimmer = 1.0 + 0.25 * band * (1.0 - t) + 0.12 * band2 * (1.0 - t);

        col *= falloff * beam * shimmer * 1.3;

        float alpha = falloff * beam * 0.92;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// ---- Soft outer glow sprite ----
function makeGlowSprite(radius, color, opacity) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,140,50,0.8)');
  grad.addColorStop(0.25, 'rgba(255,80,20,0.35)');
  grad.addColorStop(0.55, 'rgba(180,40,5,0.10)');
  grad.addColorStop(1, 'rgba(80,15,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(radius, radius, 1);
  return sprite;
}
