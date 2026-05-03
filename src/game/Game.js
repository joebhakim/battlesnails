import * as THREE from 'three';

import { Scene } from './Scene.js';
import { Renderer } from './Renderer.js';
import { CameraController } from './CameraController.js';
import { PlayerSnail } from '../entities/PlayerSnail.js';
import { NPCSnail } from '../entities/NPCSnail.js';
import { TestFixtureActor } from '../entities/TestFixtureActor.js';
import { WorldPropActor } from '../entities/WorldPropActor.js';
import { MouseControls } from '../controls/MouseControls.js';
import { KeyboardControls } from '../controls/KeyboardControls.js';
import { CollisionDetection } from '../utils/CollisionDetection.js';
import { UI } from '../utils/UI.js';
import { Debug } from '../utils/Debug.js';
import { AudioController } from '../audio/AudioController.js';
import {
  SINGLE_PLAYER_OPTIONS_SCHEMA,
  SinglePlayerSession,
  getStoredSinglePlayerOptions
} from './SinglePlayerSession.js';
import { ExplorerSession } from './ExplorerSession.js';
import { MultiplayerSession } from './MultiplayerSession.js';
import { TestSession } from './TestSession.js';
import { SimulatorSession } from './SimulatorSession.js';
import { TrailRenderer } from './TrailRenderer.js';
import { DamageIndicators } from './DamageIndicators.js';
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

function createSifuStatueActor(state) {
  return new NPCSnail({
    position: new THREE.Vector3(state.position.x, state.position.y, state.position.z),
    spawnDropHeight: 0,
    speed: 0,
    turnSpeed: 0,
    bodyRadius: state.bodyRadius,
    maxHealth: state.maxHealth,
    health: state.health,
    deathBurstEnabled: false,
    bodyColor: 0x7f9386,
    shellColor: 0x5a5144,
    shellDamagedColor: 0x5a5144,
    shellCriticalColor: 0x5a5144,
    stalkIdlePull: 0,
    stalkDrivePull: 0
  });
}

export class Game {
  constructor(container) {
    this.container = container;
    this.scene = new Scene();
    this.renderer = new Renderer(container);
    this.camera = new THREE.PerspectiveCamera(120, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.cameraController = new CameraController(this.camera);
    this.trailRenderer = null;
    this.damageIndicators = null;

    this.playerSnail = null;
    this.otherActorViews = new Map();
    this.worldPropViews = new Map();
    this.mouseControls = null;
    this.keyboardControls = null;
    this.collisionDetection = null;
    this.ui = null;
    this.debug = null;
    this.audio = null;

    this.currentSession = null;
    this.currentOverlayKey = null;
    this.latestSnapshotEvents = [];
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
    this.damageIndicators = new DamageIndicators({
      container: this.container,
      camera: this.camera
    });
    this.debug = new Debug(this);

    this.ui.updatePlayerHealth(DEFAULT_MAX_HEALTH, DEFAULT_MAX_HEALTH);
    this.ui.updateEnemyHealth(DEFAULT_BOT_MAX_HEALTH, DEFAULT_BOT_MAX_HEALTH);
    this.ui.setHealthLabels('Player', 'Enemy');
    this.refreshInstructions();
    this.ui.setMusicState(false);
    this.ui.setupMusicButton(this.toggleMusic.bind(this));
    this.ui.setupModeButtons({
      onSinglePlayer: this.showSinglePlayerSetup.bind(this),
      onExplorer: this.startExplorerSession.bind(this),
      onTestMode: this.startTestSession.bind(this),
      onSimulator: this.startSimulatorSession.bind(this),
      onMultiplayer: this.startMultiplayerSession.bind(this)
    });
    this.ui.setupSinglePlayerSetup({
      schema: SINGLE_PLAYER_OPTIONS_SCHEMA,
      values: getStoredSinglePlayerOptions(),
      onStart: this.startSinglePlayerSession.bind(this)
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
    this.ui?.hideSimulatorPanel();
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
      this.latestSnapshotEvents = [];
      this.damageIndicators?.clear();
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
    this.syncWorldPropViews(snapshot?.worldProps ?? [], delta);

    const localState = this.currentSession.getLocalPlayerState();
    const otherStates = this.currentSession.getOtherPlayerStates?.() ?? [];
    const focusState = this.currentSession.getFocusTargetState?.() ?? this.currentSession.getOpponentPlayerState();
    const viewLockOnHeld = localState?.lockOn ?? localInput.lockOnHeld;
    this.applyViewState(localState, otherStates, focusState, viewLockOnHeld, delta);
    this.latestSnapshotEvents = snapshot?.events ?? [];
    this.applyWorldPropEvents(this.latestSnapshotEvents);
    this.damageIndicators?.handleSnapshotEvents(
      this.latestSnapshotEvents,
      this.getDamageIndicatorColors(localState)
    );
    this.damageIndicators?.update(delta);
    this.updateHud(localState, focusState);
    this.ui.updateStalkIndicators(localState?.stalks ?? null);
    this.updateTestPanel();
    this.updateSimulatorPanel();
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
      interactPressed: this.keyboardControls.consumeInteractRequest?.() ?? false,
      lockOnHeld: this.keyboardControls.isLockOnHeld(),
      lookX: combatInput.lookX,
      lookY: combatInput.lookY,
      turnX: combatInput.turnX ?? 0,
      reachDelta: combatInput.reachDelta,
      leftHeld: combatInput.leftHeld,
      rightHeld: combatInput.rightHeld
    };
  }

  createActorViewForState(state) {
    let actor = null;
    if (state.fixtureKind && state.fixtureKind !== 'snail') {
      actor = new TestFixtureActor({
        fixtureKind: state.fixtureKind,
        collisionShape: state.collisionShape
      });
    } else if (state.fixtureKind === 'snail') {
      actor = createSifuStatueActor(state);
    } else if (state.profileName === 'bot') {
      actor = new NPCSnail();
    } else {
      actor = new PlayerSnail(REMOTE_PLAYER_OVERRIDES);
    }

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

  syncWorldPropViews(worldProps, delta) {
    const desiredIds = new Set(worldProps.map((prop) => prop.id));

    for (const [id, actor] of this.worldPropViews.entries()) {
      if (desiredIds.has(id)) {
        continue;
      }

      this.scene.scene.remove(actor.mesh);
      this.worldPropViews.delete(id);
    }

    for (const prop of worldProps) {
      let actor = this.worldPropViews.get(prop.id);
      if (!actor) {
        actor = new WorldPropActor(prop);
        this.worldPropViews.set(prop.id, actor);
        this.scene.scene.add(actor.mesh);
      } else {
        actor.applyPropState(prop);
      }

      actor.update(delta);
    }
  }

  applyWorldPropEvents(events) {
    for (const event of events ?? []) {
      if (event.type !== 'log_nibble' || !event.propId) {
        continue;
      }

      this.worldPropViews.get(event.propId)?.startNibble();
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
      this.ui.updateEnemyHealth(
        focusState.immortal ? 1 : focusState.health,
        focusState.immortal ? 1 : focusState.maxHealth
      );
    } else {
      this.ui.updateEnemyHealth(0, this.currentSession?.getDefaultOpponentMaxHealth?.() ?? DEFAULT_BOT_MAX_HEALTH);
    }

    const labels = this.currentSession?.getHudLabels?.(focusState) ?? { opponent: 'Enemy' };
    this.ui.setHealthLabels('Player', labels.opponent);
  }

  getActorBodyColor(actor) {
    return actor?.originalBodyColor
      ? `#${actor.originalBodyColor.getHexString()}`
      : null;
  }

  getDamageIndicatorColors(localState) {
    const colors = new Map();
    if (localState) {
      colors.set(localState.slot, this.getActorBodyColor(this.playerSnail));
    }

    for (const [slot, actor] of this.otherActorViews.entries()) {
      colors.set(slot, this.getActorBodyColor(actor));
    }

    return colors;
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
        if (typeof this.currentSession?.restart === 'function') {
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

  showSinglePlayerSetup() {
    this.ui.showSinglePlayerSetup(getStoredSinglePlayerOptions());
  }

  startSinglePlayerSession(options = {}) {
    this.enterSession(new SinglePlayerSession({ options }));
  }

  startExplorerSession() {
    this.enterSession(new ExplorerSession());
  }

  startTestSession() {
    this.enterSession(new TestSession());
  }

  startMultiplayerSession() {
    this.enterSession(new MultiplayerSession());
  }

  startSimulatorSession() {
    this.enterSession(new SimulatorSession());
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
    this.ui.hideSimulatorPanel();
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
    if (this.currentSession?.mode === 'test') {
      this.ui.setInstructions('WASD move · Mouse turn · Space jump · Hold LMB/RMB stalks · Mouse Y reach · Wheel plane height · Hold Shift lock-on · Tune sliders on the right · Click arena');
      return;
    }

    if (this.currentSession?.mode === 'singleplayer') {
      this.ui.setInstructions('WASD move · Mouse turn · Space jump · Hold LMB/RMB stalks · Mouse Y reach · Wheel plane height · Hold Shift lock-on · Click arena');
      return;
    }

    if (this.currentSession?.mode === 'explorer') {
      this.ui.setInstructions('WASD move · Mouse turn · E nibble logs · Space jump · Hold LMB/RMB stalks · Wheel plane height · Hold Shift lock-on · Click arena');
      return;
    }

    if (this.currentSession?.mode === 'simulator') {
      this.ui.setInstructions('Simulator is driving both snails · Run batches on the right · Watch the representative match');
      return;
    }

    this.ui.setInstructions('WASD move · Mouse turn · Space jump · Hold LMB/RMB stalks · Mouse Y reach · Wheel plane height · Hold Shift lock-on · Click arena');
  }

  resetViewActors() {
    this.trailRenderer?.reset();
    this.damageIndicators?.clear();
    this.playerSnail.setVisible(false);
    delete this.playerSnail.mesh.userData.hasAppliedMatchState;

    for (const actor of this.otherActorViews.values()) {
      this.scene.scene.remove(actor.mesh);
    }
    this.otherActorViews.clear();

    for (const actor of this.worldPropViews.values()) {
      this.scene.scene.remove(actor.mesh);
    }
    this.worldPropViews.clear();
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
      events: this.latestSnapshotEvents ?? [],
      playerView: this.playerSnail.mesh.visible ? this.playerSnail : null,
      opponentView: focusState ? this.otherActorViews.get(focusState.slot) ?? null : null
    };
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.updateSize();
  }

  isTuningSession() {
    return Boolean(
      this.currentSession?.mode === 'test' &&
      this.currentSession?.getTuningSchema &&
      this.currentSession?.getTuningConfig &&
      this.currentSession?.setTuningConfig &&
      this.currentSession?.getTestPanelState
    );
  }

  getTuningPanelHeader() {
    return {
      kicker: 'Test Mode',
      title: 'Snail Lab',
      copy: 'Stage changes, apply them explicitly, and keep tuning locally on this browser.'
    };
  }

  syncSessionUiChrome() {
    const localState = this.currentSession?.getLocalPlayerState?.() ?? null;
    const focusState = this.currentSession?.getFocusTargetState?.() ?? this.currentSession?.getOpponentPlayerState?.() ?? null;
    const labels = this.currentSession?.getHudLabels?.(focusState) ?? { opponent: 'Enemy' };
    this.ui.setHealthLabels('Player', labels.opponent);
    this.ui.updatePlayerHealth(localState?.health ?? DEFAULT_MAX_HEALTH, localState?.maxHealth ?? DEFAULT_MAX_HEALTH);
    this.ui.updateEnemyHealth(
      focusState ? (focusState.immortal ? 1 : focusState.health) : 0,
      focusState
        ? (focusState.immortal ? 1 : focusState.maxHealth)
        : this.currentSession?.getDefaultOpponentMaxHealth?.() ?? DEFAULT_BOT_MAX_HEALTH
    );

    if (this.isTuningSession()) {
      this.ui.showTestPanel({
        schema: this.currentSession.getTuningSchema(),
        values: this.currentSession.getTuningConfig(),
        onApply: this.handleTestTuningApply.bind(this),
        onResetArena: this.handleTestResetArena.bind(this),
        onResetDefaults: this.handleTestResetDefaults.bind(this),
        header: this.getTuningPanelHeader()
      });
      this.ui.updateTestPanelStatus(this.currentSession.getTestPanelState());
    } else {
      this.ui.hideTestPanel();
    }

    if (this.currentSession?.mode === 'simulator') {
      this.ui.showSimulatorPanel({
        state: this.currentSession.getSimulatorPanelState(),
        schema: this.currentSession.getTuningSchema(),
        values: this.currentSession.getTuningConfig(),
        onRunBatch: this.handleSimulatorRunBatch.bind(this),
        onRestartVisual: this.handleSimulatorRestartVisual.bind(this),
        onCopyJson: this.handleSimulatorCopyJson.bind(this),
        onApplyTuning: this.handleSimulatorTuningApply.bind(this),
        onResetTuningDefaults: this.handleSimulatorTuningResetDefaults.bind(this)
      });
    } else {
      this.ui.hideSimulatorPanel();
    }
  }

  updateTestPanel() {
    if (!this.isTuningSession()) {
      return;
    }

    this.ui.updateTestPanelStatus(this.currentSession.getTestPanelState());
  }

  updateSimulatorPanel() {
    if (this.currentSession?.mode !== 'simulator') {
      return;
    }

    this.ui.updateSimulatorPanelStatus(this.currentSession.getSimulatorPanelState());
  }

  handleSimulatorRunBatch(config) {
    if (this.currentSession?.mode !== 'simulator') {
      return;
    }

    this.currentSession.startBatch(config);
    this.ui.updateSimulatorPanelStatus(this.currentSession.getSimulatorPanelState(), { forceInputs: true });
  }

  handleSimulatorRestartVisual() {
    if (this.currentSession?.mode !== 'simulator') {
      return;
    }

    this.currentSession.restartVisualMatch();
    this.currentOverlayKey = null;
    this.hasRenderedMatchState = false;
    this.resetViewActors();
    this.syncSessionUiChrome();
  }

  async handleSimulatorCopyJson() {
    if (this.currentSession?.mode !== 'simulator') {
      return;
    }

    const reportJson = this.currentSession.getSimulatorReportJson();
    try {
      await navigator.clipboard.writeText(reportJson);
      this.ui.setSimulatorCopyStatus('Copied JSON');
    } catch {
      this.ui.setSimulatorCopyStatus('Copy unavailable');
    }
  }

  handleSimulatorTuningApply(nextConfig) {
    if (this.currentSession?.mode !== 'simulator') {
      return;
    }

    this.currentSession.setTuningConfig(nextConfig);
    this.currentOverlayKey = null;
    this.hasRenderedMatchState = false;
    this.resetViewActors();
    this.syncSessionUiChrome();
  }

  handleSimulatorTuningResetDefaults() {
    if (this.currentSession?.mode !== 'simulator') {
      return;
    }

    this.currentSession.resetToDefaults();
    this.currentOverlayKey = null;
    this.hasRenderedMatchState = false;
    this.resetViewActors();
    this.syncSessionUiChrome();
  }

  handleTestTuningApply(nextConfig) {
    if (!this.isTuningSession()) {
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
    if (!this.isTuningSession() || !this.currentSession.resetArena) {
      return;
    }

    this.currentSession.resetArena();
    this.currentOverlayKey = null;
    this.hasRenderedMatchState = false;
    this.resetViewActors();
    this.syncSessionUiChrome();
  }

  handleTestResetDefaults() {
    if (!this.isTuningSession() || !this.currentSession.resetToDefaults) {
      return;
    }

    this.currentSession.resetToDefaults();
    this.currentOverlayKey = null;
    this.hasRenderedMatchState = false;
    this.resetViewActors();
    this.syncSessionUiChrome();
  }
}
