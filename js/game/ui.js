// game/ui.js — DOM UI: object picker, throw/slowmo/photo/settings, photo capture.
import { CATALOG } from '../objects.js';
import { getObjectChallengeProfile, difficultyLabel } from './challenges/index.js';
import { icon, iconForObject } from '../ui/icons.js';

export class UI {
  constructor(game, { onShare } = {}) {
    this.game = game;
    this.onShare = onShare || (() => {});
    this.slowmoBtn = null;
    this.throwBtn = null;
    this._bind();
  }

  _bind() {
    // object picker — Phase-10: each button shows name, difficulty label
    // (EASY/BALANCED/HARD/EXTREME — text, not color alone) and the short
    // challenge identity in the info line. Comments never imply physics changed.
    const picker = document.getElementById('picker');
    CATALOG.forEach((def, i) => {
      const btn = document.createElement('button');
      btn.className = 'obj-btn' + (i === 0 ? ' active' : '');
      btn.dataset.id = def.id;
      const profile = getObjectChallengeProfile(def.id);
      const label = profile ? difficultyLabel(profile.difficulty) : '';
      btn.setAttribute('aria-label', `${def.name} — difficulty ${label || 'unknown'}`);
      btn.innerHTML = `<span class="obj-icon">${icon(iconForObject(def.id), 22)}</span><span class="obj-name">${def.name}</span><span class="obj-diff">${label}</span>`;
      btn.addEventListener('click', () => {
        this.game.selectObject(def.id);
        picker.querySelectorAll('.obj-btn').forEach((b) => b.classList.toggle('active', b === btn));
        const info = document.getElementById('object-info');
        const identity = profile ? profile.shortDescription : def.desc;
        info.textContent = label ? `${def.name} · ${label} — ${identity}` : def.desc;
      });
      picker.appendChild(btn);
    });
    // default select
    this.game.selectObject(CATALOG[0].id);
    const def0 = CATALOG[0];
    const profile0 = getObjectChallengeProfile(def0.id);
    const label0 = profile0 ? difficultyLabel(profile0.difficulty) : '';
    document.getElementById('object-info').textContent = label0
      ? `${def0.name} · ${label0} — ${profile0.shortDescription}`
      : def0.desc;

    this.throwBtn = document.getElementById('throw-btn');
    this.throwBtn.addEventListener('click', () => this.game.beginAim());

    // Phase 17 — CANCEL replaces THROW while aiming (normal [slowmo][THROW] ↔
    // aiming [CANCEL]). The button is hidden by default; `.aiming` on the row
    // swaps them via CSS.
    this.bottomControls = document.getElementById('bottom-controls');
    this.cancelBtn = document.getElementById('cancel-btn');
    this.cancelBtn.addEventListener('click', () => this.game.cancelAim());

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
    const chip = document.getElementById('guidance-hud');
    const result = document.getElementById('result');
    const scrim = document.getElementById('result-scrim');
    const missionChip = document.getElementById('mission-chip');
    const missionModal = document.getElementById('mission-modal');
    if (hud) hud.style.display = v ? '' : 'none';
    if (top) top.style.display = v ? '' : 'none';
    if (fab) fab.style.display = v ? '' : 'none';
    if (chip) chip.style.display = v ? '' : 'none';
    if (result) result.style.display = v ? '' : 'none';
    if (scrim) scrim.style.display = v ? '' : 'none';
    if (missionChip) missionChip.style.display = v ? '' : 'none';
    if (missionModal) missionModal.style.display = v ? '' : 'none';
    // never leave a half-open mission selector behind photo mode
    if (missionModal && !v) missionModal.classList.remove('open');
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
      this._flash('FRAME CAPTURED');
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
    const bc = this.bottomControls;
    if (st.state === 'aim') {
      this.throwBtn.classList.add('aiming');
      this.throwBtn.textContent = 'DRAG TO AIM';
      if (bc) bc.classList.add('aiming');
    } else if (st.state !== undefined) {
      // idle or flying: always allow starting another throw
      this.throwBtn.classList.remove('aiming');
      this.throwBtn.disabled = false;
      this.throwBtn.textContent = 'THROW';
      if (bc) bc.classList.remove('aiming');
    }
    if (st.consumed) this._flash('CONSUMED BY THE SINGULARITY');
  }
}
