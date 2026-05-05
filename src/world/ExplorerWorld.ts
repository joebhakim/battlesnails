import * as THREE from 'three';

import {
  EXPLORER_TERRAIN_PRESET,
  EXPLORER_REFERENCE_WORLD_RADIUS,
  getExplorerCoastWeights,
  getExplorerTerrainRegionWeights,
  getTerrainHeight,
  normalizeTerrainConfig
} from './Terrain.js';
import {
  createHexRingTiles,
  getHexDistance,
  getScaledBoundary,
  getWorldBoundsArea,
  getWorldBoundsBoundaryPoints,
  getWorldBoundsOuterRadius,
  isPointInsideWorldBounds
} from './WorldBounds.js';
import { SeededRandom, normalizeSeed } from '../sim/SeededRandom.js';

export const EXPLORER_WORLD_SCALE = 10;
export const EXPLORER_MAP_NAME = 'Moss Atoll';
export const EXPLORER_TERRAIN_FEATURE_RADIUS = EXPLORER_REFERENCE_WORLD_RADIUS * EXPLORER_WORLD_SCALE;
export const EXPLORER_HEX_TILE_RADIUS = EXPLORER_TERRAIN_FEATURE_RADIUS * 0.72;
export const EXPLORER_BEACH_WIDTH = EXPLORER_HEX_TILE_RADIUS * Math.sqrt(3);
export const EXPLORER_FOREST_BEACH_BLEND = EXPLORER_TERRAIN_FEATURE_RADIUS * 0.08;
export const EXPLORER_WATER_MARGIN = EXPLORER_HEX_TILE_RADIUS * 0.45;
export const EXPLORER_FOREST_HEX_TILES = Object.freeze(createHexRingTiles(EXPLORER_HEX_TILE_RADIUS, 1));
export const EXPLORER_HEX_TILES = Object.freeze(createHexRingTiles(EXPLORER_HEX_TILE_RADIUS, 2));
export const EXPLORER_BEACH_HEX_TILES = Object.freeze(
  EXPLORER_HEX_TILES.filter((tile) => getHexDistance(tile.q, tile.r) === 2)
);
const EXPLORER_FOREST_BOUNDS_TEMPLATE = Object.freeze({
  shape: 'hex_cluster',
  hexRadius: EXPLORER_HEX_TILE_RADIUS,
  tiles: EXPLORER_FOREST_HEX_TILES
});
const EXPLORER_LAND_BOUNDS_TEMPLATE = Object.freeze({
  shape: 'hex_cluster',
  hexRadius: EXPLORER_HEX_TILE_RADIUS,
  tiles: EXPLORER_HEX_TILES
});
const EXPLORER_FOREST_BOUNDARY = Object.freeze(getWorldBoundsBoundaryPoints(EXPLORER_FOREST_BOUNDS_TEMPLATE));
const EXPLORER_LAND_BOUNDARY = Object.freeze(getWorldBoundsBoundaryPoints(EXPLORER_LAND_BOUNDS_TEMPLATE));
export const EXPLORER_FOREST_RADIUS = getWorldBoundsOuterRadius(EXPLORER_FOREST_BOUNDS_TEMPLATE);
export const EXPLORER_LAND_RADIUS = getWorldBoundsOuterRadius(EXPLORER_LAND_BOUNDS_TEMPLATE);
export const EXPLORER_WORLD_RADIUS = getWorldBoundsOuterRadius({
  shape: 'coastal_hex_cluster',
  boundary: getScaledBoundary(EXPLORER_LAND_BOUNDARY, EXPLORER_WATER_MARGIN)
});
export const EXPLORER_MAP_DEFAULT_CELL_SIZE = 100;
export const EXPLORER_DEFAULT_SEED = 137;
export const EXPLORER_WORLDGEN_VERSION = 9;
export const EXPLORER_BIRD_COUNT = 8;
export const EXPLORER_PLAYER_START = Object.freeze({ x: 0, z: 12 * EXPLORER_WORLD_SCALE, rotationY: Math.PI });
export const EXPLORER_BOSS_SLOT = 2;

const WORLD_SCALE = EXPLORER_WORLD_SCALE;
const scaleWorld = (value) => value * WORLD_SCALE;
const FICTIONAL_SNAIL_HEIGHT_UNITS = 3.6;
const UNITS_PER_INCH = FICTIONAL_SNAIL_HEIGHT_UNITS / 6;
const UNITS_PER_FOOT = UNITS_PER_INCH * 12;
const inches = (value) => value * UNITS_PER_INCH;
const feet = (value) => value * UNITS_PER_FOOT;
const GROUND_COVER_EDGE_LIFT = inches(0.55);
const GROUND_COVER_EDGE_BLEND_INSET = inches(8);
const GROUND_COVER_VISUAL_OVERLAP = inches(11);

const FIXED_LANDMARKS = Object.freeze([
  Object.freeze({ id: 'elder-tree', kind: 'giant_tree', treeType: 'deciduous', x: scaleWorld(-24), z: scaleWorld(36), radius: scaleWorld(1.6), canopyRadius: scaleWorld(13), height: scaleWorld(52), label: 'Elder Moss Tree' }),
  Object.freeze({ id: 'needle-tree', kind: 'giant_tree', treeType: 'conifer', x: scaleWorld(28), z: scaleWorld(28), radius: scaleWorld(1.25), canopyRadius: scaleWorld(11.5), height: scaleWorld(62), label: 'Needle Tree' }),
  Object.freeze({ id: 'twin-tree-west', kind: 'giant_tree', treeType: 'deciduous', x: scaleWorld(-50), z: scaleWorld(-8), radius: scaleWorld(1.05), canopyRadius: scaleWorld(9.6), height: scaleWorld(43), label: 'Twin Tree West' }),
  Object.freeze({ id: 'twin-tree-east', kind: 'giant_tree', treeType: 'conifer', x: scaleWorld(-42), z: scaleWorld(-16), radius: scaleWorld(0.95), canopyRadius: scaleWorld(8.6), height: scaleWorld(41), label: 'Twin Tree East' }),
  Object.freeze({ id: 'rocky-crown', kind: 'mountain_landmark', x: scaleWorld(58), z: scaleWorld(-58), radius: scaleWorld(18), height: scaleWorld(28), label: 'Rocky Crown' })
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashUnit(seed, index = 0) {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453123;
  return value - Math.floor(value);
}

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < `${text}`.length; index += 1) {
    hash ^= `${text}`.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function getShapeHalfHeight(shape: any = {}, fallback = 0.5) {
  if (Number.isFinite(shape.placementHalfHeight)) {
    return shape.placementHalfHeight;
  }

  if (shape.type === 'visual_mesh') {
    return Number.isFinite(shape.halfHeight) ? shape.halfHeight : fallback;
  }

  if (shape.type === 'box') {
    return Number.isFinite(shape.halfExtents?.y) ? shape.halfExtents.y : fallback;
  }

  if (shape.type === 'cylinder') {
    return Number.isFinite(shape.halfHeight)
      ? shape.halfHeight
      : Number.isFinite(shape.height)
        ? shape.height / 2
        : fallback;
  }

  if (shape.type === 'polygon_prism') {
    return Number.isFinite(shape.halfHeight) ? shape.halfHeight : fallback;
  }

  return Number.isFinite(shape.radius) ? shape.radius : fallback;
}

function getPropRadius(shape: any = {}, fallback = 1) {
  if (Number.isFinite(shape.meshRadius)) {
    return shape.meshRadius;
  }

  if (shape.type === 'visual_mesh') {
    return Number.isFinite(shape.radius) ? shape.radius : fallback;
  }

  if (shape.type === 'box') {
    const halfExtents = shape.halfExtents ?? {};
    return Math.hypot(halfExtents.x ?? fallback, halfExtents.z ?? fallback);
  }

  if (shape.type === 'polygon_prism' && Array.isArray(shape.points)) {
    return shape.points.reduce((radius, point) => (
      Math.max(radius, Math.hypot(point.x ?? 0, point.z ?? 0))
    ), fallback);
  }

  return Number.isFinite(shape.radius) ? shape.radius : fallback;
}

function placeProp({
  id,
  kind,
  x,
  z,
  terrainConfig,
  collisionShape,
  rotationY = 0,
  displayName = null,
  blocking = true,
  climbable = true,
  interactionKind = null,
  powerup = null,
  visual = {}
}: any) {
  const halfHeight = getShapeHalfHeight(collisionShape);
  const position = {
    x,
    y: getTerrainHeight(x, z, terrainConfig) + halfHeight,
    z
  };
  const radius = Number.isFinite(visual.bodyRadius)
    ? visual.bodyRadius
    : getPropRadius(collisionShape, visual.radius ?? 1);

  return {
    id,
    kind,
    displayName: displayName ?? kind,
    position,
    rotationY,
    bodyRadius: radius,
    blocking,
    climbable,
    interactionKind,
    powerup,
    collisionShape,
    visual
  };
}

function makeVisualMeshCollisionShape({
  radius,
  halfHeight,
  nearTriangleLimit = 520,
  farTriangleLimit = 96
}: any) {
  return {
    type: 'visual_mesh',
    radius,
    halfHeight,
    nearTriangleLimit,
    farTriangleLimit
  };
}

function createTreeProp(landmark, terrainConfig) {
  const visual: any = {
    treeType: landmark.treeType ?? 'deciduous',
    radius: landmark.radius,
    trunkRadius: landmark.radius,
    canopyRadius: landmark.canopyRadius ?? landmark.radius * 4,
    height: landmark.height,
    branchReach: (landmark.canopyRadius ?? landmark.radius * 4) * (landmark.treeType === 'conifer' ? 0.62 : 0.9)
  };
  const meshRadius = Math.max(
    landmark.radius,
    visual.canopyRadius * 1.05,
    landmark.radius + visual.branchReach + landmark.radius * 1.7
  );
  visual.bodyRadius = meshRadius;
  return placeProp({
    id: landmark.id,
    kind: 'giant_tree',
    displayName: landmark.label,
    x: landmark.x,
    z: landmark.z,
    terrainConfig,
    collisionShape: makeVisualMeshCollisionShape({
      radius: meshRadius,
      halfHeight: landmark.height / 2,
      nearTriangleLimit: 900,
      farTriangleLimit: 180
    }),
    visual
  });
}

function createForestTree(index, rng, terrainConfig, treeType = 'deciduous', center = null) {
  const x = center?.x ?? scaleWorld(rng.range(-74, 52));
  const z = center?.z ?? scaleWorld(rng.range(-18, 86));
  const trunkRadius = treeType === 'conifer'
    ? inches(rng.range(3.2, 7.2))
    : inches(rng.range(3.6, 8.4));
  const height = treeType === 'conifer'
    ? feet(rng.range(28, 58))
    : feet(rng.range(22, 48));
  const canopyRadius = treeType === 'conifer'
    ? trunkRadius * rng.range(5.4, 8.5)
    : trunkRadius * rng.range(7.0, 10.5);
  const visual: any = {
    treeType,
    radius: trunkRadius,
    trunkRadius,
    canopyRadius,
    height,
    branchReach: canopyRadius * (treeType === 'conifer' ? 0.62 : 0.9)
  };
  const id = `${treeType}-tree-${index}`;
  const meshRadius = Math.max(
    trunkRadius,
    canopyRadius * 1.05,
    trunkRadius + visual.branchReach + trunkRadius * 1.7
  );
  visual.bodyRadius = meshRadius;

  return placeProp({
    id,
    kind: treeType === 'conifer' ? 'conifer_tree' : 'deciduous_tree',
    displayName: treeType === 'conifer' ? 'Needle Sapling' : 'Leaf Tree',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    collisionShape: makeVisualMeshCollisionShape({
      radius: meshRadius,
      halfHeight: height / 2,
      nearTriangleLimit: 720,
      farTriangleLimit: 144
    }),
    visual
  });
}

function createMountainMarker(landmark, terrainConfig) {
  const radius = landmark.radius / 3;
  const height = landmark.height / 2;
  return placeProp({
    id: landmark.id,
    kind: 'rock_spire',
    displayName: landmark.label,
    x: landmark.x,
    z: landmark.z,
    terrainConfig,
    collisionShape: makeVisualMeshCollisionShape({
      radius,
      halfHeight: height / 2,
      nearTriangleLimit: 80,
      farTriangleLimit: 20
    }),
    visual: {
      radius,
      height
    }
  });
}

function createSaltCone(index, rng, terrainConfig, center = null) {
  const angle = rng.range(0, Math.PI * 2);
  const distance = scaleWorld(rng.range(38, 88));
  const radius = inches(rng.range(2.5, 8));
  const x = center?.x ?? Math.sin(angle) * distance;
  const z = center?.z ?? Math.cos(angle) * distance;
  const height = radius * rng.range(0.45, 0.8);
  return placeProp({
    id: `salt-cone-${index}`,
    kind: 'salt_cone',
    displayName: 'Salt',
    x,
    z,
    terrainConfig,
    collisionShape: makeVisualMeshCollisionShape({
      radius,
      halfHeight: height / 2,
      nearTriangleLimit: 64,
      farTriangleLimit: 16
    }),
    visual: { radius, height }
  });
}

function createBambooStick(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(-78, 72));
  const z = center?.z ?? scaleWorld(rng.range(-4, 76));
  const length = feet(rng.range(5, 14));
  const radius = inches(rng.range(0.25, 0.9));
  const tilt = rng.range(10, 30) * Math.PI / 180;
  const rotationY = rng.range(0, Math.PI * 2);
  const footprint = Math.max(radius * 2.5, Math.sin(tilt) * length * 0.5);
  const visual: any = { length, radius, tilt };
  const meshRadius = footprint + radius * 3.6;
  visual.bodyRadius = meshRadius;
  return placeProp({
    id: `bamboo-stick-${index}`,
    kind: 'bamboo_stick',
    displayName: 'Bamboo Stick',
    x,
    z,
    rotationY,
    terrainConfig,
    collisionShape: makeVisualMeshCollisionShape({
      radius: meshRadius,
      halfHeight: Math.cos(tilt) * length * 0.5,
      nearTriangleLimit: 160,
      farTriangleLimit: 48
    }),
    visual
  });
}

function createGravel(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(10, 72));
  const z = center?.z ?? scaleWorld(rng.range(-58, -4));
  const radius = inches(rng.range(0.25, 0.85));
  return placeProp({
    id: `gravel-${index}`,
    kind: 'gravel',
    displayName: 'Gravel',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    collisionShape: {
      type: 'sphere',
      radius
    },
    visual: { radius }
  });
}

function createRottingLog(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(-54, 34));
  const z = center?.z ?? scaleWorld(rng.range(-2, 62));
  const length = feet(rng.range(8, 24));
  const radius = feet(rng.range(0.45, 1.4));
  return placeProp({
    id: `rotting-log-${index}`,
    kind: 'rotting_log',
    displayName: 'Rotting Log',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    collisionShape: makeVisualMeshCollisionShape({
      radius: (length / 2) + radius * 1.25,
      halfHeight: radius * 1.15,
      nearTriangleLimit: 180,
      farTriangleLimit: 48
    }),
    interactionKind: 'rotting_log',
    visual: { length, radius }
  });
}

function createRock(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(36, 84));
  const z = center?.z ?? scaleWorld(rng.range(-82, -24));
  const radius = feet(rng.range(0.75, 3.8));
  return placeProp({
    id: `rock-${index}`,
    kind: 'rock',
    displayName: 'Rock',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    collisionShape: {
      type: 'sphere',
      radius
    },
    visual: { radius }
  });
}

function createForestRock(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(-72, 48));
  const z = center?.z ?? scaleWorld(rng.range(-10, 78));
  const radius = feet(rng.range(0.28, 1.35));
  return placeProp({
    id: `forest-rock-${index}`,
    kind: 'forest_rock',
    displayName: 'Forest Rock',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    collisionShape: {
      type: 'sphere',
      radius
    },
    visual: {
      radius,
      color: rng.choice([0x555a50, 0x5f6659, 0x676b5f, 0x4e5a48])
    }
  });
}

function createTalusRock(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(24, 86));
  const z = center?.z ?? scaleWorld(rng.range(-84, -12));
  const radius = inches(rng.range(1.5, 10));
  return placeProp({
    id: `talus-rock-${index}`,
    kind: 'talus_rock',
    displayName: 'Talus Rock',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    collisionShape: {
      type: 'sphere',
      radius
    },
    visual: {
      radius,
      color: rng.choice([0x5f6260, 0x747169, 0x6a675f])
    }
  });
}

function createRockCluster(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(28, 82));
  const z = center?.z ?? scaleWorld(rng.range(-74, -18));
  const radius = feet(rng.range(0.9, 3.3));
  return placeProp({
    id: `rock-cluster-${index}`,
    kind: 'rock_cluster',
    displayName: 'Rock Cluster',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    collisionShape: {
      type: 'sphere',
      radius
    },
    visual: {
      radius,
      color: rng.choice([0x5c5f5d, 0x68665f, 0x76736a])
    }
  });
}

function createMossCushion(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(-46, 48));
  const z = center?.z ?? scaleWorld(rng.range(-2, 70));
  const radius = inches(rng.range(4, 18));
  return placeProp({
    id: `moss-cushion-${index}`,
    kind: 'moss_cushion',
    displayName: 'Moss Cushion',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    collisionShape: {
      type: 'sphere',
      radius
    },
    visual: {
      radius,
      squash: rng.range(0.38, 0.62)
    }
  });
}

function createGroundCoverFootprint(worldFootprint, center, terrainConfig, shapeHalfHeight, overlap = 0) {
  if (!worldFootprint) {
    return null;
  }

  const centerTerrainHeight = getTerrainHeight(center.x, center.z, terrainConfig);
  return worldFootprint.map((point, index) => {
    const dx = point.x - center.x;
    const dz = point.z - center.z;
    const distance = Math.hypot(dx, dz);
    const wobble = 0.82 + (((index * 53) % 17) / 16) * 0.28;
    const expandedX = distance > 0.0001
      ? point.x + (dx / distance) * overlap * wobble
      : point.x;
    const expandedZ = distance > 0.0001
      ? point.z + (dz / distance) * overlap * wobble
      : point.z;
    return {
      x: expandedX - center.x,
      z: expandedZ - center.z,
      y: getTerrainHeight(expandedX, expandedZ, terrainConfig) + GROUND_COVER_EDGE_LIFT - centerTerrainHeight - shapeHalfHeight
    };
  });
}

function getLocalBounds(points) {
  return points
    ? points.reduce((accumulator, point) => ({
      minX: Math.min(accumulator.minX, point.x),
      maxX: Math.max(accumulator.maxX, point.x),
      minZ: Math.min(accumulator.minZ, point.z),
      maxZ: Math.max(accumulator.maxZ, point.z)
    }), {
      minX: Infinity,
      maxX: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity
    })
    : null;
}

function createGroundCoverPatch(index, kind, rng, terrainConfig, center) {
  const worldFootprint = Array.isArray(center.footprint) && center.footprint.length >= 3
    ? center.footprint
    : null;
  const footprint2d = worldFootprint
    ? center.footprint.map((point) => ({
      x: point.x - center.x,
      z: point.z - center.z
    }))
    : null;
  const bounds = getLocalBounds(footprint2d);
  const length = bounds ? bounds.maxX - bounds.minX : center.cellSize * rng.range(1.18, 1.48);
  const width = bounds ? bounds.maxZ - bounds.minZ : center.cellSize * rng.range(1.08, 1.36);
  const visualByKind = {
    dry_leaf_patch: {
      displayName: 'Dry Leaf Patch',
      thickness: inches(rng.range(1, 4.5)),
      color: rng.choice([0x5f4328, 0x6d4c2a, 0x7a552f, 0x4f3521]),
      roughness: rng.range(0.72, 1),
      relief: inches(rng.range(2, 7)),
      scaleLength: inches(rng.range(8, 20)),
      scaleWidth: inches(rng.range(3, 8)),
      scaleDensity: rng.range(1.45, 2.1),
      maxPlates: rng.int(360, 560),
      plateCoverage: rng.range(1.25, 1.65),
      labelDistance: 48
    },
    moss_mat: {
      displayName: 'Moss Mat',
      thickness: inches(rng.range(1.2, 4.2)),
      color: rng.choice([0x2e5f35, 0x3f7c43, 0x569247]),
      roughness: rng.range(0.66, 0.98),
      relief: inches(rng.range(2.2, 7.2)),
      scaleLength: inches(rng.range(7, 18)),
      scaleWidth: inches(rng.range(4.6, 11)),
      scaleDensity: rng.range(1.15, 1.6),
      maxPlates: rng.int(120, 190),
      plateCoverage: rng.range(1.05, 1.35),
      labelDistance: 48
    },
    dirt_stick_patch: {
      displayName: 'Dirt With Sticks',
      thickness: inches(rng.range(0.7, 2.8)),
      color: rng.choice([0x4a2e1c, 0x5a3924, 0x6a3f25]),
      roughness: rng.range(0.68, 0.96),
      relief: inches(rng.range(1.4, 4.8)),
      scaleLength: inches(rng.range(3.4, 8.5)),
      scaleWidth: inches(rng.range(1.8, 4.6)),
      scaleDensity: rng.range(0.82, 1.18),
      stickCount: rng.int(5, 9),
      maxPlates: rng.int(76, 118),
      plateCoverage: rng.range(0.72, 0.98),
      labelDistance: 48
    },
    rock_floor_patch: {
      displayName: 'Limestone Floor',
      thickness: inches(rng.range(0.9, 3.2)),
      color: rng.choice([0xa39b84, 0xb8ad90, 0xcfc3a2, 0xd9cfb5]),
      roughness: rng.range(0.58, 0.82),
      relief: inches(rng.range(1.8, 5.8)),
      scaleLength: inches(rng.range(12, 28)),
      scaleWidth: inches(rng.range(10, 24)),
      scaleDensity: rng.range(0.35, 0.62),
      maxPlates: rng.int(18, 32),
      plateCoverage: rng.range(0.42, 0.68),
      labelDistance: 48
    }
  };
  const visualConfig = visualByKind[kind] ?? visualByKind.dry_leaf_patch;
  const grainAngle = rng.range(0, Math.PI * 2);
  const shapeHalfHeight = (visualConfig.thickness + visualConfig.relief) / 2;
  const centerTerrainHeight = getTerrainHeight(center.x, center.z, terrainConfig);
  const maximumFootprintTerrainOffset = worldFootprint
    ? worldFootprint.reduce((maximum, point) => (
      Math.max(maximum, getTerrainHeight(point.x, point.z, terrainConfig) - centerTerrainHeight)
    ), 0)
    : 0;
  const minimumSurfaceOffset = Math.min(
    Math.max(0, maximumFootprintTerrainOffset + GROUND_COVER_EDGE_LIFT + inches(0.35)),
    visualConfig.thickness + visualConfig.relief + inches(3)
  );
  const collisionRelief = kind === 'moss_mat'
    ? visualConfig.relief * 0.45
    : kind === 'dirt_stick_patch'
      ? visualConfig.relief * 0.62
      : kind === 'rock_floor_patch'
        ? visualConfig.relief * 0.9
      : visualConfig.relief;
  const collisionScaleLength = kind === 'moss_mat'
    ? visualConfig.scaleLength * 0.72
    : kind === 'dirt_stick_patch'
      ? visualConfig.scaleLength * 0.68
      : kind === 'rock_floor_patch'
        ? visualConfig.scaleLength * 0.82
      : visualConfig.scaleLength;
  const collisionScaleWidth = kind === 'moss_mat'
    ? visualConfig.scaleWidth * 0.72
    : kind === 'dirt_stick_patch'
      ? visualConfig.scaleWidth * 0.7
      : kind === 'rock_floor_patch'
        ? visualConfig.scaleWidth * 0.82
      : visualConfig.scaleWidth;
  const footprint = createGroundCoverFootprint(worldFootprint, center, terrainConfig, shapeHalfHeight);
  const visualOverlap = worldFootprint
    ? GROUND_COVER_VISUAL_OVERLAP * (0.8 + hashUnit(index + kind.length * 101, 13) * 0.45)
    : 0;
  const visualFootprint = createGroundCoverFootprint(worldFootprint, center, terrainConfig, shapeHalfHeight, visualOverlap);
  const visualBounds = getLocalBounds(visualFootprint);
  const visualLength = visualBounds ? visualBounds.maxX - visualBounds.minX : length;
  const visualWidth = visualBounds ? visualBounds.maxZ - visualBounds.minZ : width;
  return placeProp({
    id: `${kind.replaceAll('_', '-')}-${index}`,
    kind,
    displayName: visualConfig.displayName,
    x: center.x,
    z: center.z,
    rotationY: footprint ? 0 : rng.range(0, Math.PI * 2),
    terrainConfig,
    blocking: true,
    climbable: true,
    collisionShape: {
      type: footprint ? 'polygon_prism' : 'box',
      points: footprint,
      halfHeight: shapeHalfHeight,
      halfExtents: footprint
        ? undefined
        : {
          x: length / 2,
          y: shapeHalfHeight,
          z: width / 2
        },
      relief: collisionRelief,
      minSurfaceOffset: minimumSurfaceOffset,
      grainAngle,
      scaleLength: collisionScaleLength,
      scaleWidth: collisionScaleWidth,
      edgeBlendInset: GROUND_COVER_EDGE_BLEND_INSET
    },
    visual: {
      length: visualLength,
      width: visualWidth,
      thickness: visualConfig.thickness,
      color: visualConfig.color,
      roughness: visualConfig.roughness,
      relief: visualConfig.relief,
      grainAngle,
      scaleLength: visualConfig.scaleLength,
      scaleWidth: visualConfig.scaleWidth,
      scaleDensity: visualConfig.scaleDensity,
      maxPlates: visualConfig.maxPlates,
      plateCoverage: visualConfig.plateCoverage,
      footprint: visualFootprint ?? footprint,
      collisionFootprint: footprint,
      edgeBlendInset: GROUND_COVER_EDGE_BLEND_INSET,
      visualOverlap,
      stickCount: visualConfig.stickCount ?? 0,
      labelDistance: visualConfig.labelDistance
    }
  });
}

function chooseGroundCoverKind(index, total, rng) {
  const roll = (index + rng.next() * 0.35) / Math.max(1, total);
  if (roll < 0.6) {
    return 'dry_leaf_patch';
  }

  if (roll < 0.9) {
    return 'moss_mat';
  }

  return 'dirt_stick_patch';
}

function chooseMountainGroundCoverKind() {
  return 'rock_floor_patch';
}

function createDiskPolygon(radius, vertexCount = 48) {
  return Array.from({ length: vertexCount }, (_, index) => {
    const angle = (index / vertexCount) * Math.PI * 2;
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius
    };
  });
}

function isInsideVoronoiHalfPlane(point, site, otherSite) {
  const a = 2 * (otherSite.x - site.x);
  const b = 2 * (otherSite.z - site.z);
  const c = (otherSite.x * otherSite.x) + (otherSite.z * otherSite.z) -
    (site.x * site.x) - (site.z * site.z);
  return (a * point.x) + (b * point.z) <= c + 0.0001;
}

function getVoronoiHalfPlaneIntersection(start, end, site, otherSite) {
  const a = 2 * (otherSite.x - site.x);
  const b = 2 * (otherSite.z - site.z);
  const c = (otherSite.x * otherSite.x) + (otherSite.z * otherSite.z) -
    (site.x * site.x) - (site.z * site.z);
  const startValue = (a * start.x) + (b * start.z) - c;
  const endValue = (a * end.x) + (b * end.z) - c;
  const denominator = startValue - endValue;
  const alpha = Math.abs(denominator) <= 0.000001
    ? 0
    : clamp(startValue / denominator, 0, 1);
  return {
    x: start.x + (end.x - start.x) * alpha,
    z: start.z + (end.z - start.z) * alpha
  };
}

function clipVoronoiPolygonToSite(polygon, site, otherSite) {
  if (polygon.length === 0) {
    return polygon;
  }

  const clipped = [];
  let previous = polygon[polygon.length - 1];
  let previousInside = isInsideVoronoiHalfPlane(previous, site, otherSite);

  for (const current of polygon) {
    const currentInside = isInsideVoronoiHalfPlane(current, site, otherSite);
    if (currentInside !== previousInside) {
      clipped.push(getVoronoiHalfPlaneIntersection(previous, current, site, otherSite));
    }

    if (currentInside) {
      clipped.push(current);
    }

    previous = current;
    previousInside = currentInside;
  }

  return clipped;
}

function getPolygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.z - next.x * current.z;
  }

  return Math.abs(area) / 2;
}

function getExplorerPatchworkAreaScale(worldBounds) {
  const referenceRadius = EXPLORER_TERRAIN_FEATURE_RADIUS - scaleWorld(7);
  return getWorldBoundsArea(worldBounds) / (Math.PI * referenceRadius * referenceRadius);
}

function randomPointInWorldBounds(rng, worldBounds, predicate = null) {
  const radius = Math.max(1, worldBounds.radius ?? EXPLORER_WORLD_RADIUS);
  for (let attempt = 0; attempt < 800; attempt += 1) {
    const angle = rng.range(0, Math.PI * 2);
    const distance = Math.sqrt(rng.next()) * radius;
    const point = {
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance
    };
    if (isPointInsideWorldBounds(point.x, point.z, worldBounds) && (!predicate || predicate(point))) {
      return point;
    }
  }

  return randomPointInWorldBounds(rng, worldBounds);
}

function createGroundCoverSites(rng, worldBounds, count) {
  const sites = [];
  for (let index = 0; index < count; index += 1) {
    sites.push(randomPointInWorldBounds(rng, worldBounds));
  }

  return sites;
}

function createForestFloorPatchwork(rng, terrainConfig, worldBounds) {
  const patches = [];
  const cellSize = scaleWorld(7.8);
  const siteCount = Math.round(620 * getExplorerPatchworkAreaScale(worldBounds));
  const sites = createGroundCoverSites(rng, worldBounds, siteCount);
  const boundary = getWorldBoundsBoundaryPoints(worldBounds);

  for (const [siteIndex, site] of sites.entries()) {
    const { mountainWeight, beachWeight, waterWeight } = getExplorerTerrainRegionWeights(site.x, site.z, terrainConfig);
    if (beachWeight > 0.38 || waterWeight > 0) {
      continue;
    }

    let polygon = boundary.map((point) => ({ ...point }));
    for (const otherSite of sites) {
      if (otherSite === site) {
        continue;
      }

      polygon = clipVoronoiPolygonToSite(polygon, site, otherSite);
      if (polygon.length < 3) {
        break;
      }
    }

    if (polygon.length < 3 || getPolygonArea(polygon) < cellSize * cellSize * 0.12) {
      continue;
    }

    patches.push(createGroundCoverPatch(
      patches.length,
      mountainWeight > 0.24
        ? chooseMountainGroundCoverKind()
        : chooseGroundCoverKind(siteIndex, sites.length, rng),
      rng,
      terrainConfig,
      {
        x: site.x,
        z: site.z,
        cellSize,
        footprint: polygon
      }
    ));
  }

  return patches;
}

function createDewBead(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(-62, 34));
  const z = center?.z ?? scaleWorld(rng.range(8, 82));
  const radius = inches(rng.range(0.7, 4.8));
  return placeProp({
    id: `dew-bead-${index}`,
    kind: 'dew_bead',
    displayName: 'Dew Bead',
    x,
    z,
    terrainConfig,
    collisionShape: {
      type: 'sphere',
      radius
    },
    powerup: {
      type: 'dew',
      amount: Math.max(1, Number((radius * 1.8).toFixed(1))),
      label: 'Dew'
    },
    visual: {
      radius
    }
  });
}

function createDewPool(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(-34, 42));
  const z = center?.z ?? scaleWorld(rng.range(4, 68));
  const radius = inches(rng.range(2, 8));
  const height = inches(0.05);
  return placeProp({
    id: `dew-pool-${index}`,
    kind: 'dew_pool',
    displayName: 'Dew Pool',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    blocking: false,
    climbable: false,
    collisionShape: {
      type: 'cylinder',
      radius,
      halfHeight: height / 2
    },
    powerup: {
      type: 'dew',
      amount: Math.max(2, Number((radius * 1.1).toFixed(1))),
      label: 'Dew Pool'
    },
    visual: {
      radius,
      height
    }
  });
}

function createMushroom(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(-26, 46));
  const z = center?.z ?? scaleWorld(rng.range(-10, 72));
  const capRadius = inches(rng.range(5, 24));
  const stemHeight = inches(rng.range(4, 28));
  const capThickness = inches(rng.range(0.8, 5.5));
  const height = stemHeight + capThickness;
  return placeProp({
    id: `mushroom-${index}`,
    kind: 'mushroom',
    displayName: 'Mushroom',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    collisionShape: makeVisualMeshCollisionShape({
      radius: capRadius * 1.06,
      halfHeight: height / 2,
      nearTriangleLimit: 420,
      farTriangleLimit: 96
    }),
    visual: {
      capRadius,
      stemRadius: capRadius * rng.range(0.22, 0.34),
      stemHeight,
      capThickness,
      color: rng.choice([0xb64d48, 0xc98248, 0xd8c86f, 0x7b5aa6])
    }
  });
}

function createSoftFood(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(-46, 48));
  const z = center?.z ?? scaleWorld(rng.range(-8, 76));
  const radius = inches(rng.range(1.2, 5.2));
  const height = inches(rng.range(0.4, 1.6));
  return placeProp({
    id: `soft-food-${index}`,
    kind: 'soft_food',
    displayName: 'Soft Food',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    blocking: false,
    climbable: false,
    collisionShape: {
      type: 'cylinder',
      radius,
      halfHeight: height / 2
    },
    powerup: {
      type: 'food',
      amount: Math.max(35, Number((radius * 34).toFixed(1))),
      label: 'Soft Food'
    },
    visual: {
      radius,
      height,
      color: rng.choice([0x9f6b38, 0x7f5330, 0xb58a4a, 0x8f7a42])
    }
  });
}

function createRootBranch(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(-46, 50));
  const z = center?.z ?? scaleWorld(rng.range(-8, 58));
  const length = feet(rng.range(3, 16));
  const radius = inches(rng.range(0.6, 4));
  return placeProp({
    id: `root-branch-${index}`,
    kind: 'root_branch',
    displayName: 'Root Branch',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    collisionShape: makeVisualMeshCollisionShape({
      radius: (length / 2) + radius * 1.4,
      halfHeight: radius * 1.5,
      nearTriangleLimit: 96,
      farTriangleLimit: 24
    }),
    visual: {
      length,
      radius,
      color: rng.choice([0x5b3520, 0x6b4226, 0x4a2e1e])
    }
  });
}

function createTwig(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(-84, 72));
  const z = center?.z ?? scaleWorld(rng.range(-74, 78));
  const length = inches(rng.range(8, 48));
  const radius = inches(rng.range(0.08, 0.35));
  return placeProp({
    id: `twig-${index}`,
    kind: 'twig',
    displayName: 'Twig',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    collisionShape: makeVisualMeshCollisionShape({
      radius: (length / 2) + radius * 1.4,
      halfHeight: radius * 1.5,
      nearTriangleLimit: 80,
      farTriangleLimit: 20
    }),
    visual: {
      length,
      radius,
      color: rng.choice([0x49301f, 0x5c3a23, 0x6f4b2b])
    }
  });
}

function createSprout(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(-44, 54));
  const z = center?.z ?? scaleWorld(rng.range(-8, 72));
  const height = inches(rng.range(1.2, 84));
  const radius = inches(rng.range(0.09, 0.7));
  return placeProp({
    id: `sprout-${index}`,
    kind: 'sprout',
    displayName: 'Sprout',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    blocking: false,
    climbable: false,
    collisionShape: {
      type: 'cylinder',
      radius,
      halfHeight: height / 2
    },
    visual: {
      height,
      radius,
      leafLength: inches(rng.range(1.4, 14)),
      leafCount: rng.int(2, 5),
      color: rng.choice([0x4f8b3d, 0x5fa64d, 0x3f7d37])
    }
  });
}

function createShrub(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(-76, 68));
  const z = center?.z ?? scaleWorld(rng.range(-38, 84));
  const height = feet(rng.range(0.85, 7.5));
  const radius = feet(rng.range(0.55, 4.6));
  const collisionRadius = Math.max(inches(1.1), radius * rng.range(0.52, 0.76));
  const id = `shrub-${index}`;
  const visual: any = {
    height,
    radius,
    collisionRadius,
    stemCount: rng.int(5, 9),
    leafCount: rng.int(6, 12),
    color: rng.choice([0x405f32, 0x4f6f39, 0x5b773d])
  };
  const meshRadius = radius * 1.12;
  visual.bodyRadius = meshRadius;
  return placeProp({
    id,
    kind: 'shrub',
    displayName: 'Shrub',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    collisionShape: makeVisualMeshCollisionShape({
      radius: meshRadius,
      halfHeight: height / 2,
      nearTriangleLimit: 420,
      farTriangleLimit: 96
    }),
    visual
  });
}

function createFallenBranch(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(-78, 70));
  const z = center?.z ?? scaleWorld(rng.range(-42, 78));
  const length = feet(rng.range(3.5, 18));
  const radius = inches(rng.range(0.65, 4.5));
  const sideSpan = length * rng.range(0.18, 0.36);
  const tilt = rng.range(10, 60) * Math.PI / 180;
  const horizontalLength = Math.cos(tilt) * length;
  const id = `fallen-branch-${index}`;
  const visual: any = {
    length,
    radius,
    branchCount: rng.int(2, 5),
    sideSpan,
    tilt,
    color: rng.choice([0x3f2a1c, 0x4a3020, 0x5b3923])
  };
  const meshRadius = Math.hypot(horizontalLength / 2, sideSpan * 0.62) + radius * 1.4;
  visual.bodyRadius = meshRadius;
  return placeProp({
    id,
    kind: 'fallen_branch',
    displayName: 'Fallen Branch',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    collisionShape: makeVisualMeshCollisionShape({
      radius: meshRadius,
      halfHeight: Math.sin(tilt) * length * 0.5 + radius * 1.8,
      nearTriangleLimit: 220,
      farTriangleLimit: 64
    }),
    visual
  });
}

function createAntTrail(index, rng, terrainConfig, x, z, length, rotationY) {
  const width = inches(rng.range(2, 5));
  const thickness = inches(0.05);
  return placeProp({
    id: `ant-trail-${index}`,
    kind: 'ant_trail',
    displayName: 'Ant Road',
    x,
    z,
    rotationY,
    terrainConfig,
    blocking: false,
    climbable: false,
    collisionShape: {
      type: 'box',
      halfExtents: {
        x: length / 2,
        y: thickness / 2,
        z: width / 2
      }
    },
    visual: {
      length,
      width,
      thickness
    }
  });
}

function createLichenTower(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(18, 76));
  const z = center?.z ?? scaleWorld(rng.range(-62, -6));
  const radius = inches(rng.range(0.4, 2));
  const height = inches(rng.range(1.5, 8));
  return placeProp({
    id: `lichen-tower-${index}`,
    kind: 'lichen_tower',
    displayName: 'Lichen Tower',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    collisionShape: makeVisualMeshCollisionShape({
      radius: radius * 3.1,
      halfHeight: height / 2,
      nearTriangleLimit: 180,
      farTriangleLimit: 48
    }),
    visual: {
      radius,
      height,
      color: rng.choice([0xa7b86a, 0x8fa85c, 0xc4c17a])
    }
  });
}

function createShellShard(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(18, 78));
  const z = center?.z ?? scaleWorld(rng.range(-68, -12));
  const length = inches(rng.range(1.2, 5));
  const width = inches(rng.range(0.4, 2));
  const thickness = inches(rng.range(0.05, 0.4));
  return placeProp({
    id: `shell-shard-${index}`,
    kind: 'shell_shard',
    displayName: 'Shell Shard',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    collisionShape: makeVisualMeshCollisionShape({
      radius: Math.hypot(length / 2, width / 2),
      halfHeight: Math.max(thickness * 1.15, 0.02),
      nearTriangleLimit: 96,
      farTriangleLimit: 24
    }),
    powerup: {
      type: 'calcium',
      amount: Math.max(6, Number((length * 4.5).toFixed(1))),
      label: 'Calcium'
    },
    visual: {
      length,
      width,
      thickness,
      color: rng.choice([0xd6c8a2, 0xbfa57d, 0xe2d6b4])
    }
  });
}

function createSharpGrit(index, rng, terrainConfig, center = null) {
  const x = center?.x ?? scaleWorld(rng.range(18, 78));
  const z = center?.z ?? scaleWorld(rng.range(-68, -12));
  const radius = inches(rng.range(0.45, 1.7));
  return placeProp({
    id: `sharp-grit-${index}`,
    kind: 'sharp_grit',
    displayName: 'Sharp Grit',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    collisionShape: {
      type: 'sphere',
      radius
    },
    powerup: {
      type: 'grit',
      amount: Math.max(1, Number((radius * 1.8).toFixed(1))),
      label: 'Sharp Grit'
    },
    visual: {
      radius,
      color: rng.choice([0x9e8662, 0xb8a078, 0xc8bd98, 0x8f8b80])
    }
  });
}

function randomPointInCluster(rng, centerX, centerZ, radius) {
  const angle = rng.range(0, Math.PI * 2);
  const distance = Math.sqrt(rng.range(0, 1)) * radius;
  return {
    x: centerX + (Math.cos(angle) * distance),
    z: centerZ + (Math.sin(angle) * distance)
  };
}

function createCluster(count, factory, rng, terrainConfig, centerX, centerZ, radius, startIndex = 0) {
  return Array.from({ length: count }, (_, index) => (
    factory(startIndex + index, rng, terrainConfig, randomPointInCluster(rng, centerX, centerZ, radius))
  ));
}

function createAntRoads(rng, terrainConfig) {
  const roads = [];
  const roadSpecs = [
    { startX: scaleWorld(-82), startZ: scaleWorld(2), endX: scaleWorld(78), endZ: scaleWorld(30), segments: 7 },
    { startX: scaleWorld(-72), startZ: scaleWorld(-58), endX: scaleWorld(4), endZ: scaleWorld(84), segments: 6 }
  ];

  for (const spec of roadSpecs) {
    for (let index = 0; index < spec.segments; index += 1) {
      const alpha = (index + 0.5) / spec.segments;
      const nextAlpha = Math.min(1, (index + 1) / spec.segments);
      const prevAlpha = Math.max(0, index / spec.segments);
      const x = THREE.MathUtils.lerp(spec.startX, spec.endX, alpha) + scaleWorld(rng.range(-1.2, 1.2));
      const z = THREE.MathUtils.lerp(spec.startZ, spec.endZ, alpha) + scaleWorld(rng.range(-1.2, 1.2));
      const prevX = THREE.MathUtils.lerp(spec.startX, spec.endX, prevAlpha);
      const prevZ = THREE.MathUtils.lerp(spec.startZ, spec.endZ, prevAlpha);
      const nextX = THREE.MathUtils.lerp(spec.startX, spec.endX, nextAlpha);
      const nextZ = THREE.MathUtils.lerp(spec.startZ, spec.endZ, nextAlpha);
      const length = Math.hypot(nextX - prevX, nextZ - prevZ) * 0.62;
      const rotationY = Math.atan2(nextZ - prevZ, nextX - prevX);
      roads.push(createAntTrail(roads.length, rng, terrainConfig, x, z, length, rotationY));
    }
  }

  return roads;
}

function createFixedSnailFeatures(rng, terrainConfig) {
  return [
    ...createCluster(28, (index, clusterRng, config, point) => createForestTree(index, clusterRng, config, 'deciduous', point), rng, terrainConfig, scaleWorld(-26), scaleWorld(44), scaleWorld(20), 1000),
    ...createCluster(24, (index, clusterRng, config, point) => createForestTree(index, clusterRng, config, 'conifer', point), rng, terrainConfig, scaleWorld(24), scaleWorld(36), scaleWorld(20), 1000),
    ...createCluster(22, (index, clusterRng, config, point) => createForestTree(index, clusterRng, config, 'deciduous', point), rng, terrainConfig, scaleWorld(-48), scaleWorld(-2), scaleWorld(18), 2000),
    ...createCluster(20, (index, clusterRng, config, point) => createForestTree(index, clusterRng, config, 'conifer', point), rng, terrainConfig, scaleWorld(-42), scaleWorld(-18), scaleWorld(16), 2000),
    ...createCluster(24, createRootBranch, rng, terrainConfig, scaleWorld(-20), scaleWorld(28), scaleWorld(28), 1000),
    ...createCluster(32, createTwig, rng, terrainConfig, scaleWorld(-42), scaleWorld(-22), scaleWorld(34), 1000),
    ...createCluster(18, createFallenBranch, rng, terrainConfig, scaleWorld(-30), scaleWorld(12), scaleWorld(32), 1000),
    ...createCluster(28, createSprout, rng, terrainConfig, scaleWorld(-34), scaleWorld(24), scaleWorld(30), 1000),
    ...createCluster(18, createShrub, rng, terrainConfig, scaleWorld(-36), scaleWorld(28), scaleWorld(28), 1000),
    ...createCluster(10, createForestRock, rng, terrainConfig, scaleWorld(-22), scaleWorld(30), scaleWorld(34), 1000),
    ...createCluster(24, createTalusRock, rng, terrainConfig, scaleWorld(58), scaleWorld(-54), scaleWorld(32), 1000),
    ...createCluster(16, createDewBead, rng, terrainConfig, scaleWorld(-12), scaleWorld(38), scaleWorld(10), 1000),
    ...createCluster(4, createDewPool, rng, terrainConfig, scaleWorld(-8), scaleWorld(36), scaleWorld(12), 1000),
    ...createCluster(15, createMushroom, rng, terrainConfig, scaleWorld(20), scaleWorld(18), scaleWorld(13), 1000),
    ...createCluster(18, createSoftFood, rng, terrainConfig, scaleWorld(18), scaleWorld(20), scaleWorld(16), 1000),
    ...createCluster(13, createMossCushion, rng, terrainConfig, scaleWorld(-18), scaleWorld(8), scaleWorld(17), 1000),
    ...createCluster(10, createLichenTower, rng, terrainConfig, scaleWorld(42), scaleWorld(-18), scaleWorld(16), 1000),
    ...createCluster(11, createShellShard, rng, terrainConfig, scaleWorld(52), scaleWorld(-32), scaleWorld(18), 1000),
    ...createCluster(14, createSharpGrit, rng, terrainConfig, scaleWorld(54), scaleWorld(-36), scaleWorld(22), 1000),
    ...createAntRoads(rng, terrainConfig)
  ];
}

function createLandmarkProps(terrainConfig) {
  return FIXED_LANDMARKS.map((landmark) => (
    landmark.kind === 'mountain_landmark'
      ? createMountainMarker(landmark, terrainConfig)
      : createTreeProp(landmark, terrainConfig)
  ));
}

function scalePropCount(baseCount, areaScale) {
  return Math.max(1, Math.round(baseCount * areaScale));
}

const DISTRIBUTION_FILTERS = Object.freeze({
  forest: (weights) => weights.beachWeight < 0.24 && weights.waterWeight <= 0 && weights.mountainWeight < 0.32 && weights.gravelWeight < 0.58,
  forestOrRoots: (weights) => weights.beachWeight < 0.32 && weights.waterWeight <= 0 && weights.mountainWeight < 0.34,
  wet: (weights) => weights.beachWeight < 0.28 && weights.waterWeight <= 0 && weights.mountainWeight < 0.26 && weights.gravelWeight < 0.44,
  gravel: (weights) => weights.beachWeight < 0.36 && weights.waterWeight <= 0 && (weights.gravelWeight > 0.18 || weights.mountainWeight > 0.12),
  rocky: (weights) => weights.beachWeight < 0.38 && weights.waterWeight <= 0 && (weights.mountainWeight > 0.14 || weights.gravelWeight > 0.26),
  mountain: (weights) => weights.beachWeight < 0.42 && weights.waterWeight <= 0 && (weights.mountainWeight > 0.2 || weights.gravelWeight > 0.36)
});

function createDistributedProps(baseCount, factory, rng, terrainConfig, worldBounds, areaScale, startIndex = 0, distribution = null) {
  const predicate = distribution
    ? (point) => distribution(getExplorerTerrainRegionWeights(point.x, point.z, terrainConfig))
    : null;
  return Array.from({ length: scalePropCount(baseCount, areaScale) }, (_, index) => (
    factory(startIndex + index, rng, terrainConfig, randomPointInWorldBounds(rng, worldBounds, predicate))
  ));
}

function createBirdCreatures(seed, terrainConfig, worldBounds) {
  const rng = new SeededRandom(seed + 7301);
  const birdRegion = (point) => {
    const weights = getExplorerTerrainRegionWeights(point.x, point.z, terrainConfig);
    return weights.waterWeight <= 0 &&
      weights.beachWeight < 0.62 &&
      weights.mountainWeight < 0.48;
  };

  return Array.from({ length: EXPLORER_BIRD_COUNT }, (_, index) => {
    const point = randomPointInWorldBounds(rng, worldBounds, birdRegion);
    const bodyLength = inches(rng.range(7, 14));
    return {
      id: `bird-${index}`,
      kind: 'bird',
      displayName: 'Predator Bird',
      home: {
        x: point.x,
        z: point.z
      },
      phaseOffset: rng.range(0, Math.PI * 2),
      cooldown: rng.range(1.5, 6.5),
      patrolRadius: feet(rng.range(8, 22)),
      patrolSpeed: rng.range(0.12, 0.28),
      altitude: feet(rng.range(7, 17)),
      bodyLength,
      wingSpan: bodyLength * rng.range(1.7, 2.4)
    };
  });
}

function createFillerProps(seed, terrainConfig, worldBounds) {
  const rng = new SeededRandom(seed);
  const areaScale = getExplorerPatchworkAreaScale(worldBounds);
  return [
    ...createForestFloorPatchwork(rng, terrainConfig, worldBounds),
    ...createDistributedProps(9, createSaltCone, rng, terrainConfig, worldBounds, areaScale),
    ...createDistributedProps(24, createBambooStick, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.forestOrRoots),
    ...createDistributedProps(120, createGravel, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.gravel),
    ...createDistributedProps(12, createRottingLog, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.forest),
    ...createDistributedProps(22, createRock, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.rocky),
    ...createDistributedProps(26, createForestRock, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.forestOrRoots),
    ...createDistributedProps(54, (index, propRng, config, point) => createForestTree(index, propRng, config, 'deciduous', point), rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.forest),
    ...createDistributedProps(48, (index, propRng, config, point) => createForestTree(index, propRng, config, 'conifer', point), rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.forest),
    ...createDistributedProps(50, createMossCushion, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.wet),
    ...createDistributedProps(48, createDewBead, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.wet),
    ...createDistributedProps(6, createDewPool, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.wet),
    ...createDistributedProps(55, createSoftFood, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.forest),
    ...createDistributedProps(38, createMushroom, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.forest),
    ...createDistributedProps(24, createLichenTower, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.rocky),
    ...createDistributedProps(18, createShellShard, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.rocky),
    ...createDistributedProps(42, createSharpGrit, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.gravel),
    ...createDistributedProps(45, createRootBranch, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.forestOrRoots),
    ...createDistributedProps(58, createFallenBranch, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.forestOrRoots),
    ...createDistributedProps(80, createTwig, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.forestOrRoots),
    ...createDistributedProps(260, createSprout, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.forest),
    ...createDistributedProps(82, createShrub, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.forest),
    ...createDistributedProps(80, createTalusRock, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.mountain),
    ...createDistributedProps(34, createRockCluster, rng, terrainConfig, worldBounds, areaScale, 0, DISTRIBUTION_FILTERS.mountain),
    ...createFixedSnailFeatures(rng, terrainConfig)
  ].filter((prop) => isPointInsideWorldBounds(prop.position.x, prop.position.z, worldBounds));
}

export const EXPLORER_FEATURE_SYMBOLS = Object.freeze({
  outside: '□',
  moss: '·',
  leafLitter: ',',
  rootDirt: ':',
  gravelField: '░',
  beach: '∴',
  water: '≈',
  gravel: '•',
  saltCone: '○',
  bambooStick: '│',
  rottingLog: '▬',
  rock: '◆',
  forestRock: '◆',
  talusRock: '◇',
  rockCluster: '◈',
  mossCushion: '●',
  mossMat: '▚',
  dewBead: '◌',
  dewPool: '≋',
  softFood: '◍',
  mushroom: '♠',
  dryLeafPatch: '▒',
  dirtStickPatch: ';',
  rockFloorPatch: '▴',
  rootBranch: '╱',
  twig: '/',
  fallenBranch: '╲',
  sprout: '♧',
  shrub: '♮',
  antTrail: '=',
  lichenTower: '╎',
  shellShard: '△',
  sharpGrit: '✦',
  mountain: '▲',
  giantTree: '♣',
  deciduousTree: '♣',
  coniferTree: '♤',
  birdHome: 'V',
  playerStart: 'S',
  boss: 'B'
});

export const EXPLORER_ELEVATION_SYMBOLS = Object.freeze(['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']);

const FEATURE_LEGEND = Object.freeze({
  outside: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.outside, label: 'outside world bounds' }),
  moss: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.moss, label: 'moss forest floor' }),
  leafLitter: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.leafLitter, label: 'brown leaf-litter ground' }),
  rootDirt: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.rootDirt, label: 'exposed root dirt' }),
  gravelField: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.gravelField, label: 'gravel field' }),
  beach: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.beach, label: 'speckled beach sand' }),
  water: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.water, label: 'shallow water' }),
  gravel: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.gravel, label: 'snail-scale gravel chunk' }),
  saltCone: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.saltCone, label: 'salt pile' }),
  bambooStick: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.bambooStick, label: 'leaning stick' }),
  rottingLog: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.rottingLog, label: 'rotting log' }),
  rock: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.rock, label: 'rock' }),
  forestRock: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.forestRock, label: 'forest rock' }),
  talusRock: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.talusRock, label: 'mountain talus rock' }),
  rockCluster: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.rockCluster, label: 'clustered rocks' }),
  mossCushion: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.mossCushion, label: 'soft moss cushion' }),
  mossMat: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.mossMat, label: 'flat moss carpet' }),
  dewBead: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.dewBead, label: 'climbable dew bead' }),
  dewPool: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.dewPool, label: 'flat dew pool' }),
  softFood: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.softFood, label: 'soft edible rot' }),
  mushroom: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.mushroom, label: 'mushroom canopy' }),
  dryLeafPatch: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.dryLeafPatch, label: 'rough dry-leaf carpet patch' }),
  dirtStickPatch: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.dirtStickPatch, label: 'dirt patch with sticks' }),
  rockFloorPatch: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.rockFloorPatch, label: 'continuous coarse rock floor' }),
  rootBranch: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.rootBranch, label: 'exposed root branch' }),
  twig: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.twig, label: 'fallen twig' }),
  fallenBranch: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.fallenBranch, label: 'fallen branch' }),
  sprout: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.sprout, label: 'sprout' }),
  shrub: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.shrub, label: 'woody shrub' }),
  antTrail: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.antTrail, label: 'ant road' }),
  lichenTower: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.lichenTower, label: 'lichen tower' }),
  shellShard: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.shellShard, label: 'old shell shard' }),
  sharpGrit: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.sharpGrit, label: 'sharp grit' }),
  mountain: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.mountain, label: 'rocky mountain or spire' }),
  giantTree: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.giantTree, label: 'giant tree landmark' }),
  deciduousTree: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.deciduousTree, label: 'deciduous tree' }),
  coniferTree: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.coniferTree, label: 'conifer tree' }),
  birdHome: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.birdHome, label: 'predator bird patrol home' }),
  playerStart: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.playerStart, label: 'player start' }),
  boss: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.boss, label: 'boss start' })
});

const FEATURE_PRIORITY = Object.freeze({
  outside: 0,
  moss: 1,
  leafLitter: 2,
  rootDirt: 2,
  gravelField: 3,
  beach: 3,
  water: 1,
  gravel: 4,
  bambooStick: 5,
  saltCone: 6,
  rottingLog: 7,
  rock: 8,
  forestRock: 8,
  talusRock: 11,
  rockCluster: 11,
  mossCushion: 8,
  mossMat: 8,
  dewPool: 8,
  dewBead: 11,
  softFood: 10,
  dryLeafPatch: 9,
  dirtStickPatch: 9,
  rockFloorPatch: 13,
  rootBranch: 9,
  twig: 9,
  fallenBranch: 9,
  sprout: 9,
  shrub: 10,
  antTrail: 12,
  mushroom: 10,
  lichenTower: 10,
  shellShard: 10,
  sharpGrit: 10,
  deciduousTree: 11,
  coniferTree: 11,
  mountain: 13,
  birdHome: 12,
  giantTree: 12,
  boss: 13,
  playerStart: 14
});

const PROP_FEATURE_KEYS = Object.freeze({
  giant_tree: 'giantTree',
  deciduous_tree: 'deciduousTree',
  conifer_tree: 'coniferTree',
  rock_spire: 'mountain',
  mountain_landmark: 'mountain',
  salt_cone: 'saltCone',
  bamboo_stick: 'bambooStick',
  gravel: 'gravel',
  rotting_log: 'rottingLog',
  rock: 'rock',
  forest_rock: 'forestRock',
  talus_rock: 'talusRock',
  rock_cluster: 'rockCluster',
  moss_cushion: 'mossCushion',
  moss_mat: 'mossMat',
  dew_bead: 'dewBead',
  dew_pool: 'dewPool',
  soft_food: 'softFood',
  mushroom: 'mushroom',
  dry_leaf_patch: 'dryLeafPatch',
  dirt_stick_patch: 'dirtStickPatch',
  rock_floor_patch: 'rockFloorPatch',
  root_branch: 'rootBranch',
  twig: 'twig',
  fallen_branch: 'fallenBranch',
  sprout: 'sprout',
  shrub: 'shrub',
  ant_trail: 'antTrail',
  lichen_tower: 'lichenTower',
  shell_shard: 'shellShard',
  sharp_grit: 'sharpGrit'
});

function getFiniteNumber(value: any, fallback: number) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function getExplorerMapClip(world: any, options: any = {}) {
  const requestedShape = options.shape ?? options.mapShape ?? options.clipShape;
  const worldBounds = world.worldBounds ?? {
    shape: 'circle',
    radius: EXPLORER_TERRAIN_FEATURE_RADIUS
  };
  const radius = Math.max(1, getFiniteNumber(options.radius, worldBounds.radius ?? EXPLORER_WORLD_RADIUS));
  const centerX = getFiniteNumber(options.centerX, 0);
  const centerZ = getFiniteNumber(options.centerZ, 0);
  const hexRadius = Math.max(1, getFiniteNumber(options.hexRadius, radius));
  const hexRotation = getFiniteNumber(options.hexRotation, 0);
  const bounds = requestedShape === 'circle'
    ? { shape: 'circle', radius, centerX, centerZ }
    : requestedShape === 'hex'
      ? { shape: 'hex', radius, centerX, centerZ, hexRadius, hexRotation }
      : worldBounds;
  const gridRadius = getWorldBoundsOuterRadius(bounds);

  return {
    shape: bounds.shape ?? 'circle',
    mapName: world.mapName ?? bounds.mapName ?? EXPLORER_MAP_NAME,
    radius: bounds.radius ?? radius,
    centerX,
    centerZ,
    hexRadius: bounds.hexRadius ?? hexRadius,
    hexRotation: bounds.hexRotation ?? hexRotation,
    tiles: Array.isArray(bounds.tiles) ? bounds.tiles : [],
    forestTiles: Array.isArray(bounds.forestTiles) ? bounds.forestTiles : [],
    beachTiles: Array.isArray(bounds.beachTiles) ? bounds.beachTiles : [],
    bounds,
    gridRadius
  };
}

function isPointInsideExplorerMapClip(x, z, clip) {
  return isPointInsideWorldBounds(x, z, clip.bounds);
}

function getExplorerBackgroundFeature(x, z, terrainConfig, clip) {
  if (!isPointInsideExplorerMapClip(x, z, clip)) {
    return 'outside';
  }

  const coast = getExplorerCoastWeights(x, z, terrainConfig);
  const { mountainWeight, leafLitterWeight, rootDirtWeight, gravelWeight, beachWeight, waterWeight } = getExplorerTerrainRegionWeights(x, z, terrainConfig);
  if (coast.signedDistanceToLandEdge < 0 && waterWeight > 0.08) {
    return 'water';
  }

  if (beachWeight > 0.38) {
    return 'beach';
  }

  if (mountainWeight > 0.25) {
    return 'mountain';
  }

  if (rootDirtWeight > 0.42) {
    return 'rootDirt';
  }

  if (leafLitterWeight > 0.4) {
    return 'leafLitter';
  }

  if (gravelWeight > 0.35) {
    return 'gravelField';
  }

  return 'moss';
}

function getExplorerGridGeometry(radius, cellSize) {
  const numericCellSize = Number(cellSize);
  const minimumCellSize = Math.max(25, radius / 40);
  const safeCellSize = Number.isFinite(numericCellSize) && numericCellSize > 0
    ? clamp(numericCellSize, minimumCellSize, radius)
    : clamp(EXPLORER_MAP_DEFAULT_CELL_SIZE, minimumCellSize, radius);
  const halfCellCount = Math.max(1, Math.ceil(radius / safeCellSize));
  const minX = -halfCellCount * safeCellSize;
  const maxX = halfCellCount * safeCellSize;
  const minZ = -halfCellCount * safeCellSize;
  const maxZ = halfCellCount * safeCellSize;
  const width = (halfCellCount * 2) + 1;
  const height = width;

  return {
    cellSize: safeCellSize,
    width,
    height,
    bounds: { minX, maxX, minZ, maxZ }
  };
}

function getGridCellForWorldPosition(position, grid) {
  return {
    col: Math.round((position.x - grid.bounds.minX) / grid.cellSize),
    row: Math.round((grid.bounds.maxZ - position.z) / grid.cellSize)
  };
}

function setGridFeature(featureKeys, priorities, row, col, featureKey) {
  if (row < 0 || row >= featureKeys.length || col < 0 || col >= featureKeys[row].length) {
    return;
  }

  const nextPriority = FEATURE_PRIORITY[featureKey] ?? 0;
  if (nextPriority >= priorities[row][col]) {
    featureKeys[row][col] = featureKey;
    priorities[row][col] = nextPriority;
  }
}

function getElevationSymbol(height, minHeight, maxHeight) {
  if (!Number.isFinite(height)) {
    return EXPLORER_FEATURE_SYMBOLS.outside;
  }

  if (maxHeight <= minHeight) {
    return EXPLORER_ELEVATION_SYMBOLS[Math.floor(EXPLORER_ELEVATION_SYMBOLS.length / 2)];
  }

  const bucket = clamp(
    Math.floor(((height - minHeight) / (maxHeight - minHeight)) * EXPLORER_ELEVATION_SYMBOLS.length),
    0,
    EXPLORER_ELEVATION_SYMBOLS.length - 1
  );
  return EXPLORER_ELEVATION_SYMBOLS[bucket];
}

function createElevationLegend(minHeight, maxHeight) {
  const span = maxHeight - minHeight;
  return {
    outside: FEATURE_LEGEND.outside,
    buckets: EXPLORER_ELEVATION_SYMBOLS.map((symbol, index) => {
      const from = minHeight + (span * (index / EXPLORER_ELEVATION_SYMBOLS.length));
      const to = minHeight + (span * ((index + 1) / EXPLORER_ELEVATION_SYMBOLS.length));
      return {
        symbol,
        minInclusive: Number(from.toFixed(3)),
        maxExclusive: index === EXPLORER_ELEVATION_SYMBOLS.length - 1 ? null : Number(to.toFixed(3))
      };
    })
  };
}

export function createExplorerTerrainConfig(seed = EXPLORER_DEFAULT_SEED, worldBounds = createExplorerWorldBounds()) {
  return normalizeTerrainConfig({
    preset: EXPLORER_TERRAIN_PRESET,
    centerHeight: 0,
    horizontalScale: scaleWorld(28),
    verticalScale: scaleWorld(6),
    explorerSeed: normalizeSeed(seed) % 999999 || EXPLORER_DEFAULT_SEED,
    visualSize: EXPLORER_WORLD_RADIUS * 2.2,
    visualSegments: 180,
    worldRadius: EXPLORER_TERRAIN_FEATURE_RADIUS,
    shoreline: {
      mapName: EXPLORER_MAP_NAME,
      forestBounds: worldBounds.forestBounds,
      beachBounds: worldBounds.beachBounds,
      landBounds: worldBounds.landBounds,
      playBounds: {
        shape: worldBounds.shape,
        radius: worldBounds.radius,
        boundary: worldBounds.boundary
      },
      beachWidth: EXPLORER_BEACH_WIDTH,
      forestBeachBlend: EXPLORER_FOREST_BEACH_BLEND,
      waterLevel: -0.55,
      waterDepth: 1.65,
      waterBlend: scaleWorld(5.5)
    }
  });
}

export function createExplorerWorldBounds() {
  const forestTiles = EXPLORER_FOREST_HEX_TILES.map((tile) => ({ ...tile }));
  const beachTiles = EXPLORER_BEACH_HEX_TILES.map((tile) => ({ ...tile }));
  const tiles = EXPLORER_HEX_TILES.map((tile) => ({ ...tile }));
  const forestBounds = {
    shape: 'hex_cluster',
    radius: EXPLORER_FOREST_RADIUS,
    hexRadius: EXPLORER_HEX_TILE_RADIUS,
    tiles: forestTiles,
    boundary: EXPLORER_FOREST_BOUNDARY.map((point) => ({ ...point }))
  };
  const beachBounds = {
    shape: 'hex_cluster',
    radius: EXPLORER_LAND_RADIUS,
    hexRadius: EXPLORER_HEX_TILE_RADIUS,
    tiles: beachTiles
  };
  const landBounds = {
    shape: 'hex_cluster',
    radius: EXPLORER_LAND_RADIUS,
    hexRadius: EXPLORER_HEX_TILE_RADIUS,
    tiles
  };
  const landBoundary = getWorldBoundsBoundaryPoints(landBounds);
  const waterBoundary = getScaledBoundary(landBoundary, EXPLORER_WATER_MARGIN);

  return {
    shape: 'coastal_hex_cluster',
    mapName: EXPLORER_MAP_NAME,
    radius: getWorldBoundsOuterRadius({ shape: 'polygon', boundary: waterBoundary }),
    hexRadius: EXPLORER_HEX_TILE_RADIUS,
    waterMargin: EXPLORER_WATER_MARGIN,
    beachWidth: EXPLORER_BEACH_WIDTH,
    forestBeachBlend: EXPLORER_FOREST_BEACH_BLEND,
    tiles,
    forestTiles,
    beachTiles,
    forestBounds,
    beachBounds,
    landBounds: {
      ...landBounds,
      boundary: landBoundary
    },
    boundary: waterBoundary
  };
}

export function createExplorerWorld(seed = EXPLORER_DEFAULT_SEED) {
  const normalizedSeed = normalizeSeed(seed);
  const worldBounds = createExplorerWorldBounds();
  const terrainConfig = createExplorerTerrainConfig(normalizedSeed, worldBounds);
  const landmarks = FIXED_LANDMARKS.map((landmark) => ({ ...landmark }));
  const propBounds = worldBounds.landBounds ?? worldBounds;
  const props = [
    ...createLandmarkProps(terrainConfig),
    ...createFillerProps(normalizedSeed, terrainConfig, propBounds)
  ];
  const creatures = createBirdCreatures(normalizedSeed, terrainConfig, propBounds);
  const bossStart = {
    x: scaleWorld(64),
    z: scaleWorld(-52),
    rotationY: -Math.PI / 3
  };

  return {
    worldgenVersion: EXPLORER_WORLDGEN_VERSION,
    mapName: EXPLORER_MAP_NAME,
    seed: normalizedSeed,
    terrainConfig,
    worldBounds,
    playerStart: { ...EXPLORER_PLAYER_START },
    bossParticipant: {
      slot: EXPLORER_BOSS_SLOT,
      profile: 'bot',
      connected: true,
      position: {
        x: bossStart.x,
        z: bossStart.z
      },
      rotationY: bossStart.rotationY,
      displayName: 'Rocky Crown Snail'
    },
    landmarks,
    creatures,
    props
  };
}

function isExplorerWorld(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    value.terrainConfig &&
    Array.isArray(value.props) &&
    value.worldBounds
  );
}

export function createExplorerMapGrids(worldOrSeed: any = EXPLORER_DEFAULT_SEED, options: any = {}) {
  const world = isExplorerWorld(worldOrSeed)
    ? worldOrSeed
    : createExplorerWorld(worldOrSeed);
  const clip = getExplorerMapClip(world, options);
  const grid = getExplorerGridGeometry(clip.gridRadius, options.cellSize ?? EXPLORER_MAP_DEFAULT_CELL_SIZE);
  const featureKeys = [];
  const priorities = [];
  const heightRows = [];
  const finiteHeights = [];

  for (let row = 0; row < grid.height; row += 1) {
    const z = grid.bounds.maxZ - (row * grid.cellSize);
    const featureRow = [];
    const priorityRow = [];
    const heightRow = [];

    for (let col = 0; col < grid.width; col += 1) {
      const x = grid.bounds.minX + (col * grid.cellSize);
      const backgroundFeature = getExplorerBackgroundFeature(x, z, world.terrainConfig, clip);
      const insideWorld = backgroundFeature !== 'outside';
      const height = insideWorld ? getTerrainHeight(x, z, world.terrainConfig) : null;

      featureRow.push(backgroundFeature);
      priorityRow.push(FEATURE_PRIORITY[backgroundFeature] ?? 0);
      heightRow.push(Number.isFinite(height) ? Number(height.toFixed(3)) : null);
      if (Number.isFinite(height)) {
        finiteHeights.push(height);
      }
    }

    featureKeys.push(featureRow);
    priorities.push(priorityRow);
    heightRows.push(heightRow);
  }

  for (const prop of world.props) {
    const featureKey = PROP_FEATURE_KEYS[prop.kind];
    if (!featureKey) {
      continue;
    }

    if (!isPointInsideExplorerMapClip(prop.position.x, prop.position.z, clip)) {
      continue;
    }

    const { row, col } = getGridCellForWorldPosition(prop.position, grid);
    setGridFeature(featureKeys, priorities, row, col, featureKey);
  }

  for (const creature of world.creatures ?? []) {
    if (creature.kind !== 'bird') {
      continue;
    }

    const position = creature.home ?? creature.position;
    if (!position || !isPointInsideExplorerMapClip(position.x, position.z, clip)) {
      continue;
    }

    const { row, col } = getGridCellForWorldPosition(position, grid);
    setGridFeature(featureKeys, priorities, row, col, 'birdHome');
  }

  if (isPointInsideExplorerMapClip(world.playerStart.x, world.playerStart.z, clip)) {
    const playerCell = getGridCellForWorldPosition(world.playerStart, grid);
    setGridFeature(featureKeys, priorities, playerCell.row, playerCell.col, 'playerStart');
  }

  if (isPointInsideExplorerMapClip(world.bossParticipant.position.x, world.bossParticipant.position.z, clip)) {
    const bossCell = getGridCellForWorldPosition(world.bossParticipant.position, grid);
    setGridFeature(featureKeys, priorities, bossCell.row, bossCell.col, 'boss');
  }

  const minHeight = finiteHeights.length > 0 ? Math.min(...finiteHeights) : 0;
  const maxHeight = finiteHeights.length > 0 ? Math.max(...finiteHeights) : 0;
  const featureRows = featureKeys.map((row) => row.map((featureKey) => (
    FEATURE_LEGEND[featureKey]?.symbol ?? EXPLORER_FEATURE_SYMBOLS.outside
  )).join(''));
  const elevationRows = heightRows.map((row) => row.map((height) => (
    getElevationSymbol(height, minHeight, maxHeight)
  )).join(''));

  return {
    worldgenVersion: world.worldgenVersion ?? 1,
    mapName: world.mapName ?? clip.mapName,
    seed: world.seed,
    shape: clip.shape,
    clip: {
      shape: clip.shape,
      radius: Number(clip.radius.toFixed(3)),
      centerX: Number(clip.centerX.toFixed(3)),
      centerZ: Number(clip.centerZ.toFixed(3)),
      hexRadius: Number(clip.hexRadius.toFixed(3)),
      hexRotation: Number(clip.hexRotation.toFixed(6)),
      hexRotationDegrees: Number(((clip.hexRotation * 180) / Math.PI).toFixed(3)),
      beachWidth: Number((clip.bounds.beachWidth ?? 0).toFixed(3)),
      waterMargin: Number((clip.bounds.waterMargin ?? 0).toFixed(3)),
      tileCount: clip.tiles.length,
      forestTileCount: clip.forestTiles.length,
      beachTileCount: clip.beachTiles.length
    },
    cellSize: grid.cellSize,
    width: grid.width,
    height: grid.height,
    bounds: grid.bounds,
    origin: {
      row0Col0: { x: grid.bounds.minX, z: grid.bounds.maxZ },
      columns: 'x ascending',
      rows: 'z descending'
    },
    legend: {
      features: FEATURE_LEGEND,
      elevation: createElevationLegend(minHeight, maxHeight)
    },
    minHeight: Number(minHeight.toFixed(3)),
    maxHeight: Number(maxHeight.toFixed(3)),
    featureRows,
    elevationRows,
    heightRows,
    featureGrid: featureRows.join('\n'),
    elevationGrid: elevationRows.join('\n')
  };
}
