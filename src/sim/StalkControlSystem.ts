import * as THREE from 'three';

import {
  STALK_HEMISPHERE_FORWARD_TILT,
  STALK_ROOT_OFFSETS,
  STALK_SEGMENT_RADIUS,
  cloneNodeArray,
  createInitialStalkNodes,
  getLocalStalkDirection,
  getStalkGoalWorldPositionFromDirection,
  getStalkRootWorldPosition,
  getTipWorldPosition,
  serializeNodes
} from './StalkRope.js';

export const STALK_SIDE_KEYS = ['left', 'right'] as const;
export type StalkSide = typeof STALK_SIDE_KEYS[number];

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
const STALK_CONTROL_EPSILON = 0.000001;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function angleDifference(current: number, target: number) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function lerpAngle(current: number, target: number, alpha: number) {
  return current + angleDifference(current, target) * alpha;
}

function cloneVector(vector: { x: number; y: number; z: number }) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function clampReticleToDisk(x: number, y: number, radius = 0.995) {
  const length = Math.hypot(x, y);
  if (length <= radius) {
    return { x, y };
  }

  return {
    x: (x / length) * radius,
    y: (y / length) * radius
  };
}

export function clampLocalStalkDirection(vector: THREE.Vector3) {
  const normalized = vector.clone();
  if (normalized.lengthSq() < STALK_CONTROL_EPSILON) {
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

function createDirectionFromReticle(reticleX: number, reticleY: number) {
  const reticle = clampReticleToDisk(reticleX, reticleY);
  const z = Math.sqrt(Math.max(0, 1 - (reticle.x * reticle.x) - (reticle.y * reticle.y)));
  const direction = clampLocalStalkDirection(new THREE.Vector3(reticle.x, reticle.y, z));
  return {
    direction,
    reticleX: direction.x,
    reticleY: direction.y
  };
}

function getYawPitchFromLocalDirection(direction: THREE.Vector3, profile: any) {
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

function setStalkDesiredDirection(stalk: any, direction: THREE.Vector3, profile: any = null) {
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

function setStalkDesiredReach(stalk: any, nextReach: number, profile: any) {
  stalk.desiredReach = clamp(
    nextReach,
    profile.stalkReachMin,
    profile.stalkReachMax
  );
  stalk.targetReach = stalk.desiredReach;
}

function applyReachInput(stalk: any, input: any, profile: any) {
  if (input.reachDelta === 0) {
    return;
  }

  setStalkDesiredReach(
    stalk,
    stalk.desiredReach + input.reachDelta * profile.stalkReachSensitivity,
    profile
  );
}

function syncYawPitchFromDesiredDirection(stalk: any, profile: any) {
  const angles = getYawPitchFromLocalDirection(stalk.desiredVector, profile);
  stalk.desiredYaw = angles.yaw;
  stalk.desiredPitch = angles.pitch;
  stalk.appliedYaw = stalk.desiredYaw;
  stalk.appliedPitch = stalk.desiredPitch;
}

export function syncYawPitchFromAppliedDirection(stalk: any, profile: any) {
  const angles = getYawPitchFromLocalDirection(stalk.appliedVector, profile);
  stalk.appliedYaw = angles.yaw;
  stalk.appliedPitch = angles.pitch;
}

function getTopDownPlanePoint(stalk: any) {
  return {
    x: Number.isFinite(stalk.planeX) ? stalk.planeX : stalk.desiredVector.x * stalk.desiredReach,
    y: Number.isFinite(stalk.planeY) ? stalk.planeY : stalk.desiredVector.y * stalk.desiredReach,
    z: Number.isFinite(stalk.planeZ)
      ? stalk.planeZ
      : Math.max(TOP_DOWN_MIN_FORWARD, stalk.desiredVector.z * stalk.desiredReach)
  };
}

export function setTopDownPlaneTarget(stalk: any, planeX: number, planeY: number, planeZ: number, profile: any) {
  let nextX = Number.isFinite(planeX) ? planeX : 0;
  let nextY = Number.isFinite(planeY) ? planeY : 0;
  let nextZ = Number.isFinite(planeZ) ? planeZ : 1;

  nextZ = Math.max(TOP_DOWN_MIN_FORWARD, nextZ);

  const maxReach = Math.max(profile.stalkReachMin, profile.stalkReachMax);
  const maxVertical = Math.sqrt(Math.max(0, (maxReach * maxReach) - (TOP_DOWN_MIN_FORWARD * TOP_DOWN_MIN_FORWARD)));
  nextY = clamp(nextY, -maxVertical, maxVertical);

  let planarRadius = Math.hypot(nextX, nextZ);
  if (planarRadius < STALK_CONTROL_EPSILON) {
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
    if (planarRadius < STALK_CONTROL_EPSILON) {
      nextX = 0;
      nextZ = minPlanarRadius;
    } else {
      const scale = minPlanarRadius / planarRadius;
      nextX *= scale;
      nextZ *= scale;
    }
    planarRadius = Math.hypot(nextX, nextZ);
  }

  const radius = Math.max(STALK_CONTROL_EPSILON, Math.hypot(nextX, nextY, nextZ));
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

function applyTopDownPlaneControl(stalk: any, input: any, profile: any) {
  const current = getTopDownPlanePoint(stalk);

  setTopDownPlaneTarget(
    stalk,
    current.x + (-input.lookX * profile.stalkYawSensitivity),
    current.y + (input.reachDelta * profile.stalkReachSensitivity),
    current.z + (-input.lookY * profile.stalkPitchSensitivity),
    profile
  );
}

function rotateVectorToward(current: THREE.Vector3, target: THREE.Vector3, maxAngle: number) {
  const from = clampLocalStalkDirection(current);
  const to = clampLocalStalkDirection(target);
  const dot = clamp(from.dot(to), -1, 1);
  const angle = Math.acos(dot);
  if (angle <= maxAngle || angle < STALK_CONTROL_EPSILON) {
    return to;
  }

  const axis = from.clone().cross(to);
  if (axis.lengthSq() < STALK_CONTROL_EPSILON) {
    return clampLocalStalkDirection(from.lerp(to, maxAngle / angle));
  }

  return clampLocalStalkDirection(from.applyAxisAngle(axis.normalize(), maxAngle));
}

export function advanceAppliedStalkTarget(stalk: any, profile: any, delta: number) {
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

function applyAbsoluteDomeControl(stalk: any, input: any, profile: any) {
  const reticle = createDirectionFromReticle(
    stalk.reticleX + (-input.lookX * profile.stalkYawSensitivity),
    stalk.reticleY + (input.lookY * profile.stalkPitchSensitivity)
  );

  stalk.reticleX = reticle.reticleX;
  stalk.reticleY = reticle.reticleY;
  setStalkDesiredDirection(stalk, reticle.direction, profile);
}

function applySpringDomeControl(stalk: any, input: any, profile: any, delta: number) {
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

function applyTrackballControl(stalk: any, input: any, profile: any) {
  const horizontal = -input.lookX * profile.stalkYawSensitivity;
  const vertical = input.lookY * profile.stalkPitchSensitivity;
  const angle = Math.hypot(horizontal, vertical);
  if (angle === 0) {
    return;
  }

  const axis = new THREE.Vector3(-vertical, horizontal, 0);
  if (axis.lengthSq() < STALK_CONTROL_EPSILON) {
    return;
  }

  setStalkDesiredDirection(
    stalk,
    stalk.desiredVector.clone().applyAxisAngle(axis.normalize(), angle),
    profile
  );
}

function applyTangentVelocityControl(stalk: any, input: any, profile: any) {
  const horizontal = -input.lookX * profile.stalkYawSensitivity;
  const vertical = input.lookY * profile.stalkPitchSensitivity;
  if (horizontal === 0 && vertical === 0) {
    return;
  }

  const current = stalk.desiredVector.clone().normalize();
  const tangentX = STALK_SCREEN_X.clone().addScaledVector(current, -STALK_SCREEN_X.dot(current));
  const tangentY = STALK_SCREEN_Y.clone().addScaledVector(current, -STALK_SCREEN_Y.dot(current));
  if (tangentX.lengthSq() > STALK_CONTROL_EPSILON) {
    tangentX.normalize();
  }
  if (tangentY.lengthSq() > STALK_CONTROL_EPSILON) {
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

export function getControlMode(input: any) {
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

export function createStalkState(profile: any, position: THREE.Vector3, rotationY: number, side: StalkSide) {
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

export function getStalkEntries(player: any): Array<[StalkSide, any]> {
  if (!player.stalks) {
    return [];
  }

  return STALK_SIDE_KEYS.map((side) => [side, player.stalks[side]]);
}

function translateStalkPositionArray(nodes: THREE.Vector3[] | undefined, displacement: THREE.Vector3) {
  if (!Array.isArray(nodes)) {
    return;
  }

  for (const node of nodes) {
    node.add(displacement);
  }
}

export function translatePlayerAttachments(player: any, displacement: THREE.Vector3) {
  if (displacement.lengthSq() <= STALK_CONTROL_EPSILON) {
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

function getCompositeTipPosition(player: any) {
  if (!player.stalks) {
    return player.position.clone();
  }

  const left = player.stalks.left.tipPosition;
  const right = player.stalks.right.tipPosition;
  return left.clone().add(right).multiplyScalar(0.5);
}

export function updateCompositeTipState(player: any, delta: number) {
  const nextEyeTipPosition = getCompositeTipPosition(player);
  if (delta > 0) {
    player.eyeTipVelocity.copy(nextEyeTipPosition).sub(player.eyeTipPosition).divideScalar(delta);
  } else {
    player.eyeTipVelocity.set(0, 0, 0);
  }

  player.previousEyeTipPosition.copy(player.eyeTipPosition);
  player.eyeTipPosition.copy(nextEyeTipPosition);
}

function serializeStalk(stalk: any, { includeNodes = true } = {}) {
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

  if (includeNodes) {
    serialized.nodes = serializeNodes(stalk.nodes);
  }

  return serialized;
}

export function serializeStalks(player: any, { includeNodes = true } = {}) {
  if (!player.stalks) {
    return null;
  }

  return {
    left: serializeStalk(player.stalks.left, { includeNodes }),
    right: serializeStalk(player.stalks.right, { includeNodes })
  };
}

export function applyProfileToStalks(player: any, profile: any) {
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

export function applyCombatInputToPlayer(player: any, input: any, delta: number, lookIntensityScale = 18) {
  player.controlMode = getControlMode(input);
  player.controlIntensity = (input.leftHeld || input.rightHeld)
    ? Math.min(1, Math.hypot(input.lookX, input.lookY) / lookIntensityScale)
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
