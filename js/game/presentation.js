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
    return { headline: 'THROW ABORTED', tone: OUTCOME_TONES.neutral };
  }
  if (consumed) {
    if (stretch >= 2.5) return { headline: 'SPAGHETTIFIED', tone: OUTCOME_TONES.danger };
    if (tears > 0) return { headline: 'RIPPED APART', tone: OUTCOME_TONES.danger };
    return { headline: 'OBJECT CONSUMED', tone: OUTCOME_TONES.danger };
  }
  // survived the encounter
  if (t.trajectoryState === 'ORBITAL') {
    return { headline: 'ORBITAL INSERTION', tone: OUTCOME_TONES.special };
  }
  if (closest > 0 && closest <= horizon * 1.5) {
    return { headline: 'CRITICAL NEAR MISS', tone: OUTCOME_TONES.danger };
  }
  if (t.trajectoryState === 'ESCAPING') {
    return { headline: 'CLEAN ESCAPE', tone: OUTCOME_TONES.success };
  }
  if (t.trajectoryState === 'FLYBY') {
    return { headline: 'SURVIVED THE PASS', tone: OUTCOME_TONES.success };
  }
  return { headline: 'SURVIVED THE PASS', tone: OUTCOME_TONES.success };
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
      .map((r) => ({ key: r.key, label: r.label, score: r.score }));
  }
  return {
    ...presentOutcome(telemetry, score),
    total,
    maxTotal,
    breakdown,
  };
}

// Human-readable distance for the compact HUD (no excessive precision).
export function formatDistance(d) {
  const n = Number.isFinite(d) && d > 0 ? d : 0;
  if (n >= 1000) return `${(n / 1000).toFixed(1)} km`;
  return `${Math.round(n)} m`;
}

// Compact state label for the aiming HUD (spaces, no underscores).
export function formatState(state) {
  return typeof state === 'string' ? state.replace(/_/g, ' ') : state ?? '';
}

// Score formatted with thousands separators.
export function formatScore(n) {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}