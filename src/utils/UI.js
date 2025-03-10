export class UI {
  constructor() {
    // Get UI elements
    this.enemyHealthBarFill = document.querySelector('.health-bar-fill');
    this.gameMessage = document.getElementById('game-message');
  }
  
  /**
   * Update the enemy health bar display
   * 
   * @param {number} currentHealth - Current health of the enemy
   * @param {number} maxHealth - Maximum health of the enemy
   */
  updateEnemyHealth(currentHealth, maxHealth) {
    const healthPercentage = (currentHealth / maxHealth) * 100;
    this.enemyHealthBarFill.style.width = `${healthPercentage}%`;
    
    // Change color based on health
    if (healthPercentage > 70) {
      this.enemyHealthBarFill.style.backgroundColor = '#ff0000'; // Red
    } else if (healthPercentage > 30) {
      this.enemyHealthBarFill.style.backgroundColor = '#ff8000'; // Orange
    } else {
      this.enemyHealthBarFill.style.backgroundColor = '#ffff00'; // Yellow
    }
  }
  
  /**
   * Show game over message
   * 
   * @param {boolean} playerWon - Whether the player won the game
   */
  showGameOverMessage(playerWon) {
    this.gameMessage.style.display = 'block';
    
    if (playerWon) {
      this.gameMessage.textContent = 'You Win! The enemy snail has been defeated.';
      this.gameMessage.style.backgroundColor = 'rgba(0, 128, 0, 0.7)'; // Green
    } else {
      this.gameMessage.textContent = 'Game Over! Try again.';
      this.gameMessage.style.backgroundColor = 'rgba(128, 0, 0, 0.7)'; // Dark red
    }
    
    // Add a restart button
    const restartButton = document.createElement('button');
    restartButton.textContent = 'Restart Game';
    restartButton.style.display = 'block';
    restartButton.style.margin = '10px auto 0';
    restartButton.style.padding = '8px 16px';
    restartButton.style.backgroundColor = '#333';
    restartButton.style.color = 'white';
    restartButton.style.border = 'none';
    restartButton.style.borderRadius = '4px';
    restartButton.style.cursor = 'pointer';
    
    restartButton.addEventListener('click', () => {
      window.location.reload();
    });
    
    this.gameMessage.appendChild(restartButton);
  }
} 