import * as THREE from 'three';

import {
  createTriangleMeshShapeFromProp,
  isVisualMeshCollisionShape
} from '../entities/VisualCollisionMesh.js';
import { createTerrainPosition, getTerrainHeight, type TerrainConfig } from '../world/Terrain.js';
import { estimateTerrainBodyClearance } from '../world/TerrainClearance.js';
import { createSpatialIndex, querySpatialIndex, removeSpatialIndexItem } from './SpatialIndex.js';
import {
  cloneCollisionShape,
  getCollisionShapeHalfHeight,
  getCollisionShapeRadius,
  getFixtureHalfHeight
} from './CollisionShape.js';

export const WORLD_PROP_SPATIAL_CELL_SIZE = 16;

export function normalizeWorldProp(rawProp: any = {}, terrainConfig: Readonly<TerrainConfig>) {
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

export function getWorldPropSpatialRadius(prop: any) {
  return Math.max(
    0,
    prop.bodyRadius ?? getCollisionShapeRadius(prop.collisionShape, 1)
  );
}

export function createWorldPropSpatialIndex(worldProps: any[], cellSize = WORLD_PROP_SPATIAL_CELL_SIZE) {
  return createSpatialIndex(worldProps, {
    cellSize,
    getId: (prop) => prop.id,
    getPosition: (prop) => prop.position,
    getRadius: getWorldPropSpatialRadius
  });
}

export function queryWorldPropSpatialIndex(
  cells: Map<string, any[]>,
  position: { x: number; z: number },
  radius: number,
  cellSize = WORLD_PROP_SPATIAL_CELL_SIZE
) {
  return querySpatialIndex(cells, position, radius, {
    cellSize,
    getId: (prop) => prop.id,
    getPosition: (prop) => prop.position,
    getRadius: getWorldPropSpatialRadius
  });
}

export function removeWorldPropFromSpatialIndex(
  cells: Map<string, any[]> | null | undefined,
  prop: any,
  cellSize = WORLD_PROP_SPATIAL_CELL_SIZE
) {
  removeSpatialIndexItem(cells, prop, {
    cellSize,
    getId: (candidate) => candidate.id,
    getPosition: (candidate) => candidate.position,
    getRadius: getWorldPropSpatialRadius
  });
}

export function createFixturePosition(fixture: any, terrainConfig: Readonly<TerrainConfig>) {
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

export function createWorldPropObstacles(worldProps: any[]) {
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
