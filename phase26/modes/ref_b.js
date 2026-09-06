// phase26/modes/ref_b.js — REFERENCE B: a minimal, mobile-leaning adaptation of
// chrismatgit/black-hole-simulation's RK4 relativistic raytracer. Rays are
// integrated with explicit Runge-Kutta 4th order using the relativistic orbital
// equation geodesic_equation = -(3/2)*h2*pos/|pos|^5; step size scales with
// dist^2. The accretion disk is a plane crossing with a procedural FBM (turbulent)
// texture plus analytic Doppler + gravitational redshift. Shadow is implicit
// (ray reaches event horizon -> black).
//
// Technique MIT (c) Chris Matabaro "black-hole-simulation", adapted here.
//
// NOTE: chrismatgit's RK4 integrates actual 3D position with a step size scale
// factor, which is costlier per step than oseiskar's (u,phi) leapfrog; we keep
// the RK4 core to compare the two integration styles and their visual/perf cost.

import { makeBackgroundTexture } from '../bgtex.js';

export function create({ scene, camera, hr, quality, renderer }) {
  const bgTex = makeBackgroundTexture(1024);
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
      uIters: { value: 90 },
      uHr: { value: hr },
      uDisk: { value: 1.0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.999999,1.0); }`,
    fragmentShader: refBFragment,
    depthWrite: false, depthTest: false, toneMapped: false,
  });
  const quad = new THREE.Mesh(geometry, material);
  quad.frustumCulled = false;

  const fxScene = new THREE.Scene();
  fxScene.add(quad);
  const fxCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

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
      material.uniforms.uIters.value = (q === 'high' ? 220 : q === 'medium' ? 120 : 60);
    },
    render(renderer) {
      const w = renderer.domElement.width, h = renderer.domElement.height;
      material.uniforms.uResolution.value.set(w, h);
      renderer.render(fxScene, fxCam);
    },
    destroy() { geometry.dispose(); material.dispose(); bgTex.dispose(); },
  };
}

const refBFragment = /* glsl */`
precision highp float;
uniform vec2 uResolution;
uniform vec3 uCamPos, uCamX, uCamY, uCamZ;
uniform sampler2D uBgTex;
uniform float uTime;
uniform int uIters;
uniform float uHr;
uniform float uDisk;
varying vec2 vUv;

#define PI 3.14159265358979323846

float hash(float n){ return fract(sin(n)*753.5453123); }
float noise(vec3 x){
  vec3 p=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  float n=p.x+p.y*157.0+113.0*p.z;
  return mix(mix(mix(hash(n),hash(n+1.0),f.x),mix(hash(n+157.0),hash(n+158.0),f.x),f.y),
             mix(mix(hash(n+113.0),hash(n+114.0),f.x),mix(hash(n+270.0),hash(n+271.0),f.x),f.y),f.z);
}
float fbm(vec3 pos){
  float t=0.0; float amp=0.5; float fr=2.0;
  for(int i=0;i<4;i++){ t+=amp*noise(pos*fr); amp*=0.5; fr*=2.0; }
  return t;
}

// relativistic orbital dynamics (Schwarzschild correction), from chrismatgit
vec3 geodesic_equation(vec3 position, float h2){
  return -(1.5)*h2*position/pow(length(position),5.0);
}

void main(){
  vec2 p = -1.0 + 2.0*vUv;
  p.y *= uResolution.y/uResolution.x;

  vec3 pos = uCamPos / uHr;   // Schwarzschild units, horizon == 1
  vec3 ray = normalize(p.x*uCamX + p.y*uCamY + 1.0*uCamZ);
  vec3 velocity = ray;

  vec3 perp = cross(pos, velocity);
  float h2 = dot(perp, perp);

  float innerDiskR = 2.0, outerDiskR = 10.0;
  float disk_flow = 8.0;
  float flow_rate = 0.5;

  vec4 color = vec4(1.0);
  bool hit = false;
  vec3 hsv; // helper

  for(int i=0; i<300; i++){
    if(i >= uIters) break;
    float dist = length(pos);
    float stepScl = 2.5/float(uIters);
    float step_size = dist*dist*stepScl;
    vec3 rk_delta = velocity*step_size;

    vec3 k1 = step_size*geodesic_equation(pos, h2);
    vec3 k2 = step_size*geodesic_equation(pos + rk_delta + 0.5*k1, h2);
    vec3 k3 = step_size*geodesic_equation(pos + rk_delta + 0.5*k2, h2);
    vec3 k4 = step_size*geodesic_equation(pos + rk_delta + k3, h2);
    vec3 dv = (k1 + 2.0*(k2+k3)+k4)/6.0;

    vec3 ray_step = pos + rk_delta + dv;
    float rsd = length(ray_step);

    // accretion disk (plane y=0 in this space)
    if(uDisk > 0.5 && dist > innerDiskR && dist < outerDiskR && ray_step.y*pos.y < 0.001){
      float deltaDiskRadius = outerDiskR - innerDiskR;
      float disk_dist = dist - innerDiskR;
      vec3 uvw = vec3(
        atan(ray_step.z, abs(ray_step.x))/(PI*2.0) - disk_flow/sqrt(dist),
        pow(disk_dist/deltaDiskRadius,2.0) + (flow_rate/(PI*2.0))/deltaDiskRadius,
        ray_step.y*0.5+0.5
      );
      float disk_intensity = 1.0 - length(ray_step/vec3(outerDiskR,1.0,outerDiskR));
      disk_intensity *= smoothstep(innerDiskR, innerDiskR+1.0, dist);
      float density = fbm(pos + uvw*2.0);
      disk_intensity *= inversesqrt(dist)*density;

      vec3 shiftD = 0.6*cross(normalize(ray_step), vec3(0.0,1.0,0.0));
      float v = dot(ray, shiftD);
      float doppler = sqrt((1.0-v)/(1.0+v));
      float redshift = sqrt((1.0-2.0/dist)/(1.0-2.0/length(uCamPos/uHr)));

      vec3 crgb = vec3(1.0,0.62,0.30)*doppler*redshift*disk_intensity;
      color = vec4(crgb, 1.0);
      hit = true;
      break;
    }

    if(dist <= 1.0){ color = vec4(0.0,0.0,0.0,1.0); hit = true; break; } // shadow
    if(dist >= 200.0) break; // escaped

    pos += rk_delta;
    velocity += dv;
  }

  if(hit){ gl_FragColor = color; return; }

  // background along final ray
  vec2 tc = vec2(atan(pos.z,pos.x)/PI, asin(pos.y/200.0)/PI+0.5);
  gl_FragColor = vec4(texture2D(uBgTex, tc).rgb, 1.0);
}
`;
