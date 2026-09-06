// phase26/modes/hybrid.js — HYBRID: the CURRENT renderer's real-3D architecture
// (opaque black sphere for the parallax-correct shadow silhouette + tilted flat
// accretion disk) PLUS a cheap shader-based lensing approximation. Instead of
// per-pixel geodesic integration (ref_a/ref_b), the disk's fragment shader applies
// a tangential (shear) + radial warp near the inner edge that mimics gravitational
// bending of the plasma around the void — the "photon ring" look without ray
// tracing. Cost stays at ~5-6 draws regardless of viewport/resolution, so it is
// the mobile-friendly candidate.
//
// Original renderer architecture (c) the blackhole-game project (see
// js/render/blackhole.js). Lensing-shear approximation inspired by the Phase 6E
// shader technique documented in AGENTS.md.

import { makeStarfield, makeGlow } from '../common.js';

export function create({ scene, hr, quality }) {
  const star = makeStarfield(scene);

  // black sphere = event horizon silhouette (real 3D occlusion/parallax)
  const hole = new THREE.Mesh(
    new THREE.SphereGeometry(hr * 0.99, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  scene.add(hole);

  // tilted accretion disk (near edge-on) with lensing-shear shader
  const diskGroup = new THREE.Group();
  diskGroup.rotation.x = -1.4;
  const diskInner = hr * 1.1, diskOuter = hr * 3.4;
  const diskGeom = new THREE.RingGeometry(diskInner, diskOuter, 96, 1);
  const diskMat = makeLensingDiskMaterial({ hr });
  const diskMesh = new THREE.Mesh(diskGeom, diskMat);
  diskGroup.add(diskMesh);
  scene.add(diskGroup);

  const glow = makeGlow(scene, hr * 6.0, 0xffb060, 0.9);
  glow.renderOrder = -1;

  function setQuality(q) {
    const segs = q === 'high' ? 128 : q === 'medium' ? 96 : 56;
    diskMesh.geometry.dispose();
    diskMesh.geometry = new THREE.RingGeometry(diskInner, diskOuter, segs, 1);
    diskMat.uniforms.uShear.value = (q === 'high' ? 1.0 : q === 'medium' ? 0.8 : 0.6);
  }

  return {
    objects: [star, hole, diskGroup, diskMesh, glow],
    update(dt, time) {
      diskMat.uniforms.uTime.value = time;
      diskGroup.rotation.z += dt * 0.015;
    },
    setCamera(camera) {},
    setQuality,
    destroy(scene) {
      scene.remove(star, hole, diskGroup, glow);
      star.geometry.dispose(); star.material.dispose();
      hole.geometry.dispose(); hole.material.dispose();
      diskGeom.dispose(); diskMat.dispose();
    },
  };
}

function makeLensingDiskMaterial({ hr }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uInner: { value: hr * 1.1 },
      uOuter: { value: hr * 3.4 },
      uHr: { value: hr },
      uShear: { value: 0.8 },
      uColor: { value: new THREE.Color(0xffb060) },
      uColorHot: { value: new THREE.Color(0xfff2d8) },
      uColorRed: { value: new THREE.Color(0xff5a20) },
      uOpacity: { value: 0.9 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vPos;
      void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
    `,
    fragmentShader: `
      uniform float uInner, uOuter, uHr, uShear, uOpacity, uTime;
      uniform vec3 uColor, uColorHot, uColorRed;
      varying vec3 vPos;
      float hash(float n){ return fract(sin(n)*43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i.x+i.y*157.0),hash(i.x+1.0+i.y*157.0),f.x),
                   mix(hash(i.x+(i.y+1.0)*157.0),hash(i.x+1.0+(i.y+1.0)*157.0),f.x),f.y);
      }
      float fbm(vec2 p){ float t=0.0,a=0.5; for(int i=0;i<4;i++){ t+=a*noise(p); p*=2.1; a*=0.5; } return t; }
      void main(){
        vec2 p=vPos.xy;
        vec2 pc=p+vec2(0.0,0.0);
        float r=length(pc);
        float ang=atan(pc.y,pc.x);

        // 1) RADIAL DOMAIN WARP — kill concentric-band artifact (Phase 6E 'tw')
        float tw = r + 0.35*uHr*fbm(vec2(ang*1.5, r*0.02 + uTime*0.05));

        // 2) TANGENTIAL LENSING SHEAR near the inner edge ("photon ring" bend).
        //    Peak at the shadow boundary, falls off outward — plasma appears
        //    wrapped/dragged around the void in the disk plane.
        float edge = smoothstep(uInner*0.8, uInner*1.8, tw);
        float lens = exp(-pow((tw/uInner-0.6)/0.4, 2.0));
        float shearedAng = ang + uShear * 0.9 * lens * fbm(vec2(ang*4.0, uTime*0.08 + tw*0.05)) * 10.0;

        // disk banding follows the sheared angle
        float t=clamp((tw-uInner*0.7)/(uOuter-uInner*0.7),0.0,1.0);
        float falloff=pow(1.0-t,1.4);
        float beam=1.0+0.12*cos(shearedAng-uTime*0.6);
        float band=sin(shearedAng*7.0+uTime*0.9-t*18.0);
        float band2=sin(shearedAng*13.0-uTime*1.3-t*30.0);
        float shimmer=1.0+0.30*band*(1.0-t)+0.14*band2*(1.0-t);

        vec3 col=mix(uColorHot, uColor, pow(t,0.8));
        // inner rim heats to red near the void (accretion)
        col=mix(col, uColorRed, smoothstep(1.0, 0.15, t)*0.5*lens);
        // inward-biased hot speckles riding the shear (like Phase 6E hotspots)
        float hot=fbm(vec2(shearedAng*9.0, tw*0.05));
        col+=vec3(1.0,0.72,0.35)*pow(hot,8.0)*2.2*lens*(1.0-t);

        col*=falloff*beam*shimmer*uOpacity*1.25;
        float alpha=falloff*beam*0.95;
        gl_FragColor=vec4(col,alpha);
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide,
  });
}
