// tests/run_physics_trajectory.js — aggregate runner for the trajectory layer.
// node tests/run_physics_trajectory.js
import './physics/classify.test.js';
import './physics/orbital.test.js';
import './physics/predict.test.js';
import './physics/closest.test.js';
import { report } from './physics/support.js';

report();