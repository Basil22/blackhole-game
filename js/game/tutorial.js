// game/tutorial.js — interactive step-by-step tutorial overlay.
// Shows contextual tips as the player performs each action for the first time.
// Persists completion to localStorage so it only runs once. DOM-light: one
// overlay element, class toggles + textContent only.

const STORAGE_KEY = 'blackhole-game:tutorial:v1';

const STEPS = [
  { id: 'throw', text: 'Tap Throw to begin aiming', highlight: '#throw-btn', event: 'aim-start' },
  { id: 'aim', text: 'Drag on screen to aim — the arrow shows direction & power', highlight: '#canvas-container', event: 'launched' },
  { id: 'watch', text: 'Watch the object interact with gravity!', highlight: null, event: 'throw-ended' },
  { id: 'slowmo', text: 'Try Slow-Mo to see the stretch in detail', highlight: '#slowmo-btn', event: 'slowmo-toggle', optional: true },
  { id: 'object', text: 'Tap the object slot to try different objects', highlight: '#obj-slot', event: 'object-changed', optional: true },
  { id: 'mission', text: 'Check your Mission for goals to complete', highlight: '#mission-chip', event: 'mission-opened', optional: true },
];

export class Tutorial {
  constructor({ onStepChange } = {}) {
    this.onStepChange = onStepChange || (() => {});
    this._completed = false;
    this._currentStep = 0;
    this._dismissed = false;
    this._storage = typeof localStorage !== 'undefined' ? localStorage : null;

    this.el = null;
    this.textEl = null;
    this._load();
  }

  _load() {
    try {
      const raw = this._storage?.getItem?.(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this._completed = !!(d && d.completed);
      }
    } catch { /* fresh start */ }
  }

  _save() {
    try {
      this._storage?.setItem?.(STORAGE_KEY, JSON.stringify({ completed: this._completed, v: 1 }));
    } catch { /* never break the game */ }
  }

  get isCompleted() { return this._completed; }
  get isDismissed() { return this._dismissed; }

  // Build the overlay element (called once from main.js after DOM is ready).
  mount() {
    if (this._completed) return;
    this.el = document.createElement('div');
    this.el.className = 'tutorial-overlay';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.el.innerHTML = `
      <div class="tutorial-box">
        <span class="tutorial-step"></span>
        <span class="tutorial-text"></span>
        <button class="tutorial-skip ctrl-btn" type="button">Skip</button>
      </div>`;
    this.textEl = this.el.querySelector('.tutorial-text');
    this.stepEl = this.el.querySelector('.tutorial-step');
    this.el.querySelector('.tutorial-skip').addEventListener('click', () => this.dismiss());
    document.body.appendChild(this.el);
    this._showStep(0);
  }

  _showStep(idx) {
    if (!this.el || this._completed || this._dismissed) return;
    if (idx >= STEPS.length) {
      this.complete();
      return;
    }
    this._currentStep = idx;
    const step = STEPS[idx];
    this.textEl.textContent = step.text;
    this.stepEl.textContent = `${idx + 1}/${STEPS.length}`;
    this.el.classList.add('show');
    this.onStepChange(step);

    // Highlight the target element
    document.querySelectorAll('.tutorial-highlight').forEach((el) => el.classList.remove('tutorial-highlight'));
    if (step.highlight) {
      const target = document.querySelector(step.highlight);
      if (target) target.classList.add('tutorial-highlight');
    }
  }

  // Call this when a game event occurs that matches the current step.
  advance(eventName) {
    if (this._completed || this._dismissed) return;
    const step = STEPS[this._currentStep];
    if (!step) return;

    if (step.event === eventName) {
      this._showStep(this._currentStep + 1);
    } else if (step.optional) {
      // Optional steps can be skipped by any subsequent event
      const next = STEPS.findIndex((s, i) => i > this._currentStep && s.event === eventName);
      if (next >= 0) this._showStep(next + 1);
    }
  }

  dismiss() {
    this._dismissed = true;
    if (this.el) this.el.classList.remove('show');
    document.querySelectorAll('.tutorial-highlight').forEach((el) => el.classList.remove('tutorial-highlight'));
    this.complete();
  }

  complete() {
    this._completed = true;
    this._save();
    if (this.el) {
      this.el.classList.remove('show');
      setTimeout(() => this.el?.remove(), 300);
    }
    document.querySelectorAll('.tutorial-highlight').forEach((el) => el.classList.remove('tutorial-highlight'));
  }

  reset() {
    this._completed = false;
    this._dismissed = false;
    this._currentStep = 0;
    this._save();
  }
}
