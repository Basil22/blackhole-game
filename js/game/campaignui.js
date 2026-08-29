// game/campaignui.js — the Phase-19 campaign UI: a compact level chip (current
// level + object + required-mission progress) and a lightweight level selector
// modal (states by TEXT: CURRENT / COMPLETED / LOCKED — never color alone).
// Also owns the one-shot intro hint ("DRAG TO AIM · RELEASE TO THROW") that
// shows until the first real launch.
//
// Performance contract (same as MissionUI): DOM is built once in the
// constructor. Updates are textContent / class toggles only — no innerHTML
// churn, no per-frame work, no animation loop, no Three.js. It reads ONLY the
// campaign controller (itself a pure consumer of completed mission ids) and
// never evaluates or writes anything itself.

import { CAMPAIGN_LEVELS, getLevel } from './campaign/index.js';
import { icon } from '../ui/icons.js';

export class CampaignUI {
  constructor({ campaign, objectCatalog, onSelectLevel } = {}) {
    this.campaign = campaign || null;
    this.objectCatalog = objectCatalog || [];
    this.onSelectLevel = onSelectLevel || (() => {});
    this._objName = (id) => {
      const d = this.objectCatalog.find((o) => o.id === id);
      return d ? d.name.toUpperCase() : id ? id.toUpperCase() : '';
    };

    this.chipEl = document.getElementById('level-chip');
    this.chipKickerEl = this.chipEl ? this.chipEl.querySelector('.lv-kicker') : null;
    this.chipCounterEl = this.chipEl ? this.chipEl.querySelector('.lv-counter') : null;
    this.chipTitleEl = this.chipEl ? this.chipEl.querySelector('.lv-title') : null;
    this.chipObjectEl = this.chipEl ? this.chipEl.querySelector('.lv-object') : null;
    this.modalEl = document.getElementById('level-modal');
    this.listEl = this.modalEl ? this.modalEl.querySelector('.lv-list') : null;
    this.introEl = document.getElementById('intro-hint');

    this._buildList();
    this._bind();
    this.refresh([]);
    // the game never emits an idle event at boot — seed the one-shot intro
    if (this.introEl && this.campaign && this.campaign.state.showIntro === true) {
      this.introEl.classList.add('show');
    }
  }

  _buildList() {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';
    for (const lvl of CAMPAIGN_LEVELS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lv-option';
      btn.dataset.id = lvl.id;
      btn.innerHTML = `
        <span class="lv-option-main">
          <span class="lv-marker"></span>
          <span class="lv-option-title">LEVEL ${lvl.index} · ${lvl.title}</span>
          <span class="lv-state"></span>
        </span>
        <span class="lv-option-object">${this._objName(lvl.objectId)}</span>
        <span class="lv-option-desc">${lvl.description}</span>`;
      btn.addEventListener('click', () => {
        if (!this.campaign) return;
        const changed = this.campaign.selectLevel(lvl.id, this._lastCompleted);
        if (changed) {
          this.onSelectLevel(lvl.objectId);
          this.refresh(this._lastCompleted);
        }
        this.close();
      });
      this.listEl.appendChild(btn);
    }
  }

  _bind() {
    if (this.chipEl) {
      this.chipEl.addEventListener('click', () => this.open());
    }
    if (this.modalEl) {
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) this.close();
      });
      const closeBtn = this.modalEl.querySelector('.lv-close');
      if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    }
  }

  // Sync chip + modal rows against the campaign controller. Called on boot and
  // after every completed throw. `completedMissionIds` is the Progression
  // controller's completed set — the single source of truth.
  refresh(completedMissionIds) {
    if (!this.campaign) return;
    this._lastCompleted = completedMissionIds || [];
    const completed = this.campaign.completedLevelIds(this._lastCompleted);
    const current = this.campaign.currentLevel(this._lastCompleted);
    this._renderChip(current, this._lastCompleted);
    this._renderList(completed, current);
  }

  _renderChip(current, completedMissionIds) {
    if (!this.chipEl || !current) return;
    if (this.chipTitleEl) this.chipTitleEl.textContent = current.title;
    if (this.chipObjectEl) this.chipObjectEl.textContent = this._objName(current.objectId);
    if (this.chipKickerEl) {
      const num = this.chipKickerEl.querySelector('.lv-num');
      if (num) num.textContent = String(current.index);
    }
    if (this.chipCounterEl) {
      // Phase 21: the chip counter is the CURRENT LEVEL of the 4-level ladder
      // ("1 / 4" on FIRST CONTACT, "4 / 4" on EVENT HORIZON) — where you are in
      // the run, the same unit as the LEVEL kicker. Per-level mission progress
      // stays in the modal.
      this.chipCounterEl.textContent = `${current.index} / ${CAMPAIGN_LEVELS.length}`;
    }
    if (this.chipEl) {
      this.chipEl.setAttribute('aria-label',
        `Campaign level ${current.index}: ${current.title}, ${this._objName(current.objectId)}. ${current.description}`);
    }
  }

  _renderList(completed, current) {
    if (!this.listEl) return;
    const missionDone = this._lastCompleted || [];
    for (const opt of this.listEl.querySelectorAll('.lv-option')) {
      const lvl = getLevel(opt.dataset.id);
      if (!lvl) continue;
      const unlocked = this.campaign.isLevelUnlocked(lvl.id, missionDone);
      const completedFlag = completed.includes(lvl.id);
      const currentFlag = !!current && current.id === lvl.id;
      const selected = this.campaign.state.currentLevelId === lvl.id;
      opt.classList.toggle('locked', !unlocked);
      opt.classList.toggle('completed', completedFlag);
      opt.classList.toggle('current', currentFlag);
      opt.classList.toggle('active', selected);
      opt.disabled = !unlocked;
      opt.setAttribute('aria-disabled', unlocked ? 'false' : 'true');
      const marker = opt.querySelector('.lv-marker');
      const state = opt.querySelector('.lv-state');
      const objEl = opt.querySelector('.lv-option-object');
      if (marker) marker.innerHTML = currentFlag ? '●' : (completedFlag ? icon('check', 12) : '');
      if (state) {
        if (!unlocked) {
          const hint = this.campaign.unlockHintForObject(lvl.objectId, missionDone);
          state.textContent = hint ? `LOCKED · ${hint}` : 'LOCKED';
        } else if (completedFlag) {
          state.textContent = 'COMPLETED';
        } else if (currentFlag) {
          state.textContent = 'CURRENT';
        } else {
          state.textContent = '';
        }
      }
      if (objEl) objEl.textContent = this._objName(lvl.objectId);
    }
  }

  open() {
    if (!this.modalEl) return;
    if (document.body.classList.contains('result-open')) return;
    this.modalEl.classList.add('open');
  }

  close() {
    if (this.modalEl) this.modalEl.classList.remove('open');
  }

  // One-shot first-play hint: show at idle until the first launch permanently
  // clears it (persisted by the campaign controller). Object/size/slowmo/consumed
  // events carry no state and never touch it.
  onGameState(st) {
    if (!this.campaign || !this.introEl) return;
    if (st && st.state === 'flying') {
      this.introEl.classList.remove('show');
      this.campaign.dismissIntro();
      return;
    }
    if (st && (st.state === 'aim' || st.state === 'idle')) {
      this.introEl.classList.toggle('show', st.state === 'idle' && this.campaign.state.showIntro === true);
    }
  }
}
