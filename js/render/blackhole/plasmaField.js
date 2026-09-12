// render/blackhole/plasmaField.js — shared procedural accretion/plasma field.
//
// PHASE 30c-2 — IMPORTANT: this file stays FULLY SMOOTH (no posterize/banding
// here). Cel-shaded banding is applied at the COMPOSITE stage instead (see
// lensing.js's compMat and blackhole.js's diskMat), because this field is
// sampled inside a deliberately LOW-RESOLUTION ray-marched buffer that then
// gets bilinearly upscaled for mobile performance. Hard posterization edges
// computed at low res do not survive that upscale — they become chunky,
// blocky pixel artifacts once magnified. Smooth gradients survive the upscale
// fine, so all banding must happen after the upscale, at full resolution.
//
// Provides a single GLSL function, `samplePlasma(r, ang, time)` -> vec3, used
// by both the flat production disk (js/render/blackhole.js) and the
// relativistic lensing pass (lensing.js). Continuous swirl only — no floor()
// on angle anywhere, so orbiting the camera never reveals wedge seams.
//
// Depends on these uniforms the caller must declare:
//   uniform vec3 uHot, uWarm, uCool;  uniform float uHotIntensity;
//   uniform float uSegments;  (turbulence detail knob, quality-scaled)
//   uniform float uMot;       (1 = reduced motion: slow big advection)
//   uniform float uTime;

export function plasmaFieldGLSL() {
  return /* glsl */`
    float plasmaHash(float n){ return fract(sin(n)*43758.5453); }
    float plasmaNoise(vec2 p){
      vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(plasmaHash(i.x+i.y*157.0),plasmaHash(i.x+1.0+i.y*157.0),f.x),
                 mix(plasmaHash(i.x+(i.y+1.0)*157.0),plasmaHash(i.x+1.0+(i.y+1.0)*157.0),f.x),f.y);
    }
    float plasmaFbm(vec2 p){ float t=0.0,a=0.5; for(int i=0;i<4;i++){ t+=a*plasmaNoise(p); p*=2.06; a*=0.5; } return t; }

    // Sample the stylized accretion plasma at a world radius r, angle ang, and
    // animation time. Returns additive radiance >= 0 only inside the annulus;
    // 0 outside. Fully smooth/continuous — no posterization here (see note above).
    vec3 samplePlasma(float r, float ang, float time){
      float PI2 = 6.283185307179586;
      float rInner = 44.0, rOuter = 320.0;   // world-space plasma annulus (hr=40)
      float t = clamp((r - rInner) / (rOuter - rInner), 0.0, 1.0);

      float slo = mix(1.0, 0.12, uMot);
      float tA = time * slo;

      // ---- CONTINUOUS TURBULENT SWIRL ----
      float detail = clamp(uSegments / 20.0, 0.6, 1.4);
      float shearedAng = ang - tA * 0.10;
      float band1 = sin(shearedAng * (5.0 * detail) - t * 14.0 + tA * 0.7);
      float band2 = sin(shearedAng * (9.0 * detail) + t * 22.0 - tA * 1.1);
      vec2 turbUv = vec2(shearedAng * 2.4 * detail + t * 10.0, t * 4.0 + tA * 0.08);
      float turb = plasmaFbm(turbUv);
      float swirl = 1.0 + 0.32 * band1 + 0.16 * band2;
      float micro = 0.75 + 0.5 * turb;

      // ---- INNER COLLAR ----
      float collar = exp(-t * t / 0.10) * swirl * micro;

      // ---- OUTER BODY ----
      float outer = smoothstep(0.62, 0.08, t) * (0.35 + 0.5 * turb) * swirl;

      // ---- CRESCENT / DOPPLER ENVELOPE ----
      float arc = 0.5 + 0.5 * sin(ang + tA * 0.28 + 1.7);
      float sector = 0.3 + 0.7 * pow(arc, 1.4);
      float beam = 1.35 + 1.15 * cos(ang - tA * 0.60);

      // ---- DRIFTING HOTSPOTS ----
      float hot = 0.0;
      const int H = 3;
      for (int i = 0; i < H; i++) {
        float hi = float(i);
        float speed = 0.35 + 0.12 * plasmaHash(hi * 3.7 + 5.3);
        float base = hi * (PI2 / float(H)) + tA * speed;
        float hh = plasmaHash(hi * 3.7 + 5.3);
        float spotw = 0.22 + 0.20 * hh;
        float dA = abs(mod(ang - base, PI2));
        dA = min(dA, PI2 - dA);
        float spotEdge = smoothstep(spotw, spotw * 0.25, dA) * (0.6 + 0.5 * hh);
        hot += spotEdge * collar * pow(turb, 2.2);
      }
      hot *= sector * 1.8;

      // ---- COLOUR: two dominant hues, uCool only as a muted outer shadow ----
      float mixT = clamp(t * 1.15, 0.0, 1.0);
      vec3 baseCol = mix(uHot, uWarm, mixT);
      baseCol = mix(baseCol, uCool * 0.6, smoothstep(0.55, 1.0, t));

      float bright = (collar * 1.9 + outer) * sector * beam;
      vec3 body = baseCol * bright;
      vec3 hotCol = vec3(uHotIntensity) * hot * (1.0 - t);

      float outside = step(r, rOuter) * step(rInner, r);
      vec3 plasma = (body + hotCol) * (0.85 + 0.3 * micro) * outside;
      return plasma;
    }
  `;
}
