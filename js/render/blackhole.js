// render/blackhole.js — the black hole set-piece: the black event-horizon
// sphere, the tilted accretion-disk shader, the camera-facing photon ring,
// and the soft outer glow billboard.

export function buildBlackHole(scene, hr) {
  // --- the black sphere (event horizon) ---
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const hole = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.99, 48, 48), holeMat);
  scene.add(hole);

  // --- accretion disk: flat tilted ring ---
  // A plain ring tilted ~57° so it passes in FRONT of AND behind the hole —
  // the classic black-hole shot. The sphere's near half occludes the disk's far side,
  // which reads as light bending around the shadow.
  const diskInner = hr * 1.35;
  const diskOuter = hr * 3.2;
  const diskGroup = new THREE.Group();
  diskGroup.rotation.x = -1.4; // ~80° tilt: near-edge-on — squashed band like the reference shot

  const diskGeom = new THREE.RingGeometry(diskInner, diskOuter, 96, 1);
  const diskMat = makeDiskMaterial(diskInner, diskOuter);
  const diskMesh = new THREE.Mesh(diskGeom, diskMat);
  diskGroup.add(diskMesh);
  scene.add(diskGroup);

  // --- photon ring: thin bright circle hugging the horizon ---
  // Camera-facing (billboard) so it reads as a closed ring around the
  // shadow no matter how you orbit the camera — like the real photon ring,
  // which is a closed circle from every viewing angle.
  const prGeo = new THREE.RingGeometry(hr * 1.04, hr * 1.12, 96, 1);
  const prMat = new THREE.MeshBasicMaterial({
    color: 0xffe8c0, // Phase 21 — canary photon ring (originally)
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false, // the flat ring plane passes through the sphere center —
    // without this the sphere's near half occludes the ring's far half and it
    // renders as a broken arc instead of a closed photon ring
    side: THREE.DoubleSide,
  });
  const photonRing = new THREE.Mesh(prGeo, prMat);
  photonRing.renderOrder = 10; // always drawn on top of the disk
  scene.add(photonRing);

  // --- soft outer glow billboard ---
  const glowSprite = makeGlowSprite(hr * 6.0, 0xffb060, 0.9);
  glowSprite.renderOrder = -1;
  scene.add(glowSprite);

  return {
    hole,
    diskGroup,
    diskMat,
    diskMesh,
    photonRing,
    glowSprite,
    // Renderer-only adapter: the current scene.js drives the black hole
    // through bh.update(dt, time). This reproduces exactly what the old
    // scene.js did for this baseline — animate the disk shader's clock and
    // gently spin the disk group. No visual composition change.
    update(dt, time) {
      if (diskMat) diskMat.uniforms.uTime.value = time;
      diskGroup.rotation.z += dt * 0.02;
    },
    // Renderer-only fx hooks the current loop.js calls on tear/consume/proximity
    // (optional-chained against bh, not against the method — they must exist).
    // No-ops in this baseline: the pre-6B build has no cinematic glare.
    setProximity() {},
    flash() {},
    agitate() {},
    gulp() {}, // Phase 30 — consumption "gulp" squish (no-op legacy baseline)
  };
}

function makeDiskMaterial(inner, outer) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uInner: { value: inner },
      uOuter: { value: outer },
      uColor: { value: new THREE.Color(0xffb060) },
      uColorHot: { value: new THREE.Color(0xfff2d8) },
      uOpacity: { value: 0.95 },
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
      uniform vec3 uColor;
      uniform vec3 uColorHot;
      uniform float uOpacity;
      uniform float uTime;
      varying vec3 vPos;
      void main() {
        float r = length(vPos.xy);
        float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
        float angle = atan(vPos.y, vPos.x);

        // radial falloff: white-hot inner edge cooling outward
        float falloff = pow(1.0 - t, 1.4);

        // gentle brightness ripple — keeps the disk a full symmetric ring
        float beam = 1.0 + 0.10 * cos(angle * 1.0 - uTime * 0.6);

        // turbulent swirl bands that shear radially (real disks are turbulent)
        float band = sin(angle * 7.0 + uTime * 0.9 - t * 18.0);
        float band2 = sin(angle * 13.0 - uTime * 1.3 - t * 30.0);
        float shimmer = 1.0 + 0.30 * band * (1.0 - t) + 0.14 * band2 * (1.0 - t);

        // Painterly gradient-banding (soft posterization)
        float brightRaw = falloff * beam * shimmer * uOpacity * 1.25;
        float scaled = brightRaw * 4.0;
        float stepped = floor(scaled + 0.5) / 4.0;
        // Less aggressive blending: keep 60% of original, 40% posterized.
        float bright = mix(brightRaw, stepped, 0.4);

        vec3 col = mix(uColorHot, uColor, pow(t, 0.8)) * bright;

        // Rim light
        col += vec3(0.8, 0.9, 1.0) * pow(1.0 - t, 4.0) * falloff * 0.5;

        float alpha = falloff * beam * 0.95;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function makeGlowSprite(radius, color, opacity) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,190,120,0.9)');
  grad.addColorStop(0.3, 'rgba(255,140,60,0.35)');
  grad.addColorStop(1, 'rgba(255,120,40,0)');
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
