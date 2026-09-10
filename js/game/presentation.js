// game/presentation.js — PURE presentation mapping for the HUD + throw result.
// Turns an already-finalized ThrowTelemetry + ThrowScore into the tiny bit of
// player-facing language the UI shows. No DOM, no three.js, no recalculation:
// totals and breakdown rows pass through verbatim from `score`. Headlines are
// derived ONLY from existing telemetry fields (terminationReason,
// trajectoryState, closestApproach, maximumStretch, tearCount) — no second
// gameplay classification system.

export const OUTCOME_TONES = Object.freeze({
  neutral: 'neutral',
  success: 'success',
  special: 'special',
  danger: 'danger',
});

// Threat accent for the aiming HUD. Text always carries the information; color
// only reinforces it.
export function stateTone(state) {
  switch (state) {
    case 'ESCAPING': return OUTCOME_TONES.success;
    case 'FLYBY': return OUTCOME_TONES.success;
    case 'ORBITAL': return OUTCOME_TONES.special;
    case 'CAPTURED': return OUTCOME_TONES.danger;
    case 'HORIZON_CROSSING': return OUTCOME_TONES.danger;
    default: return OUTCOME_TONES.neutral; // UNKNOWN / anything new
  }
}

// One concise headline for the physical event, mapped deterministically from
// real telemetry. Priority: player reset → consumption (with how violent it
// was) → survived (orbital / near-miss / escape / pass).
export function presentOutcome(telemetry, score) {
  const t = telemetry;
  const consumed = Number.isFinite(t.consumedPointCount) && t.consumedPointCount > 0;
  const reason = t.terminationReason;
  const stretch = Number.isFinite(t.maximumStretch) ? t.maximumStretch : 1;
  const tears = Math.floor(Number.isFinite(t.tearCount) ? t.tearCount : 0);
  const closest = Number.isFinite(t.closestApproach?.distance) ? t.closestApproach.distance : 0;
  const horizon = Number.isFinite(score?.horizonRadius) ? score.horizonRadius : 40;

  if (reason === 'PLAYER_RESET') {
    return { headline: 'Throw Aborted', tone: OUTCOME_TONES.neutral };
  }
  if (consumed) {
    if (stretch >= 2.5) return { headline: 'Spaghettified', tone: OUTCOME_TONES.danger };
    if (tears > 0) return { headline: 'Ripped Apart', tone: OUTCOME_TONES.danger };
    return { headline: 'Object Consumed', tone: OUTCOME_TONES.danger };
  }
  // survived the encounter
  if (t.trajectoryState === 'ORBITAL') {
    return { headline: 'Orbital Insertion', tone: OUTCOME_TONES.special };
  }
  if (closest > 0 && closest <= horizon * 1.5) {
    return { headline: 'Critical Near Miss', tone: OUTCOME_TONES.danger };
  }
  if (t.trajectoryState === 'ESCAPING') {
    return { headline: 'Clean Escape', tone: OUTCOME_TONES.success };
  }
  if (t.trajectoryState === 'FLYBY') {
    return { headline: 'Survived The Pass', tone: OUTCOME_TONES.success };
  }
  return { headline: 'Survived The Pass', tone: OUTCOME_TONES.success };
}

// The presentation-only snapshot the result view draws from. Every number is
// taken verbatim from the scorer — the UI never recomputes a score.
export function presentResult(telemetry, score) {
  const total = Number.isFinite(score?.total) ? score.total : 0;
  const maxTotal = Number.isFinite(score?.maxTotal) ? score.maxTotal : 0;
  let breakdown = [];
  if (Array.isArray(score?.breakdown)) {
    breakdown = score.breakdown
      .filter((r) => r && typeof r.score === 'number')
      .map((r) => ({
        key: r.key, label: r.label, score: r.score,
        normalized: Number.isFinite(r.normalized) ? r.normalized : 0,
        max: Number.isFinite(r.max) ? r.max : 0,
        annotation: annotateCategory(r),
      }));
  }
  return {
    ...presentOutcome(telemetry, score),
    total,
    maxTotal,
    breakdown,
  };
}

// Contextual one-liner explaining what earned this category's score.
function annotateCategory(row) {
  if (!row || !row.key) return '';
  switch (row.key) {
    case 'precision': {
      const d = Number.isFinite(row.closestApproach) ? row.closestApproach : 0;
      if (row.consumed) return 'Consumed';
      return d > 0 ? `${d.toFixed(1)} from horizon` : '';
    }
    case 'tidal': {
      const s = Number.isFinite(row.maximumStretch) ? row.maximumStretch : 1;
      return s > 1 ? `${s.toFixed(1)}x stretch` : 'No stretch';
    }
    case 'destruction': {
      const tears = Number.isFinite(row.tearCount) ? row.tearCount : 0;
      if (tears > 0) return `${tears} tear${tears !== 1 ? 's' : ''}`;
      const consumed = Number.isFinite(row.consumedPointCount) ? row.consumedPointCount : 0;
      return consumed > 0 ? 'Swallowed whole' : 'Intact';
    }
    case 'survival': {
      if (row.consumed) return 'Consumed';
      const t = Number.isFinite(row.timeNearHorizon) ? row.timeNearHorizon : 0;
      return t > 0 ? `${t.toFixed(1)}s near horizon` : 'Far pass';
    }
    case 'orbital': {
      const s = row.trajectoryState;
      return s === 'ORBITAL' ? 'Stable orbit' : (s ? formatState(s) : 'No orbit');
    }
    case 'nearHorizonSurvival': {
      if (!row.eligible) return row.consumed ? 'Consumed' : 'Too far';
      const d = Number.isFinite(row.closestApproach) ? row.closestApproach : 0;
      return d > 0 ? `Survived at ${d.toFixed(1)}` : '';
    }
    default: return '';
  }
}

// Human-readable distance for the compact HUD (no excessive precision).
export function formatDistance(d) {
  const n = Number.isFinite(d) && d > 0 ? d : 0;
  if (n >= 1000) return `${(n / 1000).toFixed(1)} km`;
  return `${Math.round(n)} m`;
}

// Compact state label for the aiming HUD — Pascal Case, spaces, no underscores.
export function formatState(state) {
  if (typeof state !== 'string') return state ?? '';
  return state.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// Score formatted with thousands separators.
export function formatScore(n) {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}