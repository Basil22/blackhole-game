// game/missionui.js — the compact mission/objective UI. A small static chip
// shows the current mission (title + a subtle campaign counter), and a
// lightweight modal lets the player pick between the curated missions. The
// optional `progression` controller (Phase-8) gates which missions can be
// picked (locked ones are dimmed + disabled) and paints completed / current
// states. Without one the component degrades to the Phase-7 pick-any behavior.
//
// Performance contract: the DOM is built once in the constructor. After that,
// updates are textContent / class toggles only — no innerHTML churn, no per-
// frame work, no animation loop. It never evaluates anything itself; the result
// lifecycle (js/main.js) feeds it the finalized mission evaluation.

import { MISSION_CATALOG, getMission } from './missions/index.js';
import { MISSION_ORDER } from './progression/index.js';
import { getMissionChallenge, getRecommendedObject, getObjectChallengeProfile } from './challenges/index.js';
import { icon } from '../ui/icons.js';

export class MissionUI {
  constructor({ progression, objectCatalog } = {}) {
    this.selectedId = null;
    this.progression = progression || null;
    // Phase-10: the lightweight object catalog ({id,name}) injected by the
    // boot layer so recommendation runs against what's actually selectable.
    // The challenge evaluator is pure — it reads this list, never physics.
    this.objectCatalog = objectCatalog || [];

    this.chipEl = document.getElementById('mission-chip');
    this.chipTitleEl = this.chipEl ? this.chipEl.querySelector('.ms-title') : null;
    this.counterEl = this.chipEl ? this.chipEl.querySelector('.ms-counter') : null;
    this.chipObjEl = this.chipEl ? this.chipEl.querySelector('.ms-object') : null;
    this.modalEl = document.getElementById('mission-modal');
    this.listEl = this.modalEl ? this.modalEl.querySelector('.ms-list') : null;

    this._buildList();
    this._buildDetail();
    this._bind();
    this.refresh(this.progression);
  }

  _buildList() {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';
    for (const m of MISSION_CATALOG) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ms-option';
      btn.dataset.id = m.id;
      btn.innerHTML = `
        <span class="ms-option-main">
          <span class="ms-marker"></span>
          <span class="ms-option-title">${m.title}</span>
          <span class="ms-state"></span>
        </span>
        <span class="ms-option-desc">${m.description}</span>`;
      btn.addEventListener('click', () => this.select(m.id));
      this.listEl.appendChild(btn);
    }
  }

  // Phase-10: a compact detail card below the mission list. While the selector
  // is open it shows the selected mission's title, short description,
  // DIFFICULTY (dots + text + accessible label) and the RECOMMENDED object
  // (name + short reason). Text-only semantics — the color never carries the
  // meaning. Populated on open()/select(); no per-frame work.
  _buildDetail() {
    if (!this.modalEl) return;
    this.detailEl = document.createElement('div');
    this.detailEl.className = 'ms-detail';
    this.detailEl.innerHTML = `
      <div class="ms-detail-title"></div>
      <div class="ms-detail-desc"></div>
      <div class="ms-detail-meta">
        <span class="ms-detail-kicker">Difficulty</span>
        <span class="ms-detail-dots" role="img"></span>
        <span class="ms-detail-difflabel"></span>
      </div>
      <div class="ms-detail-rec">
        <span class="ms-detail-kicker">Recommended</span>
        <span class="ms-detail-recname"></span>
        <span class="ms-detail-recreason"></span>
      </div>`;
    this.listEl.after(this.detailEl);
  }

  // Render the selected-mission challenge card. Declarative, defensive: any
  // missing/garbage input collapses the card to a hidden state, never throws.
  _renderDetail() {
    const detailEl = this.detailEl;
    if (!detailEl) return;
    const m = this.getSelected();
    const ch = m ? getMissionChallenge(m.id) : null;
    const nameEl = detailEl.querySelector('.ms-detail-title');
    const descEl = detailEl.querySelector('.ms-detail-desc');
    const dotsEl = detailEl.querySelector('.ms-detail-dots');
    const diffEl = detailEl.querySelector('.ms-detail-difflabel');
    const recNameEl = detailEl.querySelector('.ms-detail-recname');
    const recReasonEl = detailEl.querySelector('.ms-detail-recreason');
    if (!ch) {
      detailEl.classList.remove('show');
      return;
    }
    nameEl.textContent = ch.mission.title;
    descEl.textContent = ch.mission.description;
    dotsEl.textContent = ch.difficulty.dots;
    dotsEl.setAttribute('aria-label', ch.difficulty.aria);
    diffEl.textContent = ch.difficulty.label;
    const rec = getRecommendedObject(ch.mission, this.objectCatalog);
    if (rec) {
      const profile = getObjectChallengeProfile(rec.objectId);
      const objName = (this.objectCatalog.find((d) => d.id === rec.objectId) || {}).name
        || (profile ? profile.title : rec.objectId);
      recNameEl.textContent = objName;
      recReasonEl.textContent = rec.reason;
      recNameEl.parentElement.classList.add('show');
    } else {
      recNameEl.textContent = '';
      recReasonEl.textContent = '';
      recNameEl.parentElement.classList.remove('show');
    }
    detailEl.classList.add('show');
  }

  _bind() {
    if (this.chipEl) {
      this.chipEl.addEventListener('click', () => this.open());
    }
    if (this.modalEl) {
      // tapping the backdrop closes the modal
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) this.close();
      });
      const closeBtn = this.modalEl.querySelector('.ms-close');
      if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    }
  }

  select(id) {
    if (!getMission(id)) return;
    if (this.progression && !this.progression.isUnlocked(id)) return;
    this.selectedId = id;
    this._render();
    this._renderDetail();
    this.close();
  }

  // Sync chip + list against the campaign controller. Called on boot and after
  // every completed throw — toggles classes / text only, never rebuilds DOM.
  refresh(p) {
    if (p) this.progression = p;
    this._renderList();
    this._render();
    this._renderDetail();
  }

  // Selector state, communicated by TEXT + marker, color only reinforces:
  //   LOCKED    → dimmed + disabled, "LOCKED" label, no marker
  //   COMPLETED → monochrome check icon + "COMPLETED" label
  //   CURRENT   → "●" marker + "CURRENT" label
  _renderList() {
    if (!this.listEl) return;
    const p = this.progression;
    for (const opt of this.listEl.querySelectorAll('.ms-option')) {
      const id = opt.dataset.id;
      const unlocked = !p || p.isUnlocked(id);
      const completed = !!p && p.isCompleted(id);
      const current = !!p && p.state.currentMissionId === id;
      opt.classList.toggle('locked', !unlocked);
      opt.classList.toggle('completed', completed);
      opt.classList.toggle('current', current);
      opt.disabled = !unlocked;
      opt.setAttribute('aria-disabled', unlocked ? 'false' : 'true');
      const marker = opt.querySelector('.ms-marker');
      const state = opt.querySelector('.ms-state');
      if (marker) marker.innerHTML = current ? '●' : (completed ? icon('check', 12) : '');
      if (state) state.textContent = !unlocked ? 'Locked' : (completed ? 'Completed' : (current ? 'Current' : ''));
    }
  }

  open() {
    if (!this.modalEl) return;
    // the result panel owns the screen while open — never layer the selector
    // over it (stale mission pick + accidental scroll)
    if (document.body.classList.contains('result-open')) return;
    // highlight the current selection
    for (const opt of this.listEl.querySelectorAll('.ms-option')) {
      opt.classList.toggle('active', opt.dataset.id === this.selectedId);
    }
    this.modalEl.classList.add('open');
    // refresh the challenge card each time the selector opens
    this._renderDetail();
  }

  close() {
    if (this.modalEl) this.modalEl.classList.remove('open');
  }

  getSelected() {
    return this.selectedId ? getMission(this.selectedId) : null;
  }

  // Refresh the chip (selected mission title + campaign counter) + aria labels
  // from the current selection. Class toggles + textContent only.
  _render() {
    const m = this.getSelected();
    if (!m) return;
    if (this.chipTitleEl) this.chipTitleEl.textContent = m.title;
    // third line mirrors the level chip so both cards keep the same 3-row
    // footprint: the mission's RECOMMENDED object plays the "OBJECT" slot.
    if (this.chipObjEl) {
      const ch = getMissionChallenge(m.id);
      const rec = ch ? getRecommendedObject(ch.mission, this.objectCatalog) : null;
      if (rec) {
        const profile = getObjectChallengeProfile(rec.objectId);
        this.chipObjEl.textContent = (this.objectCatalog.find((d) => d.id === rec.objectId) || {}).name
          || (profile ? profile.title : rec.objectId);
        this.chipObjEl.style.display = '';
      } else {
        this.chipObjEl.textContent = '';
        this.chipObjEl.style.display = 'none';
      }
    }
    if (this.counterEl) {
      if (this.progression) {
        const done = this.progression.state.completedMissionIds.length;
        // Phase 24: denominator is the FORCED ladder (6), not the catalog (7) —
        // Grazing the Void is optional content now, so a finished campaign must
        // read "6 / 6", never a permanently incomplete "6 / 7".
        this.counterEl.textContent = `${done} / ${MISSION_ORDER.length}`;
        this.counterEl.style.display = '';
      } else {
        this.counterEl.textContent = '';
        this.counterEl.style.display = 'none';
      }
    }
    if (this.chipEl) {
      this.chipEl.setAttribute('aria-label', `Mission: ${m.title}. Change mission.`);
    }
  }
}
