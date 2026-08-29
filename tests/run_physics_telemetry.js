// tests/run_physics_telemetry.js — aggregate runner for the telemetry layer.
// node tests/run_physics_telemetry.js
import './physics/telemetry.test.js';
import './physics/telemetry_objects.test.js';
import './physics/telemetry_vs_prediction.test.js';
import { report } from './physics/support.js';

report();