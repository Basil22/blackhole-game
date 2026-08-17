// game/result.js — the throw-result presentation. Consumes ONLY the finalized
// ThrowTelemetry + ThrowScore (game.lastTelemetry / game.lastScore) — it never
// recomputes anything. The score object exists fully the moment a throw ends;
// the reveal animation (staggered rows + counting total) is pure presentation
// on top and is cancelled instantly on hide. Respects prefers-reduced-motion.

import { presentResult, formatScore } from './presentation.js';

const ROW_KEYS = ['precision', 'tidal', 'destruction', 'survival', 'orbital', 'nearHorizonSurvival'];
const ROW_LABELS = {
  precision: 'PRECISION',
  tidal: 'TIDAL',
  destruction: 'DESTRUCTION',
  survival: 'SURVIVAL',
  orbital: 'ORBITAL',
  nearHorizonSurvival: 'NEAR-HORIZON',
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
    // optional campaign line (only on a NEW unlock / campaign end)
    this.progressionEl = document.createElement('div');
    this.progressionEl.className = 'rs-progression';
    this.progKickerEl = document.createElement('div');
    this.progKickerEl.className = 'rs-prog-kicker';
    this.progTitleEl = document.createElement('div');
    this.progTitleEl.className = 'rs-prog-title';
    this.progTaglineEl = document.createElement('div');
    this.progTaglineEl.className = 'rs-prog-tagline';
    // Phase-10: optional NEXT CHALLENGE hint under the unlock (declarative text)
    this.progHintEl = document.createElement('div');
    this.progHintEl.className = 'rs-prog-hint';
    this.progressionEl.append(this.progKickerEl, this.progTitleEl, this.progTaglineEl, this.progHintEl);
    this.missionEl.append(this.missionStatusEl, this.missionTitleEl, this.progressionEl);

    const rows = document.createElement('div');
    rows.className = 'rs-rows';
    this.rowEls = [];
    for (const key of ROW_KEYS) {
      const row = document.createElement('div');
      row.className = 'rs-row';
      row.dataset.key = key;
      row.innerHTML = `<span class="rs-row-label">${ROW_LABELS[key]}</span><span class="rs-row-score">0</span>`;
      rows.appendChild(row);
      this.rowEls.push({ key, el: row, scoreEl: row.querySelector('.rs-row-score') });
    }

    const again = document.createElement('button');
    again.className = 'ctrl-btn primary rs-again';
    again.type = 'button';
    again.textContent = 'THROW AGAIN';
    again.addEventListener('click', () => this.onAgain());

    el.append(this.objEl, this.headEl, this.totalLineEl, this.missionEl, rows, again);
  }

  // Show a result from finalized telemetry + score (plain pass-through display).
  // `missionView` is the optional mission presentation { title, status, tone } —
  // the status text is the flow planner's decision, never recomputed here.
  // `progressionView` is the optional campaign line
  // ({ kicker, title, tagline, tone }) — rendered only when something new
  // happened (a real unlock or campaign end).
  show(telemetry, score, objectName, missionView, progressionView) {
    const token = ++this._token;
    cancelAnimationFrame(this._raf);
    const pres = presentResult(telemetry, score);

    this.objEl.textContent = objectName || '';
    this.headEl.textContent = pres.headline;
    this.headEl.classList.remove('tonal-success', 'tonal-special', 'tonal-danger', 'tonal-neutral');
    this.headEl.classList.add(`tonal-${pres.tone}`);

    // score: max passes through verbatim from the scorer, never animated
    this.maxEl.textContent = `/ ${formatScore(pres.maxTotal)}`;

    // mission line (presented, never recalculated)
    if (missionView && missionView.title && missionView.status) {
      this.missionStatusEl.textContent = missionView.status;
      this.missionStatusEl.className = `rs-mission-status rs-${missionView.tone || ''}`;
      this.missionTitleEl.textContent = missionView.title;
      // campaign line: rendered ONLY when the planner produced one
      if (progressionView && progressionView.kicker) {
        this.progKickerEl.textContent = progressionView.kicker;
        this.progTitleEl.textContent = progressionView.title || '';
        this.progTaglineEl.textContent = progressionView.tagline || '';
        this.progHintEl.textContent = progressionView.hint || '';
        this.progHintEl.classList.toggle('show', !!progressionView.hint);
        this.progressionEl.className = `rs-progression show rs-prog-${progressionView.tone || ''}`;
      } else {
        this.progressionEl.className = 'rs-progression';
        this.progHintEl.classList.remove('show');
      }
      this.missionEl.classList.add('show');
    } else {
      this.missionEl.classList.remove('show');
      this.progressionEl.className = 'rs-progression';
    }

    // Row values are the scorer's own numbers, written immediately.
    for (const row of this.rowEls) {
      const r = pres.breakdown.find((b) => b.key === row.key);
      row.scoreEl.textContent = formatScore(r ? r.score : 0);
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

  hide() {
    this._token++;
    cancelAnimationFrame(this._raf);
    this.el.classList.remove('open');
    document.body.classList.remove('result-open');
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