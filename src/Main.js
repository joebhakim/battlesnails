const game = new Game(container);
game.init();

// Add button for multiplayer
const multiplayerButton = document.createElement('button');
multiplayerButton.textContent = 'Start Multiplayer';
multiplayerButton.className = 'multiplayer-button';
document.body.appendChild(multiplayerButton);

multiplayerButton.addEventListener('click', () => {
  game.initMultiplayer();
  multiplayerButton.remove();
});

// Start the game
game.start(); 