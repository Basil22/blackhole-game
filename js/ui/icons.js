// ui/icons.js — tiny monochrome stroke-icon system, inline SVG only.
//
// No emoji, no Unicode stand-ins, no external icon library. Every icon is a
// 24×24 viewBox line drawing using `currentColor`, consistent square stroke
// caps/joins (the hard-edged technical look) and a single stroke width.
// All returned SVGs are decorative (aria-hidden=true); the interactive
// control that contains them carries its own accessible label.
//
// Pure functions — DOM-free, physics-free, safe to unit-test in node.

const STROKE = 1.7;

// name -> one or more <path> "d" attributes (24×24 grid).
const PATHS = {
  rock: 'M4.5 14.5 L6.2 7.2 L11 5 L16 6.8 L19 11.5 L18 17.5 L12.8 19.5 L7 18 Z ' +
        'M8.8 13.5 L12.3 10.2 L14.4 13 Z',
  astronaut: 'M12 4.75 a7 7 0 1 0 0.001 0 Z ' +
             'M8.8 10.5 a3.2 3.2 0 0 1 3.2-3.2 ' +
             'M7 19.5 c0-2.6 2.1-4 5-4 s5 1.4 5 4 ' +
             'M12 5.4 V3 M12 3 h1.8',
  ship: 'M12 2.8 L17 16.5 L12 14 L7 16.5 Z ' +
        'M12 14.6 V21 ' +
        'M7 16.5 L4 19.6 M17 16.5 L20 19.6',
  planet: 'M12 12 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 ' +
          'M3.5 14.5 a8.5 5.4 0 0 0 17 0',
  camera: 'M4 8.5 h4.2 L10.4 5.8 h3.2 L15.8 8.5 H20 V18.5 H4 Z ' +
          'M12 12.4 a2.6 2.6 0 1 0 0.001 0 Z',
  zoom: 'M11 11 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 ' +
        'M15.2 15.2 L21 21',
  reset: 'M3.6 12 a8.4 8.4 0 1 1 2.6 6 ' +
         'M4 12 V5.6 M4 12 H9.4',
  crosshair: 'M12 12 m-3.4 0 a3.4 3.4 0 1 0 6.8 0 a3.4 3.4 0 1 0 -6.8 0 ' +
             'M12 12 m-8.6 0 a8.6 8.6 0 1 0 17.2 0 a8.6 8.6 0 1 0 -17.2 0 ' +
             'M12 1.5 V5 M12 19 V22.5 M1.5 12 H5 M19 12 H22.5',
  launch: 'M12 3 V20 M12 3 L6.5 9 M12 3 L17.5 9 M6.5 16.5 H17.5',
  play: 'M8 4.5 L18.5 12 L8 19.5 Z',
  rewind: 'M7.5 5 V19 M7.5 12 L12 8.6 V15.4 Z M13.5 12 L18 8.6 V15.4 Z',
  close: 'M6 6 L18 18 M18 6 L6 18',
  question: 'M9.8 9.2 a2.2 2.2 0 1 1 3 2.1 c-.9.4-1.4 1-1.4 2.3 ' +
            'M12 17.2 v.1',
  info: 'M12 12 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 ' +
        'M12 11 V17 M12 7.2 v.2',
  check: 'M4 12.5 L9.5 18 L20 6',
  menu: 'M4 7 H20 M4 12 H20 M4 17 H20',
  lock: 'M8 11 V8 a4 4 0 0 1 8 0 V11 M6.5 11 h11 V18.5 H6.5 Z',
  settings: 'M12 5.4a6.6 6.6 0 0 1 3.6 1.1l1.1-1.1 2.9 2.9-1.1 1.1a6.6 6.6 0 0 1 0 7.2l1.1 1.1-2.9 2.9-1.1-1.1a6.6 6.6 0 0 1-7.2 0l-1.1 1.1-2.9-2.9 1.1-1.1a6.6 6.6 0 0 1 0-7.2l-1.1-1.1 2.9-2.9 1.1 1.1A6.6 6.6 0 0 1 12 5.4Z ' +
            'M12 8.8a3.2 3.2 0 1 0 .001 0Z',
  'speaker-on': 'M7 9 H10.5 L15 5.5 V18.5 L10.5 15 H7 Z ' +
                'M17.5 9.6 a3.5 3.5 0 0 1 0 4.8 ' +
                'M19.8 6.9 a6.6 6.6 0 0 1 0 10.2',
  'speaker-off': 'M7 9 H10.5 L15 5.5 V18.5 L10.5 15 H7 Z ' +
                 'M16.8 9.4 L21.4 14.6 M21.4 9.4 L16.8 14.6',
  clock: 'M12 3.5 a8.5 8.5 0 1 0 0.001 0 Z ' +
         'M12 7.4 V12 L15 14.2',
};

const OBJECT_ICONS = Object.freeze({
  rock: 'rock',
  human: 'astronaut',
  ship: 'ship',
  planet: 'planet',
});

export function iconNames() {
  return Object.keys(PATHS);
}

export function iconForObject(objectId) {
  return OBJECT_ICONS[objectId] || 'rock';
}

// Build an inline SVG icon (decorative). `size` is the rendered px.
export function icon(name, size = 24) {
  const d = PATHS[name];
  if (!d) return '';
  return (
    `<svg class="ui-ico" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="${STROKE}" ` +
    `stroke-linecap="square" stroke-linejoin="miter" ` +
    `aria-hidden="true" focusable="false"><path d="${d}"/></svg>`
  );
}