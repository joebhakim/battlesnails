import * as THREE from 'three';

export const STALK_BASE_OFFSET = new THREE.Vector3(0.65, 0.55, 1.5);
export const STALK_ROOT_OFFSETS = Object.freeze({
  left: new THREE.Vector3(-STALK_BASE_OFFSET.x, STALK_BASE_OFFSET.y, STALK_BASE_OFFSET.z),
  right: STALK_BASE_OFFSET.clone()
});
export const STALK_SEGMENT_COUNT = 6;
export const STALK_TOTAL_LENGTH = 3.3;
export const STALK_SEGMENT_LENGTH = STALK_TOTAL_LENGTH / STALK_SEGMENT_COUNT;
export const STALK_SEGMENT_RADIUS = 0.18;
export const STALK_CONSTRAINT_ITERATIONS = 3;
export const STALK_GRAVITY = 34;
export const STALK_DAMPING = 0.96;
export const STALK_ACTIVE_PULL = 10;
export const STALK_IDLE_PULL = 4;
export const STALK_HEMISPHERE_FORWARD_TILT = 1.42;
export const STALK_EYE_RADIUS_SCALE = 1.35;
export const STALK_SELF_ROOT_GRACE_SEGMENTS = 1;
export const STALK_EYE_BOUNCE_RESTITUTION = 0.55;
export const STALK_EYE_BOUNCE_TANGENT_DAMPING = 0.18;

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const LOCAL_UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Vector3();
const COLLISION_EPSILON = 0.000001;
const DEFAULT_COLLISION_ITERATIONS = 2;
const TERRAIN_NORMAL_STEP = 0.05;

function createWorldRoot(position, rotationY, rootOffset = STALK_BASE_OFFSET) {
  const bodyQuaternion = new THREE.Quaternion().setFromAxisAngle(UP, rotationY);
  return rootOffset.clone().applyQuaternion(bodyQuaternion).add(position);
}

export function getLocalStalkDirection(yaw, pitch) {
  const localQuaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(pitch + STALK_HEMISPHERE_FORWARD_TILT, 0, -yaw, 'XYZ')
  );

  return LOCAL_UP.clone()
    .applyQuaternion(localQuaternion)
    .normalize();
}

export function getStalkGoalDirection(rotationY, yaw, pitch) {
  const bodyQuaternion = new THREE.Quaternion().setFromAxisAngle(UP, rotationY);
  return getLocalStalkDirection(yaw, pitch)
    .applyQuaternion(bodyQuaternion)
    .normalize();
}

export function getBodyLocalDirection(worldDirection, rotationY) {
  return worldDirection.clone()
    .applyAxisAngle(UP, -rotationY)
    .normalize();
}

export function getStalkRootWorldPosition(position, rotationY, rootOffset = STALK_BASE_OFFSET) {
  return createWorldRoot(position, rotationY, rootOffset);
}

export function getStalkGoalWorldPosition(
  position,
  rotationY,
  yaw,
  pitch,
  totalLength = STALK_TOTAL_LENGTH,
  rootOffset = STALK_BASE_OFFSET
) {
  const rootWorld = createWorldRoot(position, rotationY, rootOffset);
  const goalDirection = getStalkGoalDirection(rotationY, yaw, pitch);
  return rootWorld.addScaledVector(goalDirection, totalLength);
}

export function getStalkGoalWorldPositionFromDirection(
  position,
  rotationY,
  localDirection,
  totalLength = STALK_TOTAL_LENGTH,
  rootOffset = STALK_BASE_OFFSET
) {
  const rootWorld = createWorldRoot(position, rotationY, rootOffset);
  const bodyQuaternion = new THREE.Quaternion().setFromAxisAngle(UP, rotationY);
  const goalDirection = localDirection.clone()
    .normalize()
    .applyQuaternion(bodyQuaternion)
    .normalize();
  return rootWorld.addScaledVector(goalDirection, totalLength);
}

function applyTurgidityToNodes(nodes, previousNodes, rootWorld, goalWorld, turgidity) {
  const alpha = Math.min(1, Math.max(0, turgidity));
  if (alpha <= 0 || nodes.length <= 1) {
    return;
  }

  for (let index = 0; index < nodes.length; index += 1) {
    const target = rootWorld.clone().lerp(goalWorld, index / (nodes.length - 1));
    nodes[index].lerp(target, alpha);
    previousNodes[index]?.lerp(nodes[index], alpha);
  }

  nodes[0].copy(rootWorld);
  previousNodes[0]?.copy(rootWorld);
}

export function createInitialStalkNodes(
  rootWorld,
  goalWorld,
  segmentCount = STALK_SEGMENT_COUNT
) {
  const nodes = [];

  for (let index = 0; index <= segmentCount; index += 1) {
    const alpha = index / segmentCount;
    nodes.push(rootWorld.clone().lerp(goalWorld, alpha));
  }

  return nodes;
}

export function cloneNodeArray(nodes) {
  return nodes.map((node) => node.clone());
}

export function copyNodesInto(targetNodes, sourceNodes) {
  targetNodes.length = sourceNodes.length;

  for (let index = 0; index < sourceNodes.length; index += 1) {
    const source = sourceNodes[index];
    if (!targetNodes[index]) {
      targetNodes[index] = source.clone();
      continue;
    }

    targetNodes[index].copy(source);
  }
}

export function serializeNodes(nodes) {
  return nodes.map((node) => ({
    x: node.x,
    y: node.y,
    z: node.z
  }));
}

export function deserializeNodes(serializedNodes = []) {
  return serializedNodes.map((node) => new THREE.Vector3(node.x, node.y, node.z));
}

export function getTipWorldPosition(nodes) {
  return nodes[nodes.length - 1]?.clone() ?? ZERO.clone();
}

function getNodeCollisionRadius(index, nodeCount, segmentRadius, eyeRadius) {
  return index === nodeCount - 1 ? eyeRadius : segmentRadius;
}

function createCollisionScratch() {
  return {
    correction: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    midpoint: new THREE.Vector3(),
    segmentCorrection: new THREE.Vector3(),
    incident: new THREE.Vector3(),
    reflected: new THREE.Vector3()
  };
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function reflectIncidentVector(
  incident,
  normal,
  restitution = 1,
  tangentDamping = 0
) {
  const reflected = incident.clone();
  if (!normal || normal.lengthSq() <= COLLISION_EPSILON) {
    return reflected;
  }

  const collisionNormal = normal.clone().normalize();
  const normalSpeed = incident.dot(collisionNormal);
  const normalComponent = collisionNormal.clone().multiplyScalar(normalSpeed);
  const tangentComponent = incident.clone()
    .sub(normalComponent)
    .multiplyScalar(1 - clamp01(tangentDamping));

  return tangentComponent.addScaledVector(
    collisionNormal,
    -normalSpeed * Math.max(0, restitution)
  );
}

function moveNode(nodes, previousNodes, index, correction, bounce = null) {
  if (index <= 0 || !nodes[index]) {
    return false;
  }

  const node = nodes[index];
  const previous = previousNodes[index];
  if (bounce?.enabled && previous) {
    bounce.scratch.incident.copy(node).sub(previous);
    node.add(correction);

    if (
      bounce.scratch.incident.dot(bounce.normal) < -COLLISION_EPSILON &&
      bounce.scratch.incident.lengthSq() > COLLISION_EPSILON
    ) {
      bounce.scratch.reflected.copy(reflectIncidentVector(
        bounce.scratch.incident,
        bounce.normal,
        bounce.restitution,
        bounce.tangentDamping
      ));
      previous.copy(node).sub(bounce.scratch.reflected);
    } else {
      previous.copy(node).sub(bounce.scratch.incident);
    }

    return true;
  }

  nodes[index].add(correction);
  previousNodes[index]?.add(correction);
  return true;
}

function moveSegment(nodes, previousNodes, segmentIndex, correction, scratch, firstMovableNodeIndex = 1) {
  const startIndex = segmentIndex;
  const endIndex = segmentIndex + 1;
  const canMoveStart = startIndex >= firstMovableNodeIndex;
  const canMoveEnd = endIndex >= firstMovableNodeIndex;

  if (!nodes[endIndex] || (!canMoveStart && !canMoveEnd)) {
    return false;
  }

  if (!canMoveStart || !canMoveEnd) {
    const movableIndex = canMoveStart ? startIndex : endIndex;
    scratch.segmentCorrection.copy(correction).multiplyScalar(2);
    return moveNode(nodes, previousNodes, movableIndex, scratch.segmentCorrection);
  }

  scratch.segmentCorrection.copy(correction);
  const movedStart = moveNode(nodes, previousNodes, startIndex, scratch.segmentCorrection);
  const movedEnd = moveNode(nodes, previousNodes, endIndex, scratch.segmentCorrection);
  return movedStart || movedEnd;
}

function getBodyObstaclePosition(obstacle) {
  return obstacle?.position ?? obstacle?.center ?? null;
}

function getObstacleShape(obstacle) {
  return obstacle?.shape ?? obstacle?.collisionShape ?? { type: 'sphere' };
}

function getShapeVector(shape, key, fallback) {
  const value = shape?.[key] ?? fallback;
  return {
    x: Number.isFinite(value?.x) ? value.x : fallback.x,
    y: Number.isFinite(value?.y) ? value.y : fallback.y,
    z: Number.isFinite(value?.z) ? value.z : fallback.z
  };
}

function isBodyObstacleUsable(obstacle) {
  const position = getBodyObstaclePosition(obstacle);
  const shape = getObstacleShape(obstacle);
  const hasUsableShape = shape.type === 'box'
    ? Boolean(shape.halfExtents)
    : shape.type === 'cylinder'
      ? Number.isFinite(shape.radius) && shape.radius > 0
      : Number.isFinite(obstacle.radius) && obstacle.radius > 0;

  return Boolean(
    position &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    Number.isFinite(position.z) &&
    hasUsableShape
  );
}

function setTerrainNormal(point, terrainHeightAt, normal) {
  if (!normal || !terrainHeightAt) {
    return;
  }

  const left = terrainHeightAt(point.x - TERRAIN_NORMAL_STEP, point.z);
  const right = terrainHeightAt(point.x + TERRAIN_NORMAL_STEP, point.z);
  const back = terrainHeightAt(point.x, point.z - TERRAIN_NORMAL_STEP);
  const forward = terrainHeightAt(point.x, point.z + TERRAIN_NORMAL_STEP);

  if (
    Number.isFinite(left) &&
    Number.isFinite(right) &&
    Number.isFinite(back) &&
    Number.isFinite(forward)
  ) {
    normal
      .set(
        -(right - left) / (2 * TERRAIN_NORMAL_STEP),
        1,
        -(forward - back) / (2 * TERRAIN_NORMAL_STEP)
      )
      .normalize();
    return;
  }

  normal.copy(UP);
}

function setTerrainCorrection(point, radius, terrainHeightAt, correction, normal = null) {
  if (!terrainHeightAt) {
    return false;
  }

  const terrainHeight = terrainHeightAt(point.x, point.z);
  if (!Number.isFinite(terrainHeight)) {
    return false;
  }

  const minimumY = terrainHeight + radius;
  if (point.y >= minimumY) {
    return false;
  }

  correction.set(0, minimumY - point.y, 0);
  setTerrainNormal(point, terrainHeightAt, normal);
  return true;
}

function setSphereBodyCorrection(point, radius, obstacle, rootWorld, correction, normal = null) {
  const position = getBodyObstaclePosition(obstacle);
  const minimumDistance = obstacle.radius + radius;
  const x = point.x - position.x;
  const y = point.y - position.y;
  const z = point.z - position.z;
  const distanceSquared = (x * x) + (y * y) + (z * z);

  if (distanceSquared >= minimumDistance * minimumDistance) {
    return false;
  }

  if (distanceSquared <= COLLISION_EPSILON) {
    correction.copy(rootWorld).sub(position);
    if (correction.lengthSq() <= COLLISION_EPSILON) {
      correction.copy(FORWARD);
    } else {
      correction.normalize();
    }
    normal?.copy(correction);
    correction.multiplyScalar(minimumDistance);
    return true;
  }

  const distance = Math.sqrt(distanceSquared);
  const correctionScale = (minimumDistance - distance) / distance;
  correction.set(x * correctionScale, y * correctionScale, z * correctionScale);
  normal?.set(x / distance, y / distance, z / distance);
  return true;
}

function setBoxBodyCorrection(point, radius, obstacle, correction, normal = null) {
  const position = getBodyObstaclePosition(obstacle);
  const shape = getObstacleShape(obstacle);
  const halfExtents = getShapeVector(shape, 'halfExtents', { x: obstacle.radius, y: obstacle.radius, z: obstacle.radius });
  const x = point.x - position.x;
  const y = point.y - position.y;
  const z = point.z - position.z;
  const expandedX = halfExtents.x + radius;
  const expandedY = halfExtents.y + radius;
  const expandedZ = halfExtents.z + radius;

  if (Math.abs(x) >= expandedX || Math.abs(y) >= expandedY || Math.abs(z) >= expandedZ) {
    return false;
  }

  const penetrationX = expandedX - Math.abs(x);
  const penetrationY = expandedY - Math.abs(y);
  const penetrationZ = expandedZ - Math.abs(z);

  if (penetrationX <= penetrationY && penetrationX <= penetrationZ) {
    const direction = x >= 0 ? 1 : -1;
    correction.set(direction * penetrationX, 0, 0);
    normal?.set(direction, 0, 0);
    return true;
  }

  if (penetrationY <= penetrationZ) {
    const direction = y >= 0 ? 1 : -1;
    correction.set(0, direction * penetrationY, 0);
    normal?.set(0, direction, 0);
    return true;
  }

  const direction = z >= 0 ? 1 : -1;
  correction.set(0, 0, direction * penetrationZ);
  normal?.set(0, 0, direction);
  return true;
}

function setCylinderBodyCorrection(point, radius, obstacle, rootWorld, correction, normal = null) {
  const position = getBodyObstaclePosition(obstacle);
  const shape = getObstacleShape(obstacle);
  const cylinderRadius = shape.radius;
  const halfHeight = Number.isFinite(shape.halfHeight)
    ? shape.halfHeight
    : Number.isFinite(shape.height)
      ? shape.height / 2
      : obstacle.radius;
  const x = point.x - position.x;
  const y = point.y - position.y;
  const z = point.z - position.z;
  const radialDistance = Math.hypot(x, z);
  const expandedRadius = cylinderRadius + radius;
  const expandedHalfHeight = halfHeight + radius;

  if (radialDistance >= expandedRadius || Math.abs(y) >= expandedHalfHeight) {
    return false;
  }

  const radialPenetration = expandedRadius - radialDistance;
  const capPenetration = expandedHalfHeight - Math.abs(y);
  if (capPenetration < radialPenetration) {
    const direction = y >= 0 ? 1 : -1;
    correction.set(0, direction * capPenetration, 0);
    normal?.set(0, direction, 0);
    return true;
  }

  if (radialDistance > COLLISION_EPSILON) {
    normal?.set(x / radialDistance, 0, z / radialDistance);
  } else {
    normal?.copy(rootWorld).sub(position).setY(0);
    if (!normal || normal.lengthSq() <= COLLISION_EPSILON) {
      normal?.copy(FORWARD);
    } else {
      normal.normalize();
    }
  }

  correction.copy(normal ?? FORWARD).multiplyScalar(radialPenetration);
  return true;
}

function setBodyCorrection(point, radius, obstacle, rootWorld, correction, normal = null) {
  if (!isBodyObstacleUsable(obstacle)) {
    return false;
  }

  const shape = getObstacleShape(obstacle);
  if (shape.type === 'box') {
    return setBoxBodyCorrection(point, radius, obstacle, correction, normal);
  }

  if (shape.type === 'cylinder') {
    return setCylinderBodyCorrection(point, radius, obstacle, rootWorld, correction, normal);
  }

  return setSphereBodyCorrection(point, radius, obstacle, rootWorld, correction, normal);
}

function getBodySurfacePoint(point, obstacle, normal) {
  const position = getBodyObstaclePosition(obstacle);
  const shape = getObstacleShape(obstacle);
  const surfaceNormal = normal?.lengthSq() > COLLISION_EPSILON
    ? normal.clone().normalize()
    : FORWARD.clone();

  if (shape.type === 'box') {
    const halfExtents = getShapeVector(shape, 'halfExtents', { x: obstacle.radius, y: obstacle.radius, z: obstacle.radius });
    const local = {
      x: clamp(point.x - position.x, -halfExtents.x, halfExtents.x),
      y: clamp(point.y - position.y, -halfExtents.y, halfExtents.y),
      z: clamp(point.z - position.z, -halfExtents.z, halfExtents.z)
    };
    if (Math.abs(surfaceNormal.x) >= Math.abs(surfaceNormal.y) && Math.abs(surfaceNormal.x) >= Math.abs(surfaceNormal.z)) {
      local.x = Math.sign(surfaceNormal.x || 1) * halfExtents.x;
    } else if (Math.abs(surfaceNormal.y) >= Math.abs(surfaceNormal.z)) {
      local.y = Math.sign(surfaceNormal.y || 1) * halfExtents.y;
    } else {
      local.z = Math.sign(surfaceNormal.z || 1) * halfExtents.z;
    }

    return new THREE.Vector3(
      position.x + local.x,
      position.y + local.y,
      position.z + local.z
    );
  }

  if (shape.type === 'cylinder') {
    const cylinderRadius = shape.radius;
    const halfHeight = Number.isFinite(shape.halfHeight)
      ? shape.halfHeight
      : Number.isFinite(shape.height)
        ? shape.height / 2
        : obstacle.radius;
    const localX = point.x - position.x;
    const localZ = point.z - position.z;
    const radialDistance = Math.hypot(localX, localZ);
    const radialNormal = radialDistance > COLLISION_EPSILON
      ? new THREE.Vector3(localX / radialDistance, 0, localZ / radialDistance)
      : surfaceNormal.clone().setY(0).normalize();
    if (Math.abs(surfaceNormal.y) > Math.max(Math.abs(surfaceNormal.x), Math.abs(surfaceNormal.z))) {
      const radialScale = radialDistance > cylinderRadius && radialDistance > COLLISION_EPSILON
        ? cylinderRadius / radialDistance
        : 1;
      return new THREE.Vector3(
        position.x + localX * radialScale,
        position.y + Math.sign(surfaceNormal.y || 1) * halfHeight,
        position.z + localZ * radialScale
      );
    }

    if (radialNormal.lengthSq() <= COLLISION_EPSILON) {
      radialNormal.copy(FORWARD);
    }

    return new THREE.Vector3(
      position.x + radialNormal.x * cylinderRadius,
      position.y + clamp(point.y - position.y, -halfHeight, halfHeight),
      position.z + radialNormal.z * cylinderRadius
    );
  }

  return position.clone().addScaledVector(surfaceNormal, obstacle.radius);
}

function getBodyContactFeatureId(obstacle, normal) {
  const shape = getObstacleShape(obstacle);
  const surfaceNormal = normal?.lengthSq() > COLLISION_EPSILON
    ? normal
    : FORWARD;

  if (shape.type === 'box') {
    const axis = Math.abs(surfaceNormal.x) >= Math.abs(surfaceNormal.y) && Math.abs(surfaceNormal.x) >= Math.abs(surfaceNormal.z)
      ? 'x'
      : Math.abs(surfaceNormal.y) >= Math.abs(surfaceNormal.z)
        ? 'y'
        : 'z';
    const sign = surfaceNormal[axis] >= 0 ? '+' : '-';
    return `box:${axis}${sign}`;
  }

  if (shape.type === 'cylinder') {
    if (Math.abs(surfaceNormal.y) > Math.max(Math.abs(surfaceNormal.x), Math.abs(surfaceNormal.z))) {
      return `cylinder:cap${surfaceNormal.y >= 0 ? '+' : '-'}`;
    }

    return 'cylinder:side';
  }

  return 'sphere';
}

function createEyeBounce(index, nodeCount, normal, scratch, restitution, tangentDamping) {
  return {
    enabled: index === nodeCount - 1,
    normal,
    scratch,
    restitution,
    tangentDamping
  };
}

export function applyStalkCollisionConstraints({
  nodes,
  previousNodes,
  rootWorld,
  terrainHeightAt = null,
  bodyObstacles = [],
  segmentRadius = STALK_SEGMENT_RADIUS,
  eyeRadius = segmentRadius * STALK_EYE_RADIUS_SCALE,
  eyeBounceRestitution = STALK_EYE_BOUNCE_RESTITUTION,
  eyeBounceTangentDamping = STALK_EYE_BOUNCE_TANGENT_DAMPING,
  selfRootGraceSegments = STALK_SELF_ROOT_GRACE_SEGMENTS,
  includeSegmentMidpoints = true,
  scratch = null
}) {
  if (nodes.length === 0) {
    return 0;
  }

  let correctionCount = 0;
  const collisionScratch = scratch ?? createCollisionScratch();

  nodes[0].copy(rootWorld);

  for (let index = 1; index < nodes.length; index += 1) {
    const node = nodes[index];
    const radius = getNodeCollisionRadius(index, nodes.length, segmentRadius, eyeRadius);
    const eyeBounce = createEyeBounce(
      index,
      nodes.length,
      collisionScratch.normal,
      collisionScratch,
      eyeBounceRestitution,
      eyeBounceTangentDamping
    );

    if (setTerrainCorrection(
      node,
      radius,
      terrainHeightAt,
      collisionScratch.correction,
      collisionScratch.normal
    )) {
      moveNode(nodes, previousNodes, index, collisionScratch.correction, eyeBounce);
      correctionCount += 1;
    }

    for (const obstacle of bodyObstacles) {
      if (obstacle?.self && index <= selfRootGraceSegments) {
        continue;
      }

      if (setBodyCorrection(
        node,
        radius,
        obstacle,
        rootWorld,
        collisionScratch.correction,
        collisionScratch.normal
      )) {
        moveNode(nodes, previousNodes, index, collisionScratch.correction, eyeBounce);
        correctionCount += 1;
      }
    }

    if (setTerrainCorrection(
      node,
      radius,
      terrainHeightAt,
      collisionScratch.correction,
      collisionScratch.normal
    )) {
      moveNode(nodes, previousNodes, index, collisionScratch.correction, eyeBounce);
      correctionCount += 1;
    }
  }

  nodes[0].copy(rootWorld);

  if (!includeSegmentMidpoints) {
    return correctionCount;
  }

  for (let index = 0; index < nodes.length - 1; index += 1) {
    const start = nodes[index];
    const end = nodes[index + 1];
    collisionScratch.midpoint.copy(start).add(end).multiplyScalar(0.5);

    if (setTerrainCorrection(collisionScratch.midpoint, segmentRadius, terrainHeightAt, collisionScratch.correction)) {
      if (moveSegment(nodes, previousNodes, index, collisionScratch.correction, collisionScratch)) {
        collisionScratch.midpoint.add(collisionScratch.correction);
        correctionCount += 1;
      }
    }

    for (const obstacle of bodyObstacles) {
      if (obstacle?.self && index < selfRootGraceSegments) {
        continue;
      }

      if (setBodyCorrection(collisionScratch.midpoint, segmentRadius, obstacle, rootWorld, collisionScratch.correction)) {
        const firstMovableNodeIndex = obstacle?.self ? selfRootGraceSegments + 1 : 1;
        if (moveSegment(
          nodes,
          previousNodes,
          index,
          collisionScratch.correction,
          collisionScratch,
          firstMovableNodeIndex
        )) {
          collisionScratch.midpoint.add(collisionScratch.correction);
          correctionCount += 1;
        }
      }
    }

    if (setTerrainCorrection(collisionScratch.midpoint, segmentRadius, terrainHeightAt, collisionScratch.correction)) {
      if (moveSegment(nodes, previousNodes, index, collisionScratch.correction, collisionScratch)) {
        collisionScratch.midpoint.add(collisionScratch.correction);
        correctionCount += 1;
      }
    }
  }

  nodes[0].copy(rootWorld);
  return correctionCount;
}

export function simulateStalkRope({
  nodes,
  previousNodes,
  incidentNodes = null,
  incidentPreviousNodes = null,
  rootWorld,
  goalWorld,
  delta,
  segmentLength = STALK_SEGMENT_LENGTH,
  gravity = STALK_GRAVITY,
  damping = STALK_DAMPING,
  goalPull = STALK_ACTIVE_PULL,
  constraintIterations = STALK_CONSTRAINT_ITERATIONS,
  turgidity = 0,
  collision = null
}) {
  if (nodes.length === 0 || previousNodes.length === 0) {
    return;
  }

  const gravityStep = new THREE.Vector3(0, -gravity * delta * delta, 0);
  const previousRoot = nodes[0].clone();
  const collisionScratch = collision ? createCollisionScratch() : null;
  let incidentCaptured = false;
  const captureIncidentNodes = () => {
    if (incidentCaptured) {
      return;
    }

    if (incidentNodes) {
      copyNodesInto(incidentNodes, nodes);
    }
    if (incidentPreviousNodes) {
      copyNodesInto(incidentPreviousNodes, previousNodes);
    }
    incidentCaptured = true;
  };
  previousNodes[0].copy(previousRoot);
  nodes[0].copy(rootWorld);

  for (let index = 1; index < nodes.length; index += 1) {
    const current = nodes[index];
    const previous = previousNodes[index];
    const velocity = current.clone().sub(previous).multiplyScalar(damping);

    previous.copy(current);
    current.add(velocity);
    current.add(gravityStep);
  }

  const pullAlpha = Math.min(1, goalPull * delta);
  nodes[nodes.length - 1].lerp(goalWorld, pullAlpha);

  for (let iteration = 0; iteration < constraintIterations; iteration += 1) {
    nodes[0].copy(rootWorld);

    for (let index = 0; index < nodes.length - 1; index += 1) {
      const start = nodes[index];
      const end = nodes[index + 1];
      const deltaVector = end.clone().sub(start);
      let distance = deltaVector.length();

      if (distance === 0) {
        deltaVector.copy(FORWARD);
        distance = 1;
      }

      const correction = deltaVector.multiplyScalar((distance - segmentLength) / distance);
      if (index === 0) {
        end.addScaledVector(correction, -1);
      } else {
        start.addScaledVector(correction, 0.5);
        end.addScaledVector(correction, -0.5);
      }
    }

    if (collision) {
      captureIncidentNodes();
      applyStalkCollisionConstraints({
        nodes,
        previousNodes,
        rootWorld,
        ...collision,
        scratch: collisionScratch
      });
    }
  }

  nodes[0].copy(rootWorld);
  applyTurgidityToNodes(nodes, previousNodes, rootWorld, goalWorld, turgidity);

  if (collision) {
    const collisionIterations = collision.iterations ?? DEFAULT_COLLISION_ITERATIONS;
    for (let iteration = 0; iteration < collisionIterations; iteration += 1) {
      captureIncidentNodes();
      applyStalkCollisionConstraints({
        nodes,
        previousNodes,
        rootWorld,
        ...collision,
        scratch: collisionScratch
      });
    }
  } else {
    captureIncidentNodes();
  }
}

export function buildStalkSegmentSamples(
  nodes,
  previousNodes,
  delta,
  segmentRadius = STALK_SEGMENT_RADIUS
) {
  const samples = [];
  const safeDelta = Math.max(delta, 1 / 120);

  for (let index = 0; index < nodes.length - 1; index += 1) {
    const start = nodes[index];
    const end = nodes[index + 1];
    const previousStart = previousNodes[index] ?? start;
    const previousEnd = previousNodes[index + 1] ?? end;
    const center = start.clone().add(end).multiplyScalar(0.5);
    const previousCenter = previousStart.clone().add(previousEnd).multiplyScalar(0.5);
    const velocity = center.clone().sub(previousCenter).divideScalar(safeDelta);
    const direction = end.clone().sub(start);
    const length = direction.length();

    samples.push({
      index,
      start: start.clone(),
      end: end.clone(),
      center,
      velocity,
      radius: segmentRadius,
      direction: length > 0 ? direction.normalize() : FORWARD.clone(),
      length
    });
  }

  return samples;
}

export function buildStalkEyeSamples(
  nodes,
  previousNodes,
  delta,
  eyeRadius = STALK_SEGMENT_RADIUS * STALK_EYE_RADIUS_SCALE
) {
  const tipIndex = nodes.length - 1;
  const tip = nodes[tipIndex];
  if (!tip) {
    return [];
  }

  const previousTip = previousNodes[tipIndex] ?? tip;
  const safeDelta = Math.max(delta, 1 / 120);
  const previousSegment = nodes[tipIndex - 1] ?? tip;
  const direction = tip.clone().sub(previousSegment);
  const length = direction.length();

  return [{
    index: tipIndex,
    isEye: true,
    start: previousSegment.clone(),
    end: tip.clone(),
    center: tip.clone(),
    velocity: tip.clone().sub(previousTip).divideScalar(safeDelta),
    radius: eyeRadius,
    direction: length > 0 ? direction.normalize() : FORWARD.clone(),
    length
  }];
}

export function evaluateStalkImpact(
  samples,
  targetBodyPosition,
  targetBodyRadius,
  attackerBodyVelocity,
  impactMomentumFactor,
  targetCollisionShape = null
) {
  let strongestSample = null;
  let strongestImpact = 0;
  let contactSample = null;
  let contactImpact = 0;
  let closestDistance = Infinity;
  const scratch = createCollisionScratch();
  const targetObstacle = {
    position: targetBodyPosition,
    radius: targetBodyRadius,
    shape: targetCollisionShape
  };

  for (const sample of samples) {
    const centerDistance = sample.center.distanceTo(targetBodyPosition);
    const collision = setBodyCorrection(
      sample.center,
      sample.radius,
      targetObstacle,
      sample.center,
      scratch.correction,
      scratch.normal
    );
    const surfaceNormal = collision
      ? scratch.normal.clone()
      : sample.center.clone().sub(targetBodyPosition);

    if (surfaceNormal.lengthSq() <= COLLISION_EPSILON) {
      surfaceNormal.copy(FORWARD);
    } else {
      surfaceNormal.normalize();
    }

    const closingSpeed = Math.max(0, -sample.velocity.dot(surfaceNormal));
    const movementAssist = Math.max(0, -attackerBodyVelocity.dot(surfaceNormal));
    const impactPower = closingSpeed + movementAssist * impactMomentumFactor;
    const collisionDistance = targetBodyRadius + sample.radius;
    const surfaceDistance = Math.max(0, centerDistance - collisionDistance);
    const surfacePoint = getBodySurfacePoint(sample.center, targetObstacle, surfaceNormal);
    const contactFeatureId = getBodyContactFeatureId(targetObstacle, surfaceNormal);

    if (impactPower >= strongestImpact) {
      strongestImpact = impactPower;
      strongestSample = {
        ...sample,
        centerDistance,
        surfaceDistance,
        closingSpeed,
        movementAssist,
        surfaceNormal,
        surfacePoint,
        contactFeatureId,
        impactPower
      };
    }

    if (surfaceDistance < closestDistance) {
      closestDistance = surfaceDistance;
    }

    if (!collision || impactPower < contactImpact) {
      continue;
    }

    contactImpact = impactPower;
    contactSample = {
      ...sample,
      centerDistance,
      surfaceDistance,
      closingSpeed,
      movementAssist,
      surfaceNormal,
      surfacePoint,
      contactFeatureId,
      impactPower
    };
  }

  return {
    collision: contactSample !== null,
    impactPower: strongestImpact,
    contactImpactPower: contactImpact,
    strongestSample,
    contactSample,
    closestDistance: Number.isFinite(closestDistance) ? closestDistance : 0
  };
}
