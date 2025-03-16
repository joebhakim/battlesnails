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
    
    // Add music toggle button (default to on)
    this.musicButton = document.createElement('button');
    this.musicButton.className = 'music-button';
    this.musicButton.textContent = '🔊'; // Start with sound icon
    document.body.appendChild(this.musicButton);
    
    // Add attack HUD for visual feedback on swing mechanics
    this.attackHUD = document.createElement('div');
    this.attackHUD.className = 'attack-hud';
    document.body.appendChild(this.attackHUD);
    
    // Power meter container
    this.powerMeterContainer = document.createElement('div');
    this.powerMeterContainer.className = 'power-meter-container';
    this.attackHUD.appendChild(this.powerMeterContainer);
    
    // Power meter label
    const powerLabel = document.createElement('div');
    powerLabel.className = 'power-label';
    powerLabel.textContent = 'SWING POWER';
    this.powerMeterContainer.appendChild(powerLabel);
    
    // Power meter
    this.powerMeter = document.createElement('div');
    this.powerMeter.className = 'power-meter';
    this.powerMeterContainer.appendChild(this.powerMeter);
    
    this.powerMeterFill = document.createElement('div');
    this.powerMeterFill.className = 'power-meter-fill';
    this.powerMeter.appendChild(this.powerMeterFill);
    
    // Attack direction indicator
    this.directionIndicator = document.createElement('div');
    this.directionIndicator.className = 'direction-indicator';
    this.attackHUD.appendChild(this.directionIndicator);
    
    // Arrow for direction indicator
    this.directionArrow = document.createElement('div');
    this.directionArrow.className = 'direction-arrow';
    this.directionIndicator.appendChild(this.directionArrow);
    
    // Crosshair for attack mode
    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair';
    this.crosshair.style.display = 'none'; // Hidden by default
    document.body.appendChild(this.crosshair);
    
    // Add circle boundary around crosshair
    const boundaryCircle = document.createElement('div');
    boundaryCircle.className = 'crosshair-boundary-circle';
    this.crosshair.appendChild(boundaryCircle);
    
    // Add crosshair segments (horizontal and vertical lines)
    const horizontalLine = document.createElement('div');
    horizontalLine.className = 'crosshair-h';
    this.crosshair.appendChild(horizontalLine);
    
    const verticalLine = document.createElement('div');
    verticalLine.className = 'crosshair-v';
    this.crosshair.appendChild(verticalLine);
    
    // Add center dot
    const centerDot = document.createElement('div');
    centerDot.className = 'crosshair-center';
    this.crosshair.appendChild(centerDot);
    
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
    // Remove any existing styles
    const existingStyle = document.getElementById('battlesnails-ui-styles');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    // Create new style element
    const style = document.createElement('style');
    style.id = 'battlesnails-ui-styles';
    
    // Add CSS rules
    style.textContent = `
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
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 50px;
        height: 50px;
        background-color: rgba(0, 0, 0, 0.7);
        color: white;
        border: 2px solid rgba(255, 255, 255, 0.5);
        border-radius: 50%;
        font-size: 24px;
        cursor: pointer;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
      }
      
      .music-button:hover {
        background-color: rgba(0, 0, 0, 0.9);
        transform: scale(1.05);
      }
      
      /* Attack HUD */
      .attack-hud {
        position: absolute;
        bottom: 30px;
        right: 30px;
        width: 200px;
        height: 200px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        pointer-events: none; /* Allow clicks to pass through */
        opacity: 0; /* Hidden by default */
        transition: opacity 0.3s;
        z-index: 10;
      }
      
      .attack-hud.active {
        opacity: 1;
      }
      
      .power-meter-container {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-bottom: 20px;
      }
      
      .power-label {
        color: white;
        font-family: 'Arial', sans-serif;
        font-size: 14px;
        font-weight: bold;
        margin-bottom: 5px;
        text-shadow: 0 0 3px black, 0 0 3px black, 0 0 3px black;
      }
      
      .power-meter {
        width: 100%;
        height: 15px;
        background-color: rgba(0, 0, 0, 0.5);
        border: 2px solid white;
        border-radius: 10px;
        overflow: hidden;
      }
      
      .power-meter-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(to right, #00ff00, #ffff00, #ff0000);
        transition: width 0.1s;
      }
      
      .direction-indicator {
        width: 100px;
        height: 100px;
        border-radius: 50%;
        border: 2px solid white;
        background-color: rgba(0, 0, 0, 0.3);
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .direction-arrow {
        width: 0;
        height: 0;
        border-left: 10px solid transparent;
        border-right: 10px solid transparent;
        border-bottom: 30px solid white;
        position: absolute;
        transform: translateY(-20px) rotate(0deg);
        transform-origin: center calc(100% - 5px);
        filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.8));
      }
      
      /* Crosshair styles */
      .crosshair {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 40px;
        height: 40px;
        pointer-events: none; /* Allow clicks to pass through */
        z-index: 1000;
      }
      
      .crosshair-boundary-circle {
        position: absolute;
        width: 166.65vw; /* 5/3 of viewport width (5x bigger than before) */
        height: 166.65vw; /* Make it a perfect circle */
        max-width: 2000px; /* Limit maximum size (5x bigger than before) */
        max-height: 2000px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
      }
      
      .crosshair-h, .crosshair-v {
        position: absolute;
        background-color: rgba(255, 255, 255, 0.7);
      }
      
      .crosshair-h {
        width: 100%;
        height: 2px;
        top: 50%;
        transform: translateY(-50%);
      }
      
      .crosshair-v {
        width: 2px;
        height: 100%;
        left: 50%;
        transform: translateX(-50%);
      }
      
      .crosshair-center {
        position: absolute;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: rgba(255, 0, 0, 0.7);
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }
    `;
    
    // Append the styles to the document head
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
  
  /**
   * Update the attack HUD with power and direction
   * @param {boolean} isInAttackMode - Whether the player is in attack mode
   * @param {number} power - Current attack power (0-1)
   * @param {Object} direction - Direction vector {x, y}
   */
  updateAttackHUD(isInAttackMode, power = 0, direction = {x: 0, y: 1}) {
    // Show/hide the HUD based on attack mode
    if (isInAttackMode) {
      this.attackHUD.classList.add('active');
      
      // Show the crosshair in attack mode
      this.crosshair.style.display = 'block';
      
      // Update power meter (scale to 0-100%, ensure minimum of 5%)
      const powerPercent = Math.min(Math.max(power * 20, 5), 100);
      this.powerMeterFill.style.width = `${powerPercent}%`;
      
      // Calculate color based on power (green->yellow->red)
      let r = 0, g = 0;
      if (powerPercent < 50) {
        // Green to yellow
        r = Math.floor(255 * (powerPercent / 50)); 
        g = 255;
      } else {
        // Yellow to red
        r = 255;
        g = Math.floor(255 * (1 - (powerPercent - 50) / 50));
      }
      this.powerMeterFill.style.background = `rgb(${r}, ${g}, 0)`;
      
      // Calculate angle from direction vector (in degrees)
      // Default direction is down (0,-1) which is 0 degrees
      const angle = Math.atan2(-direction.x, -direction.y) * (180 / Math.PI);
      
      // Update direction arrow rotation
      this.directionArrow.style.transform = `translateY(-20px) rotate(${angle}deg)`;
      
      // Log for debugging
      console.log(`HUD: Power ${powerPercent.toFixed(1)}%, Direction ${angle.toFixed(1)}°`);
    } else {
      this.attackHUD.classList.remove('active');
      
      // Hide the crosshair when not in attack mode
      this.crosshair.style.display = 'none';
    }
  }
  
  /**
   * Reset the attack HUD
   */
  resetAttackHUD() {
    this.attackHUD.classList.remove('active');
    
    // Hide the crosshair
    this.crosshair.style.display = 'none';
  }
} 