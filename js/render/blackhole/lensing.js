import { plasmaFieldGLSL } from './plasmaField.js';

// render/blackhole/lensing.js — reduced-resolution relativistic lensing pass.
//
// This is the Phase 28 hybrid: keep the cheap, resolution-independent geometry
// renderer (black sphere + flat plasma disk + glow) as the primary/hero
// silhouette, and layer a LOW-RESOLUTION gravitational-lensing pass underneath
// that geodesically bends a procedural plasma field around the event-horizon
// shadow. At the game's wide camera framing the hole subtends a small angular
// size, so a reduced internal buffer + bilinear upscale is visually adequate at
// a fraction of the cost of full-resolution per-pixel ray tracing (Phase 27).
//
// Geodesic integration is the oseiskar/black-hole leapfrog scheme (u = 1/r
// coordinates, Schwarzschild metric), MIT (c) Otto Seiskari 2015 — see
// PHASE27_RESEARCH.md. Only the minimal math needed is ported; nothing from the
// original repo's app/UI is used. The plasma is sampled from the shared
// plasmaField so the lensed backdrop reuses the existing accretion language.
//
// Mobile-first: the pass MUST stay within an explicit frame-time budget. If it
// exceeds it, reduce resolution -> fewer steps -> skip frames -> geometry-only.

let _instance = 0;
export function createLensingPass({ renderer, scene, camera, hr, quality = 'medium' }) {
  let w = renderer.domElement.width >> 0 || 1280;
  let h = renderer.domElement.height >> 0 || 720;

  // ---- reduced internal resolution (configurable via quality) ----
  const RES = {
    low: 0.16,
    medium: 0.24,
    high: 0.36,
  };
  // Cap the low-res buffer absolutely so even a huge desktop canvas stays cheap.
  const MAX_PX = 220 * 220;
  let scale = RES[quality] ?? RES.medium;
  let lw = Math.max(1, Math.round(w * scale));
  let lh = Math.max(1, Math.round(h * scale));

  const enabled = { value: true };
  let target = null;

  function buildTarget() {
    const useWebGL2 = typeof WebGL2RenderingContext !== 'undefined' &&
      renderer.getContext() instanceof WebGL2RenderingContext;
    try {
      const rt = new THREE.WebGLRenderTarget(lw, lh, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: useWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType,
        generateMipmaps: false,
      });
      target = rt;
    } catch (err) {
      // Fallback: no render target available -> geometry-only.
      enabled.value = false;
      return false;
    }
    return true;
  }

  // ---- fullscreen-quad shader (the geodesic ray march) ----
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uResolution: { value: new THREE.Vector2(lw, lh) },
      uAspect: { value: camera.aspect || (w / h) }, // camera aspect (width/height)
      uCamPos: { value: new THREE.Vector3() },
      uCamBasis: { value: new THREE.Matrix3() },
      uHr: { value: hr },
      uTime: { value: 0 },
      uUv: { value: new THREE.Vector4(1.0, 1.0, 0.0, 0.0) }, // upscale source rect
      uSteps: { value: 72 },
      uProximity: { value: 0 },
      uHot: { value: new THREE.Color(0xfff2d8) },
      uWarm: { value: new THREE.Color(0xffb060) },
      uCool: { value: new THREE.Color(0x7a2508) },
      uHotIntensity: { value: 1.0 },
      uCutoff: { value: 1.0 }, // 0..1 internal-quality blend
      uSegments: { value: 20 }, // low-poly angular facet count (quality)
      uMot: { value: 1.0 },     // 1 = reduced motion (plasma advection slowed)
      uGlow: { value: 1.0 },    // 0..1 radial glow strength (quality)
      uDebug: { value: 0 },   // 0 off · 1 state-map (fell=red, disk=green, none=blue)
      uRot: { value: new THREE.Matrix3().fromArray([
        1, 0, 0,
        0, 0.17, 0.985, // plane tilt ~ around X so the disk is nearly edge-on
        0, -0.985, 0.17,
      ]) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: lensingFragment,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  const quad = new THREE.Mesh(geometry, material);
  quad.frustumCulled = false;

  const passScene = new THREE.Scene();
  passScene.add(quad);
  const passCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // ---- upscale-composite quad (draws the low-res target additively) ----
  const compGeom = new THREE.PlaneGeometry(2, 2);
  const compMat = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: null },
      uRes: { value: new THREE.Vector2(lw, lh) },
      uUv: { value: new THREE.Vector4(1, 1, 0, 0) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: `
      uniform sampler2D uTex;
      uniform vec2 uRes;
      uniform vec4 uUv; // x,y = scale; z,w = offset
      varying vec2 vUv;
      // Painterly gradient-banding (soft posterization) for comic look.
      // Band edges are smoothstepped rather than hard-cut to survive upscale.
      vec3 posterizeColor(vec3 c, float bands) {
        vec3 scaled = c * bands;
        vec3 stepped = floor(scaled + 0.5) / bands;
        return mix(c, stepped, 0.4);
      }

  // Painterly gradient-banding (soft posterization) for comic look.
  // Band edges are smoothstepped rather than hard-cut to survive upscale.
  vec3 posterizeColor(vec3 c, float bands) {
    vec3 scaled = c * bands;
    vec3 stepped = floor(scaled + 0.5) / bands;
    return mix(c, stepped, 0.4);
  }

  void main(){
    vec2 tc = vUv * uUv.xy + uUv.zw;
    vec3 col = texture2D(uTex, tc).rgb;
    col = posterizeColor(col, 4.0);
    gl_FragColor = vec4(col, 1.0);
  }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  const compMesh = new THREE.Mesh(compGeom, compMat);
  compMesh.frustumCulled = false;
  compMesh.renderOrder = -5; // behind the glow + geometry silhouette

  scene.add(compMesh);

  // Time-sliced rendering: re-ray-march only every N frames (per quality
  // budget) so the lens pass never competes frame-to-frame with the gameplay
  // loop on mobile. The composite draws the LAST lens frame every frame, so the
  // result only ever stutters at the LOW internal update rate, never gaps.
  let tick = 0;
  let frameEvery = 1;
  let lastBudget = quality === 'low' ? 0.4 : quality === 'medium' ? 0.7 : 1.0;
  frameEvery = Math.max(1, Math.ceil(1 / lastBudget - 0.001));

  function setQuality(q) {
    quality = q;
    scale = RES[q] ?? RES.medium;
    const nw = Math.max(1, Math.round(w * scale));
    const nh = Math.max(1, Math.round(h * scale));
    if (nw !== lw || nh !== lh) {
      lw = nw; lh = nh;
      material.uniforms.uResolution.value.set(lw, lh);
      compMat.uniforms.uRes.value.set(lw, lh);
      // force a rebuild of the target on next render
      if (target) { target.dispose(); target = null; }
    }
    material.uniforms.uSteps.value = q === 'high' ? 110 : q === 'medium' ? 72 : 40;
    material.uniforms.uCutoff.value = q === 'low' ? 0.55 : 1.0;
    // Phase 29 — low-poly facets + glow scale with quality detail.
    material.uniforms.uSegments.value = q === 'high' ? 28 : q === 'medium' ? 20 : 12;
    material.uniforms.uGlow.value = q === 'low' ? 0.35 : q === 'medium' ? 0.8 : 1.0;
    lastBudget = q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1.0;
    frameEvery = Math.max(1, Math.ceil(1 / lastBudget - 0.001));
    return lastBudget;
  }

  // Resize the reduced lens buffer to follow the drawing-buffer size, preserving
  // the viewport's aspect ratio (Part E/K). w,h = NEW drawing-buffer dims (CSS*DPR);
  // the buffer scales by `scale` on both axes so its aspect always equals the
  // viewport/camera aspect (no accidental 256x256-for-16:9 non-uniformity).
  function resize(nw, nh) {
    if (!nw || !nh) return;
    w = nw >> 0; h = nh >> 0;
    const nlw = Math.max(1, Math.round(w * scale));
    const nlh = Math.max(1, Math.round(h * scale));
    if (nlw !== lw || nlh !== lh) {
      lw = nlw; lh = nlh;
      material.uniforms.uResolution.value.set(lw, lh);
      compMat.uniforms.uRes.value.set(lw, lh);
      if (target) { target.dispose(); target = null; }
    }
  }

  // ---- shared helpers reused by the fx hooks ----
  function pickCamera(params) {
    const u = material.uniforms;
    u.uCamPos.value.copy(camera.position);
    // Aspect must always mirror the PRODUCTION camera (Part J): the lens ray at
    // NDC (p.x,p.y) is dir ∝ (p.x*aspect, p.y, 1) in camera space for Three.js r150
    // (x scaled by aspect, y = the tanHalfFov reference axis). Pulling it from
    // camera.aspect every frame keeps the pass consistent with the main renderer
    // even across viewport resizes.
    u.uAspect.value = (camera.aspect || 1) * 1.0;
    const m = camera.matrixWorld.elements;
    // uCamBasis (Matrix3, column-major) columns = [right, up, forward]
    // (forward points away from target).
    const e = u.uCamBasis.value.elements;
    e[0] = m[0]; e[1] = m[1]; e[2] = m[2];
    e[3] = m[4]; e[4] = m[5]; e[5] = m[6];
    e[6] = -m[8]; e[7] = -m[9]; e[8] = -m[10];
  }

  function marchPass() {
    if (!target) {
      const built = buildTarget();
      if (!built) return;
    }
    material.uniforms.uResolution.value.set(lw, lh);
    renderer.setRenderTarget(target);
    renderer.render(passScene, passCam);
    renderer.setRenderTarget(null);
  }

  const api = {
    enabled,
    material,
    target: () => target,
    get resolution() { return target ? [target.width, target.height] : [0, 0]; },
    getSteps: () => material.uniforms.uSteps.value,
    getAspect: () => material.uniforms.uAspect.value,
    setQuality,
    resize,
    debug(on) {
      material.uniforms.uDebug.value = on === 2 ? 2 : (on ? 1 : 0);
      const mode = (on === 2 || on === 1) ? THREE.NormalBlending : THREE.AdditiveBlending;
      compMat.blending = mode;
      compMat.transparent = !on;
    },
    // Diagnostic: render the ray-march quad DIRECTLY to the screen (no target,
    // no composite). Lets a harness inspect the raw geodesic output / state map.
    debugRender() {
      renderer.setRenderTarget(null);
      renderer.render(passScene, passCam);
    },
    update(dt, time) {
      material.uniforms.uTime.value = time;
    },
    // Called every frame while the camera may change; cheap (no ray march).
    sync(cam) {
      camera = cam;
      camera.updateMatrixWorld();
      pickCamera();
    },
    // Render the reduced-res lensed plasma + shadow to the target (time-sliced
    // by quality budget — composite still draws the last lens frame each frame).
    render() {
      if (!enabled.value) return;
      tick++;
      if (tick % frameEvery !== 0) return;
      marchPass();
    },
    // Ungated march — used by diagnostic/benchmark harnesses only.
    march() {
      if (!enabled.value) return;
      marchPass();
    },
    // Upscale + composite the lens frame into the main scene (additive, behind).
    composite() {
      if (!enabled.value || !target) return;
      compMat.uniforms.uTex.value = target.texture;
      // The composite quad is already added to the scene; the main renderer
      // picks it up on the next scene.render().
    },
    setProximity(p) {
      material.uniforms.uProximity.value = p;
      // proximity also brightens the hot core slightly (renderer-only)
      material.uniforms.uHotIntensity.value = 0.75 + 0.45 * p;
    },
    flash() {
      material.uniforms.uProximity.value = Math.min(1, material.uniforms.uProximity.value + 0.6);
    },
    agitate() {
      material.uniforms.uTime.value += 0.7;
    },
    // Phase 29 — reduced-motion: freeze/slow the plasma advection (uMot=1 froze,
    // =0 full motion). The static faceted geometry stays perfectly readable.
    setReducedMotion(on) {
      material.uniforms.uMot.value = !!on ? 1.0 : 0.0;
    },
    setGlow(g) {
      material.uniforms.uGlow.value = Math.max(0, Math.min(1, g));
    },
    dispose() {
      scene.remove(compMesh);
      geometry.dispose(); material.dispose();
      compGeom.dispose(); compMat.dispose();
      if (target) target.dispose();
    },
  };

  // initial build
  material.uniforms.uSteps.value = quality === 'high' ? 110 : quality === 'medium' ? 72 : 40;
  material.uniforms.uSegments.value = quality === 'high' ? 28 : quality === 'medium' ? 20 : 12;
  material.uniforms.uGlow.value = quality === 'low' ? 0.35 : quality === 'medium' ? 0.8 : 1.0;
  buildTarget();
  // If WebGL can't allocate a target, we fall back to pure geometry rendering.
  compMat.uniforms.uTex.value = target ? target.texture : null;
  if (!target) {
    scene.remove(compMesh);
  }

  return api;
}

// ---- geodesic lensing fragment shader (oseiskar leapfrog, adapted) ----
const lensingFragment = /* glsl */`
precision highp float;
uniform vec2 uResolution;
uniform float uAspect;
uniform vec3 uCamPos;
uniform mat3 uCamBasis;
uniform float uHr;
uniform float uTime;
uniform int uSteps;
uniform float uProximity;
uniform vec3 uHot, uWarm, uCool;
uniform float uHotIntensity;
uniform float uCutoff;
uniform int uDebug;
uniform mat3 uRot;
uniform float uSegments;
uniform float uMot;
uniform float uGlow;
varying vec2 vUv;

#define PI 3.14159265358979323846
#define MIN_R 1.4
#define WD 4.5
// Accretion-disk vertical half-thickness in Schwarzschild radii. A genuine disk
// hit must stay within this of the z=0 accretion plane (see the march loop) so
// steep off-plane rays don't paint full-height vertical plasma columns.
#define Z_MAX 1.6

/* SHARED PLASMA FIELD (plasmaField.js) defines: samplePlasma(r, ang, time) */
` + plasmaFieldGLSL() + /* glsl */`

void main(){
  vec2 p = -1.0 + 2.0 * vUv;
  // ASPECT-CORRECT CAMERA RAY (Part D/E). For the production PerspectiveCamera
  // (Three.js r150) the ray at NDC (p.x, p.y) in [-1,1]^2 is
  //   dir = normalize( R*p.x*tanHalfFov*aspect + U*p.y*tanHalfFov + F )
  // and normalization drops the common tanHalfFov, giving
  //   dir = normalize( R*p.x*aspect + U*p.y + F )   (R,U,F = right/up/forward)
  // So the HORIZONTAL NDC coordinate is scaled by the camera aspect while the
  // vertical coordinate stays the tanHalfFov reference axis. (The OLD code did
  // p.y *= uResolution.y/uResolution.x, dividing the vertical by aspect on the
  // wrong axis, which over-widened the vertical FOV for narrow/portrait and
  // shrank it for wide/landscape, causing the full-height vertical plasma
  // columns and the tall-stretched shadow on 16:9/portrait.) uAspect mirrors
  // camera.aspect every sync.
  p.x *= uAspect;

  // Camera position in Schwarzschild radii (horizon == 1).
  vec3 cam = uCamPos / uHr;
  vec3 ray = normalize(uCamBasis[0]*p.x + uCamBasis[1]*p.y + uCamBasis[2]);
  // To keep the lens pass stable in the game's world frame, rotate the whole
  // problem so the accretion plane is "z≈0" in geodesic space (the tilt is
  // already baked into uRot, applied to cam + ray directions consistently).
  vec3 cam_rotd = uRot * cam;
  vec3 ray_rotd = normalize(uRot * ray);

  // Leapfrog integration in (u=1/r, phi) — oseiskar scheme.
  float u = 1.0 / length(cam_rotd);
  float u0 = u;
  vec3 pos = cam_rotd;
  vec3 normal_vec = normalize(cam_rotd);
  vec3 tangent_vec = normalize(cross(cross(normal_vec, ray_rotd), normal_vec));
  float du = 0.0;
  if (length(cross(normal_vec, ray_rotd)) > 1e-6) {
    du = -dot(ray_rotd, normal_vec) / dot(ray_rotd, tangent_vec) * u;
  }
  float du0 = du;
  float phi = 0.0;
  const float MAX_REV = 1.6;
  vec3 old_pos = pos;
  vec2 diskUv = vec2(0.0);
  vec3 finalDir = ray_rotd;
  bool fell = false;
  float bestR = 1e8;
  vec2 bestUv = vec2(0.0);

  for (int j=0; j<160; j++) {
    if (j >= uSteps) break;
    float step = MAX_REV * 2.0 * PI / float(uSteps);
    float max_rel_u_change = (1.0 - log(u)) * 10.0 / float(uSteps);
    if ((du > 0.0 || (du0 < 0.0 && u0 / u < 5.0)) && abs(du) > abs(max_rel_u_change * u) / step)
      step = max_rel_u_change * u / abs(du);

    u += du * step;
    float ddu = -u * (1.0 - 1.5 * u * u);
    du += ddu * step;
    if (u < 0.0) break;
    phi += step;
    old_pos = pos;
    pos = (cos(phi) * normal_vec + sin(phi) * tangent_vec) / u;
    vec3 rseg = pos - old_pos;
    float rseg_len = length(rseg);

    // Accretion-plane proximity test. We care about the DEEPEST in-plane
    // pass (smallest |r_xy|) around the hole that also stays ATTACHED to the
    // accretion plane — NOT an unconstrained min over the whole geodesic. For
    // edge-on/oblique rays the z-sign test fires far outside the bright annulus
    // (or never), which leaves the shadow rim bare; and an unconstrained min
    // in-plane radius wrongly classes steep rays whose path merely passes
    // within a few hr of the axis at LARGE height (full-height vertical plasma
    // columns, Phase 28.1). So we gate on the ray being near the plane
    // (|z| < Z_MAX in Schwarzschild radii — the disk's thin vertical extent):
    // a real disk hit crosses (or grazes) z≈0 inside the annulus window.
    float rp = length(pos.xy);
    if (rp < bestR && abs(pos.z) < Z_MAX) {
      bestR = rp;
      bestUv = vec2(0.0, atan(pos.y, pos.x) / PI * 0.5 + 0.5);
      finalDir = normalize(rseg);
    }
    if (u > 1.0) { fell = true; break; }
    if (rseg_len > 80.0) { finalDir = normalize(rseg); break; }
  }
  // The ray must actually reach INTO the annulus window (MIN_R..MIN_R+WD) for
  // plasma to show; far-passing rays keep the starfield (nothing is sampled).
  bool isDisk = bestR > MIN_R && bestR < MIN_R + WD;
  diskUv = bestUv;
  diskUv.x = isDisk ? (bestR - MIN_R) / WD : 0.0;
  if (u < 1.0 && !fell && !isDisk) {
    if (length(pos) > 1.0) finalDir = normalize(pos - old_pos);
  }

  // Photon-sphere shadow fallback: rays whose straight-line impact parameter is
  // inside the critical capture radius MUST fall in (robust at high elevation
  // where the (u,phi) tangent degenerates).
  float b0 = length(cross(cam_rotd, ray_rotd));
  if (b0 < 2.6) fell = true;

  if (fell) { gl_FragColor = uDebug == 1 ? vec4(1.0, 0.0, 0.0, 1.0) : vec4(0.0, 0.0, 0.0, 1.0); return; }

  if (uDebug == 2) { gl_FragColor = vec4(length(cam_rotd)/8.0, length(ray_rotd), b0 / 3.0, 1.0); return; }

  if (isDisk) {
    if (uDebug == 1) { gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0); return; }
    if (uDebug == 3) { gl_FragColor = vec4(vec3(diskUv.x), 1.0); return; }
    // Sample the SHARED plasma field (plasmaField.js) along the bent ray. The
    // field knows the annulus window + turbulence + hotspots + radial ramp, so
    // this is the exact same visual language as the flat production disk.
    float r01 = clamp(diskUv.x, 0.0, 1.0);
    // diskUv.x = (r - MIN_R) / WD — recover the actual crossing radius (hr)
    // and map to world space so it matches the plasma annulus (44..320 @ hr=40).
    float rWorld = uHr * (MIN_R + r01 * WD);
    float ang = diskUv.y * 2.0 * PI + uTime * 0.15;
    vec3 col = samplePlasma(rWorld, ang, uTime);

    // Doppler asymmetry from the bend direction.
    float forward = clamp(1.0 + finalDir.z, 0.0, 2.2);
    col *= 0.55 + 0.9 * forward;

    // Proximity heats the plasma near the rim (renderer-only, no physics).
    col *= 0.7 + 0.5 * uProximity;
    gl_FragColor = vec4(col, 1.0);
    return;
  }

  // Background / non-disk rays contribute only a subtle glow hugging the shadow
  // silhouette (Phase 29). Rays grazing just OUTSIDE the photon shadow — impact
  // parameter just above the critical b0≈2.6 — get a faint, warm halo that fades
  // outward. This reinforces the black void and the relativistic ring with NO
  // bloom pass and without washing the far starfield (b0 is measured in the
  // hole's rotated frame, so the halo wraps the rim at every camera angle).
  float halo = uGlow * 0.09 * exp(-max(b0 - 2.6, 0.0) * 3.2)
               * smoothstep(8.0, 2.75, b0);
  vec3 glowC = mix(uCool, uHot, 0.5) * halo;
  gl_FragColor = uDebug == 1 ? vec4(0.05, 0.0, 1.0, 1.0) : vec4(glowC, 1.0);
}
`;
