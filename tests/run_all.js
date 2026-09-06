// tests/run_all.js — aggregate regression gate for the whole node suite.
// Runs every tests/run_*.js runner in its own process (each owns its module
// scope + exit code) and prints an aggregate summary.
//
// Phase 30: run_ui_identity was historically whitelisted as a Windows/OneDrive
// CRLF artifact; the test + stylesheet now ship LF and it is a full runner.
//
// Usage: node tests/run_all.js
import { execFileSync } from 'node:child_process';

const RUNNERS = [
  'run_aiming',
  'run_aiming_difficulty',
  'run_aiming_ux',
  'run_audio_feedback',
  'run_campaign',
  'run_challenges',
  'run_comic',
  'run_feel',
  'run_guidance',
  'run_missions',
  'run_physics_audit',
  'run_physics_telemetry',
  'run_physics_trajectory',
  'run_presentation',
  'run_progression',
  'run_progression_flow',
  'run_responsive_controls',
  'run_scoring',
  'run_settings',
  'run_spaghettification',
  'run_ui_finalize',
  'run_ui_identity',
  'run_phase29_gate',
];

const results = [];
let failures = 0;
for (const name of RUNNERS) {
  try {
    execFileSync(process.execPath, [`tests/${name}.js`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    results.push({ name, ok: true });
    console.log(`  ok — ${name}`);
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`;
    const tail = out.trim().split('\n').slice(-3).join(' | ');
    results.push({ name, ok: false });
    failures++;
    console.log(`  FAIL — ${name} | ${tail}`);
  }
}

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} runners green (${failures} failures)`);
process.exit(failures ? 1 : 0);