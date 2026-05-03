import { Game } from './game/Game.js';

function showBootError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const app = document.getElementById('app');

  if (!app) {
    return;
  }

  const errorPanel = document.createElement('div');
  errorPanel.id = 'boot-error';
  errorPanel.innerHTML = `
    <div class="menu-card">
      <p class="menu-kicker">BattleSnails</p>
      <h1>Graphics Startup Failed</h1>
      <p class="menu-copy">This browser could not create a usable WebGL renderer.</p>
      <p class="menu-copy">Details: ${message}</p>
      <p class="menu-copy">Try Chrome or Firefox, update GPU drivers, and make sure hardware acceleration is enabled.</p>
    </div>
  `;

  app.innerHTML = '';
  app.appendChild(errorPanel);
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    const container = document.getElementById('game-container');
    const game = new Game(container);

    game.init();
    if (new URLSearchParams(window.location.search).has('profile')) {
      (window as any).__battlesnailsGame = game;
    }
    game.start();
  } catch (error) {
    console.error('BattleSnails failed to boot.', error);
    showBootError(error);
  }
});
