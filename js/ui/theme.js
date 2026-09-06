// ui/theme.js — centralized cartoon visual identity + branding source
// (Phase 30). Single source of truth for the game's presentation tokens:
// brand name, the fixed 7-color cartoon palette, rounded radius scale and the
// cartoony UI font stack. Pure data — no imports, no DOM, no physics/game-
// engine references, so it is trivially unit-testable and dead-code-free in
// node.
//
// The wordmark is uppercase type-driven; UI components read these tokens
// directly while css/style.css mirrors the same values as CSS custom
// properties. Color never carries a state alone — the state text is always
// present beside it.

export const BRAND = Object.freeze({
  name: 'BLACK HOLE',
  shortName: 'BLACK HOLE',
  tagline: 'NEWTONIAN SPAGHETTIFICATION SANDBOX',
});

// Phase 30 — cartoon palette (was strictly grayscale). Fixed meanings:
//   orange  — primary energy / explosions
//   yellow  — highlights / bursts (also the aim + primary action)
//   blue    — cold contrast / chrome accents
//   magenta — comedic absurdity
//   green   — success / unlock
//   ink     — Licorice outline / hard shadows behind panels
//   white   — Paper Cream panel + word background
export const COLORS = Object.freeze({
  orange: '#FF6B1A',
  yellow: '#FFE135',
  blue: '#4AC6FF',
  magenta: '#FF3D8A',
  green: '#4CD97B',
  ink: '#1A1A1A',
  white: '#FFF8EC',
  accent: '#FF6B1A', // generic emphasis alias (Cadmium Orange)
  // Dark-but-not-black panel surfaces keep panels legible without PURE ink:
  surface: 'rgba(12,8,22,0.92)',
  surfacePanel: 'rgba(13,9,24,0.97)',
  surfaceRaised: 'rgba(21,16,34,0.92)',
  border: 'rgba(255,248,236,0.18)',
  borderStrong: 'rgba(76,198,255,0.55)',
});

// Rounded cartoon radius system (0 px, sharp).
export const RADIUS = Object.freeze({
  button: '0px',
  panel: '0px',
  chip: '0px',
  card: '0px',
  input: '0px',
});

export const TYPO = Object.freeze({
  stack: "'Luckiest Guy', Impact, 'Arial Black', sans-serif",
});

// The black-hole ramps used by the renderer in one place (extra tokens are
// fine here — renderers import this module, never the DOM).
export const BH_COLORS = Object.freeze({
  core: '#2D0A4E', // deep indigo
  mid: '#FF3D8A',  // bubblegum magenta
  rim: '#FFE135',  // canary
});

// Tiny DOM hook: repoint document.title + any [data-brand] element at the
// centralized name. Safe to call anywhere (no-ops without a DOM).
export function applyBranding({ title = BRAND.name, wordmark = BRAND.name } = {}) {
  if (typeof document === 'undefined' || !document) return;
  document.title = title;
  const mark = document.querySelector('[data-brand]');
  if (mark) mark.textContent = wordmark;
}