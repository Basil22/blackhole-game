// tests/run_audio_feedback.js — runner for the Phase 16 audio + haptics suite.
// node tests/run_audio_feedback.js
import './game/audio_feedback.test.js';
import { report } from './physics/support.js';

report();
