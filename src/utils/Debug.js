export class Debug {
  constructor(game) {
    this.game = game;
    this.enabled = false;
    this.autoUpdate = true;
    this.previousControlMode = 'idle';
    this.previousNpcState = null;
    this.previousNpcHealth = null;
    this.previousNpcInvincibility = false;
    this.previousPointerLock = false;
    this.previousImpactReady = false;
    this.events = [];
    this.maxEvents = 6;

    this.debugToggle = document.getElementById('debug-toggle');
    this.debugInfo = document.getElementById('debug-info');
    this.playerToNpcDistance = document.getElementById('player-to-npc-distance');
    this.npcToPlayerDistance = document.getElementById('npc-to-player-distance');
    this.collisionStatus = document.getElementById('collision-status');
    this.playerControlMode = document.getElementById('player-control-mode');
    this.playerImpactPower = document.getElementById('player-impact-power');
    this.mouseCaptureStatus = document.getElementById('mouse-capture-status');
    this.npcState = document.getElementById('npc-state');
    this.eyeStalkPosition = document.getElementById('eye-stalk-position');
    this.npcBodyPosition = document.getElementById('npc-body-position');
    this.npcBodyRadius = document.getElementById('npc-body-radius');
    this.npcInvincibility = document.getElementById('npc-invincibility');
    this.npcHealth = document.getElementById('npc-health');
    this.eventLog = document.getElementById('event-log');
    this.debugUpdateBtn = document.getElementById('debug-update');
    this.autoUpdateCheckbox = document.getElementById('auto-update');

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.debugToggle.addEventListener('click', () => {
      this.toggleDebugMode();
    });

    this.debugUpdateBtn.addEventListener('click', () => {
      this.updateDebugInfo();
    });

    this.autoUpdateCheckbox.addEventListener('change', (event) => {
      this.autoUpdate = event.target.checked;
    });
  }

  toggleDebugMode() {
    this.enabled = !this.enabled;
    this.debugInfo.classList.toggle('hidden', !this.enabled);

    if (this.enabled) {
      this.updateDebugInfo();
    }
  }

  update() {
    if (!this.enabled) {
      return;
    }

    if (this.autoUpdate) {
      this.updateDebugInfo();
    }
  }

  updateDebugInfo() {
    const playerTip = this.game.playerSnail.getEyeStalkPosition();
    const npcTip = this.game.npcSnail.getEyeStalkPosition();
    const playerBody = this.game.playerSnail.getBodyPosition();
    const npcBody = this.game.npcSnail.getBodyPosition();
    const playerImpact = this.game.collisionDetection.checkImpactCollision(this.game.playerSnail, this.game.npcSnail);

    this.playerToNpcDistance.textContent = playerTip.distanceTo(npcBody).toFixed(2);
    this.npcToPlayerDistance.textContent = npcTip.distanceTo(playerBody).toFixed(2);

    const collisionReady = playerImpact.collision && playerImpact.impactPower >= playerImpact.threshold;
    this.collisionStatus.textContent = collisionReady
      ? 'Impact ready'
      : playerImpact.collision
        ? 'Glancing'
        : 'Clear';
    this.collisionStatus.className = collisionReady ? 'collision-true' : '';

    this.playerControlMode.textContent = this.game.playerSnail.getCombatMode();
    this.playerImpactPower.textContent = `${this.game.playerSnail.getImpactPower().toFixed(2)} / ${this.game.playerSnail.getImpactThreshold().toFixed(2)}`;
    this.mouseCaptureStatus.textContent = this.game.mouseControls.isPointerLocked() ? 'Yes' : 'No';
    this.mouseCaptureStatus.className = this.game.mouseControls.isPointerLocked() ? 'collision-true' : '';

    this.npcState.textContent = this.game.npcSnail.state;
    this.eyeStalkPosition.textContent = `x: ${playerTip.x.toFixed(2)}, y: ${playerTip.y.toFixed(2)}, z: ${playerTip.z.toFixed(2)}`;
    this.npcBodyPosition.textContent = `x: ${npcBody.x.toFixed(2)}, y: ${npcBody.y.toFixed(2)}, z: ${npcBody.z.toFixed(2)}`;
    this.npcBodyRadius.textContent = this.game.npcSnail.getBodyRadius().toFixed(2);
    this.npcInvincibility.textContent = this.game.npcSnail.isInvincible() ? 'Yes' : 'No';
    this.npcInvincibility.className = this.game.npcSnail.isInvincible() ? 'invincible-true' : '';
    this.npcHealth.textContent = `${this.game.npcSnail.health}/${this.game.npcSnail.maxHealth}`;

    this.recordEvents();
    this.renderEventLog();
  }

  recordEvents() {
    const currentControlMode = this.game.playerSnail.getCombatMode();
    if (currentControlMode !== this.previousControlMode) {
      this.addEvent(`Player mode: ${currentControlMode}`);
    }
    this.previousControlMode = currentControlMode;

    const pointerLocked = this.game.mouseControls.isPointerLocked();
    if (pointerLocked !== this.previousPointerLock) {
      this.addEvent(pointerLocked ? 'Mouse captured' : 'Mouse released');
      this.previousPointerLock = pointerLocked;
    }

    if (this.previousNpcState !== this.game.npcSnail.state) {
      this.addEvent(`NPC state: ${this.game.npcSnail.state}`);
      this.previousNpcState = this.game.npcSnail.state;
    }

    if (this.previousNpcHealth !== null && this.game.npcSnail.health < this.previousNpcHealth) {
      this.addEvent(`NPC took damage: ${this.game.npcSnail.health}/${this.game.npcSnail.maxHealth}`);
    }
    this.previousNpcHealth = this.game.npcSnail.health;

    const npcInvincible = this.game.npcSnail.isInvincible();
    if (npcInvincible && !this.previousNpcInvincibility) {
      this.addEvent('NPC invincibility started');
    }
    if (!npcInvincible && this.previousNpcInvincibility) {
      this.addEvent('NPC invincibility ended');
    }
    this.previousNpcInvincibility = npcInvincible;

    const impactReady = this.game.playerSnail.getImpactPower() >= this.game.playerSnail.getImpactThreshold();
    if (impactReady && !this.previousImpactReady) {
      this.addEvent('Player impact threshold reached');
    }
    this.previousImpactReady = impactReady;
  }

  addEvent(message) {
    const timestamp = new Date().toLocaleTimeString();
    this.events.unshift(`[${timestamp}] ${message}`);
    this.events = this.events.slice(0, this.maxEvents);
  }

  renderEventLog() {
    this.eventLog.innerHTML = '';

    for (const event of this.events) {
      const item = document.createElement('div');
      item.textContent = event;
      this.eventLog.appendChild(item);
    }
  }
}
