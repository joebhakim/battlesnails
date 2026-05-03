import {
  EXPLORER_TERRAIN_PRESET,
  EXPLORER_REFERENCE_WORLD_RADIUS,
  getExplorerTerrainRegionWeights,
  getTerrainHeight,
  normalizeTerrainConfig
} from './Terrain.js';
import { SeededRandom, normalizeSeed } from '../sim/SeededRandom.js';

export const EXPLORER_WORLD_SCALE = 10;
export const EXPLORER_WORLD_RADIUS = EXPLORER_REFERENCE_WORLD_RADIUS * EXPLORER_WORLD_SCALE;
export const EXPLORER_MAP_DEFAULT_CELL_SIZE = 100;
export const EXPLORER_DEFAULT_SEED = 137;
export const EXPLORER_PLAYER_START = Object.freeze({ x: 0, z: 12 * EXPLORER_WORLD_SCALE, rotationY: Math.PI });
export const EXPLORER_BOSS_SLOT = 2;

const WORLD_SCALE = EXPLORER_WORLD_SCALE;
const scaleWorld = (value) => value * WORLD_SCALE;

const FIXED_LANDMARKS = Object.freeze([
  Object.freeze({ id: 'elder-tree', kind: 'giant_tree', x: scaleWorld(-24), z: scaleWorld(36), radius: scaleWorld(5.4), height: scaleWorld(34), label: 'Elder Moss Tree' }),
  Object.freeze({ id: 'needle-tree', kind: 'giant_tree', x: scaleWorld(28), z: scaleWorld(28), radius: scaleWorld(4.6), height: scaleWorld(42), label: 'Needle Tree' }),
  Object.freeze({ id: 'twin-tree-west', kind: 'giant_tree', x: scaleWorld(-50), z: scaleWorld(-8), radius: scaleWorld(3.8), height: scaleWorld(30), label: 'Twin Tree West' }),
  Object.freeze({ id: 'twin-tree-east', kind: 'giant_tree', x: scaleWorld(-42), z: scaleWorld(-16), radius: scaleWorld(3.5), height: scaleWorld(28), label: 'Twin Tree East' }),
  Object.freeze({ id: 'rocky-crown', kind: 'mountain_landmark', x: scaleWorld(58), z: scaleWorld(-58), radius: scaleWorld(18), height: scaleWorld(28), label: 'Rocky Crown' })
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getShapeHalfHeight(shape = {}, fallback = 0.5) {
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

  return Number.isFinite(shape.radius) ? shape.radius : fallback;
}

function getPropRadius(shape = {}, fallback = 1) {
  if (shape.type === 'box') {
    const halfExtents = shape.halfExtents ?? {};
    return Math.hypot(halfExtents.x ?? fallback, halfExtents.z ?? fallback);
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
  interactionKind = null,
  visual = {}
}) {
  const halfHeight = getShapeHalfHeight(collisionShape);
  const position = {
    x,
    y: getTerrainHeight(x, z, terrainConfig) + halfHeight,
    z
  };
  const radius = getPropRadius(collisionShape, visual.radius ?? 1);

  return {
    id,
    kind,
    displayName: displayName ?? kind,
    position,
    rotationY,
    bodyRadius: radius,
    blocking,
    interactionKind,
    collisionShape,
    visual
  };
}

function createTreeProp(landmark, terrainConfig) {
  return placeProp({
    id: landmark.id,
    kind: 'giant_tree',
    displayName: landmark.label,
    x: landmark.x,
    z: landmark.z,
    terrainConfig,
    collisionShape: {
      type: 'cylinder',
      radius: landmark.radius,
      halfHeight: landmark.height / 2
    },
    visual: {
      radius: landmark.radius,
      height: landmark.height
    }
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
    collisionShape: {
      type: 'cylinder',
      radius,
      halfHeight: height / 2
    },
    visual: {
      radius,
      height
    }
  });
}

function createSaltCone(index, rng, terrainConfig) {
  const angle = rng.range(0, Math.PI * 2);
  const distance = scaleWorld(rng.range(38, 88));
  const radius = scaleWorld(rng.range(0.8, 2.2));
  const x = Math.sin(angle) * distance;
  const z = Math.cos(angle) * distance;
  const height = radius * rng.range(1.15, 1.55);
  return placeProp({
    id: `salt-cone-${index}`,
    kind: 'salt_cone',
    displayName: 'Salt',
    x,
    z,
    terrainConfig,
    collisionShape: {
      type: 'cylinder',
      radius,
      halfHeight: height / 2
    },
    visual: { radius, height }
  });
}

function createBambooStick(index, rng, terrainConfig) {
  const x = scaleWorld(rng.range(-78, 72));
  const z = scaleWorld(rng.range(-4, 76));
  const length = scaleWorld(rng.range(4.5, 8));
  const radius = scaleWorld(rng.range(0.08, 0.16));
  const tilt = rng.range(10, 30) * Math.PI / 180;
  const rotationY = rng.range(0, Math.PI * 2);
  const footprint = Math.max(radius * 2.5, Math.sin(tilt) * length * 0.5);
  return placeProp({
    id: `bamboo-stick-${index}`,
    kind: 'bamboo_stick',
    displayName: 'Bamboo Stick',
    x,
    z,
    rotationY,
    terrainConfig,
    collisionShape: {
      type: 'box',
      halfExtents: {
        x: footprint,
        y: Math.cos(tilt) * length * 0.5,
        z: footprint
      }
    },
    visual: { length, radius, tilt }
  });
}

function createGravel(index, rng, terrainConfig) {
  const x = scaleWorld(rng.range(10, 72));
  const z = scaleWorld(rng.range(-58, -4));
  const radius = rng.range(0.18, 0.46);
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

function createRottingLog(index, rng, terrainConfig) {
  const x = scaleWorld(rng.range(-54, 34));
  const z = scaleWorld(rng.range(-2, 62));
  const length = scaleWorld(rng.range(4, 8));
  const radius = scaleWorld(rng.range(0.45, 0.8));
  return placeProp({
    id: `rotting-log-${index}`,
    kind: 'rotting_log',
    displayName: 'Rotting Log',
    x,
    z,
    rotationY: rng.range(0, Math.PI * 2),
    terrainConfig,
    collisionShape: {
      type: 'box',
      halfExtents: {
        x: length / 2,
        y: radius,
        z: radius
      }
    },
    interactionKind: 'rotting_log',
    visual: { length, radius }
  });
}

function createRock(index, rng, terrainConfig) {
  const x = scaleWorld(rng.range(36, 84));
  const z = scaleWorld(rng.range(-82, -24));
  const radius = scaleWorld(rng.range(1.1, 3.4));
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

function createLandmarkProps(terrainConfig) {
  return FIXED_LANDMARKS.map((landmark) => (
    landmark.kind === 'mountain_landmark'
      ? createMountainMarker(landmark, terrainConfig)
      : createTreeProp(landmark, terrainConfig)
  ));
}

function createFillerProps(seed, terrainConfig) {
  const rng = new SeededRandom(seed);
  return [
    ...Array.from({ length: 9 }, (_, index) => createSaltCone(index, rng, terrainConfig)),
    ...Array.from({ length: 15 }, (_, index) => createBambooStick(index, rng, terrainConfig)),
    ...Array.from({ length: 42 }, (_, index) => createGravel(index, rng, terrainConfig)),
    ...Array.from({ length: 9 }, (_, index) => createRottingLog(index, rng, terrainConfig)),
    ...Array.from({ length: 12 }, (_, index) => createRock(index, rng, terrainConfig))
  ].filter((prop) => Math.hypot(prop.position.x, prop.position.z) < EXPLORER_WORLD_RADIUS - clamp(prop.bodyRadius, 0, scaleWorld(8)));
}

export const EXPLORER_FEATURE_SYMBOLS = Object.freeze({
  outside: '□',
  moss: '·',
  sand: '≈',
  gravelField: '░',
  gravel: '•',
  saltCone: '○',
  bambooStick: '│',
  rottingLog: '▬',
  rock: '◆',
  mountain: '▲',
  giantTree: '♣',
  playerStart: 'S',
  boss: 'B'
});

export const EXPLORER_ELEVATION_SYMBOLS = Object.freeze(['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']);

const FEATURE_LEGEND = Object.freeze({
  outside: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.outside, label: 'outside world bounds' }),
  moss: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.moss, label: 'moss forest floor' }),
  sand: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.sand, label: 'rolling sand' }),
  gravelField: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.gravelField, label: 'gravel field' }),
  gravel: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.gravel, label: 'snail-scale gravel chunk' }),
  saltCone: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.saltCone, label: 'salt pile' }),
  bambooStick: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.bambooStick, label: 'leaning stick' }),
  rottingLog: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.rottingLog, label: 'rotting log' }),
  rock: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.rock, label: 'rock' }),
  mountain: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.mountain, label: 'rocky mountain or spire' }),
  giantTree: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.giantTree, label: 'giant tree landmark' }),
  playerStart: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.playerStart, label: 'player start' }),
  boss: Object.freeze({ symbol: EXPLORER_FEATURE_SYMBOLS.boss, label: 'boss start' })
});

const FEATURE_PRIORITY = Object.freeze({
  outside: 0,
  moss: 1,
  sand: 2,
  gravelField: 3,
  gravel: 4,
  bambooStick: 5,
  saltCone: 6,
  rottingLog: 7,
  rock: 8,
  mountain: 9,
  giantTree: 10,
  boss: 11,
  playerStart: 12
});

const PROP_FEATURE_KEYS = Object.freeze({
  giant_tree: 'giantTree',
  rock_spire: 'mountain',
  mountain_landmark: 'mountain',
  salt_cone: 'saltCone',
  bamboo_stick: 'bambooStick',
  gravel: 'gravel',
  rotting_log: 'rottingLog',
  rock: 'rock'
});

function getExplorerBackgroundFeature(x, z, terrainConfig, radius) {
  if (Math.hypot(x, z) > radius) {
    return 'outside';
  }

  const { mountainWeight, desertWeight, gravelWeight } = getExplorerTerrainRegionWeights(x, z, terrainConfig);
  if (mountainWeight > 0.25) {
    return 'mountain';
  }

  if (desertWeight > 0.4) {
    return 'sand';
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

export function createExplorerTerrainConfig(seed = EXPLORER_DEFAULT_SEED) {
  return normalizeTerrainConfig({
    preset: EXPLORER_TERRAIN_PRESET,
    centerHeight: 0,
    horizontalScale: scaleWorld(28),
    verticalScale: scaleWorld(6),
    explorerSeed: normalizeSeed(seed) % 999999 || EXPLORER_DEFAULT_SEED,
    visualSize: EXPLORER_WORLD_RADIUS * 2.2,
    visualSegments: 180,
    worldRadius: EXPLORER_WORLD_RADIUS
  });
}

export function createExplorerWorld(seed = EXPLORER_DEFAULT_SEED) {
  const normalizedSeed = normalizeSeed(seed);
  const terrainConfig = createExplorerTerrainConfig(normalizedSeed);
  const landmarks = FIXED_LANDMARKS.map((landmark) => ({ ...landmark }));
  const props = [
    ...createLandmarkProps(terrainConfig),
    ...createFillerProps(normalizedSeed, terrainConfig)
  ];
  const bossStart = {
    x: scaleWorld(64),
    z: scaleWorld(-52),
    rotationY: -Math.PI / 3
  };

  return {
    seed: normalizedSeed,
    terrainConfig,
    worldBounds: {
      radius: EXPLORER_WORLD_RADIUS
    },
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

export function createExplorerMapGrids(worldOrSeed = EXPLORER_DEFAULT_SEED, options = {}) {
  const world = isExplorerWorld(worldOrSeed)
    ? worldOrSeed
    : createExplorerWorld(worldOrSeed);
  const radius = Number.isFinite(options.radius)
    ? Math.max(1, options.radius)
    : world.worldBounds.radius;
  const grid = getExplorerGridGeometry(radius, options.cellSize ?? EXPLORER_MAP_DEFAULT_CELL_SIZE);
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
      const backgroundFeature = getExplorerBackgroundFeature(x, z, world.terrainConfig, radius);
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

    const { row, col } = getGridCellForWorldPosition(prop.position, grid);
    setGridFeature(featureKeys, priorities, row, col, featureKey);
  }

  const playerCell = getGridCellForWorldPosition(world.playerStart, grid);
  setGridFeature(featureKeys, priorities, playerCell.row, playerCell.col, 'playerStart');

  const bossCell = getGridCellForWorldPosition(world.bossParticipant.position, grid);
  setGridFeature(featureKeys, priorities, bossCell.row, bossCell.col, 'boss');

  const minHeight = finiteHeights.length > 0 ? Math.min(...finiteHeights) : 0;
  const maxHeight = finiteHeights.length > 0 ? Math.max(...finiteHeights) : 0;
  const featureRows = featureKeys.map((row) => row.map((featureKey) => (
    FEATURE_LEGEND[featureKey]?.symbol ?? EXPLORER_FEATURE_SYMBOLS.outside
  )).join(''));
  const elevationRows = heightRows.map((row) => row.map((height) => (
    getElevationSymbol(height, minHeight, maxHeight)
  )).join(''));

  return {
    seed: world.seed,
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
