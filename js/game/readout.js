// game/readout.js — live physics readout: tidal stretch %, tears, distance.

export function updateReadout(el, telemetry, timeScale, hasObjects) {
  if (!el) return;
  if (!hasObjects) {
    if (el.style.opacity !== '0') el.style.opacity = '0';
    return;
  }
  const stretchPct = telemetry.initialSpan
    ? Math.round((telemetry.maxSpan / telemetry.initialSpan) * 100)
    : 0;
  el.innerHTML =
    `<b>TIDAL STRETCH:</b> ${stretchPct}%` +
    (telemetry.tears ? `&nbsp;&nbsp;<b>TEARS:</b> ${telemetry.tears}` : '') +
    `&nbsp;&nbsp;<b>DIST:</b> ${Math.round(telemetry.dist)}` +
    `&nbsp;&nbsp;<b>${timeScale.toFixed(2)}×</b>`;
  el.style.opacity = '1';
}