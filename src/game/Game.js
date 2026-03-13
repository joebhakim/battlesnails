import * as THREE from 'three';

import { Scene } from './Scene.js';
import { Renderer } from './Renderer.js';
import { CameraController } from './CameraController.js';
import { PlayerSnail } from '../entities/PlayerSnail.js';
import { NPCSnail } from '../entities/NPCSnail.js';
import { MouseControls } from '../controls/MouseControls.js';
import { KeyboardControls } from '../controls/KeyboardControls.js';
import { CollisionDetection } from '../utils/CollisionDetection.js';
import { UI } from '../utils/UI.js';
import { Debug } from '../utils/Debug.js';
import { AudioController } from '../audio/AudioController.js';
import { SinglePlayerSession } from './SinglePlayerSession.js';
import { MultiplayerSession } from './MultiplayerSession.js';
import { DEFAULT_MAX_HEALTH } from '../sim/MatchSimulation.js';

const DEFAULT_CAMERA_PLAYER = new THREE.Vector3(0, 1, 6);
const DEFAULT_CAMERA_ENEMY = new THREE.Vector3(0, 1, -6);
const DEFAULT_FORWARD = new THREE.Vector3(0, 0, -1);

export class Game {
  constructor(container) {
    this.container = container;
    this.scene = new Scene();
    this.renderer = new Renderer(container);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.cameraController = new CameraController(this.camera);

    this.playerSnail = null;
    this.opponentSnail = null;
    this.mouseControls = null;
    this.keyboardControls = null;
    this.collisionDetection = null;
    this.ui = null;
    this.debug = null;
    this.audio = null;

    this.currentSession = null;
    this.currentOverlayKey = null;
    this.hasRenderedMatchState = false;
    this.isRunning = false;
    this.lastFrameTime = performance.now();
  }

  init() {
    this.scene.init();

    this.playerSnail = new PlayerSnail();
    this.opponentSnail = new NPCSnail();
    this.playerSnail.setVisible(false);
    this.opponentSnail.setVisible(false);
    this.scene.scene.add(this.playerSnail.mesh);
    this.scene.scene.add(this.opponentSnail.mesh);

    this.mouseControls = new MouseControls(this.container);
    this.keyboardControls = new KeyboardControls();
    this.collisionDetection = new CollisionDetection();
    this.ui = new UI();
    this.debug = new Debug(this);

    this.ui.updatePlayerHealth(DEFAULT_MAX_HEALTH, DEFAULT_MAX_HEALTH);
    this.ui.updateEnemyHealth(DEFAULT_MAX_HEALTH, DEFAULT_MAX_HEALTH);
    this.ui.setHealthLabels('Player', 'Enemy');
    this.refreshInstructions();
    this.ui.setMusicState(false);
    this.ui.setupMusicButton(this.toggleMusic.bind(this));
    this.ui.setupModeButtons({
      onSinglePlayer: this.startSinglePlayerSession.bind(this),
      onMultiplayer: this.startMultiplayerSession.bind(this)
    });
    this.ui.showStartMenu();

    this.cameraController.setLockOnEnabled(false);
    this.cameraController.snapToTarget(
      DEFAULT_CAMERA_PLAYER,
      DEFAULT_CAMERA_ENEMY,
      DEFAULT_FORWARD
    );

    this.onWindowResize();
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.animate();
  }

  stop() {
    this.isRunning = false;
    this.currentSession?.leave();
    this.currentSession = null;
  }

  animate() {
    if (!this.isRunning) {
      return;
    }

    requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const delta = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    this.update(delta);
    this.renderer.render(this.scene.scene, this.camera);
  }

  update(delta) {
    if (!this.currentSession) {
      if (this.debug) {
        this.debug.update();
      }
      return;
    }

    const localInput = this.buildLocalInput();
    this.currentSession.update(delta, localInput);

    const localState = this.currentSession.getLocalPlayerState();
    const opponentState = this.currentSession.getOpponentPlayerState();
    this.applyViewState(localState, opponentState, localInput.lockOnHeld, delta);
    this.updateHud(localState, opponentState);
    this.updateOverlay();

    if (this.debug) {
      this.debug.update();
    }
  }

  buildLocalInput() {
    const movementAxes = this.keyboardControls.getMovementAxes();
    const movementDirection = this.cameraController.getMovementDirection(movementAxes);
    const combatInput = this.mouseControls.consumeCombatInput();

    return {
      moveX: movementDirection.x,
      moveZ: movementDirection.z,
      jumpPressed: this.keyboardControls.consumeJumpRequest(),
      lockOnHeld: this.keyboardControls.isLockOnHeld(),
      combatMode: combatInput.mode,
      lookX: combatInput.lookX,
      lookY: combatInput.lookY
    };
  }

  applyViewState(localState, opponentState, lockOnHeld, delta) {
    if (!localState) {
      this.playerSnail.setVisible(false);
      this.opponentSnail.setVisible(false);
      this.hasRenderedMatchState = false;
      return;
    }

    this.playerSnail.applyMatchState(localState, delta);
    if (opponentState) {
      this.opponentSnail.applyMatchState(opponentState, delta);
    } else {
      this.opponentSnail.setVisible(false);
    }

    const fallbackOpponentState = opponentState ?? {
      position: {
        x: localState.position.x,
        y: localState.position.y,
        z: localState.position.z - 6
      },
      connected: false
    };

    const lockOnEnabled = Boolean(lockOnHeld && opponentState?.connected);
    this.cameraController.setLockOnEnabled(lockOnEnabled);

    if (!this.hasRenderedMatchState) {
      this.cameraController.snapToTarget(
        this.playerSnail.getBodyPosition(),
        new THREE.Vector3(
          fallbackOpponentState.position.x,
          fallbackOpponentState.position.y,
          fallbackOpponentState.position.z
        ),
        this.playerSnail.getFacingVector()
      );
      this.hasRenderedMatchState = true;
    } else {
      this.cameraController.update(
        this.playerSnail.getBodyPosition(),
        new THREE.Vector3(
          fallbackOpponentState.position.x,
          fallbackOpponentState.position.y,
          fallbackOpponentState.position.z
        ),
        this.playerSnail.getFacingVector()
      );
    }
  }

  updateHud(localState, opponentState) {
    if (localState) {
      this.ui.updatePlayerHealth(localState.health, localState.maxHealth);
    }

    if (opponentState) {
      this.ui.updateEnemyHealth(opponentState.health, opponentState.maxHealth);
    }

    const labels = this.currentSession?.getHudLabels() ?? { opponent: 'Enemy' };
    this.ui.setHealthLabels('Player', labels.opponent);
  }

  updateOverlay() {
    const overlay = this.currentSession?.getOverlayState() ?? null;
    const overlayKey = overlay ? JSON.stringify({
      title: overlay.title,
      body: overlay.body,
      actions: overlay.actions.map((action) => action.id)
    }) : null;

    if (!overlay) {
      if (this.currentOverlayKey !== null) {
        this.ui.clearMessage();
        this.currentOverlayKey = null;
      }
      return;
    }

    if (overlayKey === this.currentOverlayKey) {
      return;
    }

    this.currentOverlayKey = overlayKey;
    this.ui.showMessage({
      title: overlay.title,
      body: overlay.body,
      actions: overlay.actions.map((action) => ({
        label: action.label,
        onClick: () => this.handleOverlayAction(action.id)
      }))
    });
  }

  handleOverlayAction(actionId) {
    switch (actionId) {
      case 'restart':
        if (this.currentSession instanceof SinglePlayerSession) {
          this.currentSession.restart();
          this.ui.clearMessage();
          this.currentOverlayKey = null;
          this.hasRenderedMatchState = false;
        }
        break;
      case 'menu':
      case 'leave':
        this.returnToModeSelect();
        break;
    }
  }

  startSinglePlayerSession() {
    this.enterSession(new SinglePlayerSession());
  }

  startMultiplayerSession() {
    this.enterSession(new MultiplayerSession());
  }

  enterSession(session) {
    this.currentSession?.leave();
    this.currentSession = session;
    this.currentOverlayKey = null;
    this.hasRenderedMatchState = false;
    this.resetViewActors();
    this.ui.hideStartMenu();
    this.ui.clearMessage();
    this.ui.updatePlayerHealth(DEFAULT_MAX_HEALTH, DEFAULT_MAX_HEALTH);
    this.ui.updateEnemyHealth(DEFAULT_MAX_HEALTH, DEFAULT_MAX_HEALTH);
    this.refreshInstructions();

    if (document.pointerLockElement === this.container && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  returnToModeSelect() {
    this.currentSession?.leave();
    this.currentSession = null;
    this.currentOverlayKey = null;
    this.hasRenderedMatchState = false;
    this.resetViewActors();
    this.ui.clearMessage();
    this.ui.showStartMenu();
    this.ui.setHealthLabels('Player', 'Enemy');
    this.ui.updatePlayerHealth(DEFAULT_MAX_HEALTH, DEFAULT_MAX_HEALTH);
    this.ui.updateEnemyHealth(DEFAULT_MAX_HEALTH, DEFAULT_MAX_HEALTH);
    this.cameraController.setLockOnEnabled(false);
    this.cameraController.snapToTarget(
      DEFAULT_CAMERA_PLAYER,
      DEFAULT_CAMERA_ENEMY,
      DEFAULT_FORWARD
    );

    if (document.pointerLockElement === this.container && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  refreshInstructions() {
    this.ui.setInstructions(
      'WASD move · Space jump · LMB sweep · RMB thrust · Hold Shift lock-on · Click arena'
    );
  }

  resetViewActors() {
    this.playerSnail.setVisible(false);
    this.opponentSnail.setVisible(false);
    delete this.playerSnail.mesh.userData.hasAppliedMatchState;
    delete this.opponentSnail.mesh.userData.hasAppliedMatchState;
  }

  toggleMusic() {
    if (!this.audio) {
      this.audio = new AudioController();
    }

    if (this.audio.isPlaying) {
      this.audio.stopMusic();
    } else {
      this.audio.startMusic();
    }

    this.ui.setMusicState(this.audio.isPlaying);
  }

  getDebugState() {
    return {
      sessionState: this.currentSession?.getConnectionState() ?? 'menu',
      localSlot: this.currentSession?.getLocalSlot() ?? null,
      localPlayer: this.currentSession?.getLocalPlayerState() ?? null,
      opponentPlayer: this.currentSession?.getOpponentPlayerState() ?? null,
      playerView: this.playerSnail.mesh.visible ? this.playerSnail : null,
      opponentView: this.opponentSnail.mesh.visible ? this.opponentSnail : null
    };
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.updateSize();
  }
}
