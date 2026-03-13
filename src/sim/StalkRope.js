import * as THREE from 'three';

export const STALK_BASE_OFFSET = new THREE.Vector3(0.4, 0.5, 1.5);
export const STALK_SEGMENT_COUNT = 6;
export const STALK_TOTAL_LENGTH = 3.3;
export const STALK_SEGMENT_LENGTH = STALK_TOTAL_LENGTH / STALK_SEGMENT_COUNT;
export const STALK_SEGMENT_RADIUS = 0.18;
export const STALK_CONSTRAINT_ITERATIONS = 3;
export const STALK_GRAVITY = 34;
export const STALK_DAMPING = 0.96;
export const STALK_ACTIVE_PULL = 10;
export const STALK_IDLE_PULL = 4;

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const LOCAL_UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Vector3();

function createWorldRoot(position, rotationY, rootOffset = STALK_BASE_OFFSET) {
  const bodyQuaternion = new THREE.Quaternion().setFromAxisAngle(UP, rotationY);
  return rootOffset.clone().applyQuaternion(bodyQuaternion).add(position);
}

function createGoalDirection(rotationY, yaw, pitch) {
  const localQuaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(pitch, 0, -yaw, 'XYZ')
  );
  const bodyQuaternion = new THREE.Quaternion().setFromAxisAngle(UP, rotationY);

  return LOCAL_UP.clone()
    .applyQuaternion(localQuaternion)
    .applyQuaternion(bodyQuaternion)
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
  const goalDirection = createGoalDirection(rotationY, yaw, pitch);
  return rootWorld.addScaledVector(goalDirection, totalLength);
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

export function simulateStalkRope({
  nodes,
  previousNodes,
  rootWorld,
  goalWorld,
  delta,
  segmentLength = STALK_SEGMENT_LENGTH,
  gravity = STALK_GRAVITY,
  damping = STALK_DAMPING,
  goalPull = STALK_ACTIVE_PULL,
  constraintIterations = STALK_CONSTRAINT_ITERATIONS
}) {
  if (nodes.length === 0 || previousNodes.length === 0) {
    return;
  }

  const gravityStep = new THREE.Vector3(0, -gravity * delta * delta, 0);
  const previousRoot = nodes[0].clone();
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
  }

  nodes[0].copy(rootWorld);
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

export function evaluateStalkImpact(
  samples,
  targetBodyPosition,
  targetBodyRadius,
  attackerBodyVelocity,
  impactMomentumFactor
) {
  let strongestSample = null;
  let strongestImpact = 0;
  let contactSample = null;
  let contactImpact = 0;
  let closestDistance = Infinity;

  for (const sample of samples) {
    const directionToTarget = targetBodyPosition.clone().sub(sample.center);
    const centerDistance = directionToTarget.length();
    const collisionDistance = targetBodyRadius + sample.radius;
    const collision = centerDistance <= collisionDistance;

    if (centerDistance === 0) {
      directionToTarget.copy(FORWARD);
    } else {
      directionToTarget.divideScalar(centerDistance);
    }

    const closingSpeed = Math.max(0, sample.velocity.dot(directionToTarget));
    const movementAssist = Math.max(0, attackerBodyVelocity.dot(directionToTarget));
    const impactPower = closingSpeed + movementAssist * impactMomentumFactor;
    const surfaceDistance = Math.max(0, centerDistance - collisionDistance);

    if (impactPower >= strongestImpact) {
      strongestImpact = impactPower;
      strongestSample = {
        ...sample,
        centerDistance,
        surfaceDistance,
        closingSpeed,
        movementAssist,
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
