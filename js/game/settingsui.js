// game/settingsui.js — Phase 20 settings modal.
//
// A framework-light, extensible settings row list: each row is a semantic
// toggle button with a text label + description. Rows are described as plain
// data (`SETTING_ROWS`) so adding a future setting is a one-line declaration,
// not a template change. DOM is built once; refresh is textContent/class
// toggles only — no per-frame work, no innerHTML churn, no Three.js.
// Monochrome Phase-14 identity: state is carried by TEXT (ON / OFF) and
// aria-pressed, never by color alone.

import { icon } from '../ui/icons.js';

const SETTING_ROWS = [
  { key: 'audio', label: 'AUDIO', desc: 'Sound effects' },
  { key: 'haptics', label: 'HAPTICS', desc: 'Vibration feedback' },
  { key: 'skipIntro', label: 'SKIP INTRO ON OPENING', desc: 'Go straight to gameplay when you press PLAY' },
  { key: 'reduceMotion', label: 'REDUCED MOTION', desc: 'Removes the camera dive, exposure and bounce. Follows your system when OFF' },
];

export class SettingsUI {
  constructor({ settings } = {}) {
    this.settings = settings || null;
    this.modalEl = document.getElementById('settings-modal');
    this.listEl = this.modalEl ? this.modalEl.querySelector('.st-list') : null;
    this.closeBtn = this.modalEl ? this.modalEl.querySelector('.st-close') : null;
    this._rows = [];

    this._build();
    this._bind();
    this.refresh();
  }

  _build() {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';
    for (const cfg of SETTING_ROWS) {
      const row = document.createElement('div');
      row.className = 'set-row';
      row.dataset.key = cfg.key;
      row.innerHTML = `
        <div class="set-row-top">
          <span class="set-label">${cfg.label}</span>
          <button type="button" class="set-toggle" role="switch" aria-checked="false"
            aria-label="${cfg.label}">OFF</button>
        </div>
        <span class="set-desc"></span>`;
      const desc = row.querySelector('.set-desc');
      if (desc && !cfg.key.startsWith('reduce')) desc.textContent = cfg.desc;
      this.listEl.appendChild(row);
      const toggle = row.querySelector('.set-toggle');
      toggle.addEventListener('click', () => {
        if (!this.settings) return;
        const next = !this.settings.get(cfg.key);
        this.settings.set(cfg.key, next);
        // haptics needs no UI reread beyond the row; refresh keeps rows honest
        this.refresh();
      });
      this._rows.push({ cfg, row, toggle, desc });
    }
  }

  _bind() {
    if (!this.modalEl) return;
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });
    if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl.classList.contains('open')) this.close();
    });
  }

  // Sync every row against the settings controller. Reads live state; never
  // writes gameplay data.
  refresh() {
    if (!this.settings) return;
    for (const { cfg, row, toggle, desc } of this._rows) {
      const value = this.settings.get(cfg.key) === true;
      toggle.textContent = value ? 'ON' : 'OFF';
      toggle.setAttribute('aria-checked', value ? 'true' : 'false');
      toggle.classList.toggle('on', value);
      if (desc) {
        if (cfg.key === 'reduceMotion') {
          desc.textContent = this.settings.reduceMotionEffective
            ? cfg.desc + ' — ON'
            : cfg.desc;
        } else {
          desc.textContent = cfg.desc;
        }
      }
      row.classList.toggle('set-on', value);
    }
  }

  open() {
    if (!this.modalEl) return;
    if (document.body.classList.contains('result-open')) return;
    this.refresh();
    this.modalEl.classList.add('open');
  }

  close() {
    if (this.modalEl) this.modalEl.classList.remove('open');
  }

  // called from ui.setHudVisible so photo mode never leaves the modal behind
  hide() {
    if (this.modalEl && this.modalEl.classList.contains('open')) {
      this.modalEl.classList.remove('open');
    }
  }

  setVisible(v) {
    if (this.modalEl) this.modalEl.style.display = v ? '' : 'none';
    if (!v) this.hide();
  }
}