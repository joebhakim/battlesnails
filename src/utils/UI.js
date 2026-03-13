export class UI {
  constructor() {
    this.playerLabel = document.getElementById('player-label');
    this.enemyLabel = document.getElementById('enemy-label');
    this.playerHealthBarFill = document.querySelector('#player-health .health-bar-fill');
    this.enemyHealthBarFill = document.querySelector('#enemy-health .health-bar-fill');
    this.playerHealthValue = document.getElementById('player-health-value');
    this.enemyHealthValue = document.getElementById('enemy-health-value');
    this.instructions = document.getElementById('controls-hint');
    this.startMenu = document.getElementById('start-menu');
    this.startSinglePlayerButton = document.getElementById('start-singleplayer');
    this.startMultiplayerButton = document.getElementById('start-multiplayer');
    this.musicButton = document.getElementById('music-toggle');
    this.gameMessage = document.getElementById('game-message');
  }

  setInstructions(text) {
    this.instructions.textContent = text;
  }

  setHealthLabels(playerLabel, opponentLabel) {
    this.playerLabel.textContent = playerLabel;
    this.enemyLabel.textContent = opponentLabel;
  }

  updatePlayerHealth(currentHealth, maxHealth) {
    this.updateHealthBar(this.playerHealthBarFill, this.playerHealthValue, currentHealth, maxHealth, '#b8443a');
  }

  updateEnemyHealth(currentHealth, maxHealth) {
    this.updateHealthBar(this.enemyHealthBarFill, this.enemyHealthValue, currentHealth, maxHealth, '#888078');
  }

  updateHealthBar(fillElement, valueElement, currentHealth, maxHealth, healthyColor) {
    const percentage = (currentHealth / maxHealth) * 100;
    fillElement.style.width = `${percentage}%`;
    valueElement.textContent = `${currentHealth}/${maxHealth}`;

    if (percentage > 66) {
      fillElement.style.backgroundColor = healthyColor;
    } else if (percentage > 33) {
      fillElement.style.backgroundColor = '#c49a2a';
    } else {
      fillElement.style.backgroundColor = '#d04030';
    }
  }

  setupMusicButton(toggleCallback) {
    this.musicButton.addEventListener('click', toggleCallback);
  }

  setupModeButtons({ onSinglePlayer, onMultiplayer }) {
    this.startSinglePlayerButton.addEventListener('click', onSinglePlayer);
    this.startMultiplayerButton.addEventListener('click', onMultiplayer);
  }

  showStartMenu() {
    this.startMenu.classList.add('visible');
  }

  hideStartMenu() {
    this.startMenu.classList.remove('visible');
  }

  setMusicState(isPlaying) {
    this.musicButton.textContent = isPlaying ? 'Music On' : 'Music Off';
    this.musicButton.classList.toggle('active', isPlaying);
  }

  showMessage({ variant, title, body, actions = [] }) {
    this.gameMessage.innerHTML = '';
    this.gameMessage.className = 'visible';
    if (variant) {
      this.gameMessage.classList.add(`game-message--${variant}`);
    }

    const titleElement = document.createElement('h2');
    titleElement.textContent = title;

    const bodyElement = document.createElement('p');
    bodyElement.textContent = body;

    this.gameMessage.append(titleElement, bodyElement);

    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'restart-button';
      button.textContent = action.label;
      button.addEventListener('click', action.onClick);
      this.gameMessage.appendChild(button);
    }
  }

  clearMessage() {
    this.gameMessage.className = '';
    this.gameMessage.innerHTML = '';
  }

  showGameOverMessage(playerWon) {
    this.showMessage({
      variant: playerWon ? 'victory' : 'defeat',
      title: playerWon ? 'Victory' : 'Defeat',
      body: playerWon
        ? 'Placeholder Pete is down.'
        : 'The enemy landed the final strike.',
      actions: [
        {
          label: 'Restart',
          onClick: () => {
            window.location.reload();
          }
        }
      ]
    });
  }
}
