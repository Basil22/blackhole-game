// ui/theme.js — centralized monochrome visual identity + branding source.
//
// Single source of truth for the game's presentation tokens: brand name,
// strictly-grayscale color palette, hard-edged radius scale and the UI font
// stack. Pure data — no imports, no DOM, no physics/game-engine references,
// so it is trivially unit-testable and dead-code-free in node.
//
// The wordmark is intentionally typography-based (uppercase geometric sans,
// white on black) — no logo artwork. UI components read these tokens directly
// while css/style.css mirrors the same values as CSS custom properties.

export const BRAND = Object.freeze({
  name: 'BLACK HOLE',
  shortName: 'BLACK HOLE',
  tagline: 'NEWTONIAN SPAGHETTIFICATION SANDBOX',
});

// Strictly grayscale. Every hex is a neutral gray; every rgba is a white/black
// alpha ramp. No hue channel anywhere.
export const COLORS = Object.freeze({
  black: '#000000',
  ink: '#050505',
  surface: 'rgba(0,0,0,0.88)',
  surfacePanel: 'rgba(8,8,8,0.97)',
  surfaceRaised: 'rgba(16,16,16,0.92)',
  white: '#ffffff',
  offWhite: '#f2f2f2',
  gray1: '#d8d8d8',
  gray2: '#a0a0a0',
  gray3: '#666666',
  gray4: '#333333',
  dim: '#8f8f8f',
  border: 'rgba(255,255,255,0.18)',
  borderStrong: 'rgba(255,255,255,0.4)',
});

// Deliberate hard-edged radius system (2–4 px, nothing pill/capsule).
export const RADIUS = Object.freeze({
  button: '2px',
  panel: '3px',
  chip: '3px',
  card: '2px',
  input: '2px',
});

export const TYPO = Object.freeze({
  stack: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
});

// Tiny DOM hook: repoint document.title + any [data-brand] element at the
// centralized name. Safe to call anywhere (no-ops without a DOM).
export function applyBranding({ title = BRAND.name, wordmark = BRAND.name } = {}) {
  if (typeof document === 'undefined' || !document) return;
  document.title = title;
  const mark = document.querySelector('[data-brand]');
  if (mark) mark.textContent = wordmark;
}