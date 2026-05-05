import * as THREE from 'three';

import { getTerrainWaterInfo, type TerrainConfig } from '../world/Terrain.js';
import { getTerrainBodyGroundHeight } from '../world/TerrainClearance.js';
import {
  getGroundPatchSurfaceOffset,
  getGroundPatchSupportNormal,
  getPolygonPrismPoints,
  isPointInPolygon2D
} from '../world/GroundCoverSurface.js';
import {
  findClosestTriangleContact,
  getVisualCollisionMesh,
  isVisualMeshCollisionShape
} from '../entities/VisualCollisionMesh.js';
import { getCollisionShapeHalfHeight } from './CollisionShape.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const SUPPORT_EPSILON = 0.000001;
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
  'rock_floor_patch',
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function moveTowards(current: number, target: number, maximumDelta: number) {
  const delta = target - current;
  if (Math.abs(delta) <= maximumDelta) {
    return target;
  }

  return current + Math.sign(delta) * maximumDelta;
}

function getYawLocalVector(vector: THREE.Vector3, rotationY = 0) {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return new THREE.Vector3(
    (vector.x * cos) - (vector.z * sin),
    vector.y,
    (vector.x * sin) + (vector.z * cos)
  );
}

function getYawWorldVector(vector: THREE.Vector3, rotationY = 0) {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return new THREE.Vector3(
    (vector.x * cos) + (vector.z * sin),
    vector.y,
    (-vector.x * sin) + (vector.z * cos)
  );
}

export function getPlayerGroundHeight(player: any, terrainConfig: Readonly<TerrainConfig>) {
  return getTerrainBodyGroundHeight({
    x: player.position.x,
    z: player.position.z,
    rotationY: player.rotationY,
    terrainConfig,
    aboveGroundHeight: player.profile.groundHeight ?? 0
  });
}

function getPlayerWaterSupport(player: any, terrainConfig: Readonly<TerrainConfig>) {
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

export function snapPlayerToGroundIfGrounded(player: any, terrainConfig: Readonly<TerrainConfig>) {
  if (!player.grounded) {
    return;
  }

  player.position.y = getPlayerGroundHeight(player, terrainConfig);
}

function createPropSupport({
  prop,
  height,
  normal,
  surfaceId,
  kind = 'prop',
  climb = false,
  priority = 0
}: any) {
  const supportNormal = normal.clone();
  if (supportNormal.lengthSq() <= SUPPORT_EPSILON) {
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

function getMovementInwardAmount(movement: THREE.Vector3 | null, normal: THREE.Vector3) {
  if (!movement || movement.lengthSq() <= SUPPORT_EPSILON) {
    return 0;
  }

  return Math.max(0, -movement.dot(normal));
}

function shouldDetachFromSurface(player: any, support: any, movement: THREE.Vector3 | null) {
  if (!support || !support.climb || support.normal.y >= VERTICAL_SURFACE_MIN_UP_DOT) {
    return false;
  }

  if (player.supportSurfaceId !== support.surfaceId || !movement || movement.lengthSq() <= SUPPORT_EPSILON) {
    return false;
  }

  return movement.dot(support.normal) > CLIMB_INWARD_INPUT_THRESHOLD;
}

function getRotatedBoxPlanarContact(player: any, prop: any) {
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

function getCylinderPlanarContact(player: any, prop: any) {
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

  const normal = distance > SUPPORT_EPSILON
    ? new THREE.Vector3(delta.x / distance, 0, delta.z / distance)
    : new THREE.Vector3(1, 0, 0);

  return {
    correction: normal.clone().multiplyScalar(minimumDistance - distance),
    normal
  };
}

function getVisualMeshContact(player: any, prop: any, maximumDistance: number) {
  const mesh = getVisualCollisionMesh(prop);
  const localCenter = getYawLocalVector(player.position.clone().sub(prop.position), prop.rotationY ?? 0);
  const contact = findClosestTriangleContact(localCenter, mesh.triangles, maximumDistance);
  if (!contact) {
    return null;
  }

  const worldNormal = getYawWorldVector(contact.normal, prop.rotationY ?? 0);
  if (worldNormal.lengthSq() <= SUPPORT_EPSILON) {
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

function getVisualMeshPlanarContact(player: any, prop: any) {
  const contact = getVisualMeshContact(player, prop, player.bodyRadius + PROP_ADHESION_MARGIN);
  if (!contact || contact.distance >= player.bodyRadius) {
    return null;
  }

  const correction = contact.worldNormal.clone().multiplyScalar(player.bodyRadius - contact.distance);
  if (Math.abs(correction.x) + Math.abs(correction.z) <= SUPPORT_EPSILON) {
    return null;
  }

  return {
    correction,
    normal: contact.worldNormal,
    local: contact.localCenter,
    face: 'mesh'
  };
}

function getPropShapeHalfHeight(prop: any) {
  return getCollisionShapeHalfHeight(prop.collisionShape ?? { type: 'sphere', radius: prop.bodyRadius }, prop.bodyRadius);
}

function getPropTopSupportHeight(prop: any, player: any) {
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

function shouldSkipPlanarPropCollision(player: any, prop: any) {
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

function getBoxTopSupport(player: any, prop: any) {
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

function getPolygonPrismSupport(player: any, prop: any) {
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

function getBoxSideClimbSupport(player: any, prop: any, movement: THREE.Vector3, speed: number, delta: number, planarContact: any) {
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

function getVerticalCylinderSupport(player: any, prop: any, movement: THREE.Vector3, speed: number, delta: number, planarContact: any = null) {
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
  const normal = radialDistance > SUPPORT_EPSILON
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

function getSphereSupport(player: any, prop: any) {
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
  if (normal.lengthSq() <= SUPPORT_EPSILON) {
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

function getVisualMeshSupport(player: any, prop: any, movement: THREE.Vector3, speed: number, delta: number) {
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

function getConeSupport(player: any, prop: any) {
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
  const surfaceHeight = baseY + (height * Math.max(0, 1 - (surfaceRadius / Math.max(radius, SUPPORT_EPSILON))));
  const supportHeight = Math.max(baseY + player.bodyRadius, surfaceHeight + player.bodyRadius);
  const radialNormal = planarDistance > SUPPORT_EPSILON
    ? new THREE.Vector3(delta.x / planarDistance, 0, delta.z / planarDistance)
    : new THREE.Vector3(1, 0, 0);
  const sideSlope = height / Math.max(radius, SUPPORT_EPSILON);
  const normal = radialNormal.multiplyScalar(sideSlope).add(WORLD_UP).normalize();

  return createPropSupport({
    prop,
    height: supportHeight,
    normal,
    surfaceId: `prop:${prop.id}:cone`,
    priority: supportHeight + normal.y
  });
}

function getBambooStickSupport(player: any, prop: any) {
  const length = prop.visual?.length ?? (prop.collisionShape?.halfExtents?.y ?? prop.bodyRadius) * 2;
  const radius = (prop.visual?.radius ?? prop.bodyRadius) + player.bodyRadius;
  const tilt = prop.visual?.tilt ?? 0;
  const localAxis = new THREE.Vector3(-Math.sin(tilt), Math.cos(tilt), 0);
  const axis = getYawWorldVector(localAxis, prop.rotationY ?? 0).normalize();
  const delta = player.position.clone().sub(prop.position);
  const axisPlanar = new THREE.Vector3(axis.x, 0, axis.z);
  const deltaPlanar = new THREE.Vector3(delta.x, 0, delta.z);
  let along = 0;
  if (axisPlanar.lengthSq() > SUPPORT_EPSILON) {
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
  const normal = planarOffset.lengthSq() > SUPPORT_EPSILON
    ? planarOffset.normalize().multiplyScalar(Math.max(0.2, 1 - axis.y)).addScaledVector(WORLD_UP, verticalOffset / Math.max(radius, SUPPORT_EPSILON)).normalize()
    : WORLD_UP.clone();

  return createPropSupport({
    prop,
    height,
    normal,
    surfaceId: `prop:${prop.id}:stick`,
    priority: height + normal.y
  });
}

function getLogSupport(player: any, prop: any, movement: THREE.Vector3, speed: number, delta: number) {
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
  if (localNormal.lengthSq() <= SUPPORT_EPSILON) {
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

export function selectBestWorldSupport({
  player,
  terrainConfig,
  movement,
  speed,
  delta,
  contacts = [],
  getNearbyWorldProps
}: {
  player: any;
  terrainConfig: Readonly<TerrainConfig>;
  movement: THREE.Vector3;
  speed: number;
  delta: number;
  contacts?: any[];
  getNearbyWorldProps: (position: THREE.Vector3, radius: number) => any[];
}) {
  const terrainHeight = getPlayerGroundHeight(player, terrainConfig);
  const terrainSupport = {
    kind: 'terrain',
    height: terrainHeight,
    normal: WORLD_UP.clone(),
    surfaceId: null,
    priority: terrainHeight
  };
  let bestSupport = terrainSupport;
  const waterSupport = getPlayerWaterSupport(player, terrainConfig);
  if (waterSupport && waterSupport.priority > bestSupport.priority) {
    bestSupport = waterSupport;
  }
  const contactByPropId = new Map(contacts.map((contact) => [contact.prop.id, contact]));

  const supportProps = getNearbyWorldProps(
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

export function applySupportToPlayer({
  player,
  support,
  terrainHeight,
  speed,
  delta,
  tick
}: {
  player: any;
  support: any;
  terrainHeight: number;
  speed: number;
  delta: number;
  tick: number;
}) {
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
    const bob = Math.sin((tick * 0.075) + player.slot) * 0.025;
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

export function resolveWorldPropCollisionForPlayer({
  player,
  worldProps,
  getNearbyWorldProps,
  clampPlanarPosition
}: {
  player: any;
  worldProps: any[];
  getNearbyWorldProps: (position: THREE.Vector3, radius: number) => any[];
  clampPlanarPosition: (player: any) => void;
}) {
  if (!player.connected || player.health <= 0 || player.fixtureKind || worldProps.length === 0) {
    return [];
  }

  const contacts = [];

  for (let pass = 0; pass < 3; pass += 1) {
    let moved = false;

    const collisionProps = getNearbyWorldProps(player.position, player.bodyRadius + 30);

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

    clampPlanarPosition(player);
  }

  return contacts;
}
