// render/lights.js — scene lighting rig: warm skylight gradient + faint cool
// rim so the meshes read as dimensional.

export function buildLights(scene) {
  const heli = new THREE.HemisphereLight(0xbfd4ff, 0x1a0f08, 0.55);
  scene.add(heli);
  const ambient = new THREE.AmbientLight(0xffffff, 0.18);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xfff0e0, 1.1);
  dir.position.set(80, 120, 60);
  scene.add(dir);
  // faint blue fill from below
  const fill = new THREE.DirectionalLight(0x88aaff, 0.25);
  fill.position.set(-60, -80, -40);
  scene.add(fill);
}