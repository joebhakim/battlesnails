export class UI {
  constructor() {
    // Remove the old UI elements
    this.removeExistingElements();

    // Create main infobar container
    this.infoBar = document.createElement('div');
    this.infoBar.className = 'game-infobar';
    document.body.appendChild(this.infoBar);
    
    // Level information section
    const levelInfo = document.createElement('div');
    levelInfo.className = 'level-info';
    this.infoBar.appendChild(levelInfo);
    
    this.levelDisplay = document.createElement('span');
    this.levelDisplay.className = 'level';
    this.levelDisplay.textContent = 'Level 1';
    levelInfo.appendChild(this.levelDisplay);
    
    this.npcName = document.createElement('span');
    this.npcName.className = 'npc-name';
    this.npcName.textContent = 'Placeholder Pete';
    levelInfo.appendChild(this.npcName);
    
    // Player information section
    const playerInfo = document.createElement('div');
    playerInfo.className = 'player-info';
    this.infoBar.appendChild(playerInfo);
    
    // Player health container
    const playerHealthContainer = document.createElement('div');
    playerHealthContainer.className = 'health-container';
    playerInfo.appendChild(playerHealthContainer);
    
    // Player label
    const playerLabel = document.createElement('span');
    playerLabel.className = 'entity-label';
    playerLabel.textContent = 'PLAYER';
    playerHealthContainer.appendChild(playerLabel);
    
    // Player health bar
    const playerHealthBar = document.createElement('div');
    playerHealthBar.className = 'health-bar player-health-bar';
    playerHealthContainer.appendChild(playerHealthBar);
    
    this.playerHealthBarFill = document.createElement('div');
    this.playerHealthBarFill.className = 'health-bar-fill player-health-bar-fill';
    playerHealthBar.appendChild(this.playerHealthBarFill);
    
    // Player health value
    this.playerHealthValue = document.createElement('span');
    this.playerHealthValue.className = 'health-value';
    playerHealthContainer.appendChild(this.playerHealthValue);
    
    // Player stats
    this.playerStats = document.createElement('div');
    this.playerStats.className = 'stat-value';
    playerInfo.appendChild(this.playerStats);
    
    // NPC information section
    const npcInfo = document.createElement('div');
    npcInfo.className = 'npc-info';
    this.infoBar.appendChild(npcInfo);
    
    // NPC health container
    const npcHealthContainer = document.createElement('div');
    npcHealthContainer.className = 'health-container';
    npcInfo.appendChild(npcHealthContainer);
    
    // NPC label
    const npcLabel = document.createElement('span');
    npcLabel.className = 'entity-label';
    npcLabel.textContent = 'NPC';
    npcHealthContainer.appendChild(npcLabel);
    
    // NPC health bar
    const npcHealthBar = document.createElement('div');
    npcHealthBar.className = 'health-bar enemy-health-bar';
    npcHealthContainer.appendChild(npcHealthBar);
    
    this.enemyHealthBarFill = document.createElement('div');
    this.enemyHealthBarFill.className = 'health-bar-fill enemy-health-bar-fill';
    npcHealthBar.appendChild(this.enemyHealthBarFill);
    
    // NPC health value
    this.npcHealthValue = document.createElement('span');
    this.npcHealthValue.className = 'health-value';
    npcHealthContainer.appendChild(this.npcHealthValue);
    
    // NPC stats
    this.npcStats = document.createElement('div');
    this.npcStats.className = 'stat-value';
    npcInfo.appendChild(this.npcStats);
    
    // Game message for win/lose
    this.gameMessage = document.createElement('div');
    this.gameMessage.id = 'game-message';
    this.gameMessage.style.display = 'none';
    document.body.appendChild(this.gameMessage);
    
    // Create level transition message
    this.levelCompleteMessage = document.createElement('div');
    this.levelCompleteMessage.className = 'level-complete-message';
    this.levelCompleteMessage.style.display = 'none';
    document.body.appendChild(this.levelCompleteMessage);
    
    // Create countdown element
    this.countdownElement = document.createElement('div');
    this.countdownElement.className = 'countdown';
    this.levelCompleteMessage.appendChild(this.countdownElement);
    
    // Add music toggle button (default to off)
    this.musicButton = document.createElement('button');
    this.musicButton.className = 'music-button';
    this.musicButton.textContent = '🔇'; // Start with mute icon
    document.body.appendChild(this.musicButton);
    
    // Add CSS
    this.addStyles();
  }
  
  /**
   * Remove any existing UI elements to prevent duplicates
   */
  removeExistingElements() {
    // Remove old velocity display if it exists
    const oldVelocityDisplay = document.querySelector('.velocity-display');
    if (oldVelocityDisplay) {
      oldVelocityDisplay.remove();
    }
    
    // Remove old health bars if they exist
    const oldHealthBars = document.querySelectorAll('.health-bar-container');
    oldHealthBars.forEach(el => el.remove());
    
    // Remove old game message if it exists
    const oldGameMessage = document.getElementById('game-message');
    if (oldGameMessage) {
      oldGameMessage.remove();
    }
  }
  
  /**
   * Add CSS styles for the UI
   */
  addStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
      .game-infobar {
        position: absolute;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        width: 500px;
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 20px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-family: 'Arial', sans-serif;
        z-index: 100;
        font-size: 16px;
        border-radius: 0 0 10px 10px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
      }
      
      .level-info {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        font-weight: bold;
        font-size: 18px;
        text-align: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.3);
        padding-bottom: 5px;
      }
      
      .level {
        color: #64ffda;
      }
      
      .npc-name {
        color: #ff6347;
      }
      
      .player-info, .npc-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 6px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      
      .health-container {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .entity-label {
        font-weight: bold;
        width: 70px;
        color: #aaddff;
      }
      
      .health-bar {
        flex-grow: 1;
        height: 16px;
        background-color: #444;
        border-radius: 8px;
        overflow: hidden;
      }
      
      .health-bar-fill {
        height: 100%;
        width: 100%;
        transition: width 0.3s, background-color 0.3s;
      }
      
      .player-health-bar-fill {
        background-color: #00ff00;
      }
      
      .enemy-health-bar-fill {
        background-color: #ff0000;
      }
      
      .health-value {
        min-width: 80px;
        text-align: right;
        font-family: monospace;
        font-size: 14px;
      }
      
      .stat-value {
        margin-left: 70px;
        color: #ffcc00;
        font-size: 14px;
        margin-top: 2px;
      }
      
      #game-message {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 20px;
        border-radius: 10px;
        text-align: center;
        font-size: 24px;
        z-index: 1000;
      }
      
      .restart-button {
        margin-top: 20px;
        padding: 10px 20px;
        background-color: #4CAF50;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 18px;
      }
      
      .restart-button:hover {
        background-color: #45a049;
      }
      
      .level-complete-message {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 20px;
        border-radius: 10px;
        text-align: center;
        font-size: 24px;
        z-index: 1000;
      }
      
      .countdown {
        font-size: 48px;
        font-weight: bold;
        margin-top: 15px;
        color: #ffcc00;
      }
      
      .music-button {
        position: absolute;
        bottom: 20px;
        right: 20px;
        width: 40px;
        height: 40px;
        background-color: rgba(0, 0, 0, 0.6);
        color: white;
        border: none;
        border-radius: 50%;
        font-size: 20px;
        cursor: pointer;
        z-index: 100;
      }
      
      .music-button:hover {
        background-color: rgba(0, 0, 0, 0.8);
      }
    `;
    document.head.appendChild(style);
  }
  
  /**
   * Update the enemy health bar display
   * @param {number} currentHealth - Current health of the enemy
   * @param {number} maxHealth - Maximum health of the enemy
   */
  updateEnemyHealth(currentHealth, maxHealth) {
    const healthPercentage = (currentHealth / maxHealth) * 100;
    this.enemyHealthBarFill.style.width = `${healthPercentage}%`;
    
    // Update numerical value
    this.npcHealthValue.textContent = `${currentHealth.toFixed(1)}/${maxHealth}`;
    
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
   * Update the player health bar display
   * @param {number} currentHealth - Current health of the player
   * @param {number} maxHealth - Maximum health of the player
   */
  updatePlayerHealth(currentHealth, maxHealth) {
    const healthPercentage = (currentHealth / maxHealth) * 100;
    this.playerHealthBarFill.style.width = `${healthPercentage}%`;
    
    // Update numerical value
    this.playerHealthValue.textContent = `${currentHealth.toFixed(1)}/${maxHealth}`;
    
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
   * Update velocity and potential damage display
   * @param {number} playerVelocity - Current player eye stalk velocity
   * @param {number} playerDamage - Potential player damage
   * @param {number} npcVelocity - Current NPC eye stalk velocity
   * @param {number} npcDamage - Potential NPC damage
   */
  updateVelocityDisplay(playerVelocity, playerDamage, npcVelocity, npcDamage) {
    // Format to 2 decimal places
    const pVel = playerVelocity.toFixed(2);
    const pDmg = playerDamage.toFixed(2);
    const nVel = npcVelocity.toFixed(2);
    const nDmg = npcDamage.toFixed(2);
    
    this.playerStats.textContent = `Stalk Speed: ${pVel} | Damage: ${pDmg}`;
    this.npcStats.textContent = `Stalk Speed: ${nVel} | Damage: ${nDmg}`;
  }
  
  /**
   * Set the level info and NPC name
   * @param {number} level - Current level number
   * @param {string} npcName - Name of the current NPC
   */
  setLevelInfo(level, npcName) {
    this.levelDisplay.textContent = `Level ${level}`;
    this.npcName.textContent = npcName || 'Placeholder Pete';
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
  
  /**
   * Show level complete message
   * @param {number} level - Completed level number
   */
  showLevelCompleteMessage(level) {
    this.levelCompleteMessage.innerHTML = `<div>Level ${level} Complete!</div>`;
    this.levelCompleteMessage.appendChild(this.countdownElement);
    this.levelCompleteMessage.style.display = 'block';
    this.levelCompleteMessage.style.backgroundColor = 'rgba(0, 100, 0, 0.8)';
  }
  
  /**
   * Update countdown display
   * @param {number} seconds - Seconds remaining
   */
  updateCountdown(seconds) {
    this.countdownElement.textContent = seconds;
  }
  
  /**
   * Hide level complete message
   */
  hideLevelCompleteMessage() {
    this.levelCompleteMessage.style.display = 'none';
  }
  
  /**
   * Set up the music toggle button
   * @param {Function} toggleCallback - Function to call when music is toggled
   */
  setupMusicButton(toggleCallback) {
    this.musicButton.addEventListener('click', () => {
      // Call the toggle function
      toggleCallback();
      
      // Update button text based on new state
      if (this.musicButton.textContent === '🔊') {
        this.musicButton.textContent = '🔇';
      } else {
        this.musicButton.textContent = '🔊';
      }
    });
  }
} 