// game/ui.js — DOM UI: object picker, throw/slowmo/photo/settings, photo capture.
import { CATALOG } from '../objects.js';

export class UI {
  constructor(game, { onShare } = {}) {
    this.game = game;
    this.onShare = onShare || (() => {});
    this.slowmoBtn = null;
    this.throwBtn = null;
    this._bind();
  }

  _bind() {
    // object picker
    const picker = document.getElementById('picker');
    CATALOG.forEach((def, i) => {
      const btn = document.createElement('button');
      btn.className = 'obj-btn' + (i === 0 ? ' active' : '');
      btn.dataset.id = def.id;
      btn.innerHTML = `<span class="obj-icon">${def.icon}</span><span class="obj-name">${def.name}</span>`;
      btn.addEventListener('click', () => {
        this.game.selectObject(def.id);
        picker.querySelectorAll('.obj-btn').forEach((b) => b.classList.toggle('active', b === btn));
        const info = document.getElementById('object-info');
        info.textContent = def.desc;
      });
      picker.appendChild(btn);
    });
    // default select
    this.game.selectObject(CATALOG[0].id);
    document.getElementById('object-info').textContent = CATALOG[0].desc;

    this.throwBtn = document.getElementById('throw-btn');
    this.throwBtn.addEventListener('click', () => this.game.beginAim());

    // size slider
    this.sizeSlider = document.getElementById('size-slider');
    this.sizeVal = document.getElementById('size-val');
    this.sizeSlider.addEventListener('input', () => {
      const s = parseFloat(this.sizeSlider.value);
      this.sizeVal.textContent = `${s.toFixed(1)}×`;
      this.game.setSize(s);
    });

    this.slowmoBtn = document.getElementById('slowmo-btn');
    this.slowmoBtn.addEventListener('click', () => {
      this.game.toggleSlowmo();
      this.slowmoBtn.classList.toggle('on', this.game.slowmo);
      this.slowmoBtn.textContent = this.game.slowmo ? '⏪' : '⏩';
    });

    document.getElementById('photo-btn').addEventListener('click', () => this._capture());

    document.getElementById('help-close').addEventListener('click', () => this.hideHelp());
    document.getElementById('help-open').addEventListener('click', () => this.showHelp());
    this.showHelp();

    document.getElementById('share-btn').addEventListener('click', () => this._share());
  }

  // hide HUD chrome during photo
  setHudVisible(v) {
    const hud = document.getElementById('hud');
    const top = document.getElementById('top-bar');
    const fab = document.getElementById('help-open');
    if (hud) hud.style.display = v ? '' : 'none';
    if (top) top.style.display = v ? '' : 'none';
    if (fab) fab.style.display = v ? '' : 'none';
  }

  async _capture() {
    this.setHudVisible(false);
    this.game.scene.renderer.domElement.toBlob((blob) => {
      if (!blob) { this.setHudVisible(true); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `blackhole_${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      this.setHudVisible(true);
      this._flash('📸 Frame captured');
    }, 'image/png');
  }

  async _share() {
    this.game.scene.renderer.domElement.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `blackhole_${Date.now()}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Black Hole Sandbox' }); return; } catch {}
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url; a.download = file.name; a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  _flash(msg) {
    const el = document.getElementById('flash');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1600);
  }

  showHelp() {
    document.getElementById('help-modal').classList.add('open');
  }

  hideHelp() {
    document.getElementById('help-modal').classList.remove('open');
  }

  // game state callbacks
  onGameState(st) {
    if (st.state === 'aim') {
      this.throwBtn.classList.add('aiming');
      this.throwBtn.textContent = 'DRAG TO AIM';
    } else if (st.state !== undefined) {
      // idle or flying: always allow starting another throw
      this.throwBtn.classList.remove('aiming');
      this.throwBtn.disabled = false;
      this.throwBtn.textContent = 'THROW';
    }
    if (st.consumed) this._flash('⚫ Consumed by the singularity');
  }
}
