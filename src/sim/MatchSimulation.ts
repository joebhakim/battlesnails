import * as THREE from 'three';

import {
  STALK_EYE_BOUNCE_RESTITUTION,
  STALK_EYE_BOUNCE_TANGENT_DAMPING,
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
  type SimulationProfile,
  type SimulationProfiles,
  type TuningConfig,
  normalizeTuningConfig
} from './Tuning.js';
import {
  SNAIL_POWERUP_LABELS,
  SNAIL_POWERUP_TYPES,
  cloneSnailStats,
  createEmptySnailStats,
  getPowerupForProp,
  getSnailDamageMultiplier,
  getSnailSpeedMultiplier,
  updateSnailStatDerivedValues
} from './SnailPowerups.js';
import {
  createTerrainPosition,
  getTerrainHeight,
  getTerrainWaterInfo,
  normalizeTerrainConfig,
  type TerrainConfig
} from '../world/Terrain.js';
import { estimateTerrainBodyClearance, getTerrainBodyGroundHeight } from '../world/TerrainClearance.js';
import {
  getGroundPatchSurfaceOffset,
  getGroundPatchSupportNormal,
  getPolygonPrismPoints,
  isPointInPolygon2D
} from '../world/GroundCoverSurface.js';
import { clampPointToWorldBounds } from '../world/WorldBounds.js';
import {
  createTriangleMeshShapeFromProp,
  findClosestTriangleContact,
  getVisualCollisionMesh,
  isVisualMeshCollisionShape
} from '../entities/VisualCollisionMesh.js';

export const MATCH_TICK_RATE = 60;
export const MATCH_TICK_DURATION = 1 / MATCH_TICK_RATE;
export const DEFAULT_MAX_HEALTH = DEFAULT_TUNING_CONFIG.playerMaxHealth;
export const DEFAULT_BOT_MAX_HEALTH = DEFAULT_TUNING_CONFIG.botMaxHealth;
export const DEFAULT_JUMP_VELOCITY = DEFAULT_TUNING_CONFIG.jumpVelocity;
export const TRAIL_CELL_SIZE = DEFAULT_TUNING_CONFIG.trailCellSize;
export const TRAIL_SPEED_MULTIPLIER = DEFAULT_TUNING_CONFIG.trailSpeedMultiplier;

const STALK_SIDE_KEYS = ['left', 'right'] as const;
type StalkSide = typeof STALK_SIDE_KEYS[number];
interface PlainXZ {
  x: number;
  z: number;
}

export interface PlayerInput {
  moveX: number;
  moveZ: number;
  jumpPressed: boolean;
  lockOnHeld: boolean;
  lookX: number;
  lookY: number;
  turnX: number;
  reachDelta: number;
  interactPressed: boolean;
  leftHeld: boolean;
  rightHeld: boolean;
}
const STALK_LOOK_INTENSITY_SCALE = 18;
const TRAIL_CONTACT_RADIUS = 1.2;

const PLAYER_STARTS = new Map<number, Readonly<PlainXZ>>([
  [1, Object.freeze({ x: 0, z: 6 })],
  [2, Object.freeze({ x: 0, z: -6 })]
]);

function createRingPoints(radius: number, count: number, angleOffset = 0): PlainXZ[] {
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

const DEFAULT_INPUT: Readonly<PlayerInput> = Object.freeze({
  moveX: 0,
  moveZ: 0,
  jumpPressed: false,
  lockOnHeld: false,
  lookX: 0,
  lookY: 0,
  turnX: 0,
  reachDelta: 0,
  interactPressed: false,
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
const FREE_TURN_RADIANS_PER_PIXEL = 0.004;
const BASH_DAMAGE_SCALE = 0.2;
const SCRAPE_DAMAGE_SCALE = 0.04;
const SCRAPE_SPEED_DEADZONE = 6;
const BASH_KNOCKBACK_DISTANCE_SCALE = 0.035;
const SCRAPE_KNOCKBACK_TRANSFER = 0.08;
const MIN_BASH_KNOCKBACK_DISTANCE = 1.1;
const MAX_KNOCKBACK_DISTANCE = 8.5;
const GROUNDED_KNOCKBACK_VERTICAL_FLIP_SCALE = 0.65;
const AIRBORNE_KNOCKBACK_VERTICAL_SCALE = 0.45;
const KNOCKBACK_VERTICAL_VELOCITY_SCALE = 0.18;
const MAX_KNOCKBACK_VERTICAL_VELOCITY = 18;
const MIN_DAMAGE_EVENT_AMOUNT = 0.025;
const CONTACT_RENEWAL_IMPULSE_MARGIN = 10;
const CONTACT_HYSTERESIS_TICKS = 5;
const BIRD_DETECTION_RADIUS = 175;
const BIRD_TRACK_DURATION = 0.55;
const BIRD_SWOOP_DURATION = 1.1;
const BIRD_RECOVER_DURATION = 3.0;
const BIRD_MIN_COOLDOWN = 10;
const BIRD_MAX_COOLDOWN = 18;
const BIRD_WARNING_SHADOW_RADIUS = 11;
const BIRD_IMPACT_RADIUS = 5;
const BIRD_PATROL_SHADOW_RADIUS = 4.5;
const BIRD_SHADOW_TRACK_SPEED = 58;
const BIRD_SWEEP_TRACK_SPEED = 38;
const BIRD_COVER_QUERY_RADIUS = 90;
const BIRD_ATTACK_DAMAGE = 999999;
const WORLD_PROP_INTERACTION_DISTANCE = 3.1;
const WORLD_PROP_PICKUP_DISTANCE = 1.35;
const WORLD_PROP_SPATIAL_CELL_SIZE = 16;
const PLAYER_SPATIAL_CELL_SIZE = 16;
const STALK_OBSTACLE_NODE_BOUNDS_MARGIN = 1.05;
const STALK_FULL_FIDELITY_HUMAN_DISTANCE = 12;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const STALK_FORWARD = new THREE.Vector3(0, 0, 1);
const PROP_ADHESION_MARGIN = 0.35;
const PROP_SUPPORT_SNAP_DISTANCE = 2.2;
const PROP_CLIMB_SPEED_SCALE = 1.1;
const PROP_CLIMB_DESCEND_SCALE = 3.5;
const VERTICAL_SURFACE_MIN_UP_DOT = 0.45;
const CLIMB_INWARD_INPUT_THRESHOLD = 0.08;
const FREE_CLIMB_PROP_KINDS = new Set([
  'rotting_log',
  'rock',
  'gravel',
  'salt_cone',
  'rock_spire',
  'bamboo_stick',
  'moss_cushion',
  'moss_mat',
  'dry_leaf_patch',
  'dirt_stick_patch',
  'root_branch',
  'twig',
  'fallen_branch',
  'talus_rock',
  'rock_cluster',
  'dew_bead',
  'shell_shard'
]);
const SUMMIT_CYLINDER_PROP_KINDS = new Set([
  'giant_tree',
  'deciduous_tree',
  'conifer_tree',
  'mushroom',
  'lichen_tower',
  'shrub'
]);

function isFalseEnvValue(value) {
  return value === '0' || value === 'false' || value === 'off' || value === 'no';
}

function isAnalyticStalkAuthorityEnabled() {
  const viteValue = (import.meta as any).env?.VITE_ANALYTIC_STALK_AUTHORITY;
  if (viteValue !== undefined) {
    return !isFalseEnvValue(String(viteValue).toLowerCase());
  }

  const processValue = typeof process !== 'undefined'
    ? process.env?.ANALYTIC_STALK_AUTHORITY
    : undefined;
  if (processValue !== undefined) {
    return !isFalseEnvValue(String(processValue).toLowerCase());
  }

  return false;
}

const ANALYTIC_STALK_AUTHORITY = isAnalyticStalkAuthorityEnabled();

function angleDifference(current, target) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function lerpAngle(current, target, alpha) {
  return current + angleDifference(current, target) * alpha;
}

function getFacingDirection(rotationY) {
  return new THREE.Vector3(Math.sin(rotationY), 0, Math.cos(rotationY));
}

function getYawLocalVector(vector, rotationY = 0) {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return new THREE.Vector3(
    (vector.x * cos) - (vector.z * sin),
    vector.y,
    (vector.x * sin) + (vector.z * cos)
  );
}

function getYawWorldVector(vector, rotationY = 0) {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return new THREE.Vector3(
    (vector.x * cos) + (vector.z * sin),
    vector.y,
    (-vector.x * sin) + (vector.z * cos)
  );
}

function moveTowards(current, target, maximumDelta) {
  if (Math.abs(target - current) <= maximumDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maximumDelta;
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
    halfExtents: clonePlainVector(shape.halfExtents),
    points: Array.isArray(shape.points)
      ? shape.points.map((point) => ({
        x: point.x,
        z: point.z,
        ...(Number.isFinite(point.y) ? { y: point.y } : {})
      }))
      : shape.points,
    meshParts: Array.isArray(shape.meshParts)
      ? shape.meshParts.map((part) => ({
        ...part,
        center: clonePlainVector(part.center),
        start: clonePlainVector(part.start),
        end: clonePlainVector(part.end),
        halfExtents: clonePlainVector(part.halfExtents)
      }))
      : shape.meshParts
  };
}

function cloneWorldProp(prop) {
  return {
    ...prop,
    position: prop.position ? { ...prop.position } : null,
    collisionShape: cloneCollisionShape(prop.collisionShape),
    powerup: prop.powerup ? { ...prop.powerup } : null,
    visual: prop.visual ? { ...prop.visual } : {}
  };
}

function cloneEvent(event) {
  const cloned: any = {
    ...event,
    position: event.position ? { ...event.position } : null,
    shadowPosition: event.shadowPosition ? { ...event.shadowPosition } : undefined
  };

  if (event.knockback) {
    cloned.knockback = { ...event.knockback };
  }

  return cloned;
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

function setStalkDesiredDirection(stalk, direction, profile: any = null) {
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

function computeDamageKnockbackVector(target, surfaceNormal, tangentVelocity, bashImpulse, scrapeImpulse) {
  const impulseVector = new THREE.Vector3();

  if (bashImpulse > 0) {
    impulseVector.addScaledVector(surfaceNormal, -bashImpulse);
  }

  if (scrapeImpulse > 0 && tangentVelocity.lengthSq() > TOP_DOWN_EPSILON) {
    impulseVector.addScaledVector(tangentVelocity.clone().normalize(), scrapeImpulse * SCRAPE_KNOCKBACK_TRANSFER);
  }

  if (impulseVector.lengthSq() <= TOP_DOWN_EPSILON) {
    return new THREE.Vector3();
  }

  const hasBash = bashImpulse > 0;
  const distance = clamp(
    impulseVector.length() * BASH_KNOCKBACK_DISTANCE_SCALE,
    hasBash ? MIN_BASH_KNOCKBACK_DISTANCE : 0,
    MAX_KNOCKBACK_DISTANCE
  );
  const knockback = impulseVector.normalize().multiplyScalar(distance);

  if (target.grounded) {
    knockback.y = Math.abs(knockback.y) * GROUNDED_KNOCKBACK_VERTICAL_FLIP_SCALE;
  } else {
    knockback.y *= AIRBORNE_KNOCKBACK_VERTICAL_SCALE;
  }

  return knockback;
}

function computeImpactDamageDetails(attacker, target, stalk, contactSample, contactState: any = null) {
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
  const scrapeImpulse = Math.max(0, tangentSpeed - SCRAPE_SPEED_DEADZONE) *
    STALK_EYE_BOUNCE_TANGENT_DAMPING *
    massScale;
  // Innervation changes damage by changing stalk motion, not by multiplying the final hit.
  // Pressure is intentionally not used because larger eyes should hit harder, not softer.
  const damageMultiplier = getSnailDamageMultiplier(attacker.snailStats);
  const bashDamage = (activeBashImpulse / threshold) * BASH_DAMAGE_SCALE * damageMultiplier;
  const scrapeDamage = (scrapeImpulse / threshold) * SCRAPE_DAMAGE_SCALE * damageMultiplier;
  const amount = bashDamage + scrapeDamage;
  const knockback = computeDamageKnockbackVector(
    target,
    surfaceNormal,
    tangentVelocity,
    activeBashImpulse,
    scrapeImpulse
  );

  return {
    amount,
    impactImpulse: activeBashImpulse + scrapeImpulse,
    bashDamage,
    bashImpulse: activeBashImpulse,
    rawBashImpulse: bashImpulse,
    scrapeDamage,
    scrapeImpulse,
    rawScrapeImpulse: scrapeImpulse,
    impactSpeed,
    tangentSpeed,
    massScale,
    knockback
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
  const bashDamage = damageDetails.bashDamage * detailScale;
  const scrapeDamage = damageDetails.scrapeDamage * detailScale;
  const hasBashDamage = bashDamage > 0;
  const hasScrapeDamage = scrapeDamage > 0;
  const knockback = damageDetails.knockback?.clone?.().multiplyScalar(detailScale) ?? null;

  const event: any = {
    id: `${tick}:damage:${attacker.slot}:${target.slot}:${side}`,
    type: 'damage',
    tick,
    attackerSlot: attacker.slot,
    targetSlot: target.slot,
    side,
    amount,
    measurement: hasBashDamage && hasScrapeDamage
      ? 'mixed'
      : (hasScrapeDamage ? 'scrape' : 'bash'),
    impactSpeed: damageDetails.impactSpeed,
    tangentSpeed: damageDetails.tangentSpeed,
    impactImpulse: damageDetails.impactImpulse,
    bashImpulse: damageDetails.bashImpulse,
    rawBashImpulse: damageDetails.rawBashImpulse,
    bashDamage,
    massScale: damageDetails.massScale,
    position: cloneVector(getImpactSite(target, contactSample))
  };

  if (knockback && knockback.lengthSq() > TOP_DOWN_EPSILON) {
    event.knockback = cloneVector(knockback);
  }

  if (damageDetails.scrapeImpulse > 0) {
    event.scrapeImpulse = damageDetails.scrapeImpulse;
    event.rawScrapeImpulse = damageDetails.rawScrapeImpulse;
  }

  if (scrapeDamage > 0) {
    event.scrapeDamage = scrapeDamage;
  }

  return event;
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

function getCollisionShapeHalfHeight(shape, fallback = 1) {
  if (shape?.type === 'visual_mesh' || shape?.type === 'triangle_mesh') {
    return Number.isFinite(shape.halfHeight) ? shape.halfHeight : fallback;
  }

  if (shape?.type === 'box') {
    return Number.isFinite(shape.halfExtents?.y) ? shape.halfExtents.y : fallback;
  }

  if (shape?.type === 'cylinder') {
    return Number.isFinite(shape.halfHeight)
      ? shape.halfHeight
      : Number.isFinite(shape.height)
        ? shape.height / 2
      : fallback;
  }

  if (shape?.type === 'polygon_prism') {
    return Number.isFinite(shape.halfHeight) ? shape.halfHeight : fallback;
  }

  return Number.isFinite(shape?.radius) ? shape.radius : fallback;
}

function getCollisionShapeRadius(shape, fallback = 1) {
  if (Number.isFinite(shape?.meshRadius)) {
    return shape.meshRadius;
  }

  if (shape?.type === 'box') {
    const halfExtents = shape.halfExtents ?? {};
    return Math.hypot(halfExtents.x ?? fallback, halfExtents.z ?? fallback);
  }

  if (shape?.type === 'polygon_prism' && Array.isArray(shape.points)) {
    return shape.points.reduce((radius, point) => (
      Math.max(radius, Math.hypot(point.x ?? 0, point.z ?? 0))
    ), fallback);
  }

  return Number.isFinite(shape?.radius) ? shape.radius : fallback;
}

function normalizeWorldProp(rawProp: any = {}, terrainConfig) {
  const x = Number.isFinite(rawProp.position?.x) ? rawProp.position.x : 0;
  const z = Number.isFinite(rawProp.position?.z) ? rawProp.position.z : 0;
  const collisionShape = cloneCollisionShape(rawProp.collisionShape) ?? { type: 'sphere', radius: rawProp.bodyRadius ?? 1 };
  const halfHeight = getCollisionShapeHalfHeight(collisionShape, rawProp.bodyRadius ?? 1);
  const y = Number.isFinite(rawProp.position?.y)
    ? rawProp.position.y
    : getTerrainHeight(x, z, terrainConfig) + halfHeight;
  const bodyRadius = Number.isFinite(rawProp.bodyRadius)
    ? rawProp.bodyRadius
    : getCollisionShapeRadius(collisionShape, 1);

  return {
    id: rawProp.id ? `${rawProp.id}` : `${rawProp.kind ?? 'prop'}:${x.toFixed(2)}:${z.toFixed(2)}`,
    kind: rawProp.kind ?? 'prop',
    displayName: rawProp.displayName ?? rawProp.kind ?? 'Prop',
    position: new THREE.Vector3(x, y, z),
    rotationY: Number.isFinite(rawProp.rotationY) ? rawProp.rotationY : 0,
    bodyRadius,
    blocking: rawProp.blocking !== false,
    climbable: rawProp.climbable !== false,
    interactionKind: rawProp.interactionKind ?? null,
    powerup: rawProp.powerup ? { ...rawProp.powerup } : null,
    collisionShape,
    visual: { ...(rawProp.visual ?? {}) }
  };
}

function getBirdGroundPosition(x, z, terrainConfig, offset = 0.08) {
  return new THREE.Vector3(x, getTerrainHeight(x, z, terrainConfig) + offset, z);
}

function getCreatureHome(rawCreature: any = {}) {
  return {
    x: Number.isFinite(rawCreature.home?.x)
      ? rawCreature.home.x
      : Number.isFinite(rawCreature.position?.x)
        ? rawCreature.position.x
        : 0,
    z: Number.isFinite(rawCreature.home?.z)
      ? rawCreature.home.z
      : Number.isFinite(rawCreature.position?.z)
        ? rawCreature.position.z
        : 0
  };
}

function normalizeCreature(rawCreature: any = {}, terrainConfig, index = 0) {
  const kind = rawCreature.kind ?? 'bird';
  if (kind !== 'bird') {
    return null;
  }

  const home = getCreatureHome(rawCreature);
  const phaseOffset = Number.isFinite(rawCreature.phaseOffset) ? rawCreature.phaseOffset : index * 0.73;
  const patrolRadius = Number.isFinite(rawCreature.patrolRadius) ? rawCreature.patrolRadius : 55;
  const altitude = Number.isFinite(rawCreature.altitude) ? rawCreature.altitude : 75;
  const patrolAngle = Number.isFinite(rawCreature.patrolAngle) ? rawCreature.patrolAngle : phaseOffset;
  const shadowPosition = rawCreature.shadowPosition
    ? getBirdGroundPosition(rawCreature.shadowPosition.x ?? home.x, rawCreature.shadowPosition.z ?? home.z, terrainConfig)
    : getBirdGroundPosition(
      home.x + Math.cos(patrolAngle) * patrolRadius,
      home.z + Math.sin(patrolAngle) * patrolRadius,
      terrainConfig
    );
  const position = rawCreature.position
    ? new THREE.Vector3(
      rawCreature.position.x ?? shadowPosition.x,
      rawCreature.position.y ?? shadowPosition.y + altitude,
      rawCreature.position.z ?? shadowPosition.z
    )
    : new THREE.Vector3(shadowPosition.x, shadowPosition.y + altitude, shadowPosition.z);

  return {
    id: rawCreature.id ? `${rawCreature.id}` : `bird-${index}`,
    kind: 'bird',
    displayName: rawCreature.displayName ?? 'Bird',
    home: new THREE.Vector3(home.x, getTerrainHeight(home.x, home.z, terrainConfig), home.z),
    position,
    shadowPosition,
    rotationY: Number.isFinite(rawCreature.rotationY) ? rawCreature.rotationY : patrolAngle,
    phase: rawCreature.phase ?? 'patrol',
    phaseTimer: Number.isFinite(rawCreature.phaseTimer) ? rawCreature.phaseTimer : 0,
    cooldown: Number.isFinite(rawCreature.cooldown) ? rawCreature.cooldown : BIRD_MIN_COOLDOWN + (phaseOffset % 1) * (BIRD_MAX_COOLDOWN - BIRD_MIN_COOLDOWN),
    targetSlot: Number.isFinite(rawCreature.targetSlot) ? rawCreature.targetSlot : null,
    patrolAngle,
    patrolRadius,
    patrolSpeed: Number.isFinite(rawCreature.patrolSpeed) ? rawCreature.patrolSpeed : 0.18,
    altitude,
    bodyLength: Number.isFinite(rawCreature.bodyLength) ? rawCreature.bodyLength : 5.8,
    wingSpan: Number.isFinite(rawCreature.wingSpan) ? rawCreature.wingSpan : 12,
    warningRadius: Number.isFinite(rawCreature.warningRadius) ? rawCreature.warningRadius : BIRD_WARNING_SHADOW_RADIUS,
    impactRadius: Number.isFinite(rawCreature.impactRadius) ? rawCreature.impactRadius : BIRD_IMPACT_RADIUS,
    attackDamage: Number.isFinite(rawCreature.attackDamage) ? rawCreature.attackDamage : BIRD_ATTACK_DAMAGE,
    shadowRadius: Number.isFinite(rawCreature.shadowRadius) ? rawCreature.shadowRadius : BIRD_PATROL_SHADOW_RADIUS,
    shadowOpacity: Number.isFinite(rawCreature.shadowOpacity) ? rawCreature.shadowOpacity : 0.12
  };
}

function cloneCreatureDescriptor(creature) {
  return {
    id: creature.id,
    kind: creature.kind,
    displayName: creature.displayName,
    home: cloneVector(creature.home),
    position: cloneVector(creature.position),
    shadowPosition: cloneVector(creature.shadowPosition),
    rotationY: creature.rotationY,
    phaseOffset: creature.patrolAngle,
    patrolRadius: creature.patrolRadius,
    patrolSpeed: creature.patrolSpeed,
    altitude: creature.altitude,
    bodyLength: creature.bodyLength,
    wingSpan: creature.wingSpan,
    warningRadius: creature.warningRadius,
    impactRadius: creature.impactRadius,
    attackDamage: creature.attackDamage
  };
}

function serializeCreature(creature) {
  return {
    id: creature.id,
    kind: creature.kind,
    displayName: creature.displayName,
    position: cloneVector(creature.position),
    shadowPosition: cloneVector(creature.shadowPosition),
    rotationY: creature.rotationY,
    phase: creature.phase,
    targetSlot: creature.targetSlot,
    shadowRadius: creature.shadowRadius,
    shadowOpacity: creature.shadowOpacity,
    warningRadius: creature.warningRadius,
    impactRadius: creature.impactRadius,
    bodyLength: creature.bodyLength,
    wingSpan: creature.wingSpan
  };
}

function getBirdCoverRadius(prop) {
  switch (prop.kind) {
    case 'giant_tree':
    case 'deciduous_tree':
    case 'conifer_tree':
      return prop.visual?.canopyRadius ?? Math.max(prop.bodyRadius * 5, 24);
    case 'shrub':
      return prop.visual?.radius ?? Math.max(prop.bodyRadius * 2, 5);
    case 'mushroom':
      return prop.visual?.capRadius ?? prop.visual?.radius ?? prop.bodyRadius;
    case 'rotting_log':
    case 'fallen_branch':
    case 'root_branch':
      return Math.max(prop.bodyRadius ?? 0, getCollisionShapeRadius(prop.collisionShape, 1));
    case 'rock':
    case 'forest_rock':
    case 'talus_rock':
    case 'rock_cluster':
      return Math.max(prop.bodyRadius ?? 0, getCollisionShapeRadius(prop.collisionShape, 1)) * 1.05;
    case 'sprout':
      return (prop.visual?.height ?? 0) >= 18
        ? Math.max(prop.visual?.leafLength ?? 0, (prop.visual?.radius ?? prop.bodyRadius ?? 0) * 8, 4)
        : 0;
    default:
      return 0;
  }
}

function movePlanarToward(current, target, maximumDistance) {
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= TOP_DOWN_EPSILON || distance <= maximumDistance) {
    current.x = target.x;
    current.z = target.z;
    return;
  }

  const scale = maximumDistance / distance;
  current.x += dx * scale;
  current.z += dz * scale;
}

function createWorldPropSpatialCellKey(cellX, cellZ) {
  return `${cellX}:${cellZ}`;
}

function quantizeWorldPropSpatialCoord(value, cellSize) {
  return Math.floor(value / cellSize);
}

function getWorldPropSpatialRadius(prop) {
  return Math.max(
    0,
    prop.bodyRadius ?? getCollisionShapeRadius(prop.collisionShape, 1)
  );
}

function createWorldPropSpatialIndex(worldProps, cellSize = WORLD_PROP_SPATIAL_CELL_SIZE) {
  const cells = new Map();
  const safeCellSize = Math.max(1, cellSize);

  for (const prop of worldProps) {
    const radius = getWorldPropSpatialRadius(prop);
    const minCellX = quantizeWorldPropSpatialCoord(prop.position.x - radius, safeCellSize);
    const maxCellX = quantizeWorldPropSpatialCoord(prop.position.x + radius, safeCellSize);
    const minCellZ = quantizeWorldPropSpatialCoord(prop.position.z - radius, safeCellSize);
    const maxCellZ = quantizeWorldPropSpatialCoord(prop.position.z + radius, safeCellSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const key = createWorldPropSpatialCellKey(cellX, cellZ);
        const bucket = cells.get(key);
        if (bucket) {
          bucket.push(prop);
        } else {
          cells.set(key, [prop]);
        }
      }
    }
  }

  return cells;
}

function queryWorldPropSpatialIndex(cells, position, radius, cellSize = WORLD_PROP_SPATIAL_CELL_SIZE) {
  if (!cells || cells.size === 0 || !position) {
    return [];
  }

  const safeCellSize = Math.max(1, cellSize);
  const safeRadius = Math.max(0, radius);
  const minCellX = quantizeWorldPropSpatialCoord(position.x - safeRadius, safeCellSize);
  const maxCellX = quantizeWorldPropSpatialCoord(position.x + safeRadius, safeCellSize);
  const minCellZ = quantizeWorldPropSpatialCoord(position.z - safeRadius, safeCellSize);
  const maxCellZ = quantizeWorldPropSpatialCoord(position.z + safeRadius, safeCellSize);
  const seen = new Set();
  const nearby = [];

  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      const bucket = cells.get(createWorldPropSpatialCellKey(cellX, cellZ));
      if (!bucket) {
        continue;
      }

      for (const prop of bucket) {
        if (seen.has(prop.id)) {
          continue;
        }
        seen.add(prop.id);

        const maximumDistance = safeRadius + getWorldPropSpatialRadius(prop);
        const deltaX = position.x - prop.position.x;
        const deltaZ = position.z - prop.position.z;
        if ((deltaX * deltaX) + (deltaZ * deltaZ) <= maximumDistance * maximumDistance) {
          nearby.push(prop);
        }
      }
    }
  }

  return nearby;
}

function createPlayerSpatialCellKey(cellX, cellZ) {
  return `${cellX}:${cellZ}`;
}

function quantizePlayerSpatialCoord(value, cellSize) {
  return Math.floor(value / cellSize);
}

function createPlayerSpatialIndex(players, cellSize = PLAYER_SPATIAL_CELL_SIZE) {
  const cells = new Map();
  const safeCellSize = Math.max(1, cellSize);

  for (const player of players) {
    if (!player.connected || player.health <= 0) {
      continue;
    }

    const radius = Math.max(0, player.bodyRadius ?? 0);
    const minCellX = quantizePlayerSpatialCoord(player.position.x - radius, safeCellSize);
    const maxCellX = quantizePlayerSpatialCoord(player.position.x + radius, safeCellSize);
    const minCellZ = quantizePlayerSpatialCoord(player.position.z - radius, safeCellSize);
    const maxCellZ = quantizePlayerSpatialCoord(player.position.z + radius, safeCellSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const key = createPlayerSpatialCellKey(cellX, cellZ);
        const bucket = cells.get(key);
        if (bucket) {
          bucket.push(player);
        } else {
          cells.set(key, [player]);
        }
      }
    }
  }

  return cells;
}

function queryPlayerSpatialIndex(cells, position, radius, cellSize = PLAYER_SPATIAL_CELL_SIZE) {
  if (!cells || cells.size === 0 || !position) {
    return [];
  }

  const safeCellSize = Math.max(1, cellSize);
  const safeRadius = Math.max(0, radius);
  const minCellX = quantizePlayerSpatialCoord(position.x - safeRadius, safeCellSize);
  const maxCellX = quantizePlayerSpatialCoord(position.x + safeRadius, safeCellSize);
  const minCellZ = quantizePlayerSpatialCoord(position.z - safeRadius, safeCellSize);
  const maxCellZ = quantizePlayerSpatialCoord(position.z + safeRadius, safeCellSize);
  const seen = new Set();
  const nearby = [];

  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      const bucket = cells.get(createPlayerSpatialCellKey(cellX, cellZ));
      if (!bucket) {
        continue;
      }

      for (const player of bucket) {
        if (seen.has(player.slot)) {
          continue;
        }
        seen.add(player.slot);

        const maximumDistance = safeRadius + Math.max(0, player.bodyRadius ?? 0);
        const deltaX = position.x - player.position.x;
        const deltaZ = position.z - player.position.z;
        if ((deltaX * deltaX) + (deltaZ * deltaZ) <= maximumDistance * maximumDistance) {
          nearby.push(player);
        }
      }
    }
  }

  return nearby;
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

    let nearestHumanDistanceSquared = Infinity;
    for (const human of livingHumans) {
      nearestHumanDistanceSquared = Math.min(
        nearestHumanDistanceSquared,
        player.position.distanceToSquared(human.position)
      );
    }

    fidelity.set(
      player.slot,
      nearestHumanDistanceSquared <= fullDistanceSquared ? 'full' : 'terrain'
    );
  }

  return fidelity;
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

function normalizeInput(rawInput: Partial<PlayerInput> = {}): PlayerInput {
  return {
    moveX: Number.isFinite(rawInput.moveX) ? rawInput.moveX : 0,
    moveZ: Number.isFinite(rawInput.moveZ) ? rawInput.moveZ : 0,
    jumpPressed: Boolean(rawInput.jumpPressed),
    lockOnHeld: Boolean(rawInput.lockOnHeld),
    lookX: Number.isFinite(rawInput.lookX) ? rawInput.lookX : 0,
    lookY: Number.isFinite(rawInput.lookY) ? rawInput.lookY : 0,
    turnX: Number.isFinite(rawInput.turnX) ? rawInput.turnX : 0,
    reachDelta: Number.isFinite(rawInput.reachDelta) ? rawInput.reachDelta : 0,
    interactPressed: Boolean(rawInput.interactPressed),
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

function getPlayerWaterSupport(player, terrainConfig) {
  const water = getTerrainWaterInfo(player.position.x, player.position.z, terrainConfig);
  if (water.surfaceHeight === null || water.waterWeight <= 0.35) {
    return null;
  }

  const floatHeight = water.surfaceHeight + (player.profile.groundHeight ?? 0) * 0.42;
  return {
    kind: 'water',
    height: floatHeight,
    normal: WORLD_UP.clone(),
    surfaceId: 'terrain:water',
    priority: floatHeight + water.waterWeight
  };
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

function translateStalkPositionArray(nodes, displacement) {
  if (!Array.isArray(nodes)) {
    return;
  }

  for (const node of nodes) {
    node.add(displacement);
  }
}

function translatePlayerAttachments(player, displacement) {
  if (displacement.lengthSq() <= TOP_DOWN_EPSILON) {
    return;
  }

  player.eyeTipPosition?.add(displacement);
  player.previousEyeTipPosition?.add(displacement);

  for (const [, stalk] of getStalkEntries(player)) {
    translateStalkPositionArray(stalk.nodes, displacement);
    translateStalkPositionArray(stalk.previousNodes, displacement);
    translateStalkPositionArray(stalk.incidentNodes, displacement);
    translateStalkPositionArray(stalk.incidentPreviousNodes, displacement);
    stalk.tipPosition?.add(displacement);
    stalk.previousTipPosition?.add(displacement);
    stalk.rootWorld?.add(displacement);
  }
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

function createWorldPropObstacles(worldProps) {
  return worldProps
    .filter((prop) => prop.blocking)
    .map((prop) => ({
      slot: `prop:${prop.id}`,
      propId: prop.id,
      position: prop.position,
      radius: prop.bodyRadius,
      shape: isVisualMeshCollisionShape(prop.collisionShape)
        ? createTriangleMeshShapeFromProp(prop)
        : prop.collisionShape,
      rotationY: prop.rotationY ?? 0
    }));
}

function createPropSupport({
  prop,
  height,
  normal,
  surfaceId,
  kind = 'prop',
  climb = false,
  priority = 0
}) {
  const supportNormal = normal.clone();
  if (supportNormal.lengthSq() <= TOP_DOWN_EPSILON) {
    supportNormal.copy(WORLD_UP);
  } else {
    supportNormal.normalize();
  }

  return {
    prop,
    height,
    normal: supportNormal,
    surfaceId,
    kind,
    climb,
    priority
  };
}

function getMovementInwardAmount(movement, normal) {
  if (!movement || movement.lengthSq() <= TOP_DOWN_EPSILON) {
    return 0;
  }

  return Math.max(0, -movement.dot(normal));
}

function shouldDetachFromSurface(player, support, movement) {
  if (!support || !support.climb || support.normal.y >= VERTICAL_SURFACE_MIN_UP_DOT) {
    return false;
  }

  if (player.supportSurfaceId !== support.surfaceId || !movement || movement.lengthSq() <= TOP_DOWN_EPSILON) {
    return false;
  }

  return movement.dot(support.normal) > CLIMB_INWARD_INPUT_THRESHOLD;
}

function getRotatedBoxPlanarContact(player, prop) {
  const shape = prop.collisionShape ?? { type: 'sphere', radius: prop.bodyRadius };
  const halfExtents = shape.halfExtents ?? { x: prop.bodyRadius, z: prop.bodyRadius };
  const local = getYawLocalVector(player.position.clone().sub(prop.position), prop.rotationY ?? 0);
  const expandedX = (halfExtents.x ?? prop.bodyRadius) + player.bodyRadius;
  const expandedZ = (halfExtents.z ?? prop.bodyRadius) + player.bodyRadius;

  if (Math.abs(local.x) >= expandedX || Math.abs(local.z) >= expandedZ) {
    return null;
  }

  const penetrationX = expandedX - Math.abs(local.x);
  const penetrationZ = expandedZ - Math.abs(local.z);
  const localNormal = penetrationX < penetrationZ
    ? new THREE.Vector3(local.x >= 0 ? 1 : -1, 0, 0)
    : new THREE.Vector3(0, 0, local.z >= 0 ? 1 : -1);
  const localCorrection = localNormal.clone().multiplyScalar(Math.min(penetrationX, penetrationZ));
  const correction = getYawWorldVector(localCorrection, prop.rotationY ?? 0);
  const normal = getYawWorldVector(localNormal, prop.rotationY ?? 0).normalize();

  return {
    correction,
    normal,
    local,
    face: Math.abs(localNormal.x) > 0 ? 'x' : 'z'
  };
}

function getCylinderPlanarContact(player, prop) {
  const shape = prop.collisionShape ?? { type: 'sphere', radius: prop.bodyRadius };
  const obstacleRadius = shape.type === 'cylinder'
    ? shape.radius
    : prop.bodyRadius;
  const delta = player.position.clone().sub(prop.position);
  delta.y = 0;
  const minimumDistance = obstacleRadius + player.bodyRadius;
  const distance = Math.hypot(delta.x, delta.z);
  if (distance >= minimumDistance) {
    return null;
  }

  const normal = distance > TOP_DOWN_EPSILON
    ? new THREE.Vector3(delta.x / distance, 0, delta.z / distance)
    : new THREE.Vector3(1, 0, 0);

  return {
    correction: normal.clone().multiplyScalar(minimumDistance - distance),
    normal
  };
}

function getVisualMeshContact(player, prop, maximumDistance) {
  const mesh = getVisualCollisionMesh(prop);
  const localCenter = getYawLocalVector(player.position.clone().sub(prop.position), prop.rotationY ?? 0);
  const contact = findClosestTriangleContact(localCenter, mesh.triangles, maximumDistance);
  if (!contact) {
    return null;
  }

  const worldNormal = getYawWorldVector(contact.normal, prop.rotationY ?? 0);
  if (worldNormal.lengthSq() <= TOP_DOWN_EPSILON) {
    worldNormal.copy(WORLD_UP);
  } else {
    worldNormal.normalize();
  }

  const worldPoint = prop.position.clone().add(getYawWorldVector(contact.point, prop.rotationY ?? 0));
  return {
    ...contact,
    mesh,
    localCenter,
    worldNormal,
    worldPoint
  };
}

function getVisualMeshPlanarContact(player, prop) {
  const contact = getVisualMeshContact(player, prop, player.bodyRadius + PROP_ADHESION_MARGIN);
  if (!contact || contact.distance >= player.bodyRadius) {
    return null;
  }

  const correction = contact.worldNormal.clone().multiplyScalar(player.bodyRadius - contact.distance);
  if (Math.abs(correction.x) + Math.abs(correction.z) <= TOP_DOWN_EPSILON) {
    return null;
  }

  return {
    correction,
    normal: contact.worldNormal,
    local: contact.localCenter,
    face: 'mesh'
  };
}

function getPropShapeHalfHeight(prop) {
  const shape = prop.collisionShape ?? { type: 'sphere', radius: prop.bodyRadius };
  if (isVisualMeshCollisionShape(shape)) {
    return Number.isFinite(shape.halfHeight) ? shape.halfHeight : prop.bodyRadius;
  }

  if (shape.type === 'box') {
    return shape.halfExtents?.y ?? prop.bodyRadius;
  }

  if (shape.type === 'cylinder') {
    return Number.isFinite(shape.halfHeight)
      ? shape.halfHeight
      : Number.isFinite(shape.height)
        ? shape.height / 2
      : prop.bodyRadius;
  }

  if (shape.type === 'polygon_prism') {
    return Number.isFinite(shape.halfHeight) ? shape.halfHeight : prop.bodyRadius;
  }

  return shape.radius ?? prop.bodyRadius;
}

function getPropTopSupportHeight(prop, player) {
  if (prop.kind === 'rotting_log') {
    const radius = prop.visual?.radius ?? prop.collisionShape?.halfExtents?.y ?? prop.bodyRadius;
    return prop.position.y + radius + player.bodyRadius;
  }

  if (prop.kind === 'bamboo_stick') {
    const length = prop.visual?.length ?? prop.bodyRadius * 2;
    const radius = prop.visual?.radius ?? prop.bodyRadius;
    const tilt = prop.visual?.tilt ?? 0;
    return prop.position.y + (Math.cos(tilt) * length * 0.5) + radius + player.bodyRadius;
  }

  return prop.position.y + getPropShapeHalfHeight(prop) + player.bodyRadius;
}

function shouldSkipPlanarPropCollision(player, prop) {
  if (isVisualMeshCollisionShape(prop.collisionShape)) {
    return false;
  }

  if (!prop.climbable) {
    return false;
  }

  if (SUMMIT_CYLINDER_PROP_KINDS.has(prop.kind)) {
    return player.position.y >= getPropTopSupportHeight(prop, player) - PROP_SUPPORT_SNAP_DISTANCE;
  }

  if (FREE_CLIMB_PROP_KINDS.has(prop.kind)) {
    return true;
  }

  const shape = prop.collisionShape ?? { type: 'sphere', radius: prop.bodyRadius };
  return shape.type === 'sphere';
}

function getBoxTopSupport(player, prop) {
  const shape = prop.collisionShape ?? { type: 'sphere', radius: prop.bodyRadius };
  const halfExtents = shape.halfExtents ?? { x: prop.bodyRadius, y: prop.bodyRadius, z: prop.bodyRadius };
  const local = getYawLocalVector(player.position.clone().sub(prop.position), prop.rotationY ?? 0);
  const expandedX = (halfExtents.x ?? prop.bodyRadius) + player.bodyRadius;
  const expandedZ = (halfExtents.z ?? prop.bodyRadius) + player.bodyRadius;
  if (Math.abs(local.x) > expandedX + PROP_ADHESION_MARGIN || Math.abs(local.z) > expandedZ + PROP_ADHESION_MARGIN) {
    return null;
  }

  const topHeight = prop.position.y + (halfExtents.y ?? prop.bodyRadius) + player.bodyRadius;
  if (player.position.y > topHeight + PROP_SUPPORT_SNAP_DISTANCE) {
    return null;
  }

  return createPropSupport({
    prop,
    height: topHeight,
    normal: WORLD_UP,
    surfaceId: `prop:${prop.id}:box:top`,
    priority: topHeight
  });
}

function getPolygonPrismSupport(player, prop) {
  const shape = prop.collisionShape ?? {};
  const points = getPolygonPrismPoints(shape);
  if (points.length < 3) {
    return null;
  }

  const local = getYawLocalVector(player.position.clone().sub(prop.position), prop.rotationY ?? 0);
  if (!isPointInPolygon2D(local, points)) {
    return null;
  }

  const surfaceOffset = getGroundPatchSurfaceOffset(prop, local);
  const baseY = prop.position.y - getPropShapeHalfHeight(prop);
  const topHeight = baseY + surfaceOffset + player.bodyRadius;
  if (player.position.y > topHeight + PROP_SUPPORT_SNAP_DISTANCE) {
    return null;
  }

  return createPropSupport({
    prop,
    height: topHeight,
    normal: getYawWorldVector(getGroundPatchSupportNormal(prop, local), prop.rotationY ?? 0),
    surfaceId: `prop:${prop.id}:polygon:top`,
    priority: topHeight
  });
}

function getBoxSideClimbSupport(player, prop, movement, speed, delta, planarContact) {
  if (!planarContact) {
    return null;
  }

  const inwardAmount = getMovementInwardAmount(movement, planarContact.normal);
  const alreadyAttached = player.supportSurfaceId === `prop:${prop.id}:box:${planarContact.face}:${planarContact.normal.x || planarContact.normal.z}`;
  if (inwardAmount <= CLIMB_INWARD_INPUT_THRESHOLD && !alreadyAttached) {
    return null;
  }

  const shape = prop.collisionShape ?? { type: 'sphere', radius: prop.bodyRadius };
  const halfHeight = shape.halfExtents?.y ?? prop.bodyRadius;
  const minHeight = prop.position.y - halfHeight + player.bodyRadius;
  const maxHeight = prop.position.y + halfHeight + player.bodyRadius;
  const climbDelta = inwardAmount * speed * delta * PROP_CLIMB_SPEED_SCALE;
  const height = clamp(player.position.y + climbDelta, minHeight, maxHeight);

  return createPropSupport({
    prop,
    height,
    normal: planarContact.normal,
    surfaceId: `prop:${prop.id}:box:${planarContact.face}:${planarContact.normal.x || planarContact.normal.z}`,
    climb: true,
    priority: height + 5
  });
}

function getVerticalCylinderSupport(player, prop, movement, speed, delta, planarContact: any = null) {
  const shape = prop.collisionShape ?? { type: 'cylinder', radius: prop.bodyRadius, halfHeight: prop.bodyRadius };
  const radius = shape.radius ?? prop.bodyRadius;
  const halfHeight = Number.isFinite(shape.halfHeight)
    ? shape.halfHeight
    : Number.isFinite(shape.height)
      ? shape.height / 2
      : prop.bodyRadius;
  const deltaPosition = player.position.clone().sub(prop.position);
  const radialDistance = Math.hypot(deltaPosition.x, deltaPosition.z);
  const expandedRadius = radius + player.bodyRadius;
  const normal = radialDistance > TOP_DOWN_EPSILON
    ? new THREE.Vector3(deltaPosition.x / radialDistance, 0, deltaPosition.z / radialDistance)
    : planarContact?.normal?.clone() ?? new THREE.Vector3(1, 0, 0);
  const topHeight = prop.position.y + halfHeight + player.bodyRadius;
  const bottomHeight = prop.position.y - halfHeight + player.bodyRadius;

  if (radialDistance <= expandedRadius + PROP_ADHESION_MARGIN && player.position.y <= topHeight + PROP_SUPPORT_SNAP_DISTANCE) {
    const top = createPropSupport({
      prop,
      height: topHeight,
      normal: WORLD_UP,
      surfaceId: `prop:${prop.id}:cylinder:top`,
      priority: topHeight
    });
    if (player.position.y >= topHeight - PROP_SUPPORT_SNAP_DISTANCE || Math.abs(normal.y) > 0.5) {
      return top;
    }
  }

  if (radialDistance > expandedRadius + PROP_ADHESION_MARGIN) {
    return null;
  }

  const inwardAmount = getMovementInwardAmount(movement, normal);
  const surfaceId = `prop:${prop.id}:cylinder:side`;
  if (inwardAmount <= CLIMB_INWARD_INPUT_THRESHOLD && player.supportSurfaceId !== surfaceId) {
    return null;
  }

  const climbDelta = inwardAmount * speed * delta * PROP_CLIMB_SPEED_SCALE;
  const height = clamp(player.position.y + climbDelta, bottomHeight, topHeight);
  return createPropSupport({
    prop,
    height,
    normal,
    surfaceId,
    climb: true,
    priority: height + 5
  });
}

function getSphereSupport(player, prop) {
  const shape = prop.collisionShape ?? { type: 'sphere', radius: prop.bodyRadius };
  const radius = (shape.radius ?? prop.bodyRadius) + player.bodyRadius;
  const delta = player.position.clone().sub(prop.position);
  const planarDistance = Math.hypot(delta.x, delta.z);
  if (planarDistance > radius + PROP_ADHESION_MARGIN) {
    return null;
  }

  const verticalOffset = Math.sqrt(Math.max(0, (radius * radius) - (planarDistance * planarDistance)));
  const height = prop.position.y + verticalOffset;
  if (player.position.y > height + PROP_SUPPORT_SNAP_DISTANCE) {
    return null;
  }

  const normal = new THREE.Vector3(delta.x, verticalOffset, delta.z);
  if (normal.lengthSq() <= TOP_DOWN_EPSILON) {
    normal.copy(WORLD_UP);
  }

  return createPropSupport({
    prop,
    height,
    normal,
    surfaceId: `prop:${prop.id}:sphere`,
    priority: height
  });
}

function getVisualMeshSupport(player, prop, movement, speed, delta) {
  const contact = getVisualMeshContact(
    player,
    prop,
    player.bodyRadius + PROP_ADHESION_MARGIN + PROP_SUPPORT_SNAP_DISTANCE
  );
  if (!contact) {
    return null;
  }

  const normal = contact.worldNormal;
  const surfaceId = `prop:${prop.id}:mesh`;
  const supportHeight = contact.worldPoint.y + Math.max(0, normal.y) * player.bodyRadius;

  if (normal.y > 0.12) {
    if (player.position.y > supportHeight + PROP_SUPPORT_SNAP_DISTANCE) {
      return null;
    }

    return createPropSupport({
      prop,
      height: supportHeight,
      normal,
      surfaceId,
      priority: supportHeight + normal.y
    });
  }

  const inwardAmount = getMovementInwardAmount(movement, normal);
  if (inwardAmount <= CLIMB_INWARD_INPUT_THRESHOLD && player.supportSurfaceId !== surfaceId) {
    return null;
  }

  const climbDelta = inwardAmount * speed * delta * PROP_CLIMB_SPEED_SCALE;
  const minimumHeight = prop.position.y + contact.mesh.bounds.min.y + player.bodyRadius * 0.35;
  const maximumHeight = prop.position.y + contact.mesh.bounds.max.y + player.bodyRadius;
  const height = clamp(player.position.y + climbDelta, minimumHeight, maximumHeight);
  return createPropSupport({
    prop,
    height,
    normal,
    surfaceId,
    climb: true,
    priority: height + 5
  });
}

function getConeSupport(player, prop) {
  const shape = prop.collisionShape ?? { type: 'cylinder', radius: prop.bodyRadius, halfHeight: prop.bodyRadius };
  const radius = shape.radius ?? prop.visual?.radius ?? prop.bodyRadius;
  const halfHeight = getPropShapeHalfHeight(prop);
  const height = halfHeight * 2;
  const baseY = prop.position.y - halfHeight;
  const delta = player.position.clone().sub(prop.position);
  const planarDistance = Math.hypot(delta.x, delta.z);
  const expandedRadius = radius + player.bodyRadius;
  if (planarDistance > expandedRadius + PROP_ADHESION_MARGIN || player.position.y > baseY + height + player.bodyRadius + PROP_SUPPORT_SNAP_DISTANCE) {
    return null;
  }

  const surfaceRadius = Math.min(radius, planarDistance);
  const surfaceHeight = baseY + (height * Math.max(0, 1 - (surfaceRadius / Math.max(radius, TOP_DOWN_EPSILON))));
  const supportHeight = Math.max(baseY + player.bodyRadius, surfaceHeight + player.bodyRadius);
  const radialNormal = planarDistance > TOP_DOWN_EPSILON
    ? new THREE.Vector3(delta.x / planarDistance, 0, delta.z / planarDistance)
    : new THREE.Vector3(1, 0, 0);
  const sideSlope = height / Math.max(radius, TOP_DOWN_EPSILON);
  const normal = radialNormal.multiplyScalar(sideSlope).add(WORLD_UP).normalize();

  return createPropSupport({
    prop,
    height: supportHeight,
    normal,
    surfaceId: `prop:${prop.id}:cone`,
    priority: supportHeight + normal.y
  });
}

function getBambooStickSupport(player, prop) {
  const length = prop.visual?.length ?? (prop.collisionShape?.halfExtents?.y ?? prop.bodyRadius) * 2;
  const radius = (prop.visual?.radius ?? prop.bodyRadius) + player.bodyRadius;
  const tilt = prop.visual?.tilt ?? 0;
  const localAxis = new THREE.Vector3(-Math.sin(tilt), Math.cos(tilt), 0);
  const axis = getYawWorldVector(localAxis, prop.rotationY ?? 0).normalize();
  const delta = player.position.clone().sub(prop.position);
  const axisPlanar = new THREE.Vector3(axis.x, 0, axis.z);
  const deltaPlanar = new THREE.Vector3(delta.x, 0, delta.z);
  let along = 0;
  if (axisPlanar.lengthSq() > TOP_DOWN_EPSILON) {
    along = clamp(deltaPlanar.dot(axisPlanar) / axisPlanar.lengthSq(), -length / 2, length / 2);
  }

  const axisPoint = prop.position.clone().addScaledVector(axis, along);
  const planarOffset = player.position.clone().sub(axisPoint).setY(0);
  const planarDistance = planarOffset.length();
  if (planarDistance > radius + PROP_ADHESION_MARGIN) {
    return null;
  }

  const verticalOffset = Math.sqrt(Math.max(0, (radius * radius) - (planarDistance * planarDistance)));
  const height = axisPoint.y + verticalOffset;
  const normal = planarOffset.lengthSq() > TOP_DOWN_EPSILON
    ? planarOffset.normalize().multiplyScalar(Math.max(0.2, 1 - axis.y)).addScaledVector(WORLD_UP, verticalOffset / Math.max(radius, TOP_DOWN_EPSILON)).normalize()
    : WORLD_UP.clone();

  return createPropSupport({
    prop,
    height,
    normal,
    surfaceId: `prop:${prop.id}:stick`,
    priority: height + normal.y
  });
}

function getLogSupport(player, prop, movement, speed, delta) {
  const length = prop.visual?.length ?? (prop.collisionShape?.halfExtents?.x ?? prop.bodyRadius) * 2;
  const radius = prop.visual?.radius ?? prop.collisionShape?.halfExtents?.y ?? prop.bodyRadius;
  const expandedRadius = radius + player.bodyRadius;
  const halfLength = (length / 2) + player.bodyRadius;
  const local = getYawLocalVector(player.position.clone().sub(prop.position), prop.rotationY ?? 0);
  if (Math.abs(local.x) > halfLength + PROP_ADHESION_MARGIN || Math.abs(local.z) > expandedRadius + PROP_ADHESION_MARGIN) {
    return null;
  }

  const verticalOffset = Math.sqrt(Math.max(0, (expandedRadius * expandedRadius) - (local.z * local.z)));
  const height = prop.position.y + verticalOffset;
  const localNormal = new THREE.Vector3(0, verticalOffset, local.z);
  if (localNormal.lengthSq() <= TOP_DOWN_EPSILON) {
    localNormal.copy(WORLD_UP);
  }
  const normal = getYawWorldVector(localNormal.normalize(), prop.rotationY ?? 0);

  if (normal.y >= VERTICAL_SURFACE_MIN_UP_DOT) {
    if (player.position.y > height + PROP_SUPPORT_SNAP_DISTANCE) {
      return null;
    }

    return createPropSupport({
      prop,
      height,
      normal,
      surfaceId: `prop:${prop.id}:log:top`,
      priority: height + normal.y
    });
  }

  const inwardAmount = getMovementInwardAmount(movement, normal);
  const surfaceId = `prop:${prop.id}:log:side`;
  if (inwardAmount <= CLIMB_INWARD_INPUT_THRESHOLD && player.supportSurfaceId !== surfaceId) {
    return null;
  }

  return createPropSupport({
    prop,
    height: player.position.y + inwardAmount * speed * delta * PROP_CLIMB_SPEED_SCALE,
    normal,
    surfaceId,
    climb: true,
    priority: height + 5
  });
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

function canAnalyticStalkReachTarget(attacker, target) {
  const maximumReach = (
    attacker.bodyRadius +
    target.bodyRadius +
    (attacker.profile.stalkTotalLength * Math.max(1, attacker.profile.stalkReachMax)) +
    (attacker.profile.stalkSegmentRadius * STALK_EYE_RADIUS_SCALE) +
    0.5
  );

  return attacker.position.distanceToSquared(target.position) <= maximumReach * maximumReach;
}

function canAnalyticSampleHitTarget(sample, target) {
  const maximumDistance = target.bodyRadius + sample.radius + sample.length + 0.25;
  return sample.center.distanceToSquared(target.position) <= maximumDistance * maximumDistance;
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

  const serialized: any = {
    segmentRadius: stalk.segmentRadius,
    held: stalk.held,
    impactPower: stalk.impactPower,
    targetVector: cloneVector(stalk.targetVector),
    currentVector: cloneVector(stalk.currentVector),
    targetReach: stalk.targetReach,
    currentReach: stalk.currentReach,
    targetPoint: cloneVector(targetPoint),
    currentPoint: cloneVector(currentPoint),
    tipPosition: cloneVector(stalk.tipPosition),
    tipVelocity: cloneVector(stalk.tipVelocity),
    targetYaw: stalk.desiredYaw,
    targetPitch: stalk.desiredPitch
  };

  if (!ANALYTIC_STALK_AUTHORITY) {
    serialized.nodes = serializeNodes(stalk.nodes);
  }

  return serialized;
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

function serializeNetworkPlayer(player, { includeStatic = true } = {}) {
  const serialized = {
    slot: player.slot,
    connected: player.connected,
    position: cloneVector(player.position),
    rotationY: player.rotationY,
    health: player.health,
    onTrail: player.onTrail,
    grounded: player.grounded,
    supportKind: player.supportKind,
    supportNormal: cloneVector(player.supportNormal ?? WORLD_UP),
    lockOn: player.lockOnHeld,
    controlMode: player.controlMode,
    controlIntensity: player.controlIntensity,
    impactPower: player.impactPower,
    snailStats: cloneSnailStats(player.snailStats)
  };

  if (!includeStatic) {
    return serialized;
  }

  return {
    ...serialized,
    profileName: player.profileName,
    fixtureKind: player.fixtureKind ?? null,
    displayName: player.displayName ?? null,
    immortal: Boolean(player.immortal),
    collisionShape: cloneCollisionShape(player.collisionShape),
    maxHealth: player.maxHealth,
    groundHeight: player.profile.groundHeight
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
    supportNormal: WORLD_UP.clone(),
    supportKind: 'terrain',
    supportSurfaceId: null,
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
  participant: any = null
) {
  if (participant?.fixtureKind) {
    return createFixtureState(participant, terrainConfig);
  }

  const profile = profileTemplates[profileName] ?? profileTemplates.human;
  const startPoint = participant?.position
    ? {
      x: participant.position.x ?? 0,
      z: participant.position.z ?? 0
    }
    : getInitialStartPoint(slot);
  const initialRotation = Number.isFinite(participant?.rotationY)
    ? participant.rotationY
    : slot === 1 ? Math.PI : slot === 2 ? 0 : Math.atan2(-startPoint.x, -startPoint.z);
  const position = createInitialPosition(startPoint, terrainConfig, profile, initialRotation);
  const spawnDropHeight = getProfileSpawnDropHeight(profile);
  const stalks = Object.fromEntries(
    STALK_SIDE_KEYS.map((side) => [side, createStalkState(profile, position, initialRotation, side)])
  );
  const eyeTipPosition = stalks.left.tipPosition.clone().add(stalks.right.tipPosition).multiplyScalar(0.5);

  return {
    slot,
    profileName,
    displayName: participant?.displayName ?? null,
    startPoint: { x: startPoint.x, z: startPoint.z },
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
    baseMaxHealth: profile.maxHealth,
    snailStats: createEmptySnailStats(),
    onTrail: false,
    grounded: spawnDropHeight <= 0,
    supportNormal: WORLD_UP.clone(),
    supportKind: 'terrain',
    supportSurfaceId: null,
    verticalVelocity: 0,
    immortal: Boolean(participant?.immortal),
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
  player.baseMaxHealth = profile.maxHealth;
  const calcium = Math.max(0, Number(player.snailStats?.calcium) || 0);
  player.maxHealth = profile.maxHealth + calcium;
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

function applyArenaRadiusOverride(profileTemplates: any, arenaRadius: any) {
  if (!Number.isFinite(arenaRadius)) {
    return;
  }

  for (const profile of Object.values(profileTemplates) as any[]) {
    if (profile && Number.isFinite(profile.arenaRadius)) {
      profile.arenaRadius = arenaRadius;
    }
  }
}

export class MatchSimulation {
  declare tuningConfig: TuningConfig;
  declare creatures: any[];
  declare initialCreatureDescriptors: any[];
  declare wetTrailCells: Map<string, any>;
  declare arenaRadiusOverride: any;
  declare contactMemory: Map<string, any>;
  declare endReason: any;
  declare events: any[];
  declare inputs: Map<number, any>;
  declare mode: any;
  declare phase: any;
  declare players: Map<number, any>;
  declare profileTemplates: SimulationProfiles;
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

  restart() {
    const descriptors = Array.from(this.players.values()).map((player) => ({
      slot: player.slot,
      profile: player.profileName,
      connected: player.connected,
      fixtureKind: player.fixtureKind,
      displayName: player.displayName,
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
      trailCells: Array.from(this.wetTrailCells.values()).map((cell) => ({
        x: cell.x,
        z: cell.z
      })),
      creatures: this.creatures.map(serializeCreature),
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
          supportKind: player.supportKind,
          supportNormal: cloneVector(player.supportNormal ?? WORLD_UP),
          lockOn: player.lockOnHeld,
          controlMode: player.controlMode,
          controlIntensity: player.controlIntensity,
          impactPower: player.impactPower,
          snailStats: cloneSnailStats(player.snailStats),
          stalks: serializeStalks(player)
        }))
    };

    if (includeWorldProps) {
      snapshot.worldProps = this.worldProps.map(cloneWorldProp);
    }

    return snapshot;
  }

  getNetworkSnapshot({ includeStatic = true }: any = {}) {
    const snapshot: any = {
      tick: this.tick,
      phase: this.phase,
      winnerSlot: this.winnerSlot,
      reason: this.endReason,
      creatures: this.creatures.map(serializeCreature),
      events: this.events.map(cloneEvent),
      players: Array.from(this.players.values())
        .sort((left, right) => left.slot - right.slot)
        .map((player) => serializeNetworkPlayer(player, { includeStatic }))
    };

    if (includeStatic) {
      snapshot.terrain = { ...this.terrainConfig };
      snapshot.trailCellSize = this.trailCellSize;
      snapshot.trailCells = Array.from(this.wetTrailCells.values()).map((cell) => ({
        x: cell.x,
        z: cell.z
      }));
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
    if (this.phase !== 'running') {
      this.events = [];
      return this.getSnapshot(snapshotOptions);
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

    const playerSpatialIndex = createPlayerSpatialIndex(orderedPlayers);
    const stalkFidelity = createStalkFidelityMap(orderedPlayers);
    const maximumBodyRadius = getMaximumPlayerBodyRadius(orderedPlayers);
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
      const needsFullStalkObstacles = fidelity === 'full';
      const nearbyBodyPlayers = needsFullStalkObstacles
        ? queryPlayerSpatialIndex(
          playerSpatialIndex,
          player.position,
          getStalkObstacleBroadphaseRadius(player) + maximumBodyRadius
        )
        : [];
      const playerBodyObstacles = needsFullStalkObstacles ? createBodyObstacles(nearbyBodyPlayers) : [];
      const stalkPropObstacles = needsFullStalkObstacles
        ? createWorldPropObstacles(
          this.getNearbyWorldProps(player.position, getStalkObstacleBroadphaseRadius(player))
        )
        : [];
      this.updateStalkRopes(player, delta, [
        ...playerBodyObstacles,
        ...stalkPropObstacles
      ], { fidelity });
      player.bodyVelocity.copy(player.position).sub(player.previousPosition).divideScalar(Math.max(delta, 0.0001));
      updateCompositeTipState(player, delta);
      player.onTrail = player.health > 0 && this.isPlayerOnWetTrail(player);
    }

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

    this.updateCreatures(delta);
    this.evaluateEndState();
    this.tick += 1;
    return this.getSnapshot(snapshotOptions);
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

    if (this.mode === 'explorer') {
      const livingHumans = this.getLivingPlayers({ humansOnly: true });
      if (livingHumans.length > 0) {
        return;
      }

      const livingBots = this.getLivingPlayers().filter((player) => player.profileName === 'bot');
      this.endMatch(livingBots[0]?.slot ?? null, 'knockout');
      return;
    }

    if (this.mode === 'multiplayer_adventure_pve') {
      const livingHumans = this.getLivingPlayers({ humansOnly: true });
      const livingBots = this.getLivingPlayers().filter((player) => player.profileName === 'bot');
      if (livingHumans.length > 0 && livingBots.length > 0) {
        return;
      }

      if (livingHumans.length > 0) {
        this.endMatch(livingHumans[0].slot, 'knockout');
        return;
      }

      this.endMatch(livingBots[0]?.slot ?? null, livingBots.length > 0 ? 'knockout' : 'draw');
      return;
    }

    if (
      this.mode === 'multiplayer' ||
      this.mode === 'multiplayer_arena_pvp' ||
      this.mode === 'multiplayer_adventure_pvp'
    ) {
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
    const speed = baseSpeed *
      getSnailSpeedMultiplier(player.snailStats) *
      (this.isPlayerOnWetTrail(player) ? this.trailSpeedMultiplier : 1);
    player.position.addScaledVector(movement, speed * delta);
    this.clampPlanarPosition(player);
    const propContacts = this.resolveWorldPropCollision(player);
    this.collectNearbyPowerups(player);

    const terrainHeight = getPlayerGroundHeight(player, this.terrainConfig);
    const support = this.getBestWorldSupport(player, movement, speed, delta, propContacts);
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
      const useTerrainGrounding = this.applySupport(player, support, terrainHeight, speed, delta);

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

  updateStalkRopes(player, delta, bodyObstacles = [], options: any = {}) {
    if (ANALYTIC_STALK_AUTHORITY) {
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
      const stalkCollisionObstacles = filterStalkCollisionObstacles(
        stalk,
        rootWorld,
        goalWorld,
        fullFidelity ? collisionBodyObstacles : []
      );

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
        constraintIterations: fullFidelity ? player.profile.stalkConstraintIterations : 1,
        turgidity: stalk.held ? player.profile.stalkTurgidity : 0,
        collision: {
          terrainHeightAt,
          bodyObstacles: stalkCollisionObstacles,
          segmentRadius: stalk.segmentRadius,
          includeSegmentMidpoints: fullFidelity,
          iterations: fullFidelity ? undefined : 0
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

  getBestWorldSupport(player, movement, speed, delta, contacts = []) {
    const terrainHeight = getPlayerGroundHeight(player, this.terrainConfig);
    const terrainSupport = {
      kind: 'terrain',
      height: terrainHeight,
      normal: WORLD_UP.clone(),
      surfaceId: null,
      priority: terrainHeight
    };
    let bestSupport = terrainSupport;
    const waterSupport = getPlayerWaterSupport(player, this.terrainConfig);
    if (waterSupport && waterSupport.priority > bestSupport.priority) {
      bestSupport = waterSupport;
    }
    const contactByPropId = new Map(contacts.map((contact) => [contact.prop.id, contact]));

    const supportProps = this.getNearbyWorldProps(
      player.position,
      player.bodyRadius + PROP_SUPPORT_SNAP_DISTANCE + 30
    );

    for (const prop of supportProps) {
      if (!prop.climbable) {
        continue;
      }

      if (!player.grounded && player.verticalVelocity > 0.05) {
        continue;
      }

      const shape = prop.collisionShape ?? { type: 'sphere', radius: prop.bodyRadius };
      const planarContact = contactByPropId.get(prop.id)?.contact ?? null;
      let support = null;

      if (isVisualMeshCollisionShape(shape)) {
        support = getVisualMeshSupport(player, prop, movement, speed, delta);
      } else if (prop.kind === 'rotting_log' || prop.kind === 'root_branch' || prop.kind === 'twig' || prop.kind === 'fallen_branch') {
        support = getLogSupport(player, prop, movement, speed, delta);
      } else if (prop.kind === 'bamboo_stick') {
        support = getBambooStickSupport(player, prop);
      } else if (prop.kind === 'salt_cone' || prop.kind === 'rock_spire') {
        support = getConeSupport(player, prop);
      } else if (shape.type === 'polygon_prism') {
        support = getPolygonPrismSupport(player, prop);
      } else if (shape.type === 'box') {
        support = getBoxSideClimbSupport(player, prop, movement, speed, delta, planarContact) ??
          getBoxTopSupport(player, prop);
      } else if (shape.type === 'cylinder') {
        support = getVerticalCylinderSupport(player, prop, movement, speed, delta, planarContact);
      } else {
        support = getSphereSupport(player, prop);
      }

      if (!support || shouldDetachFromSurface(player, support, movement)) {
        continue;
      }

      if (support.priority > bestSupport.priority) {
        bestSupport = support;
      }
    }

    return bestSupport;
  }

  applySupport(player, support, terrainHeight, speed, delta) {
    const previousSurfaceId = player.supportSurfaceId;
    const previousKind = player.supportKind;
    const nextKind = support?.kind ?? 'terrain';
    const nextHeight = support?.height ?? terrainHeight;
    const nextNormal = support?.normal ?? WORLD_UP;
    const nextSurfaceId = support?.surfaceId ?? null;
    const wasPropSupported = previousKind === 'prop' && previousSurfaceId;
    const isPropSupported = nextKind === 'prop' && nextSurfaceId;
    const isWaterSupported = nextKind === 'water';

    if (!isPropSupported && !isWaterSupported && wasPropSupported && player.position.y > terrainHeight + 0.05) {
      player.grounded = false;
      player.verticalVelocity = Math.min(0, player.verticalVelocity);
      player.supportKind = 'air';
      player.supportSurfaceId = null;
      player.supportNormal.copy(WORLD_UP);
      return false;
    }

    if (isWaterSupported) {
      const bob = Math.sin((this.tick * 0.075) + player.slot) * 0.025;
      player.position.y = moveTowards(player.position.y, nextHeight + bob, Math.max(speed * 0.8 * delta, 0.03));
      player.grounded = true;
      player.verticalVelocity = 0;
      player.supportKind = 'water';
      player.supportSurfaceId = nextSurfaceId;
      player.supportNormal.copy(WORLD_UP);
      return false;
    }

    if (!isPropSupported) {
      player.supportKind = 'terrain';
      player.supportSurfaceId = null;
      player.supportNormal.copy(WORLD_UP);
      return true;
    }

    const ascendDelta = Math.max(speed * PROP_CLIMB_SPEED_SCALE * delta, 0.02);
    const descendDelta = Math.max(speed * PROP_CLIMB_DESCEND_SCALE * delta, ascendDelta);
    const maxDelta = nextHeight >= player.position.y ? ascendDelta : descendDelta;
    player.position.y = moveTowards(player.position.y, nextHeight, maxDelta);
    player.grounded = true;
    player.verticalVelocity = 0;
    player.supportKind = 'prop';
    player.supportSurfaceId = nextSurfaceId;
    player.supportNormal.copy(nextNormal);
    return false;
  }

  resolveWorldPropCollision(player) {
    if (!player.connected || player.health <= 0 || player.fixtureKind || this.worldProps.length === 0) {
      return [];
    }

    const contacts = [];

    for (let pass = 0; pass < 3; pass += 1) {
      let moved = false;

      const collisionProps = this.getNearbyWorldProps(player.position, player.bodyRadius + 30);

      for (const prop of collisionProps) {
        if (!prop.blocking) {
          continue;
        }

        if (shouldSkipPlanarPropCollision(player, prop)) {
          continue;
        }

        const shape = prop.collisionShape ?? { type: 'sphere', radius: prop.bodyRadius };

        if (isVisualMeshCollisionShape(shape)) {
          const contact = getVisualMeshPlanarContact(player, prop);
          if (!contact) {
            continue;
          }

          player.position.x += contact.correction.x;
          player.position.z += contact.correction.z;
          contacts.push({ prop, contact });
          moved = true;
          continue;
        }

        if (shape.type === 'box') {
          const contact = getRotatedBoxPlanarContact(player, prop);
          if (!contact) {
            continue;
          }

          player.position.x += contact.correction.x;
          player.position.z += contact.correction.z;
          contacts.push({ prop, contact });
          moved = true;
          continue;
        }

        const contact = getCylinderPlanarContact(player, prop);
        if (!contact) {
          continue;
        }

        player.position.x += contact.correction.x;
        player.position.z += contact.correction.z;
        contacts.push({ prop, contact });
        moved = true;
      }

      if (!moved) {
        break;
      }

      this.clampPlanarPosition(player);
    }

    return contacts;
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

  applyPowerupToPlayer(player, powerup, prop) {
    if (!player.snailStats) {
      player.snailStats = createEmptySnailStats();
    }

    const amount = Math.max(0, Number(powerup.amount) || 0);
    player.snailStats.pickups += 1;

    switch (powerup.type) {
      case 'dew':
        player.snailStats.dew += amount;
        break;
      case 'food':
        player.snailStats.food += amount;
        player.health = Math.min(player.maxHealth, player.health + amount);
        break;
      case 'calcium':
        player.snailStats.calcium += amount;
        player.maxHealth = (player.baseMaxHealth ?? player.profile.maxHealth) + player.snailStats.calcium;
        player.health = Math.min(player.maxHealth, player.health + amount * 0.65);
        break;
      case 'grit':
        player.snailStats.grit += amount;
        break;
    }

    updateSnailStatDerivedValues(player.snailStats);
    const burstPosition = cloneVector(prop.position);
    burstPosition.y = Math.max(
      burstPosition.y + Math.max(1, (prop.bodyRadius ?? 0) * 0.65),
      player.position.y + Math.max(1.6, player.bodyRadius * 1.2)
    );
    this.events.push({
      id: `${this.tick}:powerup:${player.slot}:${prop.id}`,
      type: 'powerup',
      tick: this.tick,
      playerSlot: player.slot,
      propId: prop.id,
      powerupType: powerup.type,
      amount,
      label: powerup.label,
      position: burstPosition
    });
  }

  collectNearbyPowerups(player) {
    if (!player.connected || player.health <= 0 || player.fixtureKind) {
      return;
    }

    const candidates = this.getNearbyWorldProps(player.position, player.bodyRadius + WORLD_PROP_PICKUP_DISTANCE + 8);
    for (const prop of candidates) {
      const powerup = getPowerupForProp(prop);
      if (!powerup) {
        continue;
      }

      const distance = Math.hypot(
        player.position.x - prop.position.x,
        player.position.z - prop.position.z
      );
      const pickupDistance = player.bodyRadius + prop.bodyRadius + WORLD_PROP_PICKUP_DISTANCE;
      if (distance > pickupDistance) {
        continue;
      }

      const removed = this.removeWorldPropById(prop.id);
      if (!removed) {
        continue;
      }

      this.applyPowerupToPlayer(player, powerup, removed);
      break;
    }
  }

  grantPowerupToSlot(slot, type, amount = 1, label = null) {
    if (!SNAIL_POWERUP_TYPES.includes(type)) {
      return false;
    }

    const player = this.players.get(slot);
    if (!player || !player.connected || player.health <= 0 || player.fixtureKind) {
      return false;
    }

    const safeAmount = Math.max(0, Number(amount) || 0);
    const debugIndex = (player.snailStats?.pickups ?? 0) + 1;
    this.applyPowerupToPlayer(player, {
      type,
      amount: safeAmount,
      label: label ?? SNAIL_POWERUP_LABELS[type] ?? type
    }, {
      id: `debug-${type}-${slot}-${this.tick}-${debugIndex}`,
      position: cloneVector(player.position),
      bodyRadius: player.bodyRadius
    });
    return true;
  }

  resolveWorldPropInteraction(player) {
    if (!player.connected || player.health <= 0 || player.fixtureKind) {
      return;
    }

    let nearestLog = null;
    let nearestDistance = Infinity;
    const interactionProps = this.getNearbyWorldProps(
      player.position,
      WORLD_PROP_INTERACTION_DISTANCE + player.bodyRadius + 12
    );

    for (const prop of interactionProps) {
      if (prop.interactionKind !== 'rotting_log') {
        continue;
      }

      const distance = Math.hypot(
        player.position.x - prop.position.x,
        player.position.z - prop.position.z
      );
      const interactionDistance = WORLD_PROP_INTERACTION_DISTANCE + player.bodyRadius + prop.bodyRadius;
      if (distance < interactionDistance && distance < nearestDistance) {
        nearestLog = prop;
        nearestDistance = distance;
      }
    }

    if (!nearestLog) {
      return;
    }

    this.events.push({
      id: `${this.tick}:nibble:${player.slot}:${nearestLog.id}`,
      type: 'log_nibble',
      tick: this.tick,
      playerSlot: player.slot,
      propId: nearestLog.id,
      position: cloneVector(nearestLog.position)
    });
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

  applyImpactKnockback(target, knockback, delta) {
    if (
      !target ||
      target.staticBody ||
      target.fixtureKind ||
      knockback.lengthSq() <= TOP_DOWN_EPSILON
    ) {
      return;
    }

    const safeDelta = Math.max(delta, 0.0001);
    const originalPosition = target.position.clone();
    const hasVerticalLift = knockback.y > TOP_DOWN_EPSILON;

    target.position.add(knockback);
    this.clampPlanarPosition(target);
    this.resolveWorldPropCollision(target);

    if (hasVerticalLift) {
      target.grounded = false;
      target.supportKind = 'air';
      target.supportSurfaceId = null;
      target.supportNormal.copy(WORLD_UP);
      target.verticalVelocity = Math.max(
        target.verticalVelocity,
        clamp(
          knockback.y / safeDelta * KNOCKBACK_VERTICAL_VELOCITY_SCALE,
          0,
          MAX_KNOCKBACK_VERTICAL_VELOCITY
        )
      );
    } else if (target.grounded && target.supportKind === 'terrain') {
      target.position.y = getPlayerGroundHeight(target, this.terrainConfig);
    } else if (!target.grounded && Math.abs(knockback.y) > TOP_DOWN_EPSILON) {
      target.verticalVelocity = clamp(
        target.verticalVelocity + (knockback.y / safeDelta * KNOCKBACK_VERTICAL_VELOCITY_SCALE),
        -MAX_KNOCKBACK_VERTICAL_VELOCITY,
        MAX_KNOCKBACK_VERTICAL_VELOCITY
      );
    }

    const appliedDisplacement = target.position.clone().sub(originalPosition);
    if (appliedDisplacement.lengthSq() <= TOP_DOWN_EPSILON) {
      return;
    }

    translatePlayerAttachments(target, appliedDisplacement);
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

    if (ANALYTIC_STALK_AUTHORITY && !canAnalyticStalkReachTarget(attacker, target)) {
      return;
    }

    let totalDamage = 0;
    let strongestImpact = attacker.impactPower;
    const pendingDamageEvents = [];

    for (const [side, stalk] of getStalkEntries(attacker)) {
      const eyeRadius = (stalk.segmentRadius ?? STALK_SEGMENT_RADIUS) * STALK_EYE_RADIUS_SCALE;
      const eyeSamples = ANALYTIC_STALK_AUTHORITY
        ? (stalk.impactSamples ?? [getAnalyticStalkSample(stalk, delta, eyeRadius)])
        : buildStalkEyeSamples(
          stalk.incidentNodes ?? stalk.nodes,
          stalk.incidentPreviousNodes ?? stalk.previousNodes,
          delta,
          eyeRadius
        );

      if (ANALYTIC_STALK_AUTHORITY && !eyeSamples.some((sample) => canAnalyticSampleHitTarget(sample, target))) {
        continue;
      }

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
          damageDetails.bashDamage >= MIN_DAMAGE_EVENT_AMOUNT
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

    const totalKnockback = new THREE.Vector3();
    let remainingVisibleDamage = appliedDamage;
    for (const pendingEvent of pendingDamageEvents) {
      if (pendingEvent.damageDetails.knockback) {
        totalKnockback.add(pendingEvent.damageDetails.knockback);
      }

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

    this.applyImpactKnockback(target, totalKnockback, delta);
  }
}

export function createIdleInput(): PlayerInput {
  return { ...DEFAULT_INPUT };
}

export function normalizePlayerInput(input: Partial<PlayerInput> = {}): PlayerInput {
  return normalizeInput(input);
}
