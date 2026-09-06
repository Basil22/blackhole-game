// js/game/comic/burstShapes.js — new file
// A small set of pre-drawn jagged starburst outlines (SVG path data), reused
// across all comic words. 3 variants avoid visible repetition without the
// cost of generating shapes per-instance.

export const BURST_SHAPES = [
  // 12-point jagged star, roughly 200x200 viewBox
  'M100,10 L118,70 L180,55 L140,100 L180,145 L118,130 L100,190 L82,130 L20,145 L60,100 L20,55 L82,70 Z',
  // 10-point, slightly irregular for variety
  'M100,5 L122,65 L185,60 L145,102 L188,150 L120,128 L100,192 L78,128 L12,150 L55,102 L15,60 L78,65 Z',
  // 14-point, more explosive/spiky
  'M100,2 L112,55 L160,30 L138,80 L195,75 L150,110 L192,155 L138,135 L100,195 L62,135 L8,155 L50,110 L5,75 L62,80 Z',
];

export function pickBurstShape(seedIndex) {
  return BURST_SHAPES[seedIndex % BURST_SHAPES.length];
}
