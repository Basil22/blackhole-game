// game/dailyui.js — daily challenge chip UI.
// Shows today's challenge goal + streak count. Tapping the chip activates
// the daily challenge as the current mission target. Text-only, monochrome,
// no per-frame work.

import { evaluateMission } from './missions/index.js';

export class DailyUI {
  constructor({ dailyTracker, missionUI, onActivate } = {}) {
    this.tracker = dailyTracker;
    this.missionUI = missionUI;
    this.onActivate = onActivate || (() => {});
    this._active = false;
    this._dailyMission = null;

    this.chipEl = document.getElementById('daily-chip');
    this.titleEl = this.chipEl ? this.chipEl.querySelector('.dc-title') : null;
    this.streakEl = this.chipEl ? this.chipEl.querySelector('.dc-streak') : null;

    this._bind();
    this.refresh();
  }

  _bind() {
    if (this.chipEl) {
      this.chipEl.addEventListener('click', () => this.activate());
    }
  }

  refresh() {
    if (!this.tracker) return;
    const daily = this.tracker.today();
    this._dailyMission = daily.mission;

    if (this.titleEl) {
      this.titleEl.textContent = daily.mission.description;
    }
    if (this.streakEl) {
      const streak = this.tracker.streak;
      this.streakEl.textContent = streak > 0 ? `Streak: ${streak}` : '';
      this.streakEl.style.display = streak > 0 ? '' : 'none';
    }

    // Mark completed state
    if (this.chipEl) {
      const completed = this.tracker.isCompletedToday();
      this.chipEl.classList.toggle('dc-done', completed);
    }
  }

  activate() {
    this._active = true;
    if (this.chipEl) this.chipEl.classList.add('dc-active');
    this.onActivate(this._dailyMission);
  }

  deactivate() {
    this._active = false;
    if (this.chipEl) this.chipEl.classList.remove('dc-active');
  }

  get isActive() {
    return this._active;
  }

  get mission() {
    return this._dailyMission;
  }

  // Evaluate the daily challenge against a throw result.
  evaluate(telemetry, score) {
    if (!this._active || !this._dailyMission) return null;
    return evaluateMission(this._dailyMission, { telemetry, score });
  }

  // Record a completion.
  recordComplete(score) {
    if (!this.tracker) return null;
    const result = this.tracker.complete(score);
    this.refresh();
    return result;
  }
}
