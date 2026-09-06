// phase26/modes/ref_a.js — REFERENCE A: a minimal, mobile-leaning adaptation of
// oseiskar/black-hole's Schwarzschild geodesic raytracer. Per-pixel rays are
// integrated through the Schwarzschild metric (u = 1/r coordinates, leapfrog
// integration) and bent by gravity; the accretion disk is a z=0 plane the rays
// intersect; the shadow is implicit (any ray reaching u=1 returns black). The
// background starfield texture is sampled along each ray's final direction, so
// the lensing warps the stars AND folds the far side of the disk over the
// shadow — genuine gravitational lensing, not a flat ring.
//
// Technique MIT (c) Otto Seiskari "black-hole", adapted & simplified here.

import { makeBackgroundTexture } from '../bgtex.js';

export function create({ scene, camera, hr, quality, renderer }) {
  const bgTex = makeBackgroundTexture(1024);

  // Fullscreen quad — rendered as the ONLY pass, straight to the canvas.
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uResolution: { value: new THREE.Vector2() },
      uCamPos: { value: new THREE.Vector3() },
      uCamX: { value: new THREE.Vector3() },
      uCamY: { value: new THREE.Vector3() },
      uCamZ: { value: new THREE.Vector3() },
      uBgTex: { value: bgTex },
      uTime: { value: 0 },
      uNs: { value: 100 },
      uHr: { value: hr },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv=uv; gl_Position=vec4(position.xy,0.999999,1.0); }
    `,
    fragmentShader: refAFragment,
    depthWrite: false, depthTest: false,
    toneMapped: false,
  });
  const quad = new THREE.Mesh(geometry, material);
  // make the ray-that-aims-exactly-at-origin not NaN (see shader guard)
  quad.frustumCulled = false;

  // The raytracer draws EVERYTHING (background + disk + shadow), so it is the
  // whole render: a tiny scene with just the quad and an ortho camera.
  const fxScene = new THREE.Scene();
  fxScene.add(quad);
  const fxCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // The horizon the geometry needs (world scale matches the game: hr=40).
  void scene; void camera; void hr;

  return {
    objects: [quad],
    update(dt, time) { material.uniforms.uTime.value = time; },
    setCamera(cam) {
      const u = material.uniforms;
      u.uCamPos.value.copy(cam.position);
      const m = cam.matrixWorld;
      u.uCamX.value.set(m.elements[0], m.elements[1], m.elements[2]).normalize();
      u.uCamY.value.set(m.elements[4], m.elements[5], m.elements[6]).normalize();
      u.uCamZ.value.set(-m.elements[8], -m.elements[9], -m.elements[10]).normalize();
    },
    setQuality(q) {
      material.uniforms.uNs.value = q === 'high' ? 240 : q === 'medium' ? 120 : 56;
    },
    render(renderer) {
      const w = renderer.domElement.width, h = renderer.domElement.height;
      material.uniforms.uResolution.value.set(w, h);
      this.setCamera ? null : null;
      renderer.render(fxScene, fxCam);
    },
    destroy() {
      geometry.dispose(); material.dispose(); bgTex.dispose();
    },
  };
}

const refAFragment = /* glsl */`
precision highp float;
uniform vec2 uResolution;
uniform vec3 uCamPos, uCamX, uCamY, uCamZ;
uniform sampler2D uBgTex;
uniform float uTime;
uniform int uNs;
uniform float uHr;
varying vec2 vUv;

#define M_PI 3.14159265358979323846

vec3 diskColor(vec2 uv, float r01) {
  float ang = uv.y*2.0*M_PI;
  float fall = pow(1.0 - clamp(r01,0.0,1.0), 1.6);
  float turb = 0.7 + 0.3*sin(ang*6.0 + uv.x*12.0 - uTime*2.0)
             + 0.2*sin(ang*13.0 - uTime*3.0 + uv.x*20.0);
  vec3 hot = vec3(1.0,0.86,0.62);
  vec3 warm = vec3(0.98,0.56,0.25);
  vec3 cool = vec3(0.5,0.12,0.03);
  float t = clamp(r01,0.0,1.0);
  vec3 col = mix(hot, warm, smoothstep(0.0,0.5,t));
  col = mix(col, cool, smoothstep(0.35,1.0,t));
  return col * (fall*turb*1.7);
}

void main() {
  vec2 p = -1.0 + 2.0*vUv;
  p.y *= uResolution.y/uResolution.x;

  // Work in Schwarzschild radii: horizon == 1. Divide world pos by hr.
  vec3 pos = uCamPos / uHr;
  vec3 ray = normalize(p.x*uCamX + p.y*uCamY + 1.0*uCamZ);

  // Robust shadow fallback: independent of geodesic integration. Compute the
  // straight-line closest approach of the initial ray to the origin. Real
  // geodesics bend light so the true shadow is slightly LARGER than this naive
  // value, but this catches the high-elevation cases where the (u,phi) tangent
  // parametrization degenerates (rays near-parallel to the radius) and would
  // otherwise render NaN background with no shadow. Also robust to a top/side
  // view where the z=0 plane-crossing test never fires.
  vec3 camPos0 = uCamPos / uHr;
  float b0 = length(cross(camPos0, ray));

  float u = 1.0/length(pos);
  float u0 = u;
  vec3 normal_vec = normalize(pos);
  vec3 tangent_vec = normalize(cross(cross(normal_vec, ray), normal_vec));
  float du = 0.0;
  if (length(cross(normal_vec, ray)) > 1e-6) {
    du = -dot(ray,normal_vec)/dot(ray,tangent_vec)*u;
  }
  float du0 = du;
  float phi = 0.0;
  const float MAX_REV = 2.0;
  vec3 old_pos = pos;
  float isDisk = 0.0;
  vec2 diskUv = vec2(0.0);
  vec3 finalDir = ray;
  bool fell = false;

  for (int j=0; j<320; j++) {
    if (j >= uNs) break;
    float step = MAX_REV*2.0*M_PI/float(uNs);
    float max_rel_u_change = (1.0-log(u))*10.0/float(uNs);
    if ((du>0.0 || (du0<0.0 && u0/u<5.0)) && abs(du) > abs(max_rel_u_change*u)/step)
      step = max_rel_u_change*u/abs(du);

    u += du*step;
    float ddu = -u*(1.0-1.5*u*u);
    du += ddu*step;
    if (u < 0.0) break;
    phi += step;
    old_pos = pos;
    pos = (cos(phi)*normal_vec + sin(phi)*tangent_vec)/u;
    vec3 rseg = pos-old_pos;
    float rseg_len = length(rseg);

    if (old_pos.z * pos.z < 0.0) {
      float t = -old_pos.z / rseg.z;
      vec3 isec = old_pos + rseg*t;
      float r = length(isec);
      const float MIN_R = 1.5, W = 5.0;
      if (r > MIN_R) {
        isDisk = 1.0;
        diskUv = vec2((r-MIN_R)/W, atan(isec.x, isec.y)/M_PI*0.5+0.5);
        finalDir = normalize(rseg);
        break;
      }
    }
    if (u > 1.0) { fell = true; break; }
    if (rseg_len > 90.0) { finalDir = normalize(rseg); break; }
  }
  if (u < 1.0 && !fell && !(isDisk>0.5)) {
    if (length(pos) > 1.0) finalDir = normalize(pos-old_pos);
  }

  // Physical shadow: a ray whose straight-line impact parameter is inside the
  // photon-sphere shadow radius (3√3/2 ≈ 2.598 Schwarzschild radii) MUST fall
  // in. Catches degenerate-geometry high-elevation rays that the leapfrog
  // parametrization renders as NaN/background. (b0 computed from the finite,
  // non-NaN starting camera pos + ray, so it is always valid.) This matches the
  // lensed shadow size the geodesic integration produces on the equatorial
  // axis, keeping the silhouette consistent across camera elevations.
  if (!fell && b0 < 2.6) fell = true;

  if (fell) { gl_FragColor = vec4(0.0,0.0,0.0,1.0); return; }

  if (isDisk > 0.5) {
    float r01 = diskUv.x;
    vec3 col = diskColor(diskUv, r01);
    float forward = clamp(1.0 + finalDir.z, 0.0, 2.2);
    col *= (0.55 + 0.9*forward);
    gl_FragColor = vec4(col, 1.0);
    return;
  }

  vec3 dir = finalDir;
  vec2 tc = vec2(atan(dir.z,dir.x)/M_PI, asin(dir.y)/M_PI+0.5);
  gl_FragColor = vec4(texture2D(uBgTex, tc).rgb, 1.0);
}
`;
