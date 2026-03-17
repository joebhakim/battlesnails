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
import { TestSession } from './TestSession.js';
import { TrailRenderer } from './TrailRenderer.js';
import { DEFAULT_BOT_MAX_HEALTH, DEFAULT_MAX_HEALTH } from '../sim/MatchSimulation.js';
import { DEFAULT_TERRAIN_CONFIG } from '../world/Terrain.js';

const DEFAULT_CAMERA_PLAYER = new THREE.Vector3(0, 1, 6);
const DEFAULT_CAMERA_ENEMY = new THREE.Vector3(0, 1, -6);
const DEFAULT_FORWARD = new THREE.Vector3(0, 0, -1);

const REMOTE_PLAYER_OVERRIDES = {
  position: new THREE.Vector3(0, 1, -6),
  bodyColor: 0xdaa520,
  shellColor: 0x6b4423,
  shellDamagedColor: 0x8a5b2f,
  shellCriticalColor: 0xa7411f
};

export class Game {
  constructor(container) {
    this.container = container;
    this.scene = new Scene();
    this.renderer = new Renderer(container);
    this.camera = new THREE.PerspectiveCamera(120, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.cameraController = new CameraController(this.camera);
    this.trailRenderer = null;

    this.playerSnail = null;
    this.otherActorViews = new Map();
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
    this.trailRenderer = new TrailRenderer(this.scene.scene);

    this.playerSnail = new PlayerSnail();
    this.playerSnail.setVisible(false);
    this.scene.scene.add(this.playerSnail.mesh);

    this.mouseControls = new MouseControls(this.container);
    this.keyboardControls = new KeyboardControls();
    this.collisionDetection = new CollisionDetection();
    this.ui = new UI();
    this.debug = new Debug(this);

    this.ui.updatePlayerHealth(DEFAULT_MAX_HEALTH, DEFAULT_MAX_HEALTH);
    this.ui.updateEnemyHealth(DEFAULT_BOT_MAX_HEALTH, DEFAULT_BOT_MAX_HEALTH);
    this.ui.setHealthLabels('Player', 'Enemy');
    this.refreshInstructions();
    this.ui.setMusicState(false);
    this.ui.setupMusicButton(this.toggleMusic.bind(this));
    this.ui.setupModeButtons({
      onSinglePlayer: this.startSinglePlayerSession.bind(this),
      onTestMode: this.startTestSession.bind(this),
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
    this.ui?.hideTestPanel();
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
      this.scene.setTerrainConfig(DEFAULT_TERRAIN_CONFIG);
      this.playerSnail.setTerrainConfig(DEFAULT_TERRAIN_CONFIG);
      this.trailRenderer?.setTerrainConfig(DEFAULT_TERRAIN_CONFIG);
      this.ui?.updateStalkIndicators(null);
      if (this.debug) {
        this.debug.update();
      }
      return;
    }

    const localInput = this.buildLocalInput();
    this.currentSession.update(delta, localInput);
    const snapshot = this.currentSession.getSnapshot?.() ?? null;
    const terrainConfig = snapshot?.terrain ?? DEFAULT_TERRAIN_CONFIG;
    this.scene.setTerrainConfig(terrainConfig);
    this.playerSnail.setTerrainConfig(terrainConfig);
    this.trailRenderer?.applySnapshot(snapshot);

    const localState = this.currentSession.getLocalPlayerState();
    const otherStates = this.currentSession.getOtherPlayerStates?.() ?? [];
    const focusState = this.currentSession.getFocusTargetState?.() ?? this.currentSession.getOpponentPlayerState();
    this.applyViewState(localState, otherStates, focusState, localInput.lockOnHeld, delta);
    this.updateHud(localState, focusState);
    this.ui.updateStalkIndicators(localState?.stalks ?? null);
    this.updateTestPanel();
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
      lookX: combatInput.lookX,
      lookY: combatInput.lookY,
      leftHeld: combatInput.leftHeld,
      rightHeld: combatInput.rightHeld
    };
  }

  createActorViewForState(state) {
    const actor = state.profileName === 'bot'
      ? new NPCSnail()
      : new PlayerSnail(REMOTE_PLAYER_OVERRIDES);
    actor.setTerrainConfig(this.currentSession?.getSnapshot?.()?.terrain ?? DEFAULT_TERRAIN_CONFIG);
    return actor;
  }

  syncOtherActorViews(otherStates) {
    const desiredSlots = new Set(otherStates.map((state) => state.slot));

    for (const [slot, actor] of this.otherActorViews.entries()) {
      if (desiredSlots.has(slot)) {
        continue;
      }

      this.scene.scene.remove(actor.mesh);
      this.otherActorViews.delete(slot);
    }

    for (const state of otherStates) {
      if (this.otherActorViews.has(state.slot)) {
        continue;
      }

      const actor = this.createActorViewForState(state);
      actor.setVisible(false);
      this.otherActorViews.set(state.slot, actor);
      this.scene.scene.add(actor.mesh);
    }
  }

  applyViewState(localState, otherStates, focusState, lockOnHeld, delta) {
    if (!localState) {
      this.playerSnail.setVisible(false);
      for (const actor of this.otherActorViews.values()) {
        actor.setVisible(false);
      }
      this.hasRenderedMatchState = false;
      return;
    }

    this.playerSnail.applyMatchState(localState, delta);
    this.syncOtherActorViews(otherStates);

    for (const state of otherStates) {
      const actor = this.otherActorViews.get(state.slot);
      actor?.setTerrainConfig(this.currentSession?.getSnapshot?.()?.terrain ?? DEFAULT_TERRAIN_CONFIG);
      actor?.applyMatchState(state, delta);
    }

    const focusActor = focusState ? this.otherActorViews.get(focusState.slot) ?? null : null;
    const fallbackFocusPosition = focusState
      ? new THREE.Vector3(focusState.position.x, focusState.position.y, focusState.position.z)
      : new THREE.Vector3(localState.position.x, localState.position.y, localState.position.z - 6);

    const lockOnEnabled = Boolean(lockOnHeld && focusState?.connected && focusState.health > 0);
    this.cameraController.setLockOnEnabled(lockOnEnabled);

    if (!this.hasRenderedMatchState) {
      this.cameraController.snapToTarget(
        this.playerSnail.getBodyPosition(),
        focusActor ? focusActor.getBodyPosition() : fallbackFocusPosition,
        this.playerSnail.getFacingVector()
      );
      this.hasRenderedMatchState = true;
      return;
    }

    this.cameraController.update(
      this.playerSnail.getBodyPosition(),
      focusActor ? focusActor.getBodyPosition() : fallbackFocusPosition,
      this.playerSnail.getFacingVector()
    );
  }

  updateHud(localState, focusState) {
    if (localState) {
      this.ui.updatePlayerHealth(localState.health, localState.maxHealth);
    }

    if (focusState) {
      this.ui.updateEnemyHealth(focusState.health, focusState.maxHealth);
    } else {
      this.ui.updateEnemyHealth(0, this.currentSession?.getDefaultOpponentMaxHealth?.() ?? DEFAULT_BOT_MAX_HEALTH);
    }

    const labels = this.currentSession?.getHudLabels?.(focusState) ?? { opponent: 'Enemy' };
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
      variant: overlay.variant,
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
          this.trailRenderer?.reset();
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

  startTestSession() {
    this.enterSession(new TestSession());
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
    this.syncSessionUiChrome();
    this.ui.updateStalkIndicators(null);
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
    this.ui.hideTestPanel();
    this.ui.setHealthLabels('Player', 'Enemy');
    this.ui.updatePlayerHealth(DEFAULT_MAX_HEALTH, DEFAULT_MAX_HEALTH);
    this.ui.updateEnemyHealth(DEFAULT_BOT_MAX_HEALTH, DEFAULT_BOT_MAX_HEALTH);
    this.ui.updateStalkIndicators(null);
    this.refreshInstructions();
    this.cameraController.setLockOnEnabled(false);
    this.scene.setTerrainConfig(DEFAULT_TERRAIN_CONFIG);
    this.playerSnail.setTerrainConfig(DEFAULT_TERRAIN_CONFIG);
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
      this.currentSession?.mode === 'test'
        ? 'WASD move · Space jump · Hold LMB left stalk · Hold RMB right stalk · Hold both for both · Hold Shift lock-on · Tune sliders on the right · Click arena'
        : 'WASD move · Space jump · Hold LMB left stalk · Hold RMB right stalk · Hold both for both · Hold Shift lock-on · Click arena'
    );
  }

  resetViewActors() {
    this.trailRenderer?.reset();
    this.playerSnail.setVisible(false);
    delete this.playerSnail.mesh.userData.hasAppliedMatchState;

    for (const actor of this.otherActorViews.values()) {
      this.scene.scene.remove(actor.mesh);
    }
    this.otherActorViews.clear();
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
    const focusState = this.currentSession?.getFocusTargetState?.() ?? this.currentSession?.getOpponentPlayerState?.() ?? null;

    return {
      sessionState: this.currentSession?.getConnectionState() ?? 'menu',
      localSlot: this.currentSession?.getLocalSlot() ?? null,
      localPlayer: this.currentSession?.getLocalPlayerState() ?? null,
      opponentPlayer: focusState,
      playerView: this.playerSnail.mesh.visible ? this.playerSnail : null,
      opponentView: focusState ? this.otherActorViews.get(focusState.slot) ?? null : null
    };
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.updateSize();
  }

  syncSessionUiChrome() {
    const localState = this.currentSession?.getLocalPlayerState?.() ?? null;
    const focusState = this.currentSession?.getFocusTargetState?.() ?? this.currentSession?.getOpponentPlayerState?.() ?? null;
    const labels = this.currentSession?.getHudLabels?.(focusState) ?? { opponent: 'Enemy' };
    this.ui.setHealthLabels('Player', labels.opponent);
    this.ui.updatePlayerHealth(localState?.health ?? DEFAULT_MAX_HEALTH, localState?.maxHealth ?? DEFAULT_MAX_HEALTH);
    this.ui.updateEnemyHealth(
      focusState?.health ?? 0,
      focusState?.maxHealth ?? this.currentSession?.getDefaultOpponentMaxHealth?.() ?? DEFAULT_BOT_MAX_HEALTH
    );

    if (this.currentSession?.mode === 'test') {
      this.ui.showTestPanel({
        schema: this.currentSession.getTuningSchema(),
        values: this.currentSession.getTuningConfig(),
        onApply: this.handleTestTuningApply.bind(this),
        onResetArena: this.handleTestResetArena.bind(this),
        onResetDefaults: this.handleTestResetDefaults.bind(this)
      });
      this.ui.updateTestPanelStatus(this.currentSession.getTestPanelState());
    } else {
      this.ui.hideTestPanel();
    }
  }

  updateTestPanel() {
    if (this.currentSession?.mode !== 'test') {
      return;
    }

    this.ui.updateTestPanelStatus(this.currentSession.getTestPanelState());
  }

  handleTestTuningApply(nextConfig) {
    if (this.currentSession?.mode !== 'test') {
      return;
    }

    const result = this.currentSession.setTuningConfig(nextConfig);
    this.syncSessionUiChrome();

    if (result?.rebuilt) {
      this.currentOverlayKey = null;
      this.hasRenderedMatchState = false;
      this.resetViewActors();
    }
  }

  handleTestResetArena() {
    if (this.currentSession?.mode !== 'test') {
      return;
    }

    this.currentSession.resetArena();
    this.currentOverlayKey = null;
    this.hasRenderedMatchState = false;
    this.resetViewActors();
    this.syncSessionUiChrome();
  }

  handleTestResetDefaults() {
    if (this.currentSession?.mode !== 'test') {
      return;
    }

    this.currentSession.resetToDefaults();
    this.currentOverlayKey = null;
    this.hasRenderedMatchState = false;
    this.resetViewActors();
    this.syncSessionUiChrome();
  }
}
