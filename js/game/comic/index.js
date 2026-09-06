// game/comic/index.js — barrel for the Phase-29 comic feedback layer.
export {
  ComicCore,
  COMIC_EVENTS,
  OBJECT_FLAVOR,
  MAX_SLOTS,
  REDUCED_FACTOR,
  isComicEvent,
  eventPriority,
  shakeOf,
  accentOf,
  keyframe,
} from './comic.js';
export { ComicRenderer } from './renderer.js';