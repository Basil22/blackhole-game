// game/statsui.js — player stats summary modal.
// Shows lifetime stats: total throws, best scores per mission, star counts,
// daily streak, and completion percentage. DOM-light: built once, updated via
// textContent / class toggles only.

import { MISSION_CATALOG } from './missions/index.js';
import { formatScore } from './presentation.js';

export class StatsUI {
  constructor({ scoreHistory, dailyTracker, progression } = {}) {
    this.scoreHistory = scoreHistory;
    this.dailyTracker = dailyTracker;
    this.progression = progression;

    this.modalEl = null;
    this._build();
    this._bind();
  }

  _build() {
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'stats-modal';
    this.modalEl.setAttribute('role', 'dialog');
    this.modalEl.setAttribute('aria-modal', 'true');
    this.modalEl.setAttribute('aria-label', 'Player Statistics');
    this.modalEl.innerHTML = `
      <div class="stats-modal-box">
        <h2 class="stats-heading">Statistics</h2>
        <div class="stats-summary"></div>
        <div class="stats-missions"></div>
        <button class="ctrl-btn primary stats-close" type="button">Done</button>
      </div>`;
    document.body.appendChild(this.modalEl);
  }

  _bind() {
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });
    this.modalEl.querySelector('.stats-close').addEventListener('click', () => this.close());
  }

  open() {
    if (document.body.classList.contains('result-open')) return;
    this._render();
    this.modalEl.classList.add('open');
  }

  close() {
    this.modalEl.classList.remove('open');
  }

  _render() {
    const summaryEl = this.modalEl.querySelector('.stats-summary');
    const missionsEl = this.modalEl.querySelector('.stats-missions');

    // Summary stats
    const completedCount = this.progression
      ? this.progression.state.completedMissionIds.length : 0;
    const totalMissions = MISSION_CATALOG.length;
    const streak = this.dailyTracker ? this.dailyTracker.streak : 0;

    // Total stars across all missions
    let totalStars = 0;
    if (this.scoreHistory) {
      for (const m of MISSION_CATALOG) {
        const best = this.scoreHistory.getBest(m.id);
        if (best && best.bestStars) totalStars += best.bestStars;
      }
    }

    summaryEl.innerHTML = `
      <div class="stat-row"><span class="stat-label">Missions Completed</span><span class="stat-value">${completedCount} / ${totalMissions}</span></div>
      <div class="stat-row"><span class="stat-label">Total Stars</span><span class="stat-value">${totalStars} / ${totalMissions * 3}</span></div>
      <div class="stat-row"><span class="stat-label">Daily Streak</span><span class="stat-value">${streak}</span></div>`;

    // Per-mission best scores
    let rows = '';
    for (const m of MISSION_CATALOG) {
      const best = this.scoreHistory ? this.scoreHistory.getBest(m.id) : null;
      const s = best ? (best.bestStars || 0) : 0;
      const starStr = s > 0
        ? '\u2605'.repeat(Math.min(3, s)) + '\u2606'.repeat(3 - Math.min(3, s))
        : '\u2606\u2606\u2606';
      const scoreStr = best ? formatScore(best.bestScore) : '---';
      rows += `<div class="stat-mission-row">
        <span class="stat-mission-name">${m.title}</span>
        <span class="stat-mission-stars">${starStr}</span>
        <span class="stat-mission-score">${scoreStr}</span>
      </div>`;
    }
    missionsEl.innerHTML = rows;
  }
}
