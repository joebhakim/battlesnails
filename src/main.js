import { Game } from './game/Game.js';

// Initialize the game when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('game-container');
  
  // Create and start the game
  const game = new Game(container);
  game.init();
  game.start();
  
  // Handle window resize
  window.addEventListener('resize', () => {
    game.onWindowResize();
  });
  
  // Log that the game has started
  console.log('BattleSnails game started!');
}); 