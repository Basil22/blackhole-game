// render/comicfx.js — retro comic-book text FX: BOOM, BANG, SNAP, CRUNCH etc.
// DOM-based overlays positioned via 3D-to-screen projection. Each popup is a
// small spiky starburst shape near the action point, punches in and fades out.
//
// Two tiers:
//   - Major (consumption, escape): medium starburst, ~1s
//   - Minor (spring snap): small starburst, ~0.5s, heavily throttled

const MAJOR_WORDS = {
  consume: ['CHOMP!', 'GULP!', 'NOM!', 'MUNCH!'],
  tear: ['RIP!', 'SHRED!', 'SPLAT!'],
  escape: ['ZOOM!', 'WHOOSH!'],
  orbit: ['SPIN!', 'WHIRL!'],
};

const MINOR_WORDS = ['SNAP!', 'CRACK!', 'POP!', 'CRUNCH!'];

// [text color, starburst bg color]
const MAJOR_PALETTES = [
  ['#FFFFFF', '#FF3300'],
  ['#FFE800', '#DD2200'],
  ['#FFFFFF', '#FF6600'],
];

const MINOR_PALETTES = [
  ['#FFFFFF', '#DD4444'],
  ['#FFE800', '#AA3388'],
];

export class ComicFX {
  constructor(container, camera, renderer) {
    this.container = container;
    this.camera = camera;
    this.renderer = renderer;
    this._minorThrottle = 0;
  }

  _toScreen(pos3d) {
    const v = new THREE.Vector3(pos3d.x, pos3d.y, pos3d.z);
    v.project(this.camera);
    const canvas = this.renderer.domElement;
    return {
      x: (v.x * 0.5 + 0.5) * canvas.clientWidth,
      y: (-v.y * 0.5 + 0.5) * canvas.clientHeight,
      visible: v.z < 1,
    };
  }

  major(type, pos3d) {
    const words = MAJOR_WORDS[type] || MAJOR_WORDS.consume;
    const word = words[Math.floor(Math.random() * words.length)];
    const pal = MAJOR_PALETTES[Math.floor(Math.random() * MAJOR_PALETTES.length)];
    const screen = this._toScreen(pos3d);
    if (!screen.visible) return;
    this._spawn(word, screen.x, screen.y, pal, true);
  }

  minor(pos3d) {
    const now = performance.now();
    if (now - this._minorThrottle < 250) return; // tighter throttle
    this._minorThrottle = now;
    const word = MINOR_WORDS[Math.floor(Math.random() * MINOR_WORDS.length)];
    const pal = MINOR_PALETTES[Math.floor(Math.random() * MINOR_PALETTES.length)];
    const screen = this._toScreen(pos3d);
    if (!screen.visible) return;
    this._spawn(word, screen.x, screen.y, pal, false);
  }

  _spawn(word, x, y, palette, isMajor) {
    const el = document.createElement('div');
    el.className = 'comic-fx';
    if (isMajor) el.classList.add('comic-fx-major');
    else el.classList.add('comic-fx-minor');

    // Random slight rotation
    const rot = (Math.random() - 0.5) * 24;
    // Random offset so they don't stack on the same pixel
    const ox = (Math.random() - 0.5) * 40;
    const oy = (Math.random() - 0.5) * 30;

    el.style.left = `${Math.max(20, Math.min(x + ox, this.container.clientWidth - 20))}px`;
    el.style.top = `${Math.max(20, Math.min(y + oy, this.container.clientHeight - 20))}px`;
    el.style.setProperty('--fx-rot', `${rot}deg`);
    el.style.setProperty('--fx-text', palette[0]);
    el.style.setProperty('--fx-bg', palette[1]);

    // Build starburst SVG inline as background
    el.innerHTML = `<span class="comic-fx-text">${word}</span>`;

    this.container.appendChild(el);

    // Trigger animation
    requestAnimationFrame(() => el.classList.add('comic-fx-in'));

    const duration = isMajor ? 900 : 500;
    setTimeout(() => {
      el.classList.add('comic-fx-out');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }
}
