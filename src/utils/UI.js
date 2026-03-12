export class UI {
  constructor() {
    this.playerHealthBarFill = document.querySelector('#player-health .health-bar-fill');
    this.enemyHealthBarFill = document.querySelector('#enemy-health .health-bar-fill');
    this.playerHealthValue = document.getElementById('player-health-value');
    this.enemyHealthValue = document.getElementById('enemy-health-value');
    this.instructions = document.getElementById('controls-hint');
    this.musicButton = document.getElementById('music-toggle');
    this.gameMessage = document.getElementById('game-message');
  }

  setInstructions(text) {
    this.instructions.textContent = text;
  }

  updatePlayerHealth(currentHealth, maxHealth) {
    this.updateHealthBar(this.playerHealthBarFill, this.playerHealthValue, currentHealth, maxHealth, '#4ade80');
  }

  updateEnemyHealth(currentHealth, maxHealth) {
    this.updateHealthBar(this.enemyHealthBarFill, this.enemyHealthValue, currentHealth, maxHealth, '#fb7185');
  }

  updateHealthBar(fillElement, valueElement, currentHealth, maxHealth, healthyColor) {
    const percentage = (currentHealth / maxHealth) * 100;
    fillElement.style.width = `${percentage}%`;
    valueElement.textContent = `${currentHealth}/${maxHealth}`;

    if (percentage > 66) {
      fillElement.style.backgroundColor = healthyColor;
    } else if (percentage > 33) {
      fillElement.style.backgroundColor = '#fbbf24';
    } else {
      fillElement.style.backgroundColor = '#f97316';
    }
  }

  setupMusicButton(toggleCallback) {
    this.musicButton.addEventListener('click', toggleCallback);
  }

  setMusicState(isPlaying) {
    this.musicButton.textContent = isPlaying ? 'Music On' : 'Music Off';
    this.musicButton.classList.toggle('active', isPlaying);
  }

  showGameOverMessage(playerWon) {
    this.gameMessage.innerHTML = '';
    this.gameMessage.classList.add('visible');

    const title = document.createElement('h2');
    title.textContent = playerWon ? 'Victory' : 'Defeat';

    const body = document.createElement('p');
    body.textContent = playerWon
      ? 'Placeholder Pete is down.'
      : 'The enemy landed the final strike.';

    const restartButton = document.createElement('button');
    restartButton.type = 'button';
    restartButton.className = 'restart-button';
    restartButton.textContent = 'Restart';
    restartButton.addEventListener('click', () => {
      window.location.reload();
    });

    this.gameMessage.append(title, body, restartButton);
  }
}
