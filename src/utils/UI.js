export class UI {
  constructor() {
    // Get UI elements
    this.enemyHealthBarFill = document.querySelector('.health-bar-fill');
    this.playerHealthBarFill = document.querySelector('.player-health-bar-fill');
    this.gameMessage = document.getElementById('game-message');
  }
  
  /**
   * Update the enemy health bar display
   * 
   * @param {number} currentHealth - Current health of the enemy
   * @param {number} maxHealth - Maximum health of the enemy
   */
  updateEnemyHealth(currentHealth, maxHealth) {
    console.log(`UI.updateEnemyHealth called with currentHealth: ${currentHealth}, maxHealth: ${maxHealth}`);
    
    const healthPercentage = (currentHealth / maxHealth) * 100;
    this.enemyHealthBarFill.style.width = `${healthPercentage}%`;
    
    console.log(`Health bar width set to: ${healthPercentage}%`);
    
    // Change color based on health
    if (healthPercentage > 70) {
      this.enemyHealthBarFill.style.backgroundColor = '#ff0000'; // Red
    } else if (healthPercentage > 30) {
      this.enemyHealthBarFill.style.backgroundColor = '#ff8000'; // Orange
    } else {
      this.enemyHealthBarFill.style.backgroundColor = '#ffff00'; // Yellow
    }
    
    console.log(`Health bar color set based on percentage: ${healthPercentage}%`);
  }
  
  /**
   * Update the player health bar display
   * 
   * @param {number} currentHealth - Current health of the player
   * @param {number} maxHealth - Maximum health of the player
   */
  updatePlayerHealth(currentHealth, maxHealth) {
    console.log(`UI.updatePlayerHealth called with currentHealth: ${currentHealth}, maxHealth: ${maxHealth}`);
    
    const healthPercentage = (currentHealth / maxHealth) * 100;
    this.playerHealthBarFill.style.width = `${healthPercentage}%`;
    
    console.log(`Player health bar width set to: ${healthPercentage}%`);
    
    // Change color based on health
    if (healthPercentage > 70) {
      this.playerHealthBarFill.style.backgroundColor = '#00ff00'; // Green
    } else if (healthPercentage > 30) {
      this.playerHealthBarFill.style.backgroundColor = '#ffff00'; // Yellow
    } else {
      this.playerHealthBarFill.style.backgroundColor = '#ff8000'; // Orange
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
      this.gameMessage.textContent = 'Game Over! You were defeated by the enemy snail.';
      this.gameMessage.style.backgroundColor = 'rgba(128, 0, 0, 0.7)'; // Dark red
    }
    
    // Add a restart button
    const restartButton = document.createElement('button');
    restartButton.textContent = 'Restart Game';
    restartButton.classList.add('restart-button');
    restartButton.addEventListener('click', () => {
      window.location.reload();
    });
    
    this.gameMessage.appendChild(document.createElement('br'));
    this.gameMessage.appendChild(restartButton);
  }
} 