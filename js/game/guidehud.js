// game/guidehud.js — the compact aiming HUD. A single small chip that shows
// the predicted trajectory state + closest approach while aiming. It is a
// secondary layer: the trajectory line is the primary information. DOM nodes
// are created once (static in index.html); updates only write textContent and
// a class — no innerHTML churn, no per-frame reconstruction.

import { formatDistance, formatState, stateTone } from './presentation.js';

export class GuideHud {
  constructor(el) {
    this.el = el;                       // #guidance-hud
    this.stateEl = el.querySelector('.gh-state');
    this.distEl = el.querySelector('.gh-dist');
    this.hidden = true;
  }

  // Show (or refresh) for a guidance result; num guidance (e.g. flight) hides.
  show(guidance) {
    if (!guidance || !guidance.state) {
      this.hide();
      return;
    }
    if (this.stateEl) {
      this.stateEl.textContent = formatState(guidance.state);
      // tone *reinforces* the text; the label carries the meaning by itself
      this.stateEl.classList.remove('tonal-success', 'tonal-special', 'tonal-danger', 'tonal-neutral');
      this.stateEl.classList.add(`tonal-${stateTone(guidance.state)}`);
    }
    if (this.distEl) this.distEl.textContent = formatDistance(guidance.closestApproach?.distance);
    if (this.hidden) this.el.classList.add('show');
    this.hidden = false;
  }

  hide() {
    if (this.hidden) return;
    this.el.classList.remove('show');
    this.hidden = true;
  }
}