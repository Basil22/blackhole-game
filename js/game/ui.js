// game/ui.js — DOM UI: object slot + picker, throw/slowmo/photo/settings, menu,
// photo capture (single action: share sheet when available, else download).
import { CATALOG, getObjectDef } from '../objects.js';
import { getObjectChallengeProfile, difficultyLabel } from './challenges/index.js';
import { icon, iconForObject } from '../ui/icons.js';

export class UI {
  constructor(game, { onShare, campaign } = {}) {
    this.game = game;
    this.campaign = campaign || null;   // optional Phase-19 lock gating (picker only)
    this.slowmoBtn = null;
    this.throwBtn = null;
    this.pickerBtns = [];
    this._bind();
  }

  _bind() {
    // object picker — Phase-21: the four tiles live in a collapsible panel
    // (#picker) opened from a single compact object slot (#obj-slot). Each tile
    // shows name, difficulty (EASY/BALANCED/HARD/EXTREME — text, not color) and
    // availability. The slot toggles the panel; the head carries a small X so
    // closing is explicit; the panel also closes on any tap outside it, on
    // selection, and while aiming so it can never cover the aim controls.
    const picker = document.getElementById('picker');
    picker.innerHTML = `
      <div class="obj-panel-head">
        <span class="obj-panel-label">OBJECTS</span>
        <button id="obj-panel-close" class="obj-panel-close" type="button"
          aria-label="Close object menu" title="Close">${icon('close', 14)}</button>
      </div>
      <div class="obj-panel-list"></div>`;
    const list = picker.querySelector('.obj-panel-list');
    CATALOG.forEach((def, i) => {
      const btn = document.createElement('button');
      btn.className = 'obj-btn' + (i === 0 ? ' active' : '');
      btn.dataset.id = def.id;
      const profile = getObjectChallengeProfile(def.id);
      const label = profile ? difficultyLabel(profile.difficulty) : '';
      btn.setAttribute('aria-label', `${def.name} — difficulty ${label || 'unknown'}`);
      btn.innerHTML = `<span class="obj-icon">${icon(iconForObject(def.id), 22)}</span><span class="obj-name">${def.name}</span><span class="obj-state"></span><span class="obj-diff">${label}</span>`;
      btn.addEventListener('click', () => {
        this.setObjectActive(def.id);
        this.closeObjectPanel();
      });
      list.appendChild(btn);
      this.pickerBtns.push(btn);
    });
    // default select
    this.setObjectActive(CATALOG[0].id);

    this.slotEl = document.getElementById('obj-slot');
    if (this.slotEl) {
      this.slotEl.addEventListener('click', () => this.toggleObjectPanel());
    }
    this.objRowEl = document.getElementById('obj-row');
    const closeBtn = document.getElementById('obj-panel-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeObjectPanel(true));
    // any tap outside the object row closes the panel (backdrop behavior)
    document.addEventListener('pointerdown', (e) => {
      if (this.objRowEl && !this.objRowEl.contains(e.target)) this.closeObjectPanel(true);
    });

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

    // single capture action — grabs a PNG (native share sheet when available,
    // download fallback). One button, one behavior, no duplicates.
    document.getElementById('photo-btn').addEventListener('click', () => this._capture());

    document.getElementById('help-close').addEventListener('click', () => this.hideHelp());
    document.getElementById('menu-btn').addEventListener('click', () => this.showMenu());
    document.getElementById('menu-help').addEventListener('click', () => {
      this.hideMenu();
      this.showHelp();
    });
    document.getElementById('menu-close').addEventListener('click', () => this.hideMenu());
    this.menuModalEl = document.getElementById('menu-modal');
    if (this.menuModalEl) {
      this.menuModalEl.addEventListener('click', (e) => {
        if (e.target === this.menuModalEl) this.hideMenu();
      });
      const helpRow = document.getElementById('menu-help');
      const settingsRow = document.getElementById('settings-open');
      if (helpRow) helpRow.innerHTML = `<span class="menu-row-icon">${icon('info', 18)}</span><span class="menu-row-label"><span class="menu-row-title">HOW TO PLAY</span><span class="menu-row-sub">rules, controls, physics</span></span>`;
      if (settingsRow) settingsRow.innerHTML = `<span class="menu-row-icon">${icon('settings', 18)}</span><span class="menu-row-label"><span class="menu-row-title">SETTINGS</span><span class="menu-row-sub">audio, haptics, intro</span></span>`;
    }
  }

  // Open/close the object panel. Returns true if it opened (no-op while a
  // dialog already owns the screen). Tapping the slot again closes it — the
  // head X and any outside tap do too.
  toggleObjectPanel() {
    if (!this.objRowEl) return;
    if (document.body.classList.contains('result-open')) return;
    if (this.objRowEl.classList.contains('open')) {
      this.closeObjectPanel(true);
      return;
    }
    this.objRowEl.classList.add('open');
    document.body.classList.add('obj-panel-open');
    if (this.slotEl) this.slotEl.setAttribute('aria-expanded', 'true');
  }

  closeObjectPanel(force) {
    if (!this.objRowEl) return;
    document.body.classList.remove('obj-panel-open');
    if (force) {
      this.objRowEl.classList.remove('open');
      if (this.slotEl) this.slotEl.setAttribute('aria-expanded', 'false');
      return;
    }
    if (this.objRowEl.classList.contains('open')) {
      this.objRowEl.classList.remove('open');
      if (this.slotEl) this.slotEl.setAttribute('aria-expanded', 'false');
    }
  }

  // Select an object: forward to the game, sync the slot + picker active state
  // and the info line. Used both by the picker's own click and by the campaign
  // layer when a level change auto-selects its object.
  setObjectActive(id) {
    const def = getObjectDef(id);
    if (!def) return;
    this.game.selectObject(id);
    for (const b of this.pickerBtns) b.classList.toggle('active', b.dataset.id === id);
    this._renderSlot(id);
    const info = document.getElementById('object-info');
    if (!info) return;
    const profile = getObjectChallengeProfile(id);
    const label = profile ? difficultyLabel(profile.difficulty) : '';
    const identity = profile ? profile.shortDescription : def.desc;
    info.textContent = label ? `${def.name} · ${label} — ${identity}` : def.desc;
  }

  // The compact slot mirrors the current object + its availability.
  _renderSlot(id) {
    if (!this.slotEl) return;
    const def = getObjectDef(id);
    if (!def) return;
    const state = this._objectState(id);
    this.slotEl.innerHTML = `<span class="obj-slot-icon">${icon(iconForObject(id), 22)}</span>`
      + `<span class="obj-slot-name">${def.name}</span>`
      + `<span class="obj-slot-state ${state.lock ? 'is-lock' : ''}"></span>`;
    this.slotEl.querySelector('.obj-slot-state').textContent = state.text;
    const profile = getObjectChallengeProfile(id);
    const label = profile ? difficultyLabel(profile.difficulty) : '';
    this.slotEl.setAttribute('aria-label', `${def.name} — difficulty ${label || 'unknown'}. Choose object.`);
  }

  _objectState(id) {
    if (!this.campaign || !this._completedMissionIds) {
      return { text: '', lock: false };
    }
    const unlocked = this.campaign.isObjectUnlocked(id, this._completedMissionIds);
    if (!unlocked) {
      // Phase 21: the compact form is the object's OWN level (astronaut is
      // LV.2, ship LV.3, planet LV.4) — the object unlocks when ITS level is
      // reached. unlockHintForObject still spells out which level to CLEAR.
      const n = this.campaign.objectLevelIndex(id);
      return { text: n ? `LOCKED · LV.${n}` : 'LOCKED', lock: true };
    }
    return { text: '', lock: false };
  }

  // Phase-19 object gating in the PICKER ONLY (game.selectObject stays open so
  // harnesses/dev hooks can still use every object). Locked → disabled +
  // aria-disabled + explicit text + dimmed, never color alone.
  refreshObjectPicker(completedMissionIds) {
    if (!this.campaign) return;
    this._completedMissionIds = completedMissionIds || [];
    for (const b of this.pickerBtns) {
      const id = b.dataset.id;
      const unlocked = this.campaign.isObjectUnlocked(id, this._completedMissionIds);
      const state = b.querySelector('.obj-state');
      b.classList.toggle('locked', !unlocked);
      b.disabled = !unlocked;
      b.setAttribute('aria-disabled', unlocked ? 'false' : 'true');
      if (!state) continue;
      state.classList.toggle('is-lock', !unlocked);
      if (!unlocked) {
        const n = this.campaign.objectLevelIndex(id);
        state.textContent = n ? `LOCKED · LV.${n}` : 'LOCKED';
      } else {
        state.textContent = id === this.game.currentId ? 'CURRENT' : 'UNLOCKED';
      }
    }
    this._renderSlot(this.game.currentId);
  }

  showMenu() {
    if (!this.menuModalEl) return;
    // a dialog owns the screen — never layer the menu over it
    if (document.body.classList.contains('result-open')) return;
    this.menuModalEl.classList.add('open');
  }

  hideMenu() {
    if (this.menuModalEl) this.menuModalEl.classList.remove('open');
  }

  // hide HUD chrome during photo
  setHudVisible(v) {
    const hud = document.getElementById('hud');
    const top = document.getElementById('top-bar');
    const menuFab = document.getElementById('menu-btn');
    const menuModal = document.getElementById('menu-modal');
    const chip = document.getElementById('guidance-hud');
    const result = document.getElementById('result');
    const scrim = document.getElementById('result-scrim');
    const missionChip = document.getElementById('mission-chip');
    const missionModal = document.getElementById('mission-modal');
    const levelChip = document.getElementById('level-chip');
    const levelModal = document.getElementById('level-modal');
    const intro = document.getElementById('intro-hint');
    const settingsModal = document.getElementById('settings-modal');
    if (hud) hud.style.display = v ? '' : 'none';
    if (top) top.style.display = v ? '' : 'none';
    if (menuFab) menuFab.style.display = v ? '' : 'none';
    if (menuModal) menuModal.style.display = v ? '' : 'none';
    if (chip) chip.style.display = v ? '' : 'none';
    if (result) result.style.display = v ? '' : 'none';
    if (scrim) scrim.style.display = v ? '' : 'none';
    if (missionChip) missionChip.style.display = v ? '' : 'none';
    if (missionModal) missionModal.style.display = v ? '' : 'none';
    if (levelChip) levelChip.style.display = v ? '' : 'none';
    if (levelModal) levelModal.style.display = v ? '' : 'none';
    if (intro) intro.style.display = v ? '' : 'none';
    if (settingsModal) settingsModal.style.display = v ? '' : 'none';
    // never leave a half-open modal/panel behind photo mode
    if (missionModal && !v) missionModal.classList.remove('open');
    if (levelModal && !v) levelModal.classList.remove('open');
    if (settingsModal && !v) settingsModal.classList.remove('open');
    if (menuModal && !v) menuModal.classList.remove('open');
    if (!v) this.closeObjectPanel(true);
  }

  // Single capture action: render → PNG → native share sheet when the device
  // offers one, otherwise download directly. Replaces the old dual
  // capture/share pair.
  async _capture() {
    this.setHudVisible(false);
    this.game.scene.renderer.domElement.toBlob(async (blob) => {
      if (!blob) { this.setHudVisible(true); return; }
      const name = `blackhole_${Date.now()}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Black Hole Sandbox' });
          this.setHudVisible(true);
          return;
        } catch (err) {
          // user dismissed the share sheet — fall through to the download
        }
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      this.setHudVisible(true);
      this._flash('FRAME CAPTURED');
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
      this.closeObjectPanel();   // the panel can never cover the aim controls
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
