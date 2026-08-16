import { Game } from './game/main.js';
import { UI } from './game/ui.js';

const container = document.getElementById('canvas-container');
let ui;
const game = new Game(container, {
  onUiState: (st) => { if (ui) ui.onGameState(st); },
});
ui = new UI(game);

game.selectObject('rock');
window.__game = game; // debug hook
