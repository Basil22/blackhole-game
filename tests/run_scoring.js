// tests/run_scoring.js — aggregate runner for the scoring engine.
// node tests/run_scoring.js
import './game/scoring.test.js';
import './game/scoring_integration.test.js';
import { report } from './physics/support.js';

report();