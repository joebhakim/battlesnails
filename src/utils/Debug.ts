export class Debug {
  declare autoUpdate: any;
  declare autoUpdateCheckbox: any;
  declare collisionStatus: any;
  declare debugInfo: any;
  declare debugToggle: any;
  declare debugUpdateBtn: any;
  declare enabled: any;
  declare eventLog: any;
  declare events: any;
  declare eyeStalkPosition: any;
  declare game: any;
  declare localSlot: any;
  declare maxEvents: any;
  declare mouseCaptureStatus: any;
  declare npcToPlayerDistance: any;
  declare opponentBodyPosition: any;
  declare opponentBodyRadius: any;
  declare opponentHealth: any;
  declare opponentState: any;
  declare playerControlMode: any;
  declare playerImpactPower: any;
  declare playerToNpcDistance: any;
  declare previousControlMode: any;
  declare previousImpactReady: any;
  declare previousOpponentHealth: any;
  declare previousPointerLock: any;
  declare previousSessionState: any;
  declare seenDamageEventQueue: any;
  declare seenDamageEvents: any;
  declare sessionState: any;
  constructor(game) {
    this.game = game;
    this.enabled = false;
    this.autoUpdate = true;
    this.previousControlMode = 'idle';
    this.previousSessionState = 'menu';
    this.previousOpponentHealth = null;
    this.previousPointerLock = false;
    this.previousImpactReady = false;
    this.seenDamageEvents = new Set();
    this.seenDamageEventQueue = [];
    this.events = [];
    this.maxEvents = 12;

    this.debugToggle = document.getElementById('debug-toggle');
    this.debugInfo = document.getElementById('debug-info');
    this.playerToNpcDistance = document.getElementById('player-to-npc-distance');
    this.npcToPlayerDistance = document.getElementById('npc-to-player-distance');
    this.sessionState = document.getElementById('session-state');
    this.localSlot = document.getElementById('local-slot');
    this.collisionStatus = document.getElementById('collision-status');
    this.playerControlMode = document.getElementById('player-control-mode');
    this.playerImpactPower = document.getElementById('player-impact-power');
    this.mouseCaptureStatus = document.getElementById('mouse-capture-status');
    this.opponentState = document.getElementById('opponent-state');
    this.eyeStalkPosition = document.getElementById('eye-stalk-position');
    this.opponentBodyPosition = document.getElementById('opponent-body-position');
    this.opponentBodyRadius = document.getElementById('opponent-body-radius');
    this.opponentHealth = document.getElementById('opponent-health');
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
    const debugState = this.game.getDebugState();
    const localView = debugState.playerView;
    const opponentView = debugState.opponentView;
    const localState = debugState.localPlayer;
    const opponentState = debugState.opponentPlayer;

    this.sessionState.textContent = debugState.sessionState;
    this.localSlot.textContent = debugState.localSlot ?? '-';
    this.mouseCaptureStatus.textContent = this.game.mouseControls.isPointerLocked() ? 'Yes' : 'No';
    this.mouseCaptureStatus.className = this.game.mouseControls.isPointerLocked() ? 'collision-true' : '';

    if (!localView || !localState) {
      this.playerToNpcDistance.textContent = '0.00';
      this.npcToPlayerDistance.textContent = '0.00';
      this.collisionStatus.textContent = 'Clear';
      this.playerControlMode.textContent = 'idle';
      this.playerImpactPower.textContent = '0.00 / 0.00';
      this.opponentState.textContent = debugState.sessionState;
      this.eyeStalkPosition.textContent = 'x: 0.00, y: 0.00, z: 0.00';
      this.opponentBodyPosition.textContent = 'x: 0.00, y: 0.00, z: 0.00';
      this.opponentBodyRadius.textContent = '0.00';
      this.opponentHealth.textContent = opponentState
        ? `${opponentState.health}/${opponentState.maxHealth}`
        : '0/0';
      this.recordEvents(debugState);
      this.renderEventLog();
      return;
    }

    const playerTip = localView.getEyeStalkPosition();
    const playerBody = localView.getBodyPosition();

    if (opponentView && opponentState) {
      const opponentTip = opponentView.getEyeStalkPosition();
      const opponentBody = opponentView.getBodyPosition();
      const playerImpact = this.game.collisionDetection.checkImpactCollision(localView, opponentView);
      const collisionReady = playerImpact.collision && playerImpact.impactPower >= playerImpact.threshold;

      this.playerToNpcDistance.textContent = playerTip.distanceTo(opponentBody).toFixed(2);
      this.npcToPlayerDistance.textContent = opponentTip.distanceTo(playerBody).toFixed(2);
      this.collisionStatus.textContent = collisionReady
        ? 'Impact ready'
        : playerImpact.collision
          ? 'Glancing'
          : 'Clear';
      this.collisionStatus.className = collisionReady ? 'collision-true' : '';
      this.opponentState.textContent = `${debugState.sessionState} / ${opponentState.controlMode}`;
      this.opponentBodyPosition.textContent = `x: ${opponentBody.x.toFixed(2)}, y: ${opponentBody.y.toFixed(2)}, z: ${opponentBody.z.toFixed(2)}`;
      this.opponentBodyRadius.textContent = opponentView.getBodyRadius().toFixed(2);
      this.opponentHealth.textContent = `${opponentState.health}/${opponentState.maxHealth}`;
    } else {
      this.playerToNpcDistance.textContent = '0.00';
      this.npcToPlayerDistance.textContent = '0.00';
      this.collisionStatus.textContent = 'Waiting';
      this.collisionStatus.className = '';
      this.opponentState.textContent = debugState.sessionState;
      this.opponentBodyPosition.textContent = 'x: 0.00, y: 0.00, z: 0.00';
      this.opponentBodyRadius.textContent = '0.00';
      this.opponentHealth.textContent = '0/0';
    }

    this.playerControlMode.textContent = localState.controlMode;
    this.playerImpactPower.textContent = `${localState.impactPower.toFixed(2)} / ${localView.getImpactThreshold().toFixed(2)}`;
    this.eyeStalkPosition.textContent = `x: ${playerTip.x.toFixed(2)}, y: ${playerTip.y.toFixed(2)}, z: ${playerTip.z.toFixed(2)}`;

    this.recordEvents(debugState);
    this.renderEventLog();
  }

  recordEvents(debugState) {
    const currentControlMode = debugState.localPlayer?.controlMode ?? 'idle';
    if (currentControlMode !== this.previousControlMode) {
      this.addEvent(`Player mode: ${currentControlMode}`);
    }
    this.previousControlMode = currentControlMode;

    if (debugState.sessionState !== this.previousSessionState) {
      this.addEvent(`Session: ${debugState.sessionState}`);
      this.previousSessionState = debugState.sessionState;
    }

    const pointerLocked = this.game.mouseControls.isPointerLocked();
    if (pointerLocked !== this.previousPointerLock) {
      this.addEvent(pointerLocked ? 'Mouse captured' : 'Mouse released');
      this.previousPointerLock = pointerLocked;
    }

    if (this.previousOpponentHealth !== null && debugState.opponentPlayer && debugState.opponentPlayer.health < this.previousOpponentHealth) {
      this.addEvent(`Opponent took damage: ${debugState.opponentPlayer.health}/${debugState.opponentPlayer.maxHealth}`);
    }
    this.previousOpponentHealth = debugState.opponentPlayer?.health ?? null;

    for (const [index, event] of (debugState.events ?? []).entries()) {
      if (event?.type !== 'damage') {
        continue;
      }

      const eventId = event.id ?? `${event.tick}:${event.attackerSlot}:${event.targetSlot}:${event.side}:${index}`;
      if (this.seenDamageEvents.has(eventId)) {
        continue;
      }

      this.rememberDamageEvent(eventId);
      this.addEvent(
        `Damage ${this.formatDamage(event.amount)} ${event.side}: bash ${this.formatDamage(event.bashDamage)}`
      );
    }

    const impactReady = Boolean(debugState.localPlayer && debugState.playerView &&
      debugState.localPlayer.impactPower >= debugState.playerView.getImpactThreshold());
    if (impactReady && !this.previousImpactReady) {
      this.addEvent('Player impact threshold reached');
    }
    this.previousImpactReady = impactReady;
  }

  rememberDamageEvent(eventId) {
    this.seenDamageEvents.add(eventId);
    this.seenDamageEventQueue.push(eventId);

    while (this.seenDamageEventQueue.length > 160) {
      this.seenDamageEvents.delete(this.seenDamageEventQueue.shift());
    }
  }

  formatDamage(value) {
    const damage = Number.isFinite(value) ? Math.max(0, value) : 0;
    return damage >= 1 ? damage.toFixed(1) : damage.toFixed(2);
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
