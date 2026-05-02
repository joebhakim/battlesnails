import * as THREE from 'three';

import {
  STALK_EYE_BOUNCE_RESTITUTION,
  STALK_EYE_RADIUS_SCALE,
  STALK_HEMISPHERE_FORWARD_TILT,
  STALK_ROOT_OFFSETS,
  STALK_SEGMENT_RADIUS,
  buildStalkEyeSamples,
  cloneNodeArray,
  createInitialStalkNodes,
  evaluateStalkImpact,
  getBodyLocalDirection,
  getLocalStalkDirection,
  getStalkGoalWorldPositionFromDirection,
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
import { estimateTerrainBodyClearance, getTerrainBodyGroundHeight } from '../world/TerrainClearance.js';

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
  reachDelta: 0,
  leftHeld: false,
  rightHeld: false
});

const STALK_SCREEN_X = new THREE.Vector3(1, 0, 0);
const STALK_SCREEN_Y = new THREE.Vector3(0, 1, 0);
const STALK_HEMISPHERE_POLE = new THREE.Vector3(
  0,
  Math.cos(STALK_HEMISPHERE_FORWARD_TILT),
  Math.sin(STALK_HEMISPHERE_FORWARD_TILT)
);
const SPRING_DOME_RESPONSE = 18;
const HEMISPHERE_EPSILON = 0.001;
const STALK_OUTSIDE_ARC_SPEED_SCALE = 0.12;
const TOP_DOWN_MIN_FORWARD = 0.02;
const TOP_DOWN_EPSILON = 0.000001;
const BASH_DAMAGE_SCALE = 0.2;
const MIN_DAMAGE_EVENT_AMOUNT = 0.025;
const CONTACT_RENEWAL_IMPULSE_MARGIN = 10;
const CONTACT_HYSTERESIS_TICKS = 5;

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

function cloneVector(vector) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function clonePlainVector(vector) {
  return vector ? { x: vector.x, y: vector.y, z: vector.z } : null;
}

function cloneCollisionShape(shape) {
  if (!shape) {
    return null;
  }

  return {
    ...shape,
    halfExtents: clonePlainVector(shape.halfExtents)
  };
}

function cloneEvent(event) {
  return {
    ...event,
    position: event.position ? { ...event.position } : null
  };
}

function createContactKey(attacker, target, side) {
  return `${attacker.slot}:${target.slot}:${side}`;
}

function getImpactSite(target, contactSample) {
  if (contactSample?.surfacePoint) {
    return contactSample.surfacePoint.clone();
  }

  if (!contactSample?.center) {
    return target.position.clone();
  }

  const toSample = contactSample.center.clone().sub(target.position);
  if (toSample.lengthSq() <= 0.000001) {
    return contactSample.center.clone();
  }

  return target.position.clone().addScaledVector(toSample.normalize(), target.bodyRadius);
}

function clampReticleToDisk(x, y, radius = 0.995) {
  const length = Math.hypot(x, y);
  if (length <= radius) {
    return { x, y };
  }

  return {
    x: (x / length) * radius,
    y: (y / length) * radius
  };
}

function clampLocalStalkDirection(vector) {
  const normalized = vector.clone();
  if (normalized.lengthSq() < 0.000001) {
    normalized.copy(STALK_HEMISPHERE_POLE);
  } else {
    normalized.normalize();
  }

  const poleDistance = normalized.dot(STALK_HEMISPHERE_POLE);
  if (poleDistance < HEMISPHERE_EPSILON) {
    normalized.addScaledVector(STALK_HEMISPHERE_POLE, HEMISPHERE_EPSILON - poleDistance);
    normalized.normalize();
  }

  return normalized;
}

function createDirectionFromReticle(reticleX, reticleY) {
  const reticle = clampReticleToDisk(reticleX, reticleY);
  const z = Math.sqrt(Math.max(0, 1 - (reticle.x * reticle.x) - (reticle.y * reticle.y)));
  const direction = clampLocalStalkDirection(new THREE.Vector3(reticle.x, reticle.y, z));
  return {
    direction,
    reticleX: direction.x,
    reticleY: direction.y
  };
}

function getYawPitchFromLocalDirection(direction, profile) {
  const localDirection = clampLocalStalkDirection(direction);
  return {
    yaw: clamp(
      Math.asin(clamp(localDirection.x, -1, 1)),
      -profile.stalkYawLimit,
      profile.stalkYawLimit
    ),
    pitch: clamp(
      Math.atan2(localDirection.z, localDirection.y) - STALK_HEMISPHERE_FORWARD_TILT,
      profile.stalkPitchMin,
      profile.stalkPitchMax
    )
  };
}

function setStalkDesiredDirection(stalk, direction, profile = null) {
  stalk.desiredVector.copy(clampLocalStalkDirection(direction));
  stalk.targetVector.copy(stalk.desiredVector);
  stalk.reticleX = stalk.desiredVector.x;
  stalk.reticleY = stalk.desiredVector.y;

  if (profile) {
    const angles = getYawPitchFromLocalDirection(stalk.desiredVector, profile);
    stalk.desiredYaw = angles.yaw;
    stalk.desiredPitch = angles.pitch;
  }
}

function setStalkDesiredReach(stalk, nextReach, profile) {
  stalk.desiredReach = clamp(
    nextReach,
    profile.stalkReachMin,
    profile.stalkReachMax
  );
  stalk.targetReach = stalk.desiredReach;
}

function applyReachInput(stalk, input, profile) {
  if (input.reachDelta === 0) {
    return;
  }

  setStalkDesiredReach(
    stalk,
    stalk.desiredReach + input.reachDelta * profile.stalkReachSensitivity,
    profile
  );
}

function syncYawPitchFromDesiredDirection(stalk, profile) {
  const angles = getYawPitchFromLocalDirection(stalk.desiredVector, profile);
  stalk.desiredYaw = angles.yaw;
  stalk.desiredPitch = angles.pitch;
  stalk.appliedYaw = stalk.desiredYaw;
  stalk.appliedPitch = stalk.desiredPitch;
}

function syncYawPitchFromAppliedDirection(stalk, profile) {
  const angles = getYawPitchFromLocalDirection(stalk.appliedVector, profile);
  stalk.appliedYaw = angles.yaw;
  stalk.appliedPitch = angles.pitch;
}

function getTopDownPlanePoint(stalk) {
  return {
    x: Number.isFinite(stalk.planeX) ? stalk.planeX : stalk.desiredVector.x * stalk.desiredReach,
    y: Number.isFinite(stalk.planeY) ? stalk.planeY : stalk.desiredVector.y * stalk.desiredReach,
    z: Number.isFinite(stalk.planeZ)
      ? stalk.planeZ
      : Math.max(TOP_DOWN_MIN_FORWARD, stalk.desiredVector.z * stalk.desiredReach)
  };
}

function setTopDownPlaneTarget(stalk, planeX, planeY, planeZ, profile) {
  let nextX = Number.isFinite(planeX) ? planeX : 0;
  let nextY = Number.isFinite(planeY) ? planeY : 0;
  let nextZ = Number.isFinite(planeZ) ? planeZ : 1;

  nextZ = Math.max(TOP_DOWN_MIN_FORWARD, nextZ);

  const maxReach = Math.max(profile.stalkReachMin, profile.stalkReachMax);
  const maxVertical = Math.sqrt(Math.max(0, (maxReach * maxReach) - (TOP_DOWN_MIN_FORWARD * TOP_DOWN_MIN_FORWARD)));
  nextY = clamp(nextY, -maxVertical, maxVertical);

  let planarRadius = Math.hypot(nextX, nextZ);
  if (planarRadius < TOP_DOWN_EPSILON) {
    nextX = 0;
    nextZ = TOP_DOWN_MIN_FORWARD;
    planarRadius = nextZ;
  }

  const maxPlanarRadius = Math.sqrt(Math.max(0, (maxReach * maxReach) - (nextY * nextY)));
  if (planarRadius > maxPlanarRadius) {
    const scale = maxPlanarRadius / planarRadius;
    nextX *= scale;
    nextZ *= scale;
    planarRadius = maxPlanarRadius;
  }

  if (nextZ < TOP_DOWN_MIN_FORWARD) {
    nextZ = TOP_DOWN_MIN_FORWARD;
    const maxSideReach = Math.sqrt(Math.max(0, (maxPlanarRadius * maxPlanarRadius) - (nextZ * nextZ)));
    nextX = clamp(nextX, -maxSideReach, maxSideReach);
    planarRadius = Math.hypot(nextX, nextZ);
  }

  const minReach = Math.max(TOP_DOWN_MIN_FORWARD, profile.stalkReachMin);
  const minPlanarRadius = Math.sqrt(Math.max(0, (minReach * minReach) - (nextY * nextY)));
  if (planarRadius < minPlanarRadius) {
    if (planarRadius < TOP_DOWN_EPSILON) {
      nextX = 0;
      nextZ = minPlanarRadius;
    } else {
      const scale = minPlanarRadius / planarRadius;
      nextX *= scale;
      nextZ *= scale;
    }
    planarRadius = Math.hypot(nextX, nextZ);
  }

  const radius = Math.max(TOP_DOWN_EPSILON, Math.hypot(nextX, nextY, nextZ));
  stalk.planeX = nextX;
  stalk.planeY = nextY;
  stalk.planeZ = nextZ;
  setStalkDesiredReach(stalk, radius, profile);
  setStalkDesiredDirection(
    stalk,
    new THREE.Vector3(nextX / radius, nextY / radius, nextZ / radius),
    profile
  );
}

function applyTopDownPlaneControl(stalk, input, profile) {
  const current = getTopDownPlanePoint(stalk);

  setTopDownPlaneTarget(
    stalk,
    current.x + (-input.lookX * profile.stalkYawSensitivity),
    current.y + (input.reachDelta * profile.stalkReachSensitivity),
    current.z + (-input.lookY * profile.stalkPitchSensitivity),
    profile
  );
}

function rotateVectorToward(current, target, maxAngle) {
  const from = clampLocalStalkDirection(current);
  const to = clampLocalStalkDirection(target);
  const dot = clamp(from.dot(to), -1, 1);
  const angle = Math.acos(dot);
  if (angle <= maxAngle || angle < 0.000001) {
    return to;
  }

  const axis = from.clone().cross(to);
  if (axis.lengthSq() < 0.000001) {
    return clampLocalStalkDirection(from.lerp(to, maxAngle / angle));
  }

  return clampLocalStalkDirection(from.applyAxisAngle(axis.normalize(), maxAngle));
}

function advanceAppliedStalkTarget(stalk, profile, delta) {
  const responseSpeed = profile.stalkTargetApproachSpeed / Math.max(0.0001, profile.stalkMass);
  const responseAlpha = Math.min(1, responseSpeed * delta);
  const maxArcAngle = Math.max(0.001, responseSpeed * delta * STALK_OUTSIDE_ARC_SPEED_SCALE);

  stalk.appliedReach += (stalk.desiredReach - stalk.appliedReach) * responseAlpha;
  stalk.appliedReach = clamp(stalk.appliedReach, profile.stalkReachMin, profile.stalkReachMax);

  if (profile.stalkControlMode === 'yaw_pitch') {
    stalk.appliedYaw = lerpAngle(stalk.appliedYaw, stalk.desiredYaw, responseAlpha);
    stalk.appliedPitch += (stalk.desiredPitch - stalk.appliedPitch) * responseAlpha;
  }

  stalk.appliedVector.copy(rotateVectorToward(stalk.appliedVector, stalk.desiredVector, maxArcAngle));
  syncYawPitchFromAppliedDirection(stalk, profile);
}

function applyAbsoluteDomeControl(stalk, input, profile) {
  const reticle = createDirectionFromReticle(
    stalk.reticleX + (-input.lookX * profile.stalkYawSensitivity),
    stalk.reticleY + (input.lookY * profile.stalkPitchSensitivity)
  );

  stalk.reticleX = reticle.reticleX;
  stalk.reticleY = reticle.reticleY;
  setStalkDesiredDirection(stalk, reticle.direction, profile);
}

function applySpringDomeControl(stalk, input, profile, delta) {
  const reticle = createDirectionFromReticle(
    stalk.reticleX + (-input.lookX * profile.stalkYawSensitivity),
    stalk.reticleY + (input.lookY * profile.stalkPitchSensitivity)
  );
  const responseAlpha = Math.min(1, SPRING_DOME_RESPONSE * delta);

  stalk.reticleX = reticle.reticleX;
  stalk.reticleY = reticle.reticleY;
  setStalkDesiredDirection(
    stalk,
    stalk.desiredVector.clone().lerp(reticle.direction, responseAlpha),
    profile
  );
}

function applyTrackballControl(stalk, input, profile) {
  const horizontal = -input.lookX * profile.stalkYawSensitivity;
  const vertical = input.lookY * profile.stalkPitchSensitivity;
  const angle = Math.hypot(horizontal, vertical);
  if (angle === 0) {
    return;
  }

  const axis = new THREE.Vector3(-vertical, horizontal, 0);
  if (axis.lengthSq() < 0.000001) {
    return;
  }

  setStalkDesiredDirection(
    stalk,
    stalk.desiredVector.clone().applyAxisAngle(axis.normalize(), angle),
    profile
  );
}

function applyTangentVelocityControl(stalk, input, profile) {
  const horizontal = -input.lookX * profile.stalkYawSensitivity;
  const vertical = input.lookY * profile.stalkPitchSensitivity;
  if (horizontal === 0 && vertical === 0) {
    return;
  }

  const current = stalk.desiredVector.clone().normalize();
  const tangentX = STALK_SCREEN_X.clone().addScaledVector(current, -STALK_SCREEN_X.dot(current));
  const tangentY = STALK_SCREEN_Y.clone().addScaledVector(current, -STALK_SCREEN_Y.dot(current));
  if (tangentX.lengthSq() > 0.000001) {
    tangentX.normalize();
  }
  if (tangentY.lengthSq() > 0.000001) {
    tangentY.normalize();
  }

  setStalkDesiredDirection(
    stalk,
    current
      .addScaledVector(tangentX, horizontal)
      .addScaledVector(tangentY, vertical),
    profile
  );
}

function getContactSurfaceNormal(target, contactSample) {
  const normal = contactSample?.surfaceNormal?.clone()
    ?? contactSample?.center?.clone().sub(target.position)
    ?? new THREE.Vector3(1, 0, 0);

  if (normal.lengthSq() <= TOP_DOWN_EPSILON) {
    return new THREE.Vector3(1, 0, 0);
  }

  return normal.normalize();
}

function computeImpactDamageDetails(attacker, target, stalk, contactSample, contactState = null) {
  const threshold = Math.max(0.0001, attacker.profile.impactThreshold);
  const radius = Math.max(0.0001, stalk.segmentRadius ?? STALK_SEGMENT_RADIUS);
  const massScale = clamp((radius / STALK_SEGMENT_RADIUS) ** 2, 0.25, 4);
  const surfaceNormal = getContactSurfaceNormal(target, contactSample);
  const sampleVelocity = contactSample?.velocity?.clone() ?? new THREE.Vector3();
  const targetVelocity = target.bodyVelocity ?? new THREE.Vector3();
  const attackerVelocity = attacker.bodyVelocity ?? new THREE.Vector3();
  const movementAssist = Math.max(0, -attackerVelocity.dot(surfaceNormal));
  const incidentVelocity = sampleVelocity
    .sub(targetVelocity)
    .addScaledVector(surfaceNormal, -movementAssist * attacker.profile.impactMomentumFactor);
  const impactSpeed = Math.max(0, -incidentVelocity.dot(surfaceNormal));
  const normalVelocity = surfaceNormal.clone().multiplyScalar(incidentVelocity.dot(surfaceNormal));
  const tangentVelocity = incidentVelocity.clone().sub(normalVelocity);
  const tangentSpeed = tangentVelocity.length();
  const bashImpulse = impactSpeed * (1 + STALK_EYE_BOUNCE_RESTITUTION) * massScale;
  const contactAlreadyActive = Boolean(contactState?.active && (contactState.peakBashImpulse ?? 0) > 0);
  const renewedBashImpulse = contactAlreadyActive
    ? bashImpulse > (contactState.peakBashImpulse + CONTACT_RENEWAL_IMPULSE_MARGIN)
    : true;
  const activeBashImpulse = renewedBashImpulse ? bashImpulse : 0;
  // Innervation changes damage by changing stalk motion, not by multiplying the final hit.
  // Pressure is intentionally not used because larger eyes should hit harder, not softer.
  const bashDamage = (activeBashImpulse / threshold) * BASH_DAMAGE_SCALE;
  const amount = bashDamage;

  return {
    amount,
    impactImpulse: activeBashImpulse,
    bashDamage,
    bashImpulse: activeBashImpulse,
    rawBashImpulse: bashImpulse,
    impactSpeed,
    tangentSpeed,
    massScale
  };
}

function createDamageEvent({
  tick,
  attacker,
  target,
  side,
  contactSample,
  damageDetails,
  amount
}) {
  const detailScale = damageDetails.amount > 0
    ? Math.min(1, amount / damageDetails.amount)
    : 0;

  return {
    id: `${tick}:damage:${attacker.slot}:${target.slot}:${side}`,
    type: 'damage',
    tick,
    attackerSlot: attacker.slot,
    targetSlot: target.slot,
    side,
    amount,
    measurement: 'bash',
    impactSpeed: damageDetails.impactSpeed,
    tangentSpeed: damageDetails.tangentSpeed,
    impactImpulse: damageDetails.impactImpulse,
    bashImpulse: damageDetails.bashImpulse,
    rawBashImpulse: damageDetails.rawBashImpulse,
    bashDamage: damageDetails.bashDamage * detailScale,
    massScale: damageDetails.massScale,
    position: cloneVector(getImpactSite(target, contactSample))
  };
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

function getInitialStartPoint(slot) {
  if (PLAYER_STARTS.has(slot)) {
    return PLAYER_STARTS.get(slot);
  }

  const botIndex = Math.max(0, slot - 3);
  return BOT_STARTS[botIndex % BOT_STARTS.length];
}

function createInitialPosition(point, terrainConfig, profile, rotationY) {
  const position = createTerrainPosition(point.x, point.z, terrainConfig);
  position.y += estimateTerrainBodyClearance({
    x: point.x,
    z: point.z,
    rotationY,
    terrainConfig,
    aboveGroundHeight: profile.groundHeight ?? 0
  });
  position.y += Math.max(0, profile.spawnDropHeight ?? 0);
  return position;
}

function getFixtureHalfHeight(fixture) {
  const shape = fixture.collisionShape ?? {};
  if (shape.type === 'box') {
    return Number.isFinite(shape.halfExtents?.y) ? shape.halfExtents.y : fixture.bodyRadius ?? 1;
  }

  if (shape.type === 'cylinder') {
    return Number.isFinite(shape.halfHeight)
      ? shape.halfHeight
      : Number.isFinite(shape.height)
        ? shape.height / 2
        : fixture.bodyRadius ?? 1;
  }

  return null;
}

function createFixturePosition(fixture, terrainConfig) {
  const x = fixture.position?.x ?? 0;
  const z = fixture.position?.z ?? 0;
  const shapeHalfHeight = getFixtureHalfHeight(fixture);

  if (shapeHalfHeight !== null) {
    const position = createTerrainPosition(x, z, terrainConfig);
    position.y += shapeHalfHeight;
    return position;
  }

  const position = createTerrainPosition(x, z, terrainConfig);
  position.y += estimateTerrainBodyClearance({
    x,
    z,
    rotationY: fixture.rotationY ?? 0,
    terrainConfig,
    aboveGroundHeight: 0
  });
  return position;
}

function getProfileSpawnDropHeight(profile) {
  return Math.max(0, profile.spawnDropHeight ?? 0);
}

function normalizeInput(rawInput = {}) {
  return {
    moveX: Number.isFinite(rawInput.moveX) ? rawInput.moveX : 0,
    moveZ: Number.isFinite(rawInput.moveZ) ? rawInput.moveZ : 0,
    jumpPressed: Boolean(rawInput.jumpPressed),
    lockOnHeld: Boolean(rawInput.lockOnHeld),
    lookX: Number.isFinite(rawInput.lookX) ? rawInput.lookX : 0,
    lookY: Number.isFinite(rawInput.lookY) ? rawInput.lookY : 0,
    reachDelta: Number.isFinite(rawInput.reachDelta) ? rawInput.reachDelta : 0,
    leftHeld: Boolean(rawInput.leftHeld),
    rightHeld: Boolean(rawInput.rightHeld)
  };
}

function getPlayerGroundHeight(player, terrainConfig) {
  return getTerrainBodyGroundHeight({
    x: player.position.x,
    z: player.position.z,
    rotationY: player.rotationY,
    terrainConfig,
    aboveGroundHeight: player.profile.groundHeight ?? 0
  });
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
  let targetYaw = profile.stalkNeutralYaw;
  let targetPitch = profile.stalkNeutralPitch;
  let targetVector = getLocalStalkDirection(targetYaw, targetPitch);
  let targetReach = 1;
  let planeX = targetVector.x * targetReach;
  let planeY = targetVector.y * targetReach;
  let planeZ = Math.max(TOP_DOWN_MIN_FORWARD, targetVector.z * targetReach);

  if (profile.stalkControlMode === 'top_down_plane') {
    targetVector = new THREE.Vector3(0, 0, 1);
    targetReach = 1;
    planeX = 0;
    planeY = 0;
    planeZ = targetReach;

    const angles = getYawPitchFromLocalDirection(targetVector, profile);
    targetYaw = angles.yaw;
    targetPitch = angles.pitch;
  }

  const rootWorld = getStalkRootWorldPosition(position, rotationY, rootOffset);
  const goalWorld = getStalkGoalWorldPositionFromDirection(
    position,
    rotationY,
    targetVector,
    profile.stalkTotalLength * targetReach,
    rootOffset
  );
  const nodes = createInitialStalkNodes(rootWorld, goalWorld, profile.stalkSegmentCount);
  const tipPosition = getTipWorldPosition(nodes);

  return {
    side,
    rootOffset: rootOffset.clone(),
    nodes,
    previousNodes: cloneNodeArray(nodes),
    incidentNodes: cloneNodeArray(nodes),
    incidentPreviousNodes: cloneNodeArray(nodes),
    tipPosition,
    previousTipPosition: tipPosition.clone(),
    tipVelocity: new THREE.Vector3(),
    desiredYaw: targetYaw,
    desiredPitch: targetPitch,
    appliedYaw: targetYaw,
    appliedPitch: targetPitch,
    targetYaw: targetYaw,
    targetPitch: targetPitch,
    desiredVector: targetVector.clone(),
    appliedVector: targetVector.clone(),
    targetVector: targetVector.clone(),
    currentVector: targetVector.clone(),
    reticleX: targetVector.x,
    reticleY: targetVector.y,
    planeX,
    planeY,
    planeZ,
    desiredReach: targetReach,
    appliedReach: targetReach,
    targetReach,
    currentReach: targetReach,
    impactPower: 0,
    held: false,
    segmentRadius: profile.stalkSegmentRadius
  };
}

function getStalkEntries(player) {
  if (!player.stalks) {
    return [];
  }

  return STALK_SIDE_KEYS.map((side) => [side, player.stalks[side]]);
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

function getCompositeTipPosition(player) {
  if (!player.stalks) {
    return player.position.clone();
  }

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
  const targetPoint = stalk.targetVector.clone().multiplyScalar(stalk.targetReach);
  const currentPoint = stalk.currentVector.clone().multiplyScalar(stalk.currentReach);

  return {
    nodes: serializeNodes(stalk.nodes),
    segmentRadius: stalk.segmentRadius,
    held: stalk.held,
    impactPower: stalk.impactPower,
    targetVector: cloneVector(stalk.targetVector),
    currentVector: cloneVector(stalk.currentVector),
    targetReach: stalk.targetReach,
    currentReach: stalk.currentReach,
    targetPoint: cloneVector(targetPoint),
    currentPoint: cloneVector(currentPoint),
    targetYaw: stalk.desiredYaw,
    targetPitch: stalk.desiredPitch
  };
}

function serializeStalks(player) {
  if (!player.stalks) {
    return null;
  }

  return {
    left: serializeStalk(player.stalks.left),
    right: serializeStalk(player.stalks.right)
  };
}

function createFixtureState(participant, terrainConfig) {
  const position = createFixturePosition(participant, terrainConfig);
  const maxHealth = participant.maxHealth ?? 1;
  const profile = {
    maxHealth,
    bodyRadius: participant.bodyRadius ?? 1,
    groundHeight: 0,
    arenaRadius: 22,
    staticBody: true
  };
  const fixtureKind = participant.fixtureKind ?? 'fixture';

  return {
    slot: participant.slot,
    profileName: participant.profile ?? 'fixture',
    fixtureKind,
    displayName: participant.displayName ?? fixtureKind,
    connected: participant.connected ?? true,
    profile,
    position,
    previousPosition: position.clone(),
    bodyVelocity: new THREE.Vector3(),
    eyeTipPosition: position.clone(),
    previousEyeTipPosition: position.clone(),
    eyeTipVelocity: new THREE.Vector3(),
    stalks: null,
    rotationY: participant.rotationY ?? 0,
    health: maxHealth,
    maxHealth,
    immortal: Boolean(participant.immortal),
    staticBody: true,
    onTrail: false,
    grounded: true,
    verticalVelocity: 0,
    lockOnHeld: false,
    controlMode: 'static',
    controlIntensity: 0,
    impactPower: 0,
    bodyRadius: participant.bodyRadius ?? 1,
    collisionShape: cloneCollisionShape(participant.collisionShape)
  };
}

function createPlayerState(
  slot,
  profileName,
  connected = true,
  profileTemplates = createSimulationProfiles(),
  terrainConfig,
  participant = null
) {
  if (participant?.fixtureKind) {
    return createFixtureState(participant, terrainConfig);
  }

  const profile = profileTemplates[profileName] ?? profileTemplates.human;
  const startPoint = getInitialStartPoint(slot);
  const initialRotation = slot === 1 ? Math.PI : slot === 2 ? 0 : Math.atan2(-startPoint.x, -startPoint.z);
  const position = createInitialPosition(startPoint, terrainConfig, profile, initialRotation);
  const spawnDropHeight = getProfileSpawnDropHeight(profile);
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
    grounded: spawnDropHeight <= 0,
    verticalVelocity: 0,
    lockOnHeld: false,
    controlMode: 'idle',
    controlIntensity: 0,
    impactPower: 0,
    bodyRadius: profile.bodyRadius
  };
}

function applyProfileToPlayer(player, profile) {
  if (player.fixtureKind) {
    return;
  }

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
    stalk.desiredVector.copy(clampLocalStalkDirection(stalk.desiredVector));
    stalk.appliedVector.copy(clampLocalStalkDirection(stalk.appliedVector));
    stalk.desiredReach = clamp(stalk.desiredReach ?? 1, profile.stalkReachMin, profile.stalkReachMax);
    stalk.appliedReach = clamp(stalk.appliedReach ?? stalk.desiredReach, profile.stalkReachMin, profile.stalkReachMax);
    stalk.targetReach = stalk.desiredReach;
    if (profile.stalkControlMode === 'top_down_plane') {
      const planePoint = getTopDownPlanePoint(stalk);
      setTopDownPlaneTarget(
        stalk,
        planePoint.x,
        planePoint.y,
        planePoint.z,
        profile
      );
      stalk.appliedVector.copy(stalk.desiredVector);
      stalk.appliedReach = stalk.desiredReach;
      syncYawPitchFromAppliedDirection(stalk, profile);
    } else if (profile.stalkControlMode === 'yaw_pitch') {
      syncYawPitchFromDesiredDirection(stalk, profile);
      stalk.desiredVector.copy(getLocalStalkDirection(stalk.desiredYaw, stalk.desiredPitch));
      stalk.appliedVector.copy(getLocalStalkDirection(stalk.appliedYaw, stalk.appliedPitch));
    }
    stalk.targetVector.copy(stalk.desiredVector);
    stalk.reticleX = stalk.desiredVector.x;
    stalk.reticleY = stalk.desiredVector.y;
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
    this.events = [];
    this.contactMemory = new Map();

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

  restart() {
    const descriptors = Array.from(this.players.values()).map((player) => ({
      slot: player.slot,
      profile: player.profileName,
      connected: player.connected,
      fixtureKind: player.fixtureKind,
      displayName: player.displayName,
      immortal: player.immortal,
      maxHealth: player.maxHealth,
      position: player.fixtureKind ? cloneVector(player.position) : null,
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
      events: this.events.map(cloneEvent),
      players: Array.from(this.players.values())
        .sort((left, right) => left.slot - right.slot)
        .map((player) => ({
          slot: player.slot,
          profileName: player.profileName,
          fixtureKind: player.fixtureKind ?? null,
          displayName: player.displayName ?? null,
          immortal: Boolean(player.immortal),
          collisionShape: cloneCollisionShape(player.collisionShape),
          connected: player.connected,
          position: cloneVector(player.position),
          rotationY: player.rotationY,
          health: player.health,
          maxHealth: player.maxHealth,
          groundHeight: player.profile.groundHeight,
          onTrail: player.onTrail,
          grounded: player.grounded,
          lockOn: player.lockOnHeld,
          controlMode: player.controlMode,
          controlIntensity: player.controlIntensity,
          impactPower: player.impactPower,
          stalks: serializeStalks(player)
        }))
    };
  }

  step(delta = this.tickDuration) {
    if (this.phase !== 'running') {
      this.events = [];
      return this.getSnapshot();
    }

    this.events = [];
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
      this.applyInput(player, target, input, delta);
    }

    for (let leftIndex = 0; leftIndex < orderedPlayers.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < orderedPlayers.length; rightIndex += 1) {
        this.resolveBodyCollision(orderedPlayers[leftIndex], orderedPlayers[rightIndex]);
      }
    }

    const bodyObstacles = createBodyObstacles(orderedPlayers);

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

      this.updateStalkRopes(player, delta, bodyObstacles);
      player.bodyVelocity.copy(player.position).sub(player.previousPosition).divideScalar(Math.max(delta, 0.0001));
      updateCompositeTipState(player, delta);
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
    const hasBots = Array.from(this.players.values()).some((player) => player.profileName === 'bot');
    if (hasBots) {
      const livingHumans = livingPlayers.filter((player) => player.profileName !== 'bot');
      const livingBots = livingPlayers.filter((player) => player.profileName === 'bot');
      if (livingHumans.length > 0 && livingBots.length > 0) {
        return;
      }

      if (livingHumans.length > 0) {
        this.endMatch(livingHumans[0].slot, 'knockout');
        return;
      }

      if (livingBots.length > 0) {
        this.endMatch(livingBots[0].slot, 'knockout');
        return;
      }

      this.endMatch(null, 'draw');
      return;
    }

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

    this.applyCombatInput(player, normalizedInput, delta);
  }

  applyCombatInput(player, input, delta) {
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
        stalk.targetVector.copy(stalk.desiredVector);
        stalk.targetReach = stalk.desiredReach;
        continue;
      }

      switch (player.profile.stalkControlMode) {
        case 'top_down_plane':
          applyTopDownPlaneControl(stalk, input, player.profile);
          break;
        case 'absolute_dome':
          applyReachInput(stalk, input, player.profile);
          applyAbsoluteDomeControl(stalk, input, player.profile);
          break;
        case 'trackball':
          applyReachInput(stalk, input, player.profile);
          applyTrackballControl(stalk, input, player.profile);
          break;
        case 'tangent_velocity':
          applyReachInput(stalk, input, player.profile);
          applyTangentVelocityControl(stalk, input, player.profile);
          break;
        case 'spring_dome':
          applyReachInput(stalk, input, player.profile);
          applySpringDomeControl(stalk, input, player.profile, delta);
          break;
        case 'yaw_pitch':
        default:
          applyReachInput(stalk, input, player.profile);
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
          setStalkDesiredDirection(
            stalk,
            getLocalStalkDirection(stalk.desiredYaw, stalk.desiredPitch),
            player.profile
          );
          break;
      }

      stalk.targetYaw = stalk.desiredYaw;
      stalk.targetPitch = stalk.desiredPitch;
      stalk.targetVector.copy(stalk.desiredVector);
      stalk.targetReach = stalk.desiredReach;
    }
  }

  updateStalkRopes(player, delta, bodyObstacles = []) {
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

      simulateStalkRope({
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
        constraintIterations: player.profile.stalkConstraintIterations,
        turgidity: stalk.held ? player.profile.stalkTurgidity : 0,
        collision: {
          terrainHeightAt,
          bodyObstacles: collisionBodyObstacles,
          segmentRadius: stalk.segmentRadius
        }
      });

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
    const pendingDamageEvents = [];

    for (const [side, stalk] of getStalkEntries(attacker)) {
      const eyeRadius = (stalk.segmentRadius ?? STALK_SEGMENT_RADIUS) * STALK_EYE_RADIUS_SCALE;
      const eyeSamples = buildStalkEyeSamples(
        stalk.incidentNodes ?? stalk.nodes,
        stalk.incidentPreviousNodes ?? stalk.previousNodes,
        delta,
        eyeRadius
      );
      const impactResult = evaluateStalkImpact(
        eyeSamples,
        target.position,
        target.bodyRadius,
        attacker.bodyVelocity,
        attacker.profile.impactMomentumFactor,
        target.collisionShape
      );

      const contactKey = createContactKey(attacker, target, side);
      const contactState = this.contactMemory.get(contactKey) ?? {
        active: false,
        peakBashImpulse: 0,
        missedTicks: 0,
        featureId: null,
        normal: null
      };
      if (!impactResult.collision) {
        if (contactState.active || contactState.peakBashImpulse > 0) {
          contactState.missedTicks = (contactState.missedTicks ?? 0) + 1;
          if (contactState.missedTicks > CONTACT_HYSTERESIS_TICKS) {
            contactState.active = false;
            contactState.peakBashImpulse = 0;
            contactState.featureId = null;
            contactState.normal = null;
          }
          this.contactMemory.set(contactKey, contactState);
        }
      }

      const damageDetails = impactResult.collision
        ? computeImpactDamageDetails(attacker, target, stalk, impactResult.contactSample, contactState)
        : null;
      const measuredImpact = damageDetails
        ? damageDetails.impactImpulse
        : impactResult.impactPower;
      stalk.impactPower = measuredImpact;
      strongestImpact = Math.max(strongestImpact, measuredImpact);

      if (impactResult.collision) {
        contactState.active = true;
        contactState.missedTicks = 0;
        contactState.featureId = impactResult.contactSample.contactFeatureId ?? null;
        contactState.normal = clonePlainVector(impactResult.contactSample.surfaceNormal);
        contactState.peakBashImpulse = Math.max(
          contactState.peakBashImpulse,
          damageDetails.amount >= MIN_DAMAGE_EVENT_AMOUNT
            ? damageDetails.rawBashImpulse
            : 0
        );
        this.contactMemory.set(contactKey, contactState);
      }

      if (
        impactResult.collision &&
        damageDetails.amount >= MIN_DAMAGE_EVENT_AMOUNT
      ) {
        totalDamage += damageDetails.amount;
        pendingDamageEvents.push({
          side,
          contactSample: impactResult.contactSample,
          damageDetails,
          amount: damageDetails.amount
        });
      }
    }

    attacker.impactPower = strongestImpact;

    if (totalDamage === 0) {
      return;
    }

    const appliedDamage = target.immortal ? totalDamage : Math.min(target.health, totalDamage);
    if (!target.immortal) {
      target.health = Math.max(0, target.health - totalDamage);
    }

    let remainingVisibleDamage = appliedDamage;
    for (const pendingEvent of pendingDamageEvents) {
      const visibleAmount = Math.min(pendingEvent.amount, remainingVisibleDamage);
      if (visibleAmount <= 0) {
        continue;
      }

      remainingVisibleDamage -= visibleAmount;
      this.events.push(createDamageEvent({
        tick: this.tick,
        attacker,
        target,
        ...pendingEvent,
        amount: visibleAmount
      }));
    }
  }
}

export function createIdleInput() {
  return { ...DEFAULT_INPUT };
}

export function normalizePlayerInput(input) {
  return normalizeInput(input);
}
