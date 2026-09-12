// game/result.js — the throw-result presentation. Consumes ONLY the finalized
// ThrowTelemetry + ThrowScore (game.lastTelemetry / game.lastScore) — it never
// recomputes anything. The score object exists fully the moment a throw ends;
// the reveal animation (staggered rows + counting total) is pure presentation
// on top and is cancelled instantly on hide. Respects prefers-reduced-motion.

import { presentResult, formatScore } from './presentation.js';

const ROW_KEYS = ['stretch', 'precision', 'absorption', 'destruction', 'survival'];
const ROW_LABELS = {
  stretch: 'Stretch',
  precision: 'Precision',
  absorption: 'Absorption',
  destruction: 'Destruction',
  survival: 'Survival',
};

export class ResultPanel {
  constructor(el, { onAgain } = {}) {
    this.el = el;                        // #result (hidden by default)
    this.onAgain = onAgain || (() => {});
    this._token = 0;
    this._raf = 0;

    // One-time DOM structure (rows are rebuilt only if the panel was disposed).
    this._build(el);
    this._reduceMotion = typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  }

  _build(el) {
    el.innerHTML = '';
    this.objEl = document.createElement('div');
    this.objEl.className = 'rs-object';

    this.headEl = document.createElement('div');
    this.headEl.className = 'rs-headline';

    // score line: animated total + static "/ max" (numbers straight from scorer)
    this.totalLineEl = document.createElement('div');
    this.totalLineEl.className = 'rs-total-line';
    this.totalEl = document.createElement('div');
    this.totalEl.className = 'rs-total';
    this.maxEl = document.createElement('span');
    this.maxEl.className = 'rs-max';
    this.totalLineEl.append(this.totalEl, this.maxEl);

    // compact mission outcome (optional — filled only when a mission result
    // exists; otherwise hidden). Never recomputes anything: the status + tone
    // come from the mission evaluation + the Phase-9 flow planner.
    this.missionEl = document.createElement('div');
    this.missionEl.className = 'rs-mission';
    this.missionStatusEl = document.createElement('div');
    this.missionStatusEl.className = 'rs-mission-status';
    this.missionTitleEl = document.createElement('div');
    this.missionTitleEl.className = 'rs-mission-title';
    // optional campaign line (only on a NEW unlock / campaign end). Up to
    // CAMPAIGN_BLOCKS blocks are pre-built once: a single throw can complete
    // several levels in a cascade (required-mission sets overlap legitimately).
    this.nudgeEl = document.createElement('div');
    this.nudgeEl.className = 'rs-nudge';

    this.progressionWrap = document.createElement('div');
    this.progressionWrap.className = 'rs-progression-wrap';
    this.progBlocks = [];
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div');
      el.className = 'rs-progression';
      el.style.display = 'none';
      const kicker = document.createElement('div');
      kicker.className = 'rs-prog-kicker';
      const title = document.createElement('div');
      title.className = 'rs-prog-title';
      const tagline = document.createElement('div');
      tagline.className = 'rs-prog-tagline';
      const hint = document.createElement('div');
      hint.className = 'rs-prog-hint';
      el.append(kicker, title, tagline, hint);
      this.progressionWrap.appendChild(el);
      this.progBlocks.push({ el, kicker, title, tagline, hint });
    }
    this.missionEl.append(this.missionStatusEl, this.missionTitleEl, this.nudgeEl, this.progressionWrap);

    // Stars line (mission star rating)
    this.starsEl = document.createElement('div');
    this.starsEl.className = 'rs-stars';

    // NEW BEST badge
    this.bestBadge = document.createElement('div');
    this.bestBadge.className = 'rs-best-badge';
    this.bestBadge.textContent = 'New Best';

    // Previous best line
    this.prevBestEl = document.createElement('div');
    this.prevBestEl.className = 'rs-prev-best';

    const rows = document.createElement('div');
    rows.className = 'rs-rows';
    this.rowEls = [];
    for (const key of ROW_KEYS) {
      const row = document.createElement('div');
      row.className = 'rs-row';
      row.dataset.key = key;
      row.innerHTML = `<span class="rs-row-label">${ROW_LABELS[key]}</span>`
        + `<span class="rs-row-bar"><span class="rs-row-fill"></span></span>`
        + `<span class="rs-row-score">0</span>`
        + `<span class="rs-row-annotation"></span>`;
      rows.appendChild(row);
      this.rowEls.push({
        key, el: row,
        scoreEl: row.querySelector('.rs-row-score'),
        fillEl: row.querySelector('.rs-row-fill'),
        annotEl: row.querySelector('.rs-row-annotation'),
      });
    }

    const close = document.createElement('button');
    close.className = 'icon-btn rs-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close result');
    close.innerHTML = '<svg class="ui-ico" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="4" y1="4" x2="14" y2="14"/><line x1="14" y1="4" x2="4" y2="14"/></svg>';
    close.addEventListener('click', () => this.hide());

    const again = document.createElement('button');
    again.className = 'ctrl-btn primary rs-again';
    again.type = 'button';
    again.textContent = 'Throw Again';
    again.addEventListener('click', () => this.onAgain());

    el.append(close, this.objEl, this.headEl, this.totalLineEl, this.starsEl, this.bestBadge, this.prevBestEl, this.missionEl, rows, again);
  }

  // Show a result from finalized telemetry + score (plain pass-through display).
  // `missionView` is the optional mission presentation { title, status, tone } —
  // the status text is the flow planner's decision, never recomputed here.
  // `progressionView` is the optional campaign line ({ kicker, title, tagline,
  // tone }) for a NEW mission unlock / campaign end. `campaignRewards` is an
  // optional ARRAY of level-complete rewards ({ kicker, title, tagline, tone,
  // hint }); when present it takes precedence over progressionView.
  show(telemetry, score, objectName, missionView, progressionView, campaignRewards, { stars, isNewBest, previousBest } = {}) {
    const token = ++this._token;
    cancelAnimationFrame(this._raf);
    const pres = presentResult(telemetry, score);

    this.objEl.textContent = objectName || '';
    this.headEl.textContent = pres.headline;
    this.headEl.classList.remove('tonal-success', 'tonal-special', 'tonal-danger', 'tonal-neutral');
    this.headEl.classList.add(`tonal-${pres.tone}`);

    // Uncapped scoring: no "/ max" display. Show "pts" instead.
    this.maxEl.textContent = pres.maxTotal > 0 ? `/ ${formatScore(pres.maxTotal)}` : 'pts';

    // star rating (only when a mission was active and completed)
    if (Number.isFinite(stars) && stars > 0) {
      const filled = Math.min(3, stars);
      this.starsEl.textContent = '\u2605'.repeat(filled) + '\u2606'.repeat(3 - filled);
      this.starsEl.setAttribute('aria-label', `${filled} of 3 stars`);
      this.starsEl.classList.add('show');
    } else {
      this.starsEl.textContent = '';
      this.starsEl.classList.remove('show');
    }

    // NEW BEST / previous best display
    if (isNewBest) {
      this.bestBadge.classList.add('show');
      if (Number.isFinite(previousBest) && previousBest > 0) {
        this.prevBestEl.textContent = `Previous best: ${formatScore(previousBest)}`;
        this.prevBestEl.classList.add('show');
      } else {
        this.prevBestEl.textContent = '';
        this.prevBestEl.classList.remove('show');
      }
    } else {
      this.bestBadge.classList.remove('show');
      if (Number.isFinite(previousBest) && previousBest > 0) {
        this.prevBestEl.textContent = `Best: ${formatScore(previousBest)}`;
        this.prevBestEl.classList.add('show');
      } else {
        this.prevBestEl.textContent = '';
        this.prevBestEl.classList.remove('show');
      }
    }

    // mission line (presented, never recalculated)
    if (missionView && missionView.title && missionView.status) {
      this.missionStatusEl.textContent = missionView.status;
      this.missionStatusEl.className = `rs-mission-status rs-${missionView.tone || ''}`;
      this.missionTitleEl.textContent = missionView.title;
      // Part I: show a contextual nudge when the mission failed
      const nudge = missionView.nudge || '';
      if (missionView.tone === 'fail' && nudge) {
        this.nudgeEl.textContent = nudge;
        this.nudgeEl.classList.add('show');
      } else {
        this.nudgeEl.textContent = '';
        this.nudgeEl.classList.remove('show');
      }
      this._renderProgression(progressionView, campaignRewards);
      this.missionEl.classList.add('show');
    } else {
      this.missionEl.classList.remove('show');
      this.nudgeEl.textContent = '';
      this.nudgeEl.classList.remove('show');
      this._renderProgression(null, null);
    }

    // Row values are the scorer's own numbers, written immediately.
    // For fill bars: use a reference score per category since scoring is uncapped.
    // The bar fills to 100% at the reference value, can overflow for extreme throws.
    const REF_SCORES = { stretch: 3000, precision: 3000, absorption: 2500, destruction: 1500, survival: 3000 };
    for (const row of this.rowEls) {
      const r = pres.breakdown.find((b) => b.key === row.key);
      row.scoreEl.textContent = formatScore(r ? r.score : 0);
      // Fill bar: proportional to reference score, capped at 100% visually
      const ref = REF_SCORES[row.key] || 3000;
      const pct = r ? Math.min(100, Math.round((r.score / ref) * 100)) : 0;
      if (row.fillEl) row.fillEl.style.width = `${pct}%`;
      // Contextual annotation
      if (row.annotEl) row.annotEl.textContent = r ? (r.annotation || '') : '';
      row.el.classList.remove('revealed');
    }

    const finalTotal = pres.total;
    // The real value lives in JS/game state immediately; the visible text may
    // be animated cosmetically.
    this.totalEl.dataset.total = String(finalTotal);
    this.totalEl.textContent = '0';

    document.body.classList.add('result-open');
    elReveal(this.el);
    if (this._reduceMotion && this._reduceMotion.matches) {
      this.totalEl.textContent = formatScore(finalTotal);
      this._revealRows(this.rowEls.length);
    } else {
      this._animate(token, finalTotal);
    }
  }

  // Fill the pre-built progression blocks. Campaign rewards (level completes)
  // win over the single mission-unlock line. Defensive: unknown structures
  // render nothing.
  _renderProgression(progressionView, campaignRewards) {
    for (const b of this.progBlocks) {
      b.hint.classList.remove('show');
      b.el.style.display = 'none';
      b.el.className = 'rs-progression';
    }
    const rewards = Array.isArray(campaignRewards) ? campaignRewards : null;
    if (rewards && rewards.length) {
      rewards.slice(0, this.progBlocks.length).forEach((r, i) => {
        if (!r || typeof r !== 'object') return;
        const b = this.progBlocks[i];
        b.kicker.textContent = r.kicker || '';
        b.title.textContent = r.title || '';
        b.tagline.textContent = r.tagline || '';
        b.hint.textContent = r.hint || '';
        b.hint.classList.toggle('show', !!r.hint);
        b.el.style.display = '';
        b.el.className = `rs-progression show rs-prog-${r.tone || ''}`;
      });
      return;
    }
    if (progressionView && progressionView.kicker) {
      const b = this.progBlocks[0];
      b.kicker.textContent = progressionView.kicker;
      b.title.textContent = progressionView.title || '';
      b.tagline.textContent = progressionView.tagline || '';
      b.hint.textContent = progressionView.hint || '';
      b.hint.classList.toggle('show', !!progressionView.hint);
      b.el.style.display = '';
      b.el.className = `rs-progression show rs-prog-${progressionView.tone || ''}`;
    }
  }

  hide() {
    this._token++;
    cancelAnimationFrame(this._raf);
    this.el.classList.remove('open');
    document.body.classList.remove('result-open');
    this.totalEl.textContent = '0';
    this.headEl.textContent = '';
    this.objEl.textContent = '';
    this.starsEl.classList.remove('show');
    this.bestBadge.classList.remove('show');
    this.prevBestEl.classList.remove('show');
    this.missionEl.classList.remove('show');
    this.nudgeEl.classList.remove('show');
    this._revealRows(0);
  }

  // cosmetic count-up on the total + staggered row reveal; stale tokens cancel
  _animate(token, finalTotal) {
    const duration = 800; // keep it short — the player must not feel blocked
    const start = performance.now();
    const stampRows = this.rowEls.length;
    const dim = (now) => {
      if (token !== this._token) return;
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      this.totalEl.textContent = formatScore(Math.round(finalTotal * eased));
      let revealed = Math.min(stampRows, Math.floor((p * stampRows) * 1.4));
      this._revealRows(revealed);
      if (p < 1) {
        this._raf = requestAnimationFrame(dim);
      } else {
        this.totalEl.textContent = formatScore(finalTotal);
        this._revealRows(stampRows);
      }
    };
    this._raf = requestAnimationFrame(dim);
  }

  _revealRows(n) {
    for (let i = 0; i < this.rowEls.length; i++) {
      this.rowEls[i].el.classList.toggle('revealed', i < n);
    }
  }
}

function elReveal(el) {
  el.classList.remove('open');
  // force reflow so the transition restarts on repeated throws
  void el.offsetWidth;
  el.classList.add('open');
}