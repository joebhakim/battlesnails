import * as THREE from 'three';

import {
  DEFAULT_PLAYER_INPUT,
  createIdleInput as createProtocolIdleInput,
  normalizePlayerInput as normalizeProtocolPlayerInput,
  type PlayerInput
} from '../protocol/InputProtocol.js';
import {
  cloneSnapshotEvent,
  cloneVector,
  cloneWorldProp,
  serializeNetworkPlayer,
  serializeSnapshotPlayer
} from './SnapshotSerialization.js';
import {
  STALK_EYE_RADIUS_SCALE,
  STALK_SEGMENT_RADIUS,
  getBodyLocalDirection,
  getStalkGoalWorldPositionFromDirection,
  getStalkRootWorldPosition,
  getTipWorldPosition,
  simulateStalkRope
} from './StalkRope.js';
import {
  createSpatialIndex,
  querySpatialIndex
} from './SpatialIndex.js';
import {
  cloneCollisionShape,
  getCollisionShapeRadius
} from './CollisionShape.js';
import {
  WORLD_PROP_SPATIAL_CELL_SIZE,
  createWorldPropObstacles,
  createWorldPropSpatialIndex,
  normalizeWorldProp,
  queryWorldPropSpatialIndex
} from './WorldPropSystem.js';
import {
  applySupportToPlayer,
  getPlayerGroundHeight,
  resolveWorldPropCollisionForPlayer,
  selectBestWorldSupport,
  snapPlayerToGroundIfGrounded
} from './MovementSupportSystem.js';
import {
  advanceAppliedStalkTarget,
  applyCombatInputToPlayer,
  getStalkEntries,
  updateCompositeTipState,
  type StalkSide
} from './StalkControlSystem.js';
import { resolveImpactForPair } from './DamageSystem.js';
import {
  applyArenaRadiusOverride,
  applyProfileToPlayer,
  createPlayerState
} from './PlayerStateSystem.js';
import {
  collectNearbyPowerups as collectNearbyPowerupsForPlayer,
  grantPowerupToSlot as grantPowerupToPlayerSlot,
  resolveWorldPropInteraction as resolvePlayerWorldPropInteraction
} from './PowerupSystem.js';
import {
  evaluateMatchEndState,
  findPreferredTarget as findPreferredTargetForPlayer,
  getLivingPlayers as getLivingPlayersFromRoster
} from './MatchLifecycleSystem.js';
import {
  depositTrailSegment,
  isCircleOnTrail,
  markTrailAtPosition as markTrailCellAtPosition,
  serializeTrailCells,
  type TrailCell
} from './TrailSystem.js';
import {
  BIRD_COVER_QUERY_RADIUS,
  BIRD_DETECTION_RADIUS,
  BIRD_MAX_COOLDOWN,
  BIRD_MIN_COOLDOWN,
  BIRD_PATROL_SHADOW_RADIUS,
  BIRD_RECOVER_DURATION,
  BIRD_SHADOW_TRACK_SPEED,
  BIRD_SWEEP_TRACK_SPEED,
  BIRD_SWOOP_DURATION,
  BIRD_TRACK_DURATION,
  cloneCreatureDescriptor,
  getBirdCoverRadius,
  getBirdGroundPosition,
  movePlanarToward,
  normalizeCreature,
  serializeCreature
} from './CreatureSystem.js';
import {
  DEFAULT_TUNING_CONFIG,
  createTerrainConfigFromTuning,
  createSimulationProfiles,
  type SimulationProfiles,
  type TuningConfig,
  normalizeTuningConfig
} from './Tuning.js';
import {
  getSnailSpeedMultiplier
} from './SnailPowerups.js';
import {
  getTerrainHeight,
  normalizeTerrainConfig,
  type TerrainConfig
} from '../world/Terrain.js';
import { clampPointToWorldBounds } from '../world/WorldBounds.js';

export type StalkAuthorityMode = 'rope' | 'analytic' | 'human_rope';
export type SimulationProfileLevel = 'off' | 'basic' | 'detailed';

function isTruthyEnvValue(value) {
  return value === '1' || value === 'true' || value === 'on' || value === 'yes';
}

function getEnvValue(viteKey: string, processKey: string) {
  const viteValue = (import.meta as any).env?.[viteKey];
  if (viteValue !== undefined) {
    return String(viteValue).toLowerCase();
  }

  return typeof process !== 'undefined' && process.env?.[processKey] !== undefined
    ? String(process.env[processKey]).toLowerCase()
    : undefined;
}

function resolveDefaultTickRate() {
  const explicitValue = getEnvValue('VITE_BATTLESNAILS_TICK_RATE', 'BATTLESNAILS_TICK_RATE');
  const explicitRate = Number(explicitValue);
  if (Number.isFinite(explicitRate) && explicitRate >= 30 && explicitRate <= 240) {
    return explicitRate;
  }

  const target120Value = getEnvValue('VITE_BATTLESNAILS_120HZ', 'BATTLESNAILS_120HZ');
  return target120Value && isTruthyEnvValue(target120Value) ? 120 : 60;
}

export const MATCH_TICK_RATE = resolveDefaultTickRate();
export const MATCH_TICK_DURATION = 1 / MATCH_TICK_RATE;
export const DEFAULT_MAX_HEALTH = DEFAULT_TUNING_CONFIG.playerMaxHealth;
export const DEFAULT_BOT_MAX_HEALTH = DEFAULT_TUNING_CONFIG.botMaxHealth;
export const DEFAULT_JUMP_VELOCITY = DEFAULT_TUNING_CONFIG.jumpVelocity;
export const TRAIL_CELL_SIZE = DEFAULT_TUNING_CONFIG.trailCellSize;
export const TRAIL_SPEED_MULTIPLIER = DEFAULT_TUNING_CONFIG.trailSpeedMultiplier;
export type { PlayerInput } from '../protocol/InputProtocol.js';

const STALK_LOOK_INTENSITY_SCALE = 18;
const TRAIL_CONTACT_RADIUS = 1.2;

const DEFAULT_INPUT = DEFAULT_PLAYER_INPUT;

const TOP_DOWN_EPSILON = 0.000001;
const FREE_TURN_RADIANS_PER_PIXEL = 0.004;
const PLAYER_SPATIAL_CELL_SIZE = 16;
const STALK_OBSTACLE_NODE_BOUNDS_MARGIN = 1.05;
const STALK_FULL_FIDELITY_HUMAN_DISTANCE = 8;
const STALK_FULL_FIDELITY_BOTS_PER_HUMAN = 2;
const WORLD_PROP_FULL_PHYSICS_HUMAN_DISTANCE = 18;
const WORLD_PROP_FULL_PHYSICS_BOTS_PER_HUMAN = 5;
const WORLD_PROP_REDUCED_PHYSICS_INTERVAL = 6;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const STALK_FORWARD = new THREE.Vector3(0, 0, 1);

export function normalizeSimulationProfileLevel(value: any = 'off'): SimulationProfileLevel {
  const normalized = String(value ?? 'off').toLowerCase().replace(/-/g, '_');
  if (normalized === 'basic' || normalized === 'coarse' || normalized === '1') {
    return 'basic';
  }

  if (normalized === 'detailed' || normalized === 'detail' || normalized === 'full' || normalized === '2') {
    return 'detailed';
  }

  return 'off';
}

export function normalizeStalkAuthorityMode(value: any = null): StalkAuthorityMode {
  const normalized = String(value ?? '').toLowerCase().replace(/-/g, '_');
  if (normalized === 'analytic' || normalized === 'fast' || normalized === '120' || normalized === '120hz') {
    return 'analytic';
  }

  if (
    normalized === 'human_rope' ||
    normalized === 'humanrope' ||
    normalized === 'hybrid' ||
    normalized === 'hybrid_120' ||
    normalized === 'bots_analytic'
  ) {
    return 'human_rope';
  }

  return 'rope';
}

function resolveDefaultStalkAuthorityMode(): StalkAuthorityMode {
  const explicitMode = getEnvValue('VITE_BATTLESNAILS_STALK_AUTHORITY', 'BATTLESNAILS_STALK_AUTHORITY');
  if (explicitMode) {
    return normalizeStalkAuthorityMode(explicitMode);
  }

  const legacyAnalyticValue = getEnvValue('VITE_ANALYTIC_STALK_AUTHORITY', 'ANALYTIC_STALK_AUTHORITY');
  return legacyAnalyticValue && !isFalseEnvValue(legacyAnalyticValue) ? 'analytic' : 'rope';
}

function isFalseEnvValue(value) {
  return value === '0' || value === 'false' || value === 'off' || value === 'no';
}

function angleDifference(current, target) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function lerpAngle(current, target, alpha) {
  return current + angleDifference(current, target) * alpha;
}

function getFacingDirection(rotationY) {
  return new THREE.Vector3(Math.sin(rotationY), 0, Math.cos(rotationY));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createPlayerSpatialIndex(players: any[], cellSize = PLAYER_SPATIAL_CELL_SIZE) {
  return createSpatialIndex(players, {
    cellSize,
    getId: (player: any) => player.slot,
    getPosition: (player: any) => player.position,
    getRadius: (player: any) => Math.max(0, player.bodyRadius ?? 0),
    include: (player: any) => player.connected && player.health > 0
  });
}

function queryPlayerSpatialIndex(cells, position, radius, cellSize = PLAYER_SPATIAL_CELL_SIZE): any[] {
  return querySpatialIndex<any>(cells, position, radius, {
    cellSize,
    getId: (player: any) => player.slot,
    getPosition: (player: any) => player.position,
    getRadius: (player: any) => Math.max(0, player.bodyRadius ?? 0)
  });
}

function getMaximumPlayerBodyRadius(players) {
  return players.reduce((maximum, player) => (
    player.connected && player.health > 0
      ? Math.max(maximum, player.bodyRadius ?? 0)
      : maximum
  ), 0);
}

function createStalkFidelityMap(players) {
  const livingHumans = players.filter((player) => (
    player.connected &&
    player.health > 0 &&
    !player.fixtureKind &&
    player.profileName !== 'bot'
  ));
  const fullDistanceSquared = STALK_FULL_FIDELITY_HUMAN_DISTANCE * STALK_FULL_FIDELITY_HUMAN_DISTANCE;
  const fullBotSlots = new Set();

  for (const human of livingHumans) {
    const nearestBots = players
      .filter((player) => (
        player.connected &&
        player.health > 0 &&
        !player.fixtureKind &&
        player.profileName === 'bot'
      ))
      .map((bot) => ({
        bot,
        distanceSquared: bot.position.distanceToSquared(human.position)
      }))
      .filter((entry) => entry.distanceSquared <= fullDistanceSquared)
      .sort((left, right) => left.distanceSquared - right.distanceSquared)
      .slice(0, STALK_FULL_FIDELITY_BOTS_PER_HUMAN);

    for (const entry of nearestBots) {
      fullBotSlots.add(entry.bot.slot);
    }
  }

  const fidelity = new Map();

  for (const player of players) {
    if (
      !player.connected ||
      player.health <= 0 ||
      player.fixtureKind ||
      player.profileName !== 'bot' ||
      livingHumans.length === 0
    ) {
      fidelity.set(player.slot, 'full');
      continue;
    }

    fidelity.set(player.slot, fullBotSlots.has(player.slot) ? 'full' : 'terrain');
  }

  return fidelity;
}

function createWorldPropPhysicsFidelityMap(players) {
  const livingHumans = players.filter((player) => (
    player.connected &&
    player.health > 0 &&
    !player.fixtureKind &&
    player.profileName !== 'bot'
  ));
  const fullDistanceSquared = WORLD_PROP_FULL_PHYSICS_HUMAN_DISTANCE * WORLD_PROP_FULL_PHYSICS_HUMAN_DISTANCE;
  const fullBotSlots = new Set();

  for (const human of livingHumans) {
    const nearestBots = players
      .filter((player) => (
        player.connected &&
        player.health > 0 &&
        !player.fixtureKind &&
        player.profileName === 'bot'
      ))
      .map((bot) => ({
        bot,
        distanceSquared: bot.position.distanceToSquared(human.position)
      }))
      .filter((entry) => entry.distanceSquared <= fullDistanceSquared)
      .sort((left, right) => left.distanceSquared - right.distanceSquared)
      .slice(0, WORLD_PROP_FULL_PHYSICS_BOTS_PER_HUMAN);

    for (const entry of nearestBots) {
      fullBotSlots.add(entry.bot.slot);
    }
  }

  const fidelity = new Map();

  for (const player of players) {
    if (
      !player.connected ||
      player.health <= 0 ||
      player.fixtureKind ||
      player.profileName !== 'bot' ||
      livingHumans.length === 0
    ) {
      fidelity.set(player.slot, 'full');
      continue;
    }

    fidelity.set(player.slot, fullBotSlots.has(player.slot) ? 'full' : 'reduced');
  }

  return fidelity;
}

function createBodyObstacles(players) {
  return players
    .filter((player) => player.connected && player.health > 0)
    .map((player) => ({
      slot: player.slot,
      position: player.position,
      radius: player.bodyRadius,
      shape: player.collisionShape
    }));
}

function getStalkObstacleBroadphaseRadius(player) {
  return (
    player.bodyRadius +
    (player.profile.stalkTotalLength * Math.max(1, player.profile.stalkReachMax)) +
    (player.profile.stalkSegmentRadius * 3)
  );
}

function getObstaclePlanarRadius(obstacle) {
  return Math.max(
    0,
    obstacle?.radius ?? getCollisionShapeRadius(obstacle?.shape ?? obstacle?.collisionShape, 1)
  );
}

function expandStalkBoundsWithNodes(bounds, nodes = []) {
  for (const node of nodes) {
    if (!node) {
      continue;
    }

    bounds.minX = Math.min(bounds.minX, node.x);
    bounds.maxX = Math.max(bounds.maxX, node.x);
    bounds.minZ = Math.min(bounds.minZ, node.z);
    bounds.maxZ = Math.max(bounds.maxZ, node.z);
  }
}

function getStalkPlanarBounds(stalk, rootWorld, goalWorld) {
  const bounds = {
    minX: Math.min(rootWorld.x, goalWorld.x),
    maxX: Math.max(rootWorld.x, goalWorld.x),
    minZ: Math.min(rootWorld.z, goalWorld.z),
    maxZ: Math.max(rootWorld.z, goalWorld.z)
  };

  expandStalkBoundsWithNodes(bounds, stalk.nodes);
  expandStalkBoundsWithNodes(bounds, stalk.previousNodes);
  expandStalkBoundsWithNodes(bounds, stalk.incidentNodes);
  return bounds;
}

function filterStalkCollisionObstacles(stalk, rootWorld, goalWorld, obstacles) {
  if (obstacles.length === 0) {
    return obstacles;
  }

  const bounds = getStalkPlanarBounds(stalk, rootWorld, goalWorld);
  const margin = STALK_OBSTACLE_NODE_BOUNDS_MARGIN + (stalk.segmentRadius ?? STALK_SEGMENT_RADIUS);

  return obstacles.filter((obstacle) => {
    if (obstacle.self) {
      return true;
    }

    const position = obstacle.position;
    if (!position) {
      return false;
    }

    const radius = getObstaclePlanarRadius(obstacle) + margin;
    return (
      position.x >= bounds.minX - radius &&
      position.x <= bounds.maxX + radius &&
      position.z >= bounds.minZ - radius &&
      position.z <= bounds.maxZ + radius
    );
  });
}

function getStalkBodyObstacles(player, bodyObstacles) {
  const broadphaseRadius = getStalkObstacleBroadphaseRadius(player);

  return bodyObstacles
    .filter((obstacle) => {
      if (obstacle.slot === player.slot) {
        return true;
      }

      const maximumDistance = broadphaseRadius + obstacle.radius;
      return player.position.distanceToSquared(obstacle.position) <= maximumDistance * maximumDistance;
    })
    .map((obstacle) => ({
      ...obstacle,
      self: obstacle.slot === player.slot
    }));
}

function getAnalyticStalkSample(stalk, delta, eyeRadius = STALK_SEGMENT_RADIUS * STALK_EYE_RADIUS_SCALE) {
  const previousTip = stalk.previousTipPosition ?? stalk.tipPosition;
  const safeDelta = Math.max(delta, 1 / 120);
  const movement = stalk.tipPosition.clone().sub(previousTip);
  const direction = movement.lengthSq() > TOP_DOWN_EPSILON
    ? movement.clone().normalize()
    : stalk.rootWorld
      ? stalk.tipPosition.clone().sub(stalk.rootWorld).normalize()
      : STALK_FORWARD.clone();

  return {
    index: 0,
    isEye: true,
    start: previousTip.clone(),
    end: stalk.tipPosition.clone(),
    center: stalk.tipPosition.clone(),
    velocity: movement.clone().divideScalar(safeDelta),
    radius: eyeRadius,
    direction: direction.lengthSq() > TOP_DOWN_EPSILON ? direction : STALK_FORWARD.clone(),
    length: movement.length()
  };
}

export class MatchSimulation {
  declare tuningConfig: TuningConfig;
  declare creatures: any[];
  declare initialCreatureDescriptors: any[];
  declare wetTrailCells: Map<string, TrailCell>;
  declare arenaRadiusOverride: any;
  declare contactMemory: Map<string, any>;
  declare endReason: any;
  declare events: any[];
  declare inputs: Map<number, any>;
  declare mode: any;
  declare phase: any;
  declare players: Map<number, any>;
  declare profileTemplates: SimulationProfiles;
  declare activeStepProfile: any;
  declare simulationProfileLevel: SimulationProfileLevel;
  declare simulationProfileSamples: any[];
  declare stalkAuthorityMode: StalkAuthorityMode;
  declare terrainConfig: TerrainConfig;
  declare tick: any;
  declare tickDuration: any;
  declare tickRate: any;
  declare trailCellSize: any;
  declare trailContactRadius: any;
  declare trailSpeedMultiplier: any;
  declare winnerSlot: any;
  declare worldBounds: any;
  declare worldProps: any[];
  declare worldPropSpatialCellSize: any;
  declare worldPropSpatialIndex: any;
  constructor(options: any = {}) {
    const participants = options.players ?? [
      { slot: 1, profile: 'human', connected: true },
      { slot: 2, profile: 'human', connected: true }
    ];

    this.tickRate = options.tickRate ?? MATCH_TICK_RATE;
    this.tickDuration = 1 / this.tickRate;
    this.simulationProfileLevel = normalizeSimulationProfileLevel(
      options.simulationProfileLevel ?? options.simProfileLevel ?? options.profileLevel
    );
    this.simulationProfileSamples = [];
    this.activeStepProfile = null;
    this.stalkAuthorityMode = normalizeStalkAuthorityMode(
      options.stalkAuthorityMode ?? options.stalkAuthority ?? resolveDefaultStalkAuthorityMode()
    );
    this.tuningConfig = normalizeTuningConfig(options.tuning ?? DEFAULT_TUNING_CONFIG);
    this.terrainConfig = options.terrainConfig
      ? normalizeTerrainConfig(options.terrainConfig)
      : createTerrainConfigFromTuning(this.tuningConfig);
    this.profileTemplates = createSimulationProfiles(this.tuningConfig);
    this.arenaRadiusOverride = Number.isFinite(options.arenaRadius)
      ? options.arenaRadius
      : this.terrainConfig.worldRadius;
    this.worldBounds = options.worldBounds ?? null;
    applyArenaRadiusOverride(this.profileTemplates, this.arenaRadiusOverride);
    this.mode = options.mode ?? 'singleplayer';
    this.phase = options.startImmediately === false ? 'waiting' : 'running';
    this.winnerSlot = null;
    this.endReason = null;
    this.tick = 0;
    this.trailCellSize = options.trailCellSize ?? this.tuningConfig.trailCellSize;
    this.trailSpeedMultiplier = options.trailSpeedMultiplier ?? this.tuningConfig.trailSpeedMultiplier;
    this.trailContactRadius = options.trailContactRadius ?? this.tuningConfig.trailContactRadius;
    this.wetTrailCells = new Map();
    this.events = [];
    this.contactMemory = new Map();
    this.worldProps = (options.worldProps ?? []).map((prop) => normalizeWorldProp(prop, this.terrainConfig));
    this.worldPropSpatialCellSize = options.worldPropSpatialCellSize ?? WORLD_PROP_SPATIAL_CELL_SIZE;
    this.worldPropSpatialIndex = createWorldPropSpatialIndex(this.worldProps, this.worldPropSpatialCellSize);
    this.creatures = (options.creatures ?? [])
      .map((creature, index) => normalizeCreature(creature, this.terrainConfig, index))
      .filter(Boolean);
    this.initialCreatureDescriptors = this.creatures.map(cloneCreatureDescriptor);

    this.players = new Map();
    this.inputs = new Map();

    for (const participant of participants) {
      const player = createPlayerState(
        participant.slot,
        participant.profile ?? 'human',
        participant.connected ?? true,
        this.profileTemplates,
        this.terrainConfig,
        participant
      );
      this.players.set(player.slot, player);
      this.inputs.set(player.slot, { ...DEFAULT_INPUT });
    }
  }

  setSimulationProfileLevel(level: any = 'off') {
    this.simulationProfileLevel = normalizeSimulationProfileLevel(level);
    this.simulationProfileSamples = [];
    this.activeStepProfile = null;
  }

  setProfileLevel(level: any = 'off') {
    this.setSimulationProfileLevel(level);
  }

  getSimulationProfileLevel() {
    return this.simulationProfileLevel;
  }

  drainSimulationProfileSamples() {
    if (this.simulationProfileSamples.length === 0) {
      return [];
    }

    const samples = this.simulationProfileSamples;
    this.simulationProfileSamples = [];
    return samples;
  }

  addProfileBucket(bucket, elapsedMs) {
    const profile = this.activeStepProfile;
    if (!profile || !Number.isFinite(elapsedMs)) {
      return;
    }

    profile.buckets[bucket] = (profile.buckets[bucket] ?? 0) + elapsedMs;
  }

  addProfileCount(counter, amount = 1) {
    const profile = this.activeStepProfile;
    if (!profile || !Number.isFinite(amount)) {
      return;
    }

    profile.counts[counter] = (profile.counts[counter] ?? 0) + amount;
  }

  timeDetailedProfileBucket(bucket, callback) {
    if (this.activeStepProfile?.level !== 'detailed') {
      return callback();
    }

    const start = performance.now();
    try {
      return callback();
    } finally {
      this.addProfileBucket(bucket, performance.now() - start);
    }
  }

  restart() {
    const descriptors = Array.from(this.players.values()).map((player) => ({
      slot: player.slot,
      profile: player.profileName,
      connected: player.connected,
      fixtureKind: player.fixtureKind,
      displayName: player.displayName,
      speakerKind: player.speakerKind,
      portraitKey: player.portraitKey,
      voiceSource: player.voiceSource,
      immortal: player.immortal,
      maxHealth: player.maxHealth,
      position: player.fixtureKind ? cloneVector(player.position) : player.startPoint ? { ...player.startPoint } : null,
      rotationY: player.rotationY,
      bodyRadius: player.bodyRadius,
      collisionShape: cloneCollisionShape(player.collisionShape)
    }));

    this.players.clear();
    this.inputs.clear();

    for (const descriptor of descriptors) {
      const player = createPlayerState(
        descriptor.slot,
        descriptor.profile,
        descriptor.connected,
        this.profileTemplates,
        this.terrainConfig,
        descriptor
      );
      this.players.set(player.slot, player);
      this.inputs.set(player.slot, { ...DEFAULT_INPUT });
    }

    this.phase = 'running';
    this.winnerSlot = null;
    this.endReason = null;
    this.tick = 0;
    this.wetTrailCells.clear();
    this.events = [];
    this.contactMemory.clear();
    this.creatures = this.initialCreatureDescriptors
      .map((creature, index) => normalizeCreature(creature, this.terrainConfig, index))
      .filter(Boolean);
  }

  setPlayerConnected(slot, connected) {
    const player = this.players.get(slot);
    if (!player) {
      return;
    }

    player.connected = connected;
  }

  setPlayerInput(slot, input) {
    if (!this.players.has(slot)) {
      return;
    }

    this.inputs.set(slot, normalizeProtocolPlayerInput(input));
  }

  getPlayerState(slot) {
    return this.players.get(slot) ?? null;
  }

  getTuningConfig() {
    return { ...this.tuningConfig };
  }

  setTuningConfig(nextConfig) {
    this.tuningConfig = normalizeTuningConfig(nextConfig);
    this.terrainConfig = createTerrainConfigFromTuning(this.tuningConfig);
    this.profileTemplates = createSimulationProfiles(this.tuningConfig);
    applyArenaRadiusOverride(this.profileTemplates, this.arenaRadiusOverride);
    this.trailCellSize = this.tuningConfig.trailCellSize;
    this.trailSpeedMultiplier = this.tuningConfig.trailSpeedMultiplier;
    this.trailContactRadius = this.tuningConfig.trailContactRadius;

    for (const player of this.players.values()) {
      applyProfileToPlayer(
        player,
        this.profileTemplates[player.profileName] ?? this.profileTemplates.human
      );
    }
  }

  getSnapshot({ includeWorldProps = true }: any = {}) {
    const snapshot: any = {
      tick: this.tick,
      phase: this.phase,
      winnerSlot: this.winnerSlot,
      reason: this.endReason,
      terrain: { ...this.terrainConfig },
      trailCellSize: this.trailCellSize,
      trailCells: serializeTrailCells(this.wetTrailCells),
      creatures: this.creatures.map(serializeCreature),
      events: this.events.map(cloneSnapshotEvent),
      players: Array.from(this.players.values())
        .sort((left, right) => left.slot - right.slot)
        .map((player) => serializeSnapshotPlayer(player, {
          includeStalkNodes: !this.isPlayerAnalyticStalkAuthority(player)
        }))
    };

    if (includeWorldProps) {
      snapshot.worldProps = this.worldProps.map(cloneWorldProp);
    }

    return snapshot;
  }

  isPlayerAnalyticStalkAuthority(player) {
    if (!player || player.fixtureKind || !player.stalks) {
      return false;
    }

    if (this.stalkAuthorityMode === 'analytic') {
      return true;
    }

    if (this.stalkAuthorityMode === 'human_rope') {
      return player.profileName === 'bot';
    }

    return false;
  }

  getNetworkSnapshot({ includeStatic = true }: any = {}) {
    const snapshot: any = {
      tick: this.tick,
      phase: this.phase,
      winnerSlot: this.winnerSlot,
      reason: this.endReason,
      creatures: this.creatures.map(serializeCreature),
      events: this.events.map(cloneSnapshotEvent),
      players: Array.from(this.players.values())
        .sort((left, right) => left.slot - right.slot)
        .map((player) => serializeNetworkPlayer(player, { includeStatic }))
    };

    if (includeStatic) {
      snapshot.terrain = { ...this.terrainConfig };
      snapshot.trailCellSize = this.trailCellSize;
      snapshot.trailCells = serializeTrailCells(this.wetTrailCells);
      snapshot.worldProps = this.worldProps.map(cloneWorldProp);
    }

    return snapshot;
  }

  getNearbyWorldProps(position, radius) {
    if (this.worldProps.length === 0) {
      return [];
    }

    return queryWorldPropSpatialIndex(
      this.worldPropSpatialIndex,
      position,
      radius,
      this.worldPropSpatialCellSize
    );
  }

  step(delta = this.tickDuration, snapshotOptions: any = {}) {
    const profileLevel = this.simulationProfileLevel;
    const profileEnabled = profileLevel !== 'off';
    const profile: any = profileEnabled
      ? { level: profileLevel, tick: this.tick, buckets: {}, counts: {} }
      : null;
    const profileStart = profileEnabled ? performance.now() : 0;
    let profileMarker = profileStart;
    const markProfileBucket = profileEnabled
      ? (bucket) => {
        const now = performance.now();
        profile.buckets[bucket] = (profile.buckets[bucket] ?? 0) + (now - profileMarker);
        profileMarker = now;
      }
      : null;

    this.activeStepProfile = profile?.level === 'detailed' ? profile : null;

    try {
      if (this.phase !== 'running') {
        this.events = [];
        const snapshot = this.getSnapshot(snapshotOptions);
        markProfileBucket?.('snapshot');
        return snapshot;
      }

      this.events = [];
      const orderedPlayers = Array.from(this.players.values()).sort((left, right) => left.slot - right.slot);
      const worldPropPhysicsFidelity = createWorldPropPhysicsFidelityMap(orderedPlayers);

      for (const player of orderedPlayers) {
        player.previousPosition.copy(player.position);
        player.previousEyeTipPosition.copy(player.eyeTipPosition);
        player.impactPower = 0;

        for (const [, stalk] of getStalkEntries(player)) {
          stalk.previousTipPosition.copy(stalk.tipPosition);
          stalk.impactPower = 0;
        }
      }
      markProfileBucket?.('setup');

      for (const player of orderedPlayers) {
        if (!player.connected || player.health <= 0) {
          player.onTrail = false;
          player.controlMode = player.fixtureKind ? 'static' : 'idle';
          for (const [, stalk] of getStalkEntries(player)) {
            stalk.held = false;
          }
          continue;
        }

        if (player.fixtureKind) {
          player.controlMode = 'static';
          player.controlIntensity = 0;
          player.lockOnHeld = false;
          continue;
        }

        const target = this.findPreferredTarget(player, {
          preferHumans: player.profileName === 'bot'
        });
        const input = this.inputs.get(player.slot) ?? DEFAULT_INPUT;
        this.applyInput(player, target, input, delta, {
          worldPropPhysics: worldPropPhysicsFidelity.get(player.slot) ?? 'full'
        });
      }
      markProfileBucket?.('input');

      const playerSpatialIndex = createPlayerSpatialIndex(orderedPlayers);
      const stalkFidelity = createStalkFidelityMap(orderedPlayers);
      const maximumBodyRadius = getMaximumPlayerBodyRadius(orderedPlayers);
      markProfileBucket?.('broadphase');

      const resolvedBodyPairs = new Set();
      for (let leftIndex = 0; leftIndex < orderedPlayers.length; leftIndex += 1) {
        const player = orderedPlayers[leftIndex];
        if (!player.connected || player.health <= 0) {
          continue;
        }

        const bodyCandidates = queryPlayerSpatialIndex(
          playerSpatialIndex,
          player.position,
          player.bodyRadius + maximumBodyRadius
        );
        for (const candidate of bodyCandidates) {
          if (candidate.slot === player.slot) {
            continue;
          }

          const leftSlot = Math.min(player.slot, candidate.slot);
          const rightSlot = Math.max(player.slot, candidate.slot);
          const pairKey = `${leftSlot}:${rightSlot}`;
          if (resolvedBodyPairs.has(pairKey)) {
            continue;
          }

          resolvedBodyPairs.add(pairKey);
          this.resolveBodyCollision(player, candidate);
        }
      }
      markProfileBucket?.('bodyCollision');

      for (const player of orderedPlayers) {
        if (!player.connected) {
          player.onTrail = false;
          continue;
        }

        if (player.fixtureKind) {
          player.bodyVelocity.copy(player.position).sub(player.previousPosition).divideScalar(Math.max(delta, 0.0001));
          player.onTrail = false;
          continue;
        }

        if (player.health > 0) {
          this.depositTrailForPlayer(player);
        } else {
          player.onTrail = false;
          for (const [, stalk] of getStalkEntries(player)) {
            stalk.held = false;
            stalk.impactPower = 0;
          }
        }

        const fidelity = stalkFidelity.get(player.slot) ?? 'full';
        const analyticStalkAuthority = this.isPlayerAnalyticStalkAuthority(player);
        const needsFullStalkObstacles = !analyticStalkAuthority && fidelity === 'full';
        const nearbyBodyPlayers = needsFullStalkObstacles
          ? queryPlayerSpatialIndex(
            playerSpatialIndex,
            player.position,
            getStalkObstacleBroadphaseRadius(player) + maximumBodyRadius
          )
          : [];
        const playerBodyObstacles = needsFullStalkObstacles ? createBodyObstacles(nearbyBodyPlayers) : [];
        const stalkPropObstacles = needsFullStalkObstacles
          ? this.timeDetailedProfileBucket('stalkPropObstacleQuery', () => createWorldPropObstacles(
            this.getNearbyWorldProps(player.position, getStalkObstacleBroadphaseRadius(player))
          ))
          : [];
        this.updateStalkRopes(player, delta, [
          ...playerBodyObstacles,
          ...stalkPropObstacles
        ], { fidelity, analyticStalkAuthority });
        player.bodyVelocity.copy(player.position).sub(player.previousPosition).divideScalar(Math.max(delta, 0.0001));
        updateCompositeTipState(player, delta);
        player.onTrail = player.health > 0 && this.isPlayerOnWetTrail(player);
      }
      markProfileBucket?.('stalks');

      for (const attacker of orderedPlayers) {
        if (!attacker.connected || attacker.health <= 0) {
          continue;
        }

        const targetCandidates = queryPlayerSpatialIndex(
          playerSpatialIndex,
          attacker.position,
          getStalkObstacleBroadphaseRadius(attacker) + maximumBodyRadius + 0.5
        );
        for (const target of targetCandidates) {
          if (attacker.slot === target.slot) {
            continue;
          }

          this.resolveImpact(attacker, target, delta);
        }
      }
      markProfileBucket?.('damage');

      this.updateCreatures(delta);
      this.evaluateEndState();
      this.tick += 1;
      markProfileBucket?.('creatures');

      const snapshot = this.getSnapshot(snapshotOptions);
      markProfileBucket?.('snapshot');
      return snapshot;
    } finally {
      this.activeStepProfile = null;
      if (profileEnabled) {
        profile.buckets.total = performance.now() - profileStart;
        this.simulationProfileSamples.push(profile);
      }
    }
  }

  endMatch(winnerSlot, reason) {
    this.phase = 'ended';
    this.winnerSlot = winnerSlot;
    this.endReason = reason;
  }

  getLivingPlayers({ humansOnly = false } = {}) {
    return getLivingPlayersFromRoster(this.players.values(), { humansOnly });
  }

  findPreferredTarget(player, { preferHumans = false } = {}) {
    return findPreferredTargetForPlayer(this.players.values(), player, { preferHumans });
  }

  evaluateEndState() {
    const endState = evaluateMatchEndState({
      mode: this.mode,
      players: this.players
    });
    if (endState) {
      this.endMatch(endState.winnerSlot, endState.reason);
    }
  }

  applyInput(player, target, input, delta, options: any = {}) {
    const normalizedInput = normalizeProtocolPlayerInput(input);
    const movement = new THREE.Vector3(normalizedInput.moveX, 0, normalizedInput.moveZ);
    if (movement.lengthSq() > 1) {
      movement.normalize();
    }

    const baseSpeed = normalizedInput.lockOnHeld
      ? player.profile.lockedMoveSpeed
      : player.profile.freeMoveSpeed;
    const speed = baseSpeed *
      getSnailSpeedMultiplier(player.snailStats) *
      (this.isPlayerOnWetTrail(player) ? this.trailSpeedMultiplier : 1);
    player.position.addScaledVector(movement, speed * delta);
    this.clampPlanarPosition(player);
    const worldPropPhysics = options.worldPropPhysics ?? 'full';
    const runWorldPropPhysics = worldPropPhysics === 'full' ||
      ((this.tick + player.slot) % WORLD_PROP_REDUCED_PHYSICS_INTERVAL === 0);
    if (worldPropPhysics === 'full') {
      this.addProfileCount('worldPropPhysicsFullPlayers');
    } else if (runWorldPropPhysics) {
      this.addProfileCount('worldPropPhysicsReducedRuns');
    } else {
      this.addProfileCount('worldPropPhysicsReducedSkips');
    }

    const propContacts = runWorldPropPhysics
      ? this.timeDetailedProfileBucket('worldPropCollision', () => this.resolveWorldPropCollision(player))
      : [];
    if (runWorldPropPhysics) {
      this.timeDetailedProfileBucket('powerupCollection', () => this.collectNearbyPowerups(player));
    }

    const terrainHeight = getPlayerGroundHeight(player, this.terrainConfig);
    const support = this.timeDetailedProfileBucket('worldPropSupport', () => this.getBestWorldSupport(
      player,
      movement,
      speed,
      delta,
      propContacts,
      { includeWorldProps: runWorldPropPhysics }
    ));
    const supportHeight = Math.max(terrainHeight, support?.height ?? terrainHeight);

    const startedJump = normalizedInput.jumpPressed && player.grounded;
    if (startedJump) {
      player.grounded = false;
      player.verticalVelocity = player.profile.jumpVelocity;
      player.position.y = Math.max(player.position.y, supportHeight);
      player.supportKind = 'air';
      player.supportSurfaceId = null;
      player.supportNormal.copy(WORLD_UP);
    }

    if (!startedJump) {
      const useTerrainGrounding = this.timeDetailedProfileBucket(
        'supportApply',
        () => this.applySupport(player, support, terrainHeight, speed, delta)
      );

      if (useTerrainGrounding) {
        if (player.grounded) {
          player.position.y = terrainHeight;
        } else {
          player.verticalVelocity -= player.profile.gravity * delta;
          player.verticalVelocity *= Math.exp(-Math.max(0, player.profile.verticalDamping ?? 0) * delta);
          player.position.y += player.verticalVelocity * delta;

          if (player.position.y <= terrainHeight) {
            player.position.y = terrainHeight;
            player.verticalVelocity = 0;
            player.grounded = true;
            player.supportKind = 'terrain';
            player.supportSurfaceId = null;
            player.supportNormal.copy(WORLD_UP);
          }
        }
      }
    }

    player.lockOnHeld = normalizedInput.lockOnHeld;

    const manualFreeTurn = !normalizedInput.lockOnHeld && Math.abs(normalizedInput.turnX) > 0.000001;
    if (manualFreeTurn) {
      player.rotationY += normalizedInput.turnX * FREE_TURN_RADIANS_PER_PIXEL;
    }

    let facingDirection = null;
    if (normalizedInput.lockOnHeld && target) {
      facingDirection = target.position.clone().sub(player.position);
    } else if (!manualFreeTurn && movement.lengthSq() > 0) {
      const movementDirection = movement.clone().normalize();
      const forwardAlignment = getFacingDirection(player.rotationY).dot(movementDirection);
      if (forwardAlignment > 0.2) {
        facingDirection = movement;
      }
    }

    if (facingDirection && facingDirection.lengthSq() > 0) {
      const planarDirection = facingDirection.clone().setY(0);
      if (planarDirection.lengthSq() > 0) {
        planarDirection.normalize();
        const desiredRotation = Math.atan2(planarDirection.x, planarDirection.z);
        const turnAlpha = Math.min(1, player.profile.turnSpeed * delta);
        player.rotationY = lerpAngle(player.rotationY, desiredRotation, turnAlpha);
      }
    }

    if (normalizedInput.interactPressed) {
      this.resolveWorldPropInteraction(player);
    }

    this.timeDetailedProfileBucket('combatInput', () => this.applyCombatInput(player, normalizedInput, delta));
  }

  applyCombatInput(player, input, delta) {
    applyCombatInputToPlayer(player, input, delta, STALK_LOOK_INTENSITY_SCALE);
  }

  updateStalkRopes(player, delta, bodyObstacles = [], options: any = {}) {
    if (options.analyticStalkAuthority ?? this.isPlayerAnalyticStalkAuthority(player)) {
      for (const [, stalk] of getStalkEntries(player)) {
        advanceAppliedStalkTarget(stalk, player.profile, delta);

        const rootWorld = getStalkRootWorldPosition(player.position, player.rotationY, stalk.rootOffset);
        const goalWorld = getStalkGoalWorldPositionFromDirection(
          player.position,
          player.rotationY,
          stalk.appliedVector,
          player.profile.stalkTotalLength * stalk.appliedReach,
          stalk.rootOffset
        );

        stalk.rootWorld = rootWorld;
        stalk.previousTipPosition.copy(stalk.tipPosition);
        stalk.tipPosition.copy(goalWorld);
        if (delta > 0) {
          stalk.tipVelocity.copy(stalk.tipPosition).sub(stalk.previousTipPosition).divideScalar(delta);
        } else {
          stalk.tipVelocity.set(0, 0, 0);
        }

        const rootToTip = stalk.tipPosition.clone().sub(rootWorld);
        stalk.currentReach = Math.min(
          player.profile.stalkReachMax,
          rootToTip.length() / Math.max(0.0001, player.profile.stalkTotalLength)
        );
        if (rootToTip.lengthSq() === 0) {
          stalk.currentVector.copy(stalk.targetVector);
        } else {
          stalk.currentVector.copy(getBodyLocalDirection(rootToTip.normalize(), player.rotationY));
        }

        const eyeRadius = (stalk.segmentRadius ?? STALK_SEGMENT_RADIUS) * STALK_EYE_RADIUS_SCALE;
        stalk.impactSamples = [getAnalyticStalkSample(stalk, delta, eyeRadius)];
      }
      return;
    }

    const fidelity = options.fidelity ?? 'full';
    const fullFidelity = fidelity === 'full';
    const collisionBodyObstacles = getStalkBodyObstacles(player, bodyObstacles);
    const terrainHeightAt = (x, z) => getTerrainHeight(x, z, this.terrainConfig);

    for (const [, stalk] of getStalkEntries(player)) {
      if (stalk.held) {
        advanceAppliedStalkTarget(stalk, player.profile, delta);
      }

      const goalWorld = getStalkGoalWorldPositionFromDirection(
        player.position,
        player.rotationY,
        stalk.appliedVector,
        player.profile.stalkTotalLength * stalk.appliedReach,
        stalk.rootOffset
      );
      const rootWorld = getStalkRootWorldPosition(player.position, player.rotationY, stalk.rootOffset);
      const stalkCollisionObstacles = this.timeDetailedProfileBucket('stalkObstacleFilter', () => filterStalkCollisionObstacles(
        stalk,
        rootWorld,
        goalWorld,
        fullFidelity ? collisionBodyObstacles : []
      ));

      this.timeDetailedProfileBucket('stalkRopeSim', () => simulateStalkRope({
        nodes: stalk.nodes,
        previousNodes: stalk.previousNodes,
        incidentNodes: stalk.incidentNodes,
        incidentPreviousNodes: stalk.incidentPreviousNodes,
        rootWorld,
        goalWorld,
        delta,
        segmentLength: player.profile.stalkTotalLength / player.profile.stalkSegmentCount,
        gravity: player.profile.stalkGravity,
        damping: player.profile.stalkDamping,
        goalPull: stalk.held ? player.profile.stalkDrivePull : player.profile.stalkIdlePull,
        constraintIterations: fullFidelity ? player.profile.stalkConstraintIterations : 1,
        turgidity: stalk.held ? player.profile.stalkTurgidity : 0,
        collision: {
          terrainHeightAt,
          bodyObstacles: stalkCollisionObstacles,
          segmentRadius: stalk.segmentRadius,
          includeSegmentMidpoints: fullFidelity,
          iterations: fullFidelity ? undefined : 0
        }
      }));

      stalk.tipPosition.copy(getTipWorldPosition(stalk.nodes));
      if (delta > 0) {
        stalk.tipVelocity.copy(stalk.tipPosition).sub(stalk.previousTipPosition).divideScalar(delta);
      } else {
        stalk.tipVelocity.set(0, 0, 0);
      }

      const rootToTip = stalk.tipPosition.clone().sub(rootWorld);
      stalk.currentReach = Math.min(
        player.profile.stalkReachMax,
        rootToTip.length() / Math.max(0.0001, player.profile.stalkTotalLength)
      );
      if (rootToTip.lengthSq() === 0) {
        stalk.currentVector.copy(stalk.targetVector);
      } else {
        stalk.currentVector.copy(getBodyLocalDirection(rootToTip.normalize(), player.rotationY));
      }
    }
  }

  getTrailCells() {
    return serializeTrailCells(this.wetTrailCells);
  }

  markTrailAtPosition(position) {
    markTrailCellAtPosition(this.wetTrailCells, position, this.trailCellSize);
  }

  depositTrailForPlayer(player) {
    depositTrailSegment(this.wetTrailCells, player.previousPosition, player.position, this.trailCellSize);
  }

  isPlayerOnWetTrail(player) {
    const contactRadius = Math.max(this.trailContactRadius, player.bodyRadius * 0.55);
    return isCircleOnTrail(this.wetTrailCells, player.position, contactRadius, this.trailCellSize);
  }

  getBestWorldSupport(player, movement, speed, delta, contacts = [], options: any = {}) {
    return selectBestWorldSupport({
      player,
      terrainConfig: this.terrainConfig,
      movement,
      speed,
      delta,
      contacts,
      includeWorldProps: options.includeWorldProps !== false,
      getNearbyWorldProps: (position, radius) => this.getNearbyWorldProps(position, radius)
    });
  }

  applySupport(player, support, terrainHeight, speed, delta) {
    return applySupportToPlayer({
      player,
      support,
      terrainHeight,
      speed,
      delta,
      tick: this.tick
    });
  }

  resolveWorldPropCollision(player) {
    return resolveWorldPropCollisionForPlayer({
      player,
      worldProps: this.worldProps,
      getNearbyWorldProps: (position, radius) => this.getNearbyWorldProps(position, radius),
      clampPlanarPosition: (target) => this.clampPlanarPosition(target)
    });
  }

  rebuildWorldPropSpatialIndex() {
    this.worldPropSpatialIndex = createWorldPropSpatialIndex(this.worldProps, this.worldPropSpatialCellSize);
  }

  removeWorldPropById(propId) {
    const index = this.worldProps.findIndex((prop) => prop.id === propId);
    if (index < 0) {
      return null;
    }

    const [prop] = this.worldProps.splice(index, 1);
    this.rebuildWorldPropSpatialIndex();
    return prop;
  }

  collectNearbyPowerups(player) {
    this.events.push(...collectNearbyPowerupsForPlayer({
      player,
      tick: this.tick,
      getNearbyWorldProps: (position, radius) => this.getNearbyWorldProps(position, radius),
      removeWorldPropById: (propId) => this.removeWorldPropById(propId)
    }));
  }

  grantPowerupToSlot(slot, type, amount = 1, label = null) {
    const result = grantPowerupToPlayerSlot({
      players: this.players,
      slot,
      type,
      amount,
      label,
      tick: this.tick
    });
    this.events.push(...result.events);
    return result.granted;
  }

  resolveWorldPropInteraction(player) {
    this.events.push(...resolvePlayerWorldPropInteraction({
      player,
      tick: this.tick,
      getNearbyWorldProps: (position, radius) => this.getNearbyWorldProps(position, radius)
    }));
  }

  clampPlanarPosition(player) {
    if (this.worldBounds) {
      const clamped = clampPointToWorldBounds(player.position.x, player.position.z, this.worldBounds);
      player.position.x = clamped.x;
      player.position.z = clamped.z;
      return;
    }

    player.position.x = clamp(player.position.x, -player.profile.arenaRadius, player.profile.arenaRadius);
    player.position.z = clamp(player.position.z, -player.profile.arenaRadius, player.profile.arenaRadius);
  }

  isPlayerUnderBirdCover(player) {
    const props = this.getNearbyWorldProps(player.position, BIRD_COVER_QUERY_RADIUS);

    for (const prop of props) {
      const coverRadius = getBirdCoverRadius(prop);
      if (coverRadius <= 0) {
        continue;
      }

      const distance = Math.hypot(
        player.position.x - prop.position.x,
        player.position.z - prop.position.z
      );
      if (distance <= coverRadius + Math.max(0.5, player.bodyRadius * 0.35)) {
        return true;
      }
    }

    return false;
  }

  findBirdTarget(creature) {
    const detectionRadiusSq = BIRD_DETECTION_RADIUS * BIRD_DETECTION_RADIUS;
    let bestTarget = null;
    let bestScore = Infinity;

    for (const player of this.players.values()) {
      if (
        !player.connected ||
        player.health <= 0 ||
        player.fixtureKind
      ) {
        continue;
      }

      const dx = player.position.x - creature.shadowPosition.x;
      const dz = player.position.z - creature.shadowPosition.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > detectionRadiusSq || this.isPlayerUnderBirdCover(player)) {
        continue;
      }

      const humanBias = player.profileName === 'bot' ? detectionRadiusSq : 0;
      const score = distanceSq + humanBias;
      if (score < bestScore) {
        bestScore = score;
        bestTarget = player;
      }
    }

    return bestTarget;
  }

  setBirdPhase(creature, phase, targetSlot = null) {
    creature.phase = phase;
    creature.phaseTimer = 0;
    creature.targetSlot = targetSlot;
  }

  syncBirdPose(creature, diveAlpha = 0) {
    const shadowGround = getBirdGroundPosition(
      creature.shadowPosition.x,
      creature.shadowPosition.z,
      this.terrainConfig
    );
    const oldX = creature.position.x;
    const oldZ = creature.position.z;
    creature.shadowPosition.copy(shadowGround);
    const lowAltitude = Math.max(creature.bodyLength * 1.35, 7);
    const altitude = THREE.MathUtils.lerp(creature.altitude, lowAltitude, clamp(diveAlpha, 0, 1));
    creature.position.set(creature.shadowPosition.x, creature.shadowPosition.y + altitude, creature.shadowPosition.z);

    const dx = creature.position.x - oldX;
    const dz = creature.position.z - oldZ;
    if ((dx * dx) + (dz * dz) > TOP_DOWN_EPSILON) {
      creature.rotationY = Math.atan2(dx, dz);
    }
  }

  updateBirdPatrol(creature, delta) {
    creature.phaseTimer += delta;
    creature.cooldown = Math.max(0, creature.cooldown - delta);
    creature.patrolAngle += creature.patrolSpeed * delta;
    creature.shadowPosition.x = creature.home.x + Math.cos(creature.patrolAngle) * creature.patrolRadius;
    creature.shadowPosition.z = creature.home.z + Math.sin(creature.patrolAngle) * creature.patrolRadius;
    creature.shadowRadius = BIRD_PATROL_SHADOW_RADIUS;
    creature.shadowOpacity = 0.12;
    this.syncBirdPose(creature);

    if (creature.cooldown > 0) {
      return;
    }

    const target = this.findBirdTarget(creature);
    if (target) {
      this.setBirdPhase(creature, 'tracking', target.slot);
    }
  }

  updateBirdTracking(creature, delta) {
    creature.phaseTimer += delta;
    const target = this.players.get(creature.targetSlot);
    if (!target || target.health <= 0 || !target.connected || this.isPlayerUnderBirdCover(target)) {
      creature.cooldown = 2.5;
      this.setBirdPhase(creature, 'patrol');
      return;
    }

    movePlanarToward(creature.shadowPosition, target.position, BIRD_SHADOW_TRACK_SPEED * delta);
    creature.shadowRadius = creature.warningRadius;
    creature.shadowOpacity = 0.3;
    this.syncBirdPose(creature);

    if (creature.phaseTimer >= BIRD_TRACK_DURATION) {
      this.setBirdPhase(creature, 'swoop', target.slot);
    }
  }

  resolveBirdImpact(creature) {
    const target = this.players.get(creature.targetSlot);
    const targetAlive = target && target.connected && target.health > 0 && !target.fixtureKind;
    const hit = Boolean(targetAlive) &&
      !this.isPlayerUnderBirdCover(target) &&
      Math.hypot(
        target.position.x - creature.shadowPosition.x,
        target.position.z - creature.shadowPosition.z
      ) <= creature.impactRadius;

    if (hit) {
      const amount = target.immortal ? 0 : Math.min(target.health, creature.attackDamage);
      if (!target.immortal) {
        target.health = Math.max(0, target.health - creature.attackDamage);
      }

      this.events.push({
        id: `${this.tick}:bird_attack:${creature.id}:${target.slot}`,
        type: 'bird_attack',
        tick: this.tick,
        birdId: creature.id,
        targetSlot: target.slot,
        amount,
        lethal: !target.immortal,
        position: cloneVector(target.position),
        shadowPosition: cloneVector(creature.shadowPosition)
      });
    } else {
      this.events.push({
        id: `${this.tick}:bird_miss:${creature.id}:${creature.targetSlot ?? 'none'}`,
        type: 'bird_miss',
        tick: this.tick,
        birdId: creature.id,
        targetSlot: creature.targetSlot,
        position: cloneVector(creature.shadowPosition)
      });
    }

    const phaseJitter = ((Math.sin((this.tick + creature.id.length) * 12.9898) * 43758.5453123) % 1 + 1) % 1;
    creature.cooldown = BIRD_MIN_COOLDOWN + phaseJitter * (BIRD_MAX_COOLDOWN - BIRD_MIN_COOLDOWN);
    this.setBirdPhase(creature, 'recover');
  }

  updateBirdSwoop(creature, delta) {
    creature.phaseTimer += delta;
    const target = this.players.get(creature.targetSlot);
    if (target?.connected && target.health > 0) {
      movePlanarToward(creature.shadowPosition, target.position, BIRD_SWEEP_TRACK_SPEED * delta);
    }

    const alpha = clamp(creature.phaseTimer / BIRD_SWOOP_DURATION, 0, 1);
    creature.shadowRadius = THREE.MathUtils.lerp(creature.warningRadius, creature.impactRadius, alpha);
    creature.shadowOpacity = THREE.MathUtils.lerp(0.34, 0.66, alpha);
    this.syncBirdPose(creature, alpha);

    if (creature.phaseTimer >= BIRD_SWOOP_DURATION) {
      this.resolveBirdImpact(creature);
    }
  }

  updateBirdRecover(creature, delta) {
    creature.phaseTimer += delta;
    creature.cooldown = Math.max(0, creature.cooldown - delta);
    creature.patrolAngle += creature.patrolSpeed * delta * 1.5;
    const recoverRadius = creature.patrolRadius * 1.15;
    creature.shadowPosition.x = creature.home.x + Math.cos(creature.patrolAngle) * recoverRadius;
    creature.shadowPosition.z = creature.home.z + Math.sin(creature.patrolAngle) * recoverRadius;
    creature.shadowRadius = BIRD_PATROL_SHADOW_RADIUS;
    creature.shadowOpacity = 0.08;
    this.syncBirdPose(creature);

    if (creature.phaseTimer >= BIRD_RECOVER_DURATION) {
      this.setBirdPhase(creature, 'patrol');
    }
  }

  updateCreatures(delta) {
    for (const creature of this.creatures) {
      if (creature.kind !== 'bird') {
        continue;
      }

      switch (creature.phase) {
        case 'tracking':
          this.updateBirdTracking(creature, delta);
          break;
        case 'swoop':
          this.updateBirdSwoop(creature, delta);
          break;
        case 'recover':
          this.updateBirdRecover(creature, delta);
          break;
        case 'patrol':
        default:
          this.updateBirdPatrol(creature, delta);
          break;
      }
    }
  }

  resolveBodyCollision(playerA, playerB) {
    if (!playerA.connected || !playerB.connected || playerA.health <= 0 || playerB.health <= 0) {
      return;
    }

    const delta = playerB.position.clone().sub(playerA.position);
    const distance = delta.length();
    const minimumDistance = playerA.bodyRadius + playerB.bodyRadius;
    if (distance >= minimumDistance) {
      return;
    }

    const planarDirection = new THREE.Vector3(delta.x, 0, delta.z);
    if (planarDirection.lengthSq() === 0) {
      planarDirection.set(1, 0, 0);
    } else {
      planarDirection.normalize();
    }

    const overlap = minimumDistance - distance;
    const playerAMovable = playerA.staticBody ? 0 : 1;
    const playerBMovable = playerB.staticBody ? 0 : 1;
    const movableTotal = playerAMovable + playerBMovable;
    if (movableTotal === 0) {
      return;
    }

    const displacement = planarDirection.multiplyScalar(overlap);
    playerA.position.addScaledVector(displacement, -playerAMovable / movableTotal);
    playerB.position.addScaledVector(displacement, playerBMovable / movableTotal);
    this.clampPlanarPosition(playerA);
    this.clampPlanarPosition(playerB);
    snapPlayerToGroundIfGrounded(playerA, this.terrainConfig);
    snapPlayerToGroundIfGrounded(playerB, this.terrainConfig);
  }

  resolveImpact(attacker, target, delta) {
    this.events.push(...resolveImpactForPair({
      attacker,
      target,
      delta,
      tick: this.tick,
      contactMemory: this.contactMemory,
      analyticStalkAuthority: this.isPlayerAnalyticStalkAuthority(attacker),
      terrainConfig: this.terrainConfig,
      clampPlanarPosition: (player) => this.clampPlanarPosition(player),
      resolveWorldPropCollision: (player) => this.resolveWorldPropCollision(player)
    }));
  }
}

export function createIdleInput(): PlayerInput {
  return createProtocolIdleInput();
}

export function normalizePlayerInput(input: Partial<PlayerInput> = {}): PlayerInput {
  return normalizeProtocolPlayerInput(input);
}
