import * as THREE from 'three';

import {
  STALK_ACTIVE_PULL,
  STALK_CONSTRAINT_ITERATIONS,
  STALK_DAMPING,
  STALK_GRAVITY,
  STALK_IDLE_PULL,
  STALK_SEGMENT_COUNT,
  STALK_SEGMENT_RADIUS,
  STALK_TOTAL_LENGTH,
  buildStalkSegmentSamples,
  cloneNodeArray,
  createInitialStalkNodes,
  evaluateStalkImpact,
  getStalkGoalWorldPosition,
  getStalkRootWorldPosition,
  getTipWorldPosition,
  serializeNodes,
  simulateStalkRope
} from './StalkRope.js';

export const MATCH_TICK_RATE = 60;
export const MATCH_TICK_DURATION = 1 / MATCH_TICK_RATE;
export const DEFAULT_MAX_HEALTH = 40;

const UP = new THREE.Vector3(0, 1, 0);
const PLAYER_STARTS = new Map([
  [1, new THREE.Vector3(0, 1, 6)],
  [2, new THREE.Vector3(0, 1, -6)]
]);

const HUMAN_PROFILE = {
  groundHeight: 1,
  arenaRadius: 22,
  bodyRadius: 1.8,
  maxHealth: DEFAULT_MAX_HEALTH,
  invincibilityDuration: 0.45,
  jumpVelocity: 8.5,
  gravity: 24,
  turnSpeed: 12,
  lockedMoveSpeed: 7.5,
  freeMoveSpeed: 10,
  stalkNeutralYaw: 0,
  stalkNeutralPitch: 0.08,
  stalkYawLimit: 1.3,
  stalkPitchMin: -1.2,
  stalkPitchMax: 1.15,
  stalkResponse: 15,
  stalkRecover: 9,
  stalkSegmentCount: STALK_SEGMENT_COUNT,
  stalkTotalLength: STALK_TOTAL_LENGTH,
  stalkSegmentRadius: STALK_SEGMENT_RADIUS,
  stalkGravity: STALK_GRAVITY,
  stalkDamping: STALK_DAMPING,
  stalkConstraintIterations: STALK_CONSTRAINT_ITERATIONS,
  stalkDrivePull: STALK_ACTIVE_PULL,
  stalkIdlePull: STALK_IDLE_PULL,
  impactThreshold: 5.4,
  impactMomentumFactor: 0.35,
  sweepYawSensitivity: 0.011,
  sweepPitchSensitivity: 0.014,
  thrustYawSensitivity: 0.005,
  thrustPitchSensitivity: 0.011
};

const BOT_PROFILE = {
  ...HUMAN_PROFILE,
  turnSpeed: 8,
  lockedMoveSpeed: 4.2,
  freeMoveSpeed: 4.2,
  stalkNeutralPitch: 0.12,
  stalkYawLimit: 1.05,
  stalkPitchMin: -0.55,
  stalkPitchMax: 0.7,
  stalkResponse: 11,
  stalkRecover: 7,
  impactThreshold: 5.1,
  impactMomentumFactor: 0.28,
  sweepYawSensitivity: 0.009,
  sweepPitchSensitivity: 0.009,
  thrustYawSensitivity: 0.005,
  thrustPitchSensitivity: 0.009
};

const DEFAULT_INPUT = Object.freeze({
  moveX: 0,
  moveZ: 0,
  jumpPressed: false,
  lockOnHeld: false,
  combatMode: 'idle',
  lookX: 0,
  lookY: 0
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

function createInitialPosition(slot) {
  return (PLAYER_STARTS.get(slot) ?? new THREE.Vector3()).clone();
}

function resolveProfile(profileName) {
  return profileName === 'bot' ? BOT_PROFILE : HUMAN_PROFILE;
}

function normalizeInput(rawInput = {}) {
  const combatMode = rawInput.combatMode === 'swing' || rawInput.combatMode === 'thrust'
    ? rawInput.combatMode
    : 'idle';

  return {
    moveX: Number.isFinite(rawInput.moveX) ? rawInput.moveX : 0,
    moveZ: Number.isFinite(rawInput.moveZ) ? rawInput.moveZ : 0,
    jumpPressed: Boolean(rawInput.jumpPressed),
    lockOnHeld: Boolean(rawInput.lockOnHeld),
    combatMode,
    lookX: Number.isFinite(rawInput.lookX) ? rawInput.lookX : 0,
    lookY: Number.isFinite(rawInput.lookY) ? rawInput.lookY : 0
  };
}

function createInitialStalkState(profile, position, rotationY) {
  const rootWorld = getStalkRootWorldPosition(position, rotationY);
  const goalWorld = getStalkGoalWorldPosition(
    position,
    rotationY,
    profile.stalkNeutralYaw,
    profile.stalkNeutralPitch,
    profile.stalkTotalLength
  );
  const stalkNodes = createInitialStalkNodes(rootWorld, goalWorld, profile.stalkSegmentCount);
  const previousStalkNodes = cloneNodeArray(stalkNodes);

  return {
    stalkNodes,
    previousStalkNodes,
    eyeTipPosition: getTipWorldPosition(stalkNodes),
    previousEyeTipPosition: getTipWorldPosition(stalkNodes)
  };
}

function createPlayerState(slot, profileName, connected = true) {
  const profile = resolveProfile(profileName);
  const position = createInitialPosition(slot);
  const initialRotation = slot === 1 ? Math.PI : 0;
  const stalkState = createInitialStalkState(profile, position, initialRotation);

  return {
    slot,
    profileName,
    connected,
    profile,
    position,
    previousPosition: position.clone(),
    bodyVelocity: new THREE.Vector3(),
    eyeTipPosition: stalkState.eyeTipPosition,
    previousEyeTipPosition: stalkState.previousEyeTipPosition,
    eyeTipVelocity: new THREE.Vector3(),
    stalkNodes: stalkState.stalkNodes,
    previousStalkNodes: stalkState.previousStalkNodes,
    rotationY: initialRotation,
    health: profile.maxHealth,
    maxHealth: profile.maxHealth,
    invincibilityTime: 0,
    grounded: true,
    verticalVelocity: 0,
    lockOnHeld: false,
    controlMode: 'idle',
    controlIntensity: 0,
    impactPower: 0,
    bodyRadius: profile.bodyRadius,
    stalkSegmentRadius: profile.stalkSegmentRadius,
    stalkYaw: profile.stalkNeutralYaw,
    stalkPitch: profile.stalkNeutralPitch,
    stalkTargetYaw: profile.stalkNeutralYaw,
    stalkTargetPitch: profile.stalkNeutralPitch
  };
}

export class MatchSimulation {
  constructor(options = {}) {
    const participants = options.players ?? [
      { slot: 1, profile: 'human', connected: true },
      { slot: 2, profile: 'human', connected: true }
    ];

    this.tickRate = options.tickRate ?? MATCH_TICK_RATE;
    this.tickDuration = 1 / this.tickRate;
    this.mode = options.mode ?? 'singleplayer';
    this.phase = options.startImmediately === false ? 'waiting' : 'running';
    this.winnerSlot = null;
    this.endReason = null;
    this.tick = 0;

    this.players = new Map();
    this.inputs = new Map();

    for (const participant of participants) {
      const player = createPlayerState(
        participant.slot,
        participant.profile ?? 'human',
        participant.connected ?? true
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
      const player = createPlayerState(descriptor.slot, descriptor.profile, descriptor.connected);
      this.players.set(player.slot, player);
      this.inputs.set(player.slot, { ...DEFAULT_INPUT });
    }

    this.phase = 'running';
    this.winnerSlot = null;
    this.endReason = null;
    this.tick = 0;
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

  getSnapshot() {
    return {
      tick: this.tick,
      phase: this.phase,
      winnerSlot: this.winnerSlot,
      reason: this.endReason,
      players: Array.from(this.players.values())
        .sort((left, right) => left.slot - right.slot)
        .map((player) => ({
          slot: player.slot,
          connected: player.connected,
          position: cloneVector(player.position),
          rotationY: player.rotationY,
          stalkYaw: player.stalkYaw,
          stalkPitch: player.stalkPitch,
          stalkNodes: serializeNodes(player.stalkNodes),
          stalkSegmentRadius: player.stalkSegmentRadius,
          health: player.health,
          maxHealth: player.maxHealth,
          grounded: player.grounded,
          lockOn: player.lockOnHeld,
          controlMode: player.controlMode,
          controlIntensity: player.controlIntensity,
          impactPower: player.impactPower,
          invincible: player.invincibilityTime > 0
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
    }

    for (const player of orderedPlayers) {
      if (!player.connected || player.health <= 0) {
        continue;
      }

      const opponent = orderedPlayers.find((candidate) => candidate.slot !== player.slot && candidate.connected) ?? null;
      const input = this.inputs.get(player.slot) ?? DEFAULT_INPUT;
      this.applyInput(player, opponent, input, delta);
    }

    if (orderedPlayers.length >= 2) {
      this.resolveBodyCollision(orderedPlayers[0], orderedPlayers[1]);
    }

    for (const player of orderedPlayers) {
      if (!player.connected) {
        continue;
      }

      this.updateStalkRope(player, delta);
      player.bodyVelocity.copy(player.position).sub(player.previousPosition).divideScalar(Math.max(delta, 0.0001));
      player.eyeTipVelocity.copy(player.eyeTipPosition).sub(player.previousEyeTipPosition).divideScalar(Math.max(delta, 0.0001));
      player.invincibilityTime = Math.max(0, player.invincibilityTime - delta);
    }

    if (orderedPlayers.length >= 2) {
      this.resolveImpacts(orderedPlayers[0], orderedPlayers[1], delta);
    }

    this.tick += 1;
    return this.getSnapshot();
  }

  endMatch(winnerSlot, reason) {
    this.phase = 'ended';
    this.winnerSlot = winnerSlot;
    this.endReason = reason;
  }

  applyInput(player, opponent, input, delta) {
    const normalizedInput = normalizeInput(input);
    const movement = new THREE.Vector3(normalizedInput.moveX, 0, normalizedInput.moveZ);
    if (movement.lengthSq() > 1) {
      movement.normalize();
    }

    const speed = normalizedInput.lockOnHeld
      ? player.profile.lockedMoveSpeed
      : player.profile.freeMoveSpeed;
    player.position.addScaledVector(movement, speed * delta);
    this.clampPlanarPosition(player);

    if (normalizedInput.jumpPressed && player.grounded) {
      player.grounded = false;
      player.verticalVelocity = player.profile.jumpVelocity;
    }

    if (player.grounded) {
      player.position.y = player.profile.groundHeight;
    } else {
      player.verticalVelocity -= player.profile.gravity * delta;
      player.position.y += player.verticalVelocity * delta;

      if (player.position.y <= player.profile.groundHeight) {
        player.position.y = player.profile.groundHeight;
        player.verticalVelocity = 0;
        player.grounded = true;
      }
    }

    player.lockOnHeld = normalizedInput.lockOnHeld;

    let facingDirection = null;
    if (normalizedInput.lockOnHeld && opponent) {
      facingDirection = opponent.position.clone().sub(player.position);
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

    this.applyCombatInput(player, normalizedInput, delta);
  }

  applyCombatInput(player, input, delta) {
    if (input.combatMode === 'idle') {
      player.stalkTargetYaw = player.profile.stalkNeutralYaw;
      player.stalkTargetPitch = player.profile.stalkNeutralPitch;
      player.controlMode = 'idle';
      player.controlIntensity = 0;
    } else {
      const intensity = Math.min(1, Math.hypot(input.lookX, input.lookY) / 18);
      const yawSensitivity = input.combatMode === 'thrust'
        ? player.profile.thrustYawSensitivity
        : player.profile.sweepYawSensitivity;
      const pitchSensitivity = input.combatMode === 'thrust'
        ? player.profile.thrustPitchSensitivity
        : player.profile.sweepPitchSensitivity;

      player.stalkTargetYaw = clamp(
        player.stalkTargetYaw + (-input.lookX * yawSensitivity),
        -player.profile.stalkYawLimit,
        player.profile.stalkYawLimit
      );
      player.stalkTargetPitch = clamp(
        player.stalkTargetPitch + (-input.lookY * pitchSensitivity),
        player.profile.stalkPitchMin,
        player.profile.stalkPitchMax
      );
      player.controlMode = input.combatMode;
      player.controlIntensity = intensity;
    }

    const response = player.controlMode === 'idle'
      ? player.profile.stalkRecover
      : player.profile.stalkResponse;
    const alpha = Math.min(1, response * delta);

    player.stalkYaw = THREE.MathUtils.lerp(player.stalkYaw, player.stalkTargetYaw, alpha);
    player.stalkPitch = THREE.MathUtils.lerp(player.stalkPitch, player.stalkTargetPitch, alpha);
  }

  updateStalkRope(player, delta) {
    const goalWorld = getStalkGoalWorldPosition(
      player.position,
      player.rotationY,
      player.stalkYaw,
      player.stalkPitch,
      player.profile.stalkTotalLength
    );
    const rootWorld = getStalkRootWorldPosition(player.position, player.rotationY);

    simulateStalkRope({
      nodes: player.stalkNodes,
      previousNodes: player.previousStalkNodes,
      rootWorld,
      goalWorld,
      delta,
      segmentLength: player.profile.stalkTotalLength / player.profile.stalkSegmentCount,
      gravity: player.profile.stalkGravity,
      damping: player.profile.stalkDamping,
      goalPull: player.controlMode === 'idle'
        ? player.profile.stalkIdlePull
        : player.profile.stalkDrivePull,
      constraintIterations: player.profile.stalkConstraintIterations
    });

    player.eyeTipPosition.copy(getTipWorldPosition(player.stalkNodes));
  }

  clampPlanarPosition(player) {
    player.position.x = clamp(player.position.x, -player.profile.arenaRadius, player.profile.arenaRadius);
    player.position.z = clamp(player.position.z, -player.profile.arenaRadius, player.profile.arenaRadius);
  }

  resolveBodyCollision(playerA, playerB) {
    if (!playerA.connected || !playerB.connected) {
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
  }

  resolveImpacts(playerA, playerB, delta) {
    this.resolveImpact(playerA, playerB, delta);
    this.resolveImpact(playerB, playerA, delta);

    if (playerA.health <= 0 && playerB.health <= 0) {
      this.endMatch(null, 'draw');
      return;
    }

    if (playerA.health <= 0) {
      this.endMatch(playerB.slot, 'knockout');
      return;
    }

    if (playerB.health <= 0) {
      this.endMatch(playerA.slot, 'knockout');
    }
  }

  resolveImpact(attacker, target, delta) {
    if (!attacker.connected || !target.connected || attacker.health <= 0 || target.health <= 0) {
      return;
    }

    const segmentSamples = buildStalkSegmentSamples(
      attacker.stalkNodes,
      attacker.previousStalkNodes,
      delta,
      attacker.stalkSegmentRadius
    );
    const impactResult = evaluateStalkImpact(
      segmentSamples,
      target.position,
      target.bodyRadius,
      attacker.bodyVelocity,
      attacker.profile.impactMomentumFactor
    );

    attacker.impactPower = impactResult.collision
      ? impactResult.contactImpactPower
      : impactResult.impactPower;

    if (
      !impactResult.collision ||
      impactResult.contactImpactPower < attacker.profile.impactThreshold ||
      target.invincibilityTime > 0
    ) {
      return;
    }

    target.health = Math.max(0, target.health - 1);
    target.invincibilityTime = target.profile.invincibilityDuration;
  }
}

export function createIdleInput() {
  return { ...DEFAULT_INPUT };
}

export function normalizePlayerInput(input) {
  return normalizeInput(input);
}
