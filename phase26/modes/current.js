// phase26/modes/current.js — CURRENT: faithful reproduction of the production
// renderer architecture (js/render/blackhole.js baseline): black sphere +
// flat tilted accretion ring + camera-facing photon ring + glow sprite.
// No gravitational lensing — the "bending" is the far half of a flat tilted
// ring being occluded by the near hemisphere of the black sphere.

import { makeStarfield, makeGlow } from '../common.js';

export function create({ scene, hr, quality }) {
  const star = makeStarfield(scene);

  // black sphere (event horizon)
  const hole = new THREE.Mesh(
    new THREE.SphereGeometry(hr * 0.99, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  scene.add(hole);

  // flat tilted accretion ring (~80° tilt, near edge-on)
  const diskGroup = new THREE.Group();
  diskGroup.rotation.x = -1.4;
  const diskInner = hr * 1.35, diskOuter = hr * 3.2;
  const diskGeom = new THREE.RingGeometry(diskInner, diskOuter, 96, 1);
  const diskMat = makeDiskMaterial(diskInner, diskOuter);
  const diskMesh = new THREE.Mesh(diskGeom, diskMat);
  diskGroup.add(diskMesh);
  scene.add(diskGroup);

  // camera-facing photon ring
  const prGeo = new THREE.RingGeometry(hr * 1.04, hr * 1.12, 96, 1);
  const prMat = new THREE.MeshBasicMaterial({
    color: 0xffe8c0, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    side: THREE.DoubleSide,
  });
  const photonRing = new THREE.Mesh(prGeo, prMat);
  photonRing.renderOrder = 10;
  scene.add(photonRing);

  const glow = makeGlow(scene, hr * 6.0, 0xffb060, 0.9);
  glow.renderOrder = -1;

  function setQuality(q) {
    // CURRENT baseline has no real quality tiers; geometry is cheap already.
    const segs = q === 'high' ? 96 : q === 'medium' ? 64 : 40;
    diskMesh.geometry.dispose();
    diskMesh.geometry = new THREE.RingGeometry(diskInner, diskOuter, segs, 1);
    return;
  }

  return {
    objects: [star, hole, diskGroup, diskMesh, photonRing, glow],
    update(dt, time) {
      diskMat.uniforms.uTime.value = time;
      diskGroup.rotation.z += dt * 0.02;
    },
    setCamera(camera) {
      photonRing.quaternion.copy(camera.quaternion);
    },
    setQuality,
    destroy(scene) {
      scene.remove(star, hole, diskGroup, photonRing, glow);
      star.geometry.dispose(); star.material.dispose();
      hole.geometry.dispose(); hole.material.dispose();
      diskGeom.dispose(); diskMat.dispose();
      prGeo.dispose(); prMat.dispose();
    },
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
      void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
    `,
    fragmentShader: `
      uniform float uInner, uOuter, uOpacity, uTime;
      uniform vec3 uColor, uColorHot;
      varying vec3 vPos;
      void main(){
        float r=length(vPos.xy);
        float t=clamp((r-uInner)/(uOuter-uInner),0.0,1.0);
        float angle=atan(vPos.y,vPos.x);
        float falloff=pow(1.0-t,1.4);
        float beam=1.0+0.10*cos(angle-uTime*0.6);
        float band=sin(angle*7.0+uTime*0.9-t*18.0);
        float band2=sin(angle*13.0-uTime*1.3-t*30.0);
        float shimmer=1.0+0.30*band*(1.0-t)+0.14*band2*(1.0-t);
        vec3 col=mix(uColorHot,uColor,pow(t,0.8));
        col*=falloff*beam*shimmer*uOpacity*1.25;
        float alpha=falloff*beam*0.95;
        gl_FragColor=vec4(col,alpha);
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide,
  });
}
