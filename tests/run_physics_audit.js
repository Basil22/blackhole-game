// tests/run_physics_audit.js — aggregate runner: node tests/run_physics_audit.js
// Each suite file exercises itself at import time against the shared harness.
import './physics/vectors.test.js';
import './physics/springs.test.js';
import './physics/gravity.test.js';
import './physics/sim.test.js';
import './physics/events.test.js';
import './physics/diagnostics.test.js';
import { report } from './physics/support.js';

report();