import * as THREE from 'three';

import { Scene } from './Scene.js';
import { Renderer } from './Renderer.js';
import { CameraController } from './CameraController.js';
import { PlayerSnail } from '../entities/PlayerSnail.js';
import { NPCSnail } from '../entities/NPCSnail.js';
import { TestFixtureActor } from '../entities/TestFixtureActor.js';
import { WorldPropActor } from '../entities/WorldPropActor.js';
import { WorldPropBatchActor, shouldRenderWorldPropIndividually } from '../entities/WorldPropBatchActor.js';
import { BirdActor } from '../entities/BirdActor.js';
import { MouseControls } from '../controls/MouseControls.js';
import { KeyboardControls } from '../controls/KeyboardControls.js';
import { MobileControls } from '../controls/MobileControls.js';
import { CollisionDetection } from '../utils/CollisionDetection.js';
import { UI } from '../utils/UI.js';
import { Debug } from '../utils/Debug.js';
import { AudioController } from '../audio/AudioController.js';
import { ProximityVoiceController } from '../audio/ProximityVoiceController.js';
import {
  ANNOYING_LECTURER_SPEAKER_KIND,
  buildProximitySpeakerEntries
} from '../audio/ProximityChat.js';
import {
  SINGLE_PLAYER_OPTIONS_SCHEMA,
  SinglePlayerSession,
  getStoredSinglePlayerOptions
} from './SinglePlayerSession.js';
import {
  HUNT_OPTIONS_SCHEMA,
  ExplorerSession,
  getStoredHuntOptions
} from './ExplorerSession.js';
import { MultiplayerSession } from './MultiplayerSession.js';
import { TestSession } from './TestSession.js';
import { SimulatorSession } from './SimulatorSession.js';
import { TrailRenderer } from './TrailRenderer.js';
import { DamageIndicators } from './DamageIndicators.js';
import { startAssetStudio } from './AssetStudio.js';
import { ProximityPortraitRenderer } from './ProximityPortraitRenderer.js';
import { DEFAULT_BOT_MAX_HEALTH, DEFAULT_MAX_HEALTH } from '../sim/MatchSimulation.js';
import { DEFAULT_TERRAIN_CONFIG } from '../world/Terrain.js';
import {
  DEFAULT_MULTIPLAYER_OPTIONS,
  normalizeMultiplayerOptions
} from '../sim/MultiplayerOptions.js';
import { getPowerupForProp } from '../sim/SnailPowerups.js';

const DEFAULT_CAMERA_PLAYER = new THREE.Vector3(0, 1, 6);
const DEFAULT_CAMERA_ENEMY = new THREE.Vector3(0, 1, -6);
const DEFAULT_FORWARD = new THREE.Vector3(0, 0, -1);
const PERFORMANCE_SAMPLE_INTERVAL = 0.5;
const REMOTE_BOT_STALK_RENDER_DISTANCE = 48;
const NEARBY_POWERUP_RADIUS = 42;
const INDIVIDUAL_WORLD_PROP_RENDER_DISTANCE = 190;
const LECTURER_PLAYER_OVERRIDES = {
  bodyColor: 0x67c5bd,
  shellColor: 0x2f536a,
  shellDamagedColor: 0x4f6b7e,
  shellCriticalColor: 0x8f574f
};

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

function clampAxis(value) {
  return Math.max(-1, Math.min(1, value));
}

function getZeroCombatInput() {
  return {
    engaged: false,
    leftHeld: false,
    rightHeld: false,
    lookX: 0,
    lookY: 0,
    turnX: 0,
    reachDelta: 0,
    pointerLocked: false
  };
}

function mergeCombatInputs(...inputs) {
  const merged = getZeroCombatInput();
  for (const input of inputs) {
    if (!input) {
      continue;
    }

    merged.leftHeld = merged.leftHeld || Boolean(input.leftHeld);
    merged.rightHeld = merged.rightHeld || Boolean(input.rightHeld);
    merged.lookX += input.lookX ?? 0;
    merged.lookY += input.lookY ?? 0;
    merged.turnX += input.turnX ?? 0;
    merged.reachDelta += input.reachDelta ?? 0;
    merged.pointerLocked = merged.pointerLocked || Boolean(input.pointerLocked);
  }

  merged.engaged = merged.leftHeld || merged.rightHeld;
  if (merged.engaged) {
    merged.turnX = 0;
  }
  return merged;
}

export class Game {
  declare otherActorViews: any;
  declare worldPropViews: any;
  declare worldPropBatch: any;
  declare individualWorldPropsReference: any;
  declare individualWorldProps: any;
  declare creatureViews: any;
  declare audio: any;
  declare assetStudioRestore: any;
  declare assetStudioState: any;
  declare camera: any;
  declare cameraController: any;
  declare collisionDetection: any;
  declare container: any;
  declare currentOverlayKey: any;
  declare currentSession: any;
  declare damageIndicators: any;
  declare developerModesVisible: any;
  declare debug: any;
  declare handleGlobalKeyDown: any;
  declare hasRenderedMatchState: any;
  declare isRunning: any;
  declare keyboardControls: any;
  declare lastFrameTime: any;
  declare latestSnapshotEvents: any;
  declare lastWorldPropsReference: any;
  declare cachedPowerupWorldPropsReference: any;
  declare cachedPowerupWorldProps: any;
  declare worldPropBatchSignature: any;
  declare performanceFrameCount: any;
  declare performanceLastSampleTick: any;
  declare performanceLastSampleTime: any;
  declare performanceFps: any;
  declare performanceTps: any;
  declare mouseControls: any;
  declare mobileControls: any;
  declare playerSnail: any;
  declare proximityPortraits: any;
  declare proximityVoice: any;
  declare renderer: any;
  declare scene: any;
  declare trailRenderer: any;
  declare ui: any;
  constructor(container) {
    this.container = container;
    this.scene = new Scene();
    this.renderer = new Renderer(container);
    this.camera = new THREE.PerspectiveCamera(120, window.innerWidth / window.innerHeight, 0.1, 6000);
    this.cameraController = new CameraController(this.camera);
    this.trailRenderer = null;
    this.damageIndicators = null;
    this.developerModesVisible = false;
    this.handleGlobalKeyDown = this.onGlobalKeyDown.bind(this);

    this.playerSnail = null;
    this.otherActorViews = new Map();
    this.worldPropViews = new Map();
    this.worldPropBatch = null;
    this.individualWorldPropsReference = null;
    this.individualWorldProps = [];
    this.creatureViews = new Map();
    this.mouseControls = null;
    this.mobileControls = null;
    this.keyboardControls = null;
    this.collisionDetection = null;
    this.ui = null;
    this.debug = null;
    this.audio = null;
    this.proximityPortraits = null;
    this.proximityVoice = null;

    this.currentSession = null;
    this.currentOverlayKey = null;
    this.latestSnapshotEvents = [];
    this.lastWorldPropsReference = null;
    this.cachedPowerupWorldPropsReference = null;
    this.cachedPowerupWorldProps = [];
    this.worldPropBatchSignature = '';
    this.performanceFrameCount = 0;
    this.performanceLastSampleTime = performance.now();
    this.performanceLastSampleTick = null;
    this.performanceFps = null;
    this.performanceTps = null;
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
    this.mobileControls = new MobileControls(document.getElementById('mobile-controls'));
    this.collisionDetection = new CollisionDetection();
    this.ui = new UI();
    this.proximityPortraits = new ProximityPortraitRenderer();
    this.proximityVoice = new ProximityVoiceController();
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
      onExplorer: this.showHuntSetup.bind(this),
      onTestMode: this.startTestSession.bind(this),
      onSimulator: this.startSimulatorSession.bind(this),
      onMultiplayer: this.showMultiplayerSetup.bind(this)
    });
    this.ui.setupSinglePlayerSetup({
      schema: SINGLE_PLAYER_OPTIONS_SCHEMA,
      values: getStoredSinglePlayerOptions(),
      onStart: this.startSinglePlayerSession.bind(this)
    });
    this.ui.showStartMenu();
    this.ui.setDeveloperModesVisible(this.developerModesVisible);

    this.cameraController.setLockOnEnabled(false);
    this.cameraController.snapToTarget(
      DEFAULT_CAMERA_PLAYER,
      DEFAULT_CAMERA_ENEMY,
      DEFAULT_FORWARD
    );

    this.onWindowResize();
    window.addEventListener('resize', this.onWindowResize.bind(this));
    document.addEventListener('keydown', this.handleGlobalKeyDown);
  }

  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.resetPerformanceCounters(this.lastFrameTime);
    this.animate();
  }

  stop() {
    this.isRunning = false;
    this.currentSession?.leave();
    this.currentSession = null;
    this.assetStudioRestore?.();
    this.assetStudioRestore = null;
    this.ui?.hideTestPanel();
    this.ui?.hideSimulatorPanel();
    this.mobileControls?.setEnabled(false);
    this.ui?.setMobileControlsVisible(false);
    this.ui?.updateProximitySpeakers([]);
    this.proximityPortraits?.clear();
    this.proximityVoice?.stop();
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
    this.updatePerformanceReadout(now);
  }

  resetPerformanceCounters(now = performance.now()) {
    this.performanceFrameCount = 0;
    this.performanceLastSampleTime = now;
    this.performanceLastSampleTick = this.currentSession?.getSnapshot?.()?.tick ?? null;
    this.performanceFps = null;
    this.performanceTps = null;
    this.ui?.updatePerformanceStats({ fps: null, tps: null });
  }

  updatePerformanceReadout(now) {
    this.performanceFrameCount += 1;
    const elapsed = (now - this.performanceLastSampleTime) / 1000;
    if (elapsed < PERFORMANCE_SAMPLE_INTERVAL) {
      return;
    }

    const currentTick = this.currentSession?.getSnapshot?.()?.tick ?? null;
    this.performanceFps = this.performanceFrameCount / elapsed;
    this.performanceTps = (
      Number.isFinite(currentTick) &&
      Number.isFinite(this.performanceLastSampleTick) &&
      currentTick >= this.performanceLastSampleTick
    )
      ? (currentTick - this.performanceLastSampleTick) / elapsed
      : null;

    this.performanceFrameCount = 0;
    this.performanceLastSampleTime = now;
    this.performanceLastSampleTick = Number.isFinite(currentTick) ? currentTick : null;
    this.ui?.updatePerformanceStats({
      fps: this.performanceFps,
      tps: this.performanceTps
    });
  }

  update(delta) {
    if (!this.currentSession) {
      this.scene.setTerrainConfig(DEFAULT_TERRAIN_CONFIG);
      this.playerSnail.setTerrainConfig(DEFAULT_TERRAIN_CONFIG);
      this.trailRenderer?.setTerrainConfig(DEFAULT_TERRAIN_CONFIG);
      this.ui?.updateStalkIndicators(null);
      this.ui?.updateSnailStats(null);
      this.ui?.updateTrialHud(null);
      this.ui?.updateNearbyItems([]);
      this.ui?.updateProximitySpeakers([]);
      this.proximityPortraits?.clear();
      this.proximityVoice?.update([]);
      this.latestSnapshotEvents = [];
      this.damageIndicators?.clear();
      this.syncCreatureViews([], delta);
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
    this.syncWorldPropViews(snapshot?.worldProps ?? [], delta, localState?.position ?? null);
    this.syncCreatureViews(snapshot?.creatures ?? [], delta);

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
    this.updateHud(localState, focusState, snapshot);
    this.updateProximityChat(localState, otherStates, delta);
    this.ui.updateStalkIndicators(localState?.stalks ?? null);
    this.updateTestPanel();
    this.updateSimulatorPanel();
    this.updateOverlay();

    if (this.debug) {
      this.debug.update();
    }
  }

  buildLocalInput() {
    const keyboardMovementAxes = this.keyboardControls.getMovementAxes();
    const mobileMovementAxes = this.mobileControls?.getMovementAxes?.() ?? { forward: 0, right: 0 };
    const movementAxes = {
      forward: clampAxis((keyboardMovementAxes.forward ?? 0) + (mobileMovementAxes.forward ?? 0)),
      right: clampAxis((keyboardMovementAxes.right ?? 0) + (mobileMovementAxes.right ?? 0))
    };
    const movementDirection = this.cameraController.getMovementDirection(movementAxes);
    const combatInput = mergeCombatInputs(
      this.mouseControls.consumeCombatInput(),
      this.mobileControls?.consumeCombatInput?.() ?? null
    );

    return {
      moveX: movementDirection.x,
      moveZ: movementDirection.z,
      jumpPressed: Boolean(
        this.keyboardControls.consumeJumpRequest() ||
        this.mobileControls?.consumeJumpRequest?.()
      ),
      interactPressed: Boolean(
        this.keyboardControls.consumeInteractRequest?.() ||
        this.mobileControls?.consumeInteractRequest?.()
      ),
      lockOnHeld: Boolean(
        this.keyboardControls.isLockOnHeld() ||
        this.mobileControls?.isLockOnHeld?.()
      ),
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
      actor = new NPCSnail(state.speakerKind === ANNOYING_LECTURER_SPEAKER_KIND
        ? LECTURER_PLAYER_OVERRIDES
        : undefined);
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

  getIndividualWorldProps(worldProps: any[] = []) {
    if (worldProps === this.individualWorldPropsReference) {
      return this.individualWorldProps;
    }

    this.individualWorldPropsReference = worldProps;
    this.individualWorldProps = worldProps.filter((prop) => shouldRenderWorldPropIndividually(prop));
    return this.individualWorldProps;
  }

  isIndividualWorldPropStateVisible(prop, localPlayerPosition = null) {
    if (!localPlayerPosition) {
      return true;
    }

    const dx = prop.position.x - localPlayerPosition.x;
    const dz = prop.position.z - localPlayerPosition.z;
    const renderDistance = INDIVIDUAL_WORLD_PROP_RENDER_DISTANCE + (prop.bodyRadius ?? 0);
    return (dx * dx) + (dz * dz) <= renderDistance * renderDistance;
  }

  syncIndividualWorldPropViews(worldProps, delta, localPlayerPosition = null) {
    const desiredIds = new Set();
    for (const prop of this.getIndividualWorldProps(worldProps)) {
      if (!this.isIndividualWorldPropStateVisible(prop, localPlayerPosition)) {
        continue;
      }

      desiredIds.add(prop.id);
      let actor = this.worldPropViews.get(prop.id);
      if (!actor) {
        actor = new WorldPropActor(prop, { createLabel: false });
        this.worldPropViews.set(prop.id, actor);
        this.scene.scene.add(actor.mesh);
      } else {
        actor.applyPropState(prop);
      }

      actor.setBodyVisible(true);
      actor.mesh.visible = true;
      actor.update(delta, localPlayerPosition);
    }

    for (const [id, actor] of this.worldPropViews.entries()) {
      if (desiredIds.has(id)) {
        continue;
      }

      this.scene.scene.remove(actor.mesh);
      this.worldPropViews.delete(id);
    }
  }

  syncWorldPropViews(worldProps, delta, localPlayerPosition = null) {
    if (worldProps === this.lastWorldPropsReference) {
      this.syncIndividualWorldPropViews(worldProps, delta, localPlayerPosition);
      this.worldPropBatch?.update(localPlayerPosition);
      return;
    }

    this.lastWorldPropsReference = worldProps;
    const batchEntries = [];
    const batchSignatureParts = [];

    for (const prop of worldProps) {
      if (shouldRenderWorldPropIndividually(prop)) {
        batchEntries.push({ prop, farOnly: true });
        continue;
      }

      batchEntries.push({ prop });
      batchSignatureParts.push([
        prop.id,
        prop.kind,
        prop.position?.x,
        prop.position?.y,
        prop.position?.z,
        prop.rotationY,
        prop.bodyRadius,
        prop.collisionShape?.type
      ].join(':'));
    }

    const nextBatchSignature = batchSignatureParts.join('|');
    this.syncIndividualWorldPropViews(worldProps, delta, localPlayerPosition);

    if (nextBatchSignature !== this.worldPropBatchSignature) {
      if (this.worldPropBatch) {
        this.scene.scene.remove(this.worldPropBatch.mesh);
        this.worldPropBatch.dispose();
        this.worldPropBatch = null;
      }
      this.worldPropBatchSignature = nextBatchSignature;
    }

    if (!this.worldPropBatch && batchEntries.length > 0) {
      this.worldPropBatch = new WorldPropBatchActor(batchEntries);
      this.scene.scene.add(this.worldPropBatch.mesh);
    }
    this.worldPropBatch?.update(localPlayerPosition);
  }

  isIndividualWorldPropVisible(actor, localPlayerPosition = null) {
    if (!localPlayerPosition) {
      return true;
    }

    const dx = actor.mesh.position.x - localPlayerPosition.x;
    const dz = actor.mesh.position.z - localPlayerPosition.z;
    const renderDistance = INDIVIDUAL_WORLD_PROP_RENDER_DISTANCE + (actor.bodyRadius ?? 0);
    return (dx * dx) + (dz * dz) <= renderDistance * renderDistance;
  }

  getPowerupWorldProps(worldProps: any[] = []) {
    if (worldProps === this.cachedPowerupWorldPropsReference) {
      return this.cachedPowerupWorldProps;
    }

    this.cachedPowerupWorldPropsReference = worldProps;
    this.cachedPowerupWorldProps = worldProps
      .map((prop) => {
        const powerup = getPowerupForProp(prop);
        return powerup ? { prop, powerup } : null;
      })
      .filter(Boolean);
    return this.cachedPowerupWorldProps;
  }

  syncCreatureViews(creatures, delta) {
    const desiredIds = new Set(creatures.map((creature) => creature.id));

    for (const [id, actor] of this.creatureViews.entries()) {
      if (desiredIds.has(id)) {
        continue;
      }

      this.scene.scene.remove(actor.mesh);
      this.creatureViews.delete(id);
    }

    for (const creature of creatures) {
      let actor = this.creatureViews.get(creature.id);
      if (!actor) {
        actor = new BirdActor();
        this.creatureViews.set(creature.id, actor);
        this.scene.scene.add(actor.mesh);
      }

      actor.applyCreatureState(creature);
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

    const terrainConfig = this.currentSession?.getSnapshot?.()?.terrain ?? DEFAULT_TERRAIN_CONFIG;
    for (const state of otherStates) {
      const actor = this.otherActorViews.get(state.slot);
      const isFocused = focusState?.slot === state.slot;
      const dx = state.position.x - localState.position.x;
      const dz = state.position.z - localState.position.z;
      const botStalksInRange = (dx * dx) + (dz * dz) <=
        REMOTE_BOT_STALK_RENDER_DISTANCE * REMOTE_BOT_STALK_RENDER_DISTANCE;
      const stalkRenderFidelity = state.profileName === 'bot' && !isFocused && !botStalksInRange
        ? 'hidden'
        : 'full';
      actor?.setTerrainConfig(terrainConfig);
      actor?.applyMatchState(state, delta, { stalkRenderFidelity });
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

  getNearbyPowerupItems(worldProps: any[] = [], localState: any = null) {
    if (!localState?.position || !Array.isArray(worldProps)) {
      return [];
    }

    return this.getPowerupWorldProps(worldProps)
      .map(({ prop, powerup }) => {

        const dx = prop.position.x - localState.position.x;
        const dz = prop.position.z - localState.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance > NEARBY_POWERUP_RADIUS + (prop.bodyRadius ?? 0)) {
          return null;
        }

        return {
          id: prop.id,
          kind: prop.kind,
          type: powerup.type,
          label: prop.displayName ?? powerup.label,
          amount: powerup.amount,
          distance
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 5);
  }

  getProximitySpeakerColor(slot) {
    const actor = this.otherActorViews.get(slot);
    return this.getActorBodyColor(actor) ?? '#d7c58a';
  }

  updateProximityChat(localState, otherStates: any[] = [], delta = 0) {
    const statesBySlot = new Map(otherStates.map((state) => [state.slot, state]));
    const speakers = buildProximitySpeakerEntries(localState, otherStates).map((speaker) => ({
      ...speaker,
      bodyColor: this.getProximitySpeakerColor(speaker.slot)
    }));

    this.ui.updateProximitySpeakers(speakers);
    this.proximityPortraits?.update(
      speakers,
      statesBySlot,
      (slot) => this.ui.getProximityPortraitCanvas(slot),
      delta
    );
    this.proximityVoice?.update(speakers);
  }

  updateHud(localState, focusState, snapshot: any = null) {
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
    this.ui.updateSnailStats(localState?.snailStats ?? null);
    this.ui.updateTrialHud(snapshot?.trialState ?? null);
    this.ui.updateNearbyItems(this.getNearbyPowerupItems(snapshot?.worldProps ?? [], localState));
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

  showHuntSetup() {
    this.ui.showModeSetup({
      title: 'The Hunt',
      copy: 'Choose how many wild snails stalk Moss Atoll, and how dangerous they are.',
      schema: HUNT_OPTIONS_SCHEMA,
      values: getStoredHuntOptions(),
      startLabel: 'Start Hunt',
      onStart: this.startExplorerSession.bind(this)
    });
  }

  showMultiplayerSetup() {
    this.ui.showModeSetup({
      title: 'Online Multiplayer',
      copy: 'Join the two-snail generated forest test room.',
      schema: [],
      values: DEFAULT_MULTIPLAYER_OPTIONS,
      startLabel: 'Join Online',
      onStart: this.startMultiplayerSession.bind(this)
    });
  }

  startSinglePlayerSession(options: any = {}) {
    this.enterSession(new SinglePlayerSession({ options }));
  }

  startExplorerSession(options: any = {}) {
    const params = new URLSearchParams(window.location.search);
    this.enterSession(new ExplorerSession({
      seed: params.has('seed') ? Number(params.get('seed')) : undefined,
      options: {
        ...options,
        npcCount: params.has('npcs') ? Number(params.get('npcs')) : options.npcCount,
        npcStrength: params.has('strength') ? Number(params.get('strength')) : options.npcStrength
      },
      trialKind: params.get('trial') ?? undefined,
      startInTrial: params.has('trial-now') || params.get('trialNow') === '1',
      forageDuration: params.has('forage') ? Number(params.get('forage')) : undefined
    }));
  }

  startTestSession() {
    this.enterSession(new TestSession());
  }

  startMultiplayerSession(options: any = {}) {
    this.enterSession(new MultiplayerSession({ options: normalizeMultiplayerOptions(options) }));
  }

  startSimulatorSession() {
    this.enterSession(new SimulatorSession());
  }

  startAssetStudio(rawOptions: any = {}) {
    return startAssetStudio(this, rawOptions);
  }

  enterSession(session) {
    this.currentSession?.leave();
    this.currentSession = session;
    this.currentOverlayKey = null;
    this.hasRenderedMatchState = false;
    this.assetStudioRestore?.();
    this.assetStudioRestore = null;
    this.resetViewActors();
    this.ui.hideStartMenu();
    this.ui.clearMessage();
    this.mobileControls?.setEnabled(session.mode !== 'simulator');
    this.syncSessionUiChrome();
    this.ui.updateStalkIndicators(null);
    this.refreshInstructions();
    this.resetPerformanceCounters();

    if (document.pointerLockElement === this.container && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  returnToModeSelect() {
    this.currentSession?.leave();
    this.currentSession = null;
    this.currentOverlayKey = null;
    this.hasRenderedMatchState = false;
    this.assetStudioRestore?.();
    this.assetStudioRestore = null;
    this.resetViewActors();
    this.ui.clearMessage();
    this.ui.showStartMenu();
    this.ui.hideTestPanel();
    this.ui.hideSimulatorPanel();
    this.mobileControls?.setEnabled(false);
    this.ui.setMobileControlsVisible(false);
    this.ui.setHealthLabels('Player', 'Enemy');
    this.ui.updatePlayerHealth(DEFAULT_MAX_HEALTH, DEFAULT_MAX_HEALTH);
    this.ui.updateEnemyHealth(DEFAULT_BOT_MAX_HEALTH, DEFAULT_BOT_MAX_HEALTH);
    this.ui.updateStalkIndicators(null);
    this.refreshInstructions();
    this.cameraController.setLockOnEnabled(false);
    this.scene.setTerrainConfig(DEFAULT_TERRAIN_CONFIG);
    this.playerSnail.setTerrainConfig(DEFAULT_TERRAIN_CONFIG);
    this.resetPerformanceCounters();
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
      this.ui.setInstructions('WASD move · Mouse turn · E nibble logs · Space jump · Hold LMB/RMB stalks · Wheel plane height · Hold Shift lock-on · Click hunt');
      return;
    }

    if (this.currentSession?.mode === 'simulator') {
      this.ui.setInstructions('Simulator is driving both snails · Run batches on the right · Watch the representative match');
      return;
    }

    this.ui.setInstructions('WASD move · Mouse turn · Space jump · Hold LMB/RMB stalks · Mouse Y reach · Wheel plane height · Hold Shift lock-on · Click arena');
  }

  onGlobalKeyDown(event) {
    const target = event.target;
    const tagName = target?.tagName?.toLowerCase?.();
    if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') {
      return;
    }

    if (event.key !== '`' && event.code !== 'Backquote') {
      return;
    }

    event.preventDefault();
    this.developerModesVisible = !this.developerModesVisible;
    this.ui.setDeveloperModesVisible(this.developerModesVisible);
    if (this.developerModesVisible && this.debug && !this.debug.enabled) {
      this.debug.toggleDebugMode();
    }
  }

  resetViewActors() {
    this.trailRenderer?.reset();
    this.damageIndicators?.clear();
    this.ui?.updateProximitySpeakers([]);
    this.proximityPortraits?.clear();
    this.proximityVoice?.stop();
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
    if (this.worldPropBatch) {
      this.scene.scene.remove(this.worldPropBatch.mesh);
      this.worldPropBatch.dispose();
      this.worldPropBatch = null;
    }
    this.lastWorldPropsReference = null;
    this.individualWorldPropsReference = null;
    this.individualWorldProps = [];
    this.cachedPowerupWorldPropsReference = null;
    this.cachedPowerupWorldProps = [];
    this.worldPropBatchSignature = '';

    for (const actor of this.creatureViews.values()) {
      this.scene.scene.remove(actor.mesh);
    }
    this.creatureViews.clear();
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

  addDebugResource(type, amount) {
    const applied = this.currentSession?.grantDebugResource?.(type, amount) ?? false;
    if (!applied) {
      this.debug?.addEvent?.(`Could not add ${type}`);
      this.debug?.renderEventLog?.();
      return false;
    }

    const snapshot = this.currentSession?.getSnapshot?.() ?? null;
    this.latestSnapshotEvents = snapshot?.events ?? [];
    const localState = this.currentSession?.getLocalPlayerState?.() ?? null;
    this.ui?.updateSnailStats(localState?.snailStats ?? null);
    this.damageIndicators?.handleSnapshotEvents?.(
      this.latestSnapshotEvents,
      this.getDamageIndicatorColors(localState)
    );
    this.damageIndicators?.update?.(0);
    this.debug?.addEvent?.(`Added ${amount} ${type}`);
    this.debug?.updateDebugInfo?.();
    return true;
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
    this.ui.setMobileControlsVisible(Boolean(this.currentSession && this.currentSession.mode !== 'simulator'));
    this.ui.setHealthLabels('Player', labels.opponent);
    this.ui.updatePlayerHealth(localState?.health ?? DEFAULT_MAX_HEALTH, localState?.maxHealth ?? DEFAULT_MAX_HEALTH);
    this.ui.updateEnemyHealth(
      focusState ? (focusState.immortal ? 1 : focusState.health) : 0,
      focusState
        ? (focusState.immortal ? 1 : focusState.maxHealth)
        : this.currentSession?.getDefaultOpponentMaxHealth?.() ?? DEFAULT_BOT_MAX_HEALTH
    );
    const snapshot = this.currentSession?.getSnapshot?.() ?? null;
    this.ui.updateSnailStats(localState?.snailStats ?? null);
    this.ui.updateTrialHud(snapshot?.trialState ?? null);
    this.ui.updateNearbyItems(this.getNearbyPowerupItems(snapshot?.worldProps ?? [], localState));

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
