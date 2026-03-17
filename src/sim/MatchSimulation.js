import * as THREE from 'three';

import {
  STALK_ROOT_OFFSETS,
  buildStalkSegmentSamples,
  cloneNodeArray,
  createInitialStalkNodes,
  evaluateStalkImpact,
  getBodyLocalDirection,
  getLocalStalkDirection,
  getStalkGoalWorldPosition,
  getStalkRootWorldPosition,
  getTipWorldPosition,
  serializeNodes,
  simulateStalkRope
} from './StalkRope.js';
import {
  DEFAULT_TUNING_CONFIG,
  createTerrainConfigFromTuning,
  createSimulationProfiles,
  normalizeTuningConfig
} from './Tuning.js';
import { createTerrainPosition, getTerrainHeight } from '../world/Terrain.js';

export const MATCH_TICK_RATE = 60;
export const MATCH_TICK_DURATION = 1 / MATCH_TICK_RATE;
export const DEFAULT_MAX_HEALTH = DEFAULT_TUNING_CONFIG.playerMaxHealth;
export const DEFAULT_BOT_MAX_HEALTH = DEFAULT_TUNING_CONFIG.botMaxHealth;
export const DEFAULT_JUMP_VELOCITY = DEFAULT_TUNING_CONFIG.jumpVelocity;
export const TRAIL_CELL_SIZE = DEFAULT_TUNING_CONFIG.trailCellSize;
export const TRAIL_SPEED_MULTIPLIER = DEFAULT_TUNING_CONFIG.trailSpeedMultiplier;

const STALK_SIDE_KEYS = ['left', 'right'];
const STALK_LOOK_INTENSITY_SCALE = 18;
const TRAIL_CONTACT_RADIUS = 1.2;

const PLAYER_STARTS = new Map([
  [1, Object.freeze({ x: 0, z: 6 })],
  [2, Object.freeze({ x: 0, z: -6 })]
]);

function createRingPoints(radius, count, angleOffset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const angle = angleOffset + (index / count) * Math.PI * 2;
    return {
      x: Math.sin(angle) * radius,
      z: Math.cos(angle) * radius
    };
  });
}

const BOT_STARTS = [
  ...createRingPoints(8, 8, Math.PI / 8),
  ...createRingPoints(12.5, 12, 0),
  ...createRingPoints(17, 20, Math.PI / 20)
];

const DEFAULT_INPUT = Object.freeze({
  moveX: 0,
  moveZ: 0,
  jumpPressed: false,
  lockOnHeld: false,
  lookX: 0,
  lookY: 0,
  leftHeld: false,
  rightHeld: false
});

function angleDifference(current, target) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function lerpAngle(current, target, alpha) {
  return current + angleDifference(current, target) * alpha;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cloneVector(vector) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function computeImpactDamage(attacker, stalk, impactPower) {
  const threshold = Math.max(0.0001, attacker.profile.impactThreshold);
  const innervationMultiplier = stalk.held
    ? attacker.profile.innervatedDamageMultiplier ?? 1
    : 1;

  return Math.max(
    1,
    Math.round((impactPower / threshold) * innervationMultiplier)
  );
}

function createTrailCellKey(cellX, cellZ) {
  return `${cellX}:${cellZ}`;
}

function quantizeTrailCoord(value, cellSize) {
  return Math.round(value / cellSize);
}

function circleIntersectsTrailCell(x, z, radius, cell, cellSize) {
  const halfSize = cellSize / 2;
  const closestX = clamp(x, cell.x - halfSize, cell.x + halfSize);
  const closestZ = clamp(z, cell.z - halfSize, cell.z + halfSize);
  const deltaX = x - closestX;
  const deltaZ = z - closestZ;
  return (deltaX * deltaX) + (deltaZ * deltaZ) <= radius * radius;
}

function createInitialPosition(slot, terrainConfig) {
  if (PLAYER_STARTS.has(slot)) {
    const point = PLAYER_STARTS.get(slot);
    return createTerrainPosition(point.x, point.z, terrainConfig);
  }

  const botIndex = Math.max(0, slot - 3);
  const point = BOT_STARTS[botIndex % BOT_STARTS.length];
  return createTerrainPosition(point.x, point.z, terrainConfig);
}

function normalizeInput(rawInput = {}) {
  return {
    moveX: Number.isFinite(rawInput.moveX) ? rawInput.moveX : 0,
    moveZ: Number.isFinite(rawInput.moveZ) ? rawInput.moveZ : 0,
    jumpPressed: Boolean(rawInput.jumpPressed),
    lockOnHeld: Boolean(rawInput.lockOnHeld),
    lookX: Number.isFinite(rawInput.lookX) ? rawInput.lookX : 0,
    lookY: Number.isFinite(rawInput.lookY) ? rawInput.lookY : 0,
    leftHeld: Boolean(rawInput.leftHeld),
    rightHeld: Boolean(rawInput.rightHeld)
  };
}

function getPlayerGroundHeight(player, terrainConfig) {
  return getTerrainHeight(player.position.x, player.position.z, terrainConfig);
}

function snapPlayerToGroundIfGrounded(player, terrainConfig) {
  if (!player.grounded) {
    return;
  }

  player.position.y = getPlayerGroundHeight(player, terrainConfig);
}

function getControlMode(input) {
  if (input.leftHeld && input.rightHeld) {
    return 'both';
  }

  if (input.leftHeld) {
    return 'left';
  }

  if (input.rightHeld) {
    return 'right';
  }

  return 'idle';
}

function createStalkState(profile, position, rotationY, side) {
  const rootOffset = STALK_ROOT_OFFSETS[side] ?? STALK_ROOT_OFFSETS.right;
  const targetYaw = profile.stalkNeutralYaw;
  const targetPitch = profile.stalkNeutralPitch;
  const rootWorld = getStalkRootWorldPosition(position, rotationY, rootOffset);
  const goalWorld = getStalkGoalWorldPosition(
    position,
    rotationY,
    targetYaw,
    targetPitch,
    profile.stalkTotalLength,
    rootOffset
  );
  const nodes = createInitialStalkNodes(rootWorld, goalWorld, profile.stalkSegmentCount);
  const tipPosition = getTipWorldPosition(nodes);

  return {
    side,
    rootOffset: rootOffset.clone(),
    nodes,
    previousNodes: cloneNodeArray(nodes),
    tipPosition,
    previousTipPosition: tipPosition.clone(),
    tipVelocity: new THREE.Vector3(),
    desiredYaw: targetYaw,
    desiredPitch: targetPitch,
    appliedYaw: targetYaw,
    appliedPitch: targetPitch,
    targetYaw: targetYaw,
    targetPitch: targetPitch,
    targetVector: getLocalStalkDirection(targetYaw, targetPitch),
    currentVector: getLocalStalkDirection(targetYaw, targetPitch),
    impactPower: 0,
    held: false,
    segmentRadius: profile.stalkSegmentRadius
  };
}

function getStalkEntries(player) {
  return STALK_SIDE_KEYS.map((side) => [side, player.stalks[side]]);
}

function getCompositeTipPosition(player) {
  const left = player.stalks.left.tipPosition;
  const right = player.stalks.right.tipPosition;
  return left.clone().add(right).multiplyScalar(0.5);
}

function updateCompositeTipState(player, delta) {
  const nextEyeTipPosition = getCompositeTipPosition(player);
  if (delta > 0) {
    player.eyeTipVelocity.copy(nextEyeTipPosition).sub(player.eyeTipPosition).divideScalar(delta);
  } else {
    player.eyeTipVelocity.set(0, 0, 0);
  }

  player.previousEyeTipPosition.copy(player.eyeTipPosition);
  player.eyeTipPosition.copy(nextEyeTipPosition);
}

function serializeStalk(stalk) {
  return {
    nodes: serializeNodes(stalk.nodes),
    segmentRadius: stalk.segmentRadius,
    held: stalk.held,
    impactPower: stalk.impactPower,
    targetVector: cloneVector(stalk.targetVector),
    currentVector: cloneVector(stalk.currentVector),
    targetYaw: stalk.desiredYaw,
    targetPitch: stalk.desiredPitch
  };
}

function createPlayerState(
  slot,
  profileName,
  connected = true,
  profileTemplates = createSimulationProfiles(),
  terrainConfig
) {
  const profile = profileTemplates[profileName] ?? profileTemplates.human;
  const position = createInitialPosition(slot, terrainConfig);
  const initialRotation = slot === 1 ? Math.PI : slot === 2 ? 0 : Math.atan2(-position.x, -position.z);
  const stalks = Object.fromEntries(
    STALK_SIDE_KEYS.map((side) => [side, createStalkState(profile, position, initialRotation, side)])
  );
  const eyeTipPosition = stalks.left.tipPosition.clone().add(stalks.right.tipPosition).multiplyScalar(0.5);

  return {
    slot,
    profileName,
    connected,
    profile,
    position,
    previousPosition: position.clone(),
    bodyVelocity: new THREE.Vector3(),
    eyeTipPosition,
    previousEyeTipPosition: eyeTipPosition.clone(),
    eyeTipVelocity: new THREE.Vector3(),
    stalks,
    rotationY: initialRotation,
    health: profile.maxHealth,
    maxHealth: profile.maxHealth,
    onTrail: false,
    invincibilityTime: 0,
    grounded: true,
    verticalVelocity: 0,
    lockOnHeld: false,
    controlMode: 'idle',
    controlIntensity: 0,
    impactPower: 0,
    bodyRadius: profile.bodyRadius
  };
}

function applyProfileToPlayer(player, profile) {
  player.profile = profile;
  player.maxHealth = profile.maxHealth;
  player.health = Math.min(player.health, player.maxHealth);
  player.bodyRadius = profile.bodyRadius;

  for (const [, stalk] of getStalkEntries(player)) {
    stalk.segmentRadius = profile.stalkSegmentRadius;
    stalk.desiredYaw = clamp(stalk.desiredYaw, -profile.stalkYawLimit, profile.stalkYawLimit);
    stalk.desiredPitch = clamp(stalk.desiredPitch, profile.stalkPitchMin, profile.stalkPitchMax);
    stalk.appliedYaw = clamp(stalk.appliedYaw, -profile.stalkYawLimit, profile.stalkYawLimit);
    stalk.appliedPitch = clamp(stalk.appliedPitch, profile.stalkPitchMin, profile.stalkPitchMax);
    stalk.targetYaw = stalk.desiredYaw;
    stalk.targetPitch = stalk.desiredPitch;
    stalk.targetVector.copy(getLocalStalkDirection(stalk.desiredYaw, stalk.desiredPitch));
  }
}

export class MatchSimulation {
  constructor(options = {}) {
    const participants = options.players ?? [
      { slot: 1, profile: 'human', connected: true },
      { slot: 2, profile: 'human', connected: true }
    ];

    this.tickRate = options.tickRate ?? MATCH_TICK_RATE;
    this.tickDuration = 1 / this.tickRate;
    this.tuningConfig = normalizeTuningConfig(options.tuning ?? DEFAULT_TUNING_CONFIG);
    this.terrainConfig = createTerrainConfigFromTuning(this.tuningConfig);
    this.profileTemplates = createSimulationProfiles(this.tuningConfig);
    this.mode = options.mode ?? 'singleplayer';
    this.phase = options.startImmediately === false ? 'waiting' : 'running';
    this.winnerSlot = null;
    this.endReason = null;
    this.tick = 0;
    this.trailCellSize = options.trailCellSize ?? this.tuningConfig.trailCellSize;
    this.trailSpeedMultiplier = options.trailSpeedMultiplier ?? this.tuningConfig.trailSpeedMultiplier;
    this.trailContactRadius = options.trailContactRadius ?? this.tuningConfig.trailContactRadius;
    this.wetTrailCells = new Map();

    this.players = new Map();
    this.inputs = new Map();

    for (const participant of participants) {
      const player = createPlayerState(
        participant.slot,
        participant.profile ?? 'human',
        participant.connected ?? true,
        this.profileTemplates,
        this.terrainConfig
      );
      this.players.set(player.slot, player);
      this.inputs.set(player.slot, { ...DEFAULT_INPUT });
    }
  }

  restart() {
    const descriptors = Array.from(this.players.values()).map((player) => ({
      slot: player.slot,
      profile: player.profileName,
      connected: player.connected
    }));

    this.players.clear();
    this.inputs.clear();

    for (const descriptor of descriptors) {
      const player = createPlayerState(
        descriptor.slot,
        descriptor.profile,
        descriptor.connected,
        this.profileTemplates,
        this.terrainConfig
      );
      this.players.set(player.slot, player);
      this.inputs.set(player.slot, { ...DEFAULT_INPUT });
    }

    this.phase = 'running';
    this.winnerSlot = null;
    this.endReason = null;
    this.tick = 0;
    this.wetTrailCells.clear();
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

    this.inputs.set(slot, normalizeInput(input));
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

  getSnapshot() {
    return {
      tick: this.tick,
      phase: this.phase,
      winnerSlot: this.winnerSlot,
      reason: this.endReason,
      terrain: { ...this.terrainConfig },
      trailCellSize: this.trailCellSize,
      trailCells: Array.from(this.wetTrailCells.values()).map((cell) => ({
        x: cell.x,
        z: cell.z
      })),
      players: Array.from(this.players.values())
        .sort((left, right) => left.slot - right.slot)
        .map((player) => ({
          slot: player.slot,
          profileName: player.profileName,
          connected: player.connected,
          position: cloneVector(player.position),
          rotationY: player.rotationY,
          health: player.health,
          maxHealth: player.maxHealth,
          onTrail: player.onTrail,
          grounded: player.grounded,
          lockOn: player.lockOnHeld,
          controlMode: player.controlMode,
          controlIntensity: player.controlIntensity,
          impactPower: player.impactPower,
          invincible: player.invincibilityTime > 0,
          stalks: {
            left: serializeStalk(player.stalks.left),
            right: serializeStalk(player.stalks.right)
          }
        }))
    };
  }

  step(delta = this.tickDuration) {
    if (this.phase !== 'running') {
      return this.getSnapshot();
    }

    const orderedPlayers = Array.from(this.players.values()).sort((left, right) => left.slot - right.slot);

    for (const player of orderedPlayers) {
      player.previousPosition.copy(player.position);
      player.previousEyeTipPosition.copy(player.eyeTipPosition);
      player.impactPower = 0;

      for (const [, stalk] of getStalkEntries(player)) {
        stalk.previousTipPosition.copy(stalk.tipPosition);
        stalk.impactPower = 0;
      }
    }

    for (const player of orderedPlayers) {
      if (!player.connected || player.health <= 0) {
        player.onTrail = false;
        player.controlMode = 'idle';
        for (const [, stalk] of getStalkEntries(player)) {
          stalk.held = false;
        }
        continue;
      }

      const target = this.findPreferredTarget(player, {
        preferHumans: this.mode === 'multiplayer' && player.profileName === 'bot'
      });
      const input = this.inputs.get(player.slot) ?? DEFAULT_INPUT;
      this.applyInput(player, target, input, delta);
    }

    for (let leftIndex = 0; leftIndex < orderedPlayers.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < orderedPlayers.length; rightIndex += 1) {
        this.resolveBodyCollision(orderedPlayers[leftIndex], orderedPlayers[rightIndex]);
      }
    }

    for (const player of orderedPlayers) {
      if (!player.connected) {
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

      this.updateStalkRopes(player, delta);
      player.bodyVelocity.copy(player.position).sub(player.previousPosition).divideScalar(Math.max(delta, 0.0001));
      updateCompositeTipState(player, delta);
      player.invincibilityTime = Math.max(0, player.invincibilityTime - delta);
      player.onTrail = player.health > 0 && this.isPlayerOnWetTrail(player);
    }

    for (const attacker of orderedPlayers) {
      for (const target of orderedPlayers) {
        if (attacker.slot === target.slot) {
          continue;
        }

        this.resolveImpact(attacker, target, delta);
      }
    }

    this.evaluateEndState();
    this.tick += 1;
    return this.getSnapshot();
  }

  endMatch(winnerSlot, reason) {
    this.phase = 'ended';
    this.winnerSlot = winnerSlot;
    this.endReason = reason;
  }

  getLivingPlayers({ humansOnly = false } = {}) {
    return Array.from(this.players.values()).filter((player) => (
      player.connected &&
      player.health > 0 &&
      (!humansOnly || player.profileName !== 'bot')
    ));
  }

  findPreferredTarget(player, { preferHumans = false } = {}) {
    const candidates = this.getLivingPlayers().filter((candidate) => candidate.slot !== player.slot);
    if (candidates.length === 0) {
      return null;
    }

    const humanCandidates = preferHumans
      ? candidates.filter((candidate) => candidate.profileName !== 'bot')
      : [];
    const pool = humanCandidates.length > 0 ? humanCandidates : candidates;

    return pool.reduce((nearest, candidate) => {
      if (!nearest) {
        return candidate;
      }

      const nearestDistance = nearest.position.distanceToSquared(player.position);
      const candidateDistance = candidate.position.distanceToSquared(player.position);
      return candidateDistance < nearestDistance ? candidate : nearest;
    }, null);
  }

  evaluateEndState() {
    if (this.mode === 'test') {
      return;
    }

    if (this.mode === 'multiplayer') {
      const livingHumans = this.getLivingPlayers({ humansOnly: true });
      if (livingHumans.length > 1) {
        return;
      }

      if (livingHumans.length === 1) {
        this.endMatch(livingHumans[0].slot, 'knockout');
        return;
      }

      this.endMatch(null, 'draw');
      return;
    }

    const livingPlayers = this.getLivingPlayers();
    if (livingPlayers.length > 1) {
      return;
    }

    if (livingPlayers.length === 1) {
      this.endMatch(livingPlayers[0].slot, 'knockout');
      return;
    }

    this.endMatch(null, 'draw');
  }

  applyInput(player, target, input, delta) {
    const normalizedInput = normalizeInput(input);
    const movement = new THREE.Vector3(normalizedInput.moveX, 0, normalizedInput.moveZ);
    if (movement.lengthSq() > 1) {
      movement.normalize();
    }

    const baseSpeed = normalizedInput.lockOnHeld
      ? player.profile.lockedMoveSpeed
      : player.profile.freeMoveSpeed;
    const speed = baseSpeed * (this.isPlayerOnWetTrail(player) ? this.trailSpeedMultiplier : 1);
    player.position.addScaledVector(movement, speed * delta);
    this.clampPlanarPosition(player);

    const groundHeight = getPlayerGroundHeight(player, this.terrainConfig);

    if (normalizedInput.jumpPressed && player.grounded) {
      player.grounded = false;
      player.verticalVelocity = player.profile.jumpVelocity;
      player.position.y = groundHeight;
    }

    if (player.grounded) {
      player.position.y = groundHeight;
    } else {
      player.verticalVelocity -= player.profile.gravity * delta;
      player.position.y += player.verticalVelocity * delta;

      if (player.position.y <= groundHeight) {
        player.position.y = groundHeight;
        player.verticalVelocity = 0;
        player.grounded = true;
      }
    }

    player.lockOnHeld = normalizedInput.lockOnHeld;

    let facingDirection = null;
    if (normalizedInput.lockOnHeld && target) {
      facingDirection = target.position.clone().sub(player.position);
    } else if (movement.lengthSq() > 0) {
      facingDirection = movement;
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

    this.applyCombatInput(player, normalizedInput);
  }

  applyCombatInput(player, input) {
    player.controlMode = getControlMode(input);
    player.controlIntensity = (input.leftHeld || input.rightHeld)
      ? Math.min(1, Math.hypot(input.lookX, input.lookY) / STALK_LOOK_INTENSITY_SCALE)
      : 0;

    for (const [side, stalk] of getStalkEntries(player)) {
      const held = side === 'left' ? input.leftHeld : input.rightHeld;
      stalk.held = held;

      if (!held) {
        stalk.targetYaw = stalk.desiredYaw;
        stalk.targetPitch = stalk.desiredPitch;
        stalk.targetVector.copy(getLocalStalkDirection(stalk.desiredYaw, stalk.desiredPitch));
        continue;
      }

      stalk.desiredYaw = clamp(
        stalk.desiredYaw + (-input.lookX * player.profile.stalkYawSensitivity),
        -player.profile.stalkYawLimit,
        player.profile.stalkYawLimit
      );
      stalk.desiredPitch = clamp(
        stalk.desiredPitch + (-input.lookY * player.profile.stalkPitchSensitivity),
        player.profile.stalkPitchMin,
        player.profile.stalkPitchMax
      );
      stalk.targetYaw = stalk.desiredYaw;
      stalk.targetPitch = stalk.desiredPitch;
      stalk.targetVector.copy(getLocalStalkDirection(stalk.desiredYaw, stalk.desiredPitch));
    }
  }

  updateStalkRopes(player, delta) {
    for (const [, stalk] of getStalkEntries(player)) {
      if (stalk.held) {
        const responseAlpha = Math.min(
          1,
          (player.profile.stalkTargetApproachSpeed / Math.max(0.0001, player.profile.stalkMass)) * delta
        );
        stalk.appliedYaw = lerpAngle(stalk.appliedYaw, stalk.desiredYaw, responseAlpha);
        stalk.appliedPitch += (stalk.desiredPitch - stalk.appliedPitch) * responseAlpha;
      }

      const goalWorld = getStalkGoalWorldPosition(
        player.position,
        player.rotationY,
        stalk.appliedYaw,
        stalk.appliedPitch,
        player.profile.stalkTotalLength,
        stalk.rootOffset
      );
      const rootWorld = getStalkRootWorldPosition(player.position, player.rotationY, stalk.rootOffset);

      simulateStalkRope({
        nodes: stalk.nodes,
        previousNodes: stalk.previousNodes,
        rootWorld,
        goalWorld,
        delta,
        segmentLength: player.profile.stalkTotalLength / player.profile.stalkSegmentCount,
        gravity: player.profile.stalkGravity,
        damping: player.profile.stalkDamping,
        goalPull: stalk.held ? player.profile.stalkDrivePull : player.profile.stalkIdlePull,
        constraintIterations: player.profile.stalkConstraintIterations
      });

      stalk.tipPosition.copy(getTipWorldPosition(stalk.nodes));
      if (delta > 0) {
        stalk.tipVelocity.copy(stalk.tipPosition).sub(stalk.previousTipPosition).divideScalar(delta);
      } else {
        stalk.tipVelocity.set(0, 0, 0);
      }

      const rootToTip = stalk.tipPosition.clone().sub(rootWorld);
      if (rootToTip.lengthSq() === 0) {
        stalk.currentVector.copy(stalk.targetVector);
      } else {
        stalk.currentVector.copy(getBodyLocalDirection(rootToTip.normalize(), player.rotationY));
      }
    }
  }

  getTrailCells() {
    return Array.from(this.wetTrailCells.values()).map((cell) => ({
      x: cell.x,
      z: cell.z
    }));
  }

  markTrailAtPosition(position) {
    const cellX = quantizeTrailCoord(position.x, this.trailCellSize);
    const cellZ = quantizeTrailCoord(position.z, this.trailCellSize);
    const key = createTrailCellKey(cellX, cellZ);

    if (!this.wetTrailCells.has(key)) {
      this.wetTrailCells.set(key, {
        x: cellX * this.trailCellSize,
        z: cellZ * this.trailCellSize
      });
    }
  }

  depositTrailForPlayer(player) {
    const start = player.previousPosition;
    const end = player.position;
    const distance = Math.hypot(end.x - start.x, end.z - start.z);
    const steps = Math.max(1, Math.ceil(distance / (this.trailCellSize * 0.45)));

    for (let index = 0; index <= steps; index += 1) {
      const alpha = steps === 0 ? 1 : index / steps;
      this.markTrailAtPosition({
        x: THREE.MathUtils.lerp(start.x, end.x, alpha),
        z: THREE.MathUtils.lerp(start.z, end.z, alpha)
      });
    }
  }

  isPlayerOnWetTrail(player) {
    const contactRadius = Math.max(this.trailContactRadius, player.bodyRadius * 0.55);
    const centerCellX = quantizeTrailCoord(player.position.x, this.trailCellSize);
    const centerCellZ = quantizeTrailCoord(player.position.z, this.trailCellSize);
    const searchRadius = Math.ceil((contactRadius + this.trailCellSize) / this.trailCellSize);

    for (let cellX = centerCellX - searchRadius; cellX <= centerCellX + searchRadius; cellX += 1) {
      for (let cellZ = centerCellZ - searchRadius; cellZ <= centerCellZ + searchRadius; cellZ += 1) {
        const cell = this.wetTrailCells.get(createTrailCellKey(cellX, cellZ));
        if (!cell) {
          continue;
        }

        if (circleIntersectsTrailCell(
          player.position.x,
          player.position.z,
          contactRadius,
          cell,
          this.trailCellSize
        )) {
          return true;
        }
      }
    }

    return false;
  }

  clampPlanarPosition(player) {
    player.position.x = clamp(player.position.x, -player.profile.arenaRadius, player.profile.arenaRadius);
    player.position.z = clamp(player.position.z, -player.profile.arenaRadius, player.profile.arenaRadius);
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
    const displacement = planarDirection.multiplyScalar(overlap / 2);
    playerA.position.addScaledVector(displacement, -1);
    playerB.position.add(displacement);
    this.clampPlanarPosition(playerA);
    this.clampPlanarPosition(playerB);
    snapPlayerToGroundIfGrounded(playerA, this.terrainConfig);
    snapPlayerToGroundIfGrounded(playerB, this.terrainConfig);
  }

  resolveImpact(attacker, target, delta) {
    if (
      !attacker.connected ||
      !target.connected ||
      attacker.health <= 0 ||
      target.health <= 0
    ) {
      return;
    }

    let totalDamage = 0;
    let strongestImpact = attacker.impactPower;

    for (const [, stalk] of getStalkEntries(attacker)) {
      const segmentSamples = buildStalkSegmentSamples(
        stalk.nodes,
        stalk.previousNodes,
        delta,
        stalk.segmentRadius
      );
      const impactResult = evaluateStalkImpact(
        segmentSamples,
        target.position,
        target.bodyRadius,
        attacker.bodyVelocity,
        attacker.profile.impactMomentumFactor
      );

      const measuredImpact = impactResult.collision
        ? impactResult.contactImpactPower
        : impactResult.impactPower;
      stalk.impactPower = measuredImpact;
      strongestImpact = Math.max(strongestImpact, measuredImpact);

      if (
        impactResult.collision &&
        impactResult.contactImpactPower >= attacker.profile.impactThreshold
      ) {
        totalDamage += computeImpactDamage(attacker, stalk, impactResult.contactImpactPower);
      }
    }

    attacker.impactPower = strongestImpact;

    if (totalDamage === 0 || target.invincibilityTime > 0) {
      return;
    }

    target.health = Math.max(0, target.health - totalDamage);
    target.invincibilityTime = target.profile.invincibilityDuration;
  }
}

export function createIdleInput() {
  return { ...DEFAULT_INPUT };
}

export function normalizePlayerInput(input) {
  return normalizeInput(input);
}
