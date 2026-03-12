import { Game } from './game/Game.js';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('game-container');
  const game = new Game(container);

  game.init();
  game.start();
});
