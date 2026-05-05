import {
  ARENA_BIRD_PANIC_STAGE,
  ARENA_CALCIUM_CROWN_STAGE,
  ARENA_DEW_RUSH_STAGE,
  ARENA_FEAST_FRENZY_STAGE,
  ARENA_HIGH_LEAF_STAGE,
  ARENA_SALT_BOWL_STAGE,
  ARENA_SHELL_DERBY_STAGE,
  DEFAULT_TERRAIN_CONFIG,
  EXPLORER_TERRAIN_PRESET,
  getTerrainHeight,
  isArenaEventTerrainPreset,
  normalizeTerrainConfig
} from '../world/Terrain.js';
import { createExplorerWorld } from '../world/ExplorerWorld.js';

const DEFAULT_EVENT_ARENA_RADIUS = 24;

function createEventTerrainConfig(stagePreset, radius = DEFAULT_EVENT_ARENA_RADIUS) {
  return normalizeTerrainConfig({
    ...DEFAULT_TERRAIN_CONFIG,
    preset: stagePreset,
    centerHeight: 0,
    horizontalScale: 10,
    verticalScale: 1,
    visualSize: Math.max(60, radius * 2.6),
    visualSegments: 56,
    worldRadius: radius
  });
}

function makeProp({
  id,
  kind,
  displayName,
  x,
  z,
  terrainConfig,
  radius = 1,
  height = 1,
  rotationY = 0,
  blocking = false,
  climbable = false,
  interactionKind = null,
  powerup = null,
  collisionShape = null,
  visual = {}
}: any) {
  const halfHeight = height / 2;
  const shape = collisionShape ?? {
    type: 'cylinder',
    radius,
    halfHeight
  };
  const y = getTerrainHeight(x, z, terrainConfig) + halfHeight;
  return {
    id,
    kind,
    displayName,
    position: { x, y, z },
    rotationY,
    bodyRadius: radius,
    blocking,
    climbable,
    interactionKind,
    powerup,
    collisionShape: shape,
    visual: {
      radius,
      height,
      ...visual
    }
  };
}

function createRing(count, radius, factory) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return factory(index, angle, Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
}

function createBarrierRing(stageId, terrainConfig, radius, count = 14, kind = 'rock_spire') {
  return createRing(count, radius, (index, angle, x, z) => makeProp({
    id: `${stageId}-rim-${index}`,
    kind,
    displayName: 'Arena Rim',
    x,
    z,
    terrainConfig,
    radius: kind === 'salt_cone' ? 1.5 : 1.8,
    height: kind === 'salt_cone' ? 4 : 6,
    rotationY: angle,
    blocking: true,
    climbable: true,
    visual: kind === 'salt_cone'
      ? { radius: 1.5, height: 4 }
      : { radius: 1.8, height: 6, color: 0x5f6260 }
  }));
}

function createDewRushStage(terrainConfig) {
  return [
    ...createBarrierRing('dew-rush', terrainConfig, 22, 12, 'bamboo_stick'),
    makeProp({
      id: 'dew-rush-center',
      kind: 'dew_bead',
      displayName: 'Dawn Dew',
      x: 0,
      z: 0,
      terrainConfig,
      radius: 4.8,
      height: 9.6,
      blocking: true,
      climbable: true,
      powerup: { type: 'dew', amount: 14, label: 'Dawn Dew' },
      visual: { radius: 4.8 }
    }),
    ...createRing(6, 11, (index, _angle, x, z) => makeProp({
      id: `dew-rush-bead-${index}`,
      kind: 'dew_bead',
      displayName: 'Dew',
      x,
      z,
      terrainConfig,
      radius: 1.2,
      height: 2.4,
      powerup: { type: 'dew', amount: 3, label: 'Dew' },
      visual: { radius: 1.2 }
    }))
  ];
}

function createSaltBowlStage(terrainConfig) {
  return [
    ...createBarrierRing('salt-bowl', terrainConfig, 23, 20, 'salt_cone'),
    ...createRing(8, 10, (index, angle, x, z) => makeProp({
      id: `salt-bowl-inner-${index}`,
      kind: 'salt_cone',
      displayName: 'Salt Pile',
      x,
      z,
      terrainConfig,
      radius: 1.8,
      height: 4.6,
      rotationY: angle,
      blocking: true,
      climbable: true,
      visual: { radius: 1.8, height: 4.6 }
    })),
    makeProp({
      id: 'salt-bowl-dew',
      kind: 'dew_pool',
      displayName: 'Center Dew',
      x: 0,
      z: 0,
      terrainConfig,
      radius: 4.2,
      height: 0.2,
      powerup: { type: 'dew', amount: 6, label: 'Center Dew' },
      visual: { radius: 4.2, height: 0.2 }
    })
  ];
}

function createShellDerbyStage(terrainConfig) {
  return [
    ...[-9, 9].flatMap((z, lane) => Array.from({ length: 5 }, (_, index) => makeProp({
      id: `shell-derby-wall-${lane}-${index}`,
      kind: 'rotting_log',
      displayName: 'Derby Rail',
      x: -16 + index * 8,
      z,
      terrainConfig,
      radius: 0.8,
      height: 1.6,
      rotationY: 0,
      blocking: true,
      climbable: true,
      collisionShape: {
        type: 'box',
        halfExtents: { x: 3.8, y: 0.8, z: 0.8 }
      },
      visual: { length: 7.6, radius: 0.8 }
    }))),
    ...createRing(10, 8.5, (index, _angle, x, z) => makeProp({
      id: `shell-derby-grit-${index}`,
      kind: 'sharp_grit',
      displayName: 'Derby Grit',
      x,
      z,
      terrainConfig,
      radius: 0.8,
      height: 1.6,
      powerup: { type: 'grit', amount: 2, label: 'Derby Grit' },
      visual: { radius: 0.8, color: 0xc8bd98 }
    }))
  ];
}

function createFeastFrenzyStage(terrainConfig) {
  return [
    ...createBarrierRing('feast-frenzy', terrainConfig, 22, 10, 'rock_spire'),
    ...createRing(16, 7.5, (index, _angle, x, z) => makeProp({
      id: `feast-frenzy-food-${index}`,
      kind: 'soft_food',
      displayName: 'Soft Food',
      x,
      z,
      terrainConfig,
      radius: 1.5,
      height: 0.55,
      powerup: { type: 'food', amount: 70, label: 'Soft Food' },
      visual: { radius: 1.5, height: 0.55, color: 0xb58a4a }
    })),
    makeProp({
      id: 'feast-frenzy-log',
      kind: 'rotting_log',
      displayName: 'Feast Log',
      x: 0,
      z: 0,
      terrainConfig,
      radius: 1.8,
      height: 3.6,
      rotationY: Math.PI / 2,
      blocking: true,
      climbable: true,
      interactionKind: 'rotting_log',
      collisionShape: {
        type: 'box',
        halfExtents: { x: 8, y: 1.8, z: 1.8 }
      },
      visual: { length: 16, radius: 1.8 }
    })
  ];
}

function createHighLeafStage(terrainConfig) {
  return [
    makeProp({
      id: 'high-leaf-tower',
      kind: 'lichen_tower',
      displayName: 'High Leaf',
      x: 0,
      z: 0,
      terrainConfig,
      radius: 4.5,
      height: 35,
      blocking: true,
      climbable: true,
      visual: { radius: 4.5, height: 35, color: 0x8fa85c }
    }),
    ...createRing(5, 13, (index, angle, x, z) => makeProp({
      id: `high-leaf-branch-${index}`,
      kind: 'fallen_branch',
      displayName: 'Leaning Branch',
      x,
      z,
      terrainConfig,
      radius: 0.7,
      height: 1.4,
      rotationY: angle + Math.PI / 2,
      blocking: true,
      climbable: true,
      collisionShape: {
        type: 'box',
        halfExtents: { x: 5.2, y: 1.2, z: 0.9 }
      },
      visual: { length: 10.5, radius: 0.55, tilt: 0.65, sideSpan: 1.6 }
    }))
  ];
}

function createBirdPanicStage(terrainConfig) {
  return [
    ...createBarrierRing('bird-panic', terrainConfig, 23, 12, 'rock_spire'),
    ...createRing(7, 10.5, (index, angle, x, z) => makeProp({
      id: `bird-panic-cover-${index}`,
      kind: index % 2 === 0 ? 'shrub' : 'rotting_log',
      displayName: 'Panic Cover',
      x,
      z,
      terrainConfig,
      radius: 2.4,
      height: 3.6,
      rotationY: angle,
      blocking: true,
      climbable: true,
      collisionShape: index % 2 === 0
        ? { type: 'cylinder', radius: 2.4, halfHeight: 1.8 }
        : { type: 'box', halfExtents: { x: 4.6, y: 1.1, z: 1.1 } },
      visual: index % 2 === 0
        ? { radius: 2.4, height: 3.6, collisionRadius: 2.4, stemCount: 4, leafCount: 5, color: 0x405f32 }
        : { length: 9.2, radius: 1.1 }
    }))
  ];
}

function createCalciumCrownStage(terrainConfig) {
  return [
    ...createBarrierRing('calcium-crown', terrainConfig, 22, 10, 'rock_spire'),
    makeProp({
      id: 'calcium-crown-center',
      kind: 'shell_shard',
      displayName: 'Calcium Crown',
      x: 0,
      z: 0,
      terrainConfig,
      radius: 4.2,
      height: 0.7,
      rotationY: Math.PI / 5,
      powerup: { type: 'calcium', amount: 32, label: 'Calcium Crown' },
      collisionShape: {
        type: 'box',
        halfExtents: { x: 5.4, y: 0.35, z: 2.4 }
      },
      visual: { length: 10.8, width: 4.8, thickness: 0.7, color: 0xe2d6b4 }
    }),
    ...createRing(12, 9, (index, angle, x, z) => makeProp({
      id: `calcium-crown-shard-${index}`,
      kind: 'shell_shard',
      displayName: 'Crown Shard',
      x,
      z,
      terrainConfig,
      radius: 1.1,
      height: 0.3,
      rotationY: angle,
      powerup: { type: 'calcium', amount: 8, label: 'Crown Shard' },
      collisionShape: {
        type: 'box',
        halfExtents: { x: 1.6, y: 0.15, z: 0.55 }
      },
      visual: { length: 3.2, width: 1.1, thickness: 0.3, color: 0xd6c8a2 }
    }))
  ];
}

function createArenaEventEnvironment(stagePreset) {
  const arenaRadius = stagePreset === ARENA_HIGH_LEAF_STAGE ? 26 : DEFAULT_EVENT_ARENA_RADIUS;
  const terrainConfig = createEventTerrainConfig(stagePreset, arenaRadius);
  const stageProps = {
    [ARENA_DEW_RUSH_STAGE]: createDewRushStage,
    [ARENA_SALT_BOWL_STAGE]: createSaltBowlStage,
    [ARENA_SHELL_DERBY_STAGE]: createShellDerbyStage,
    [ARENA_FEAST_FRENZY_STAGE]: createFeastFrenzyStage,
    [ARENA_HIGH_LEAF_STAGE]: createHighLeafStage,
    [ARENA_BIRD_PANIC_STAGE]: createBirdPanicStage,
    [ARENA_CALCIUM_CROWN_STAGE]: createCalciumCrownStage
  }[stagePreset]?.(terrainConfig) ?? [];
  const creatures = stagePreset === ARENA_BIRD_PANIC_STAGE
    ? [{
      id: 'arena-bird-panic-0',
      kind: 'bird',
      displayName: 'Predator Bird',
      home: { x: 0, z: 0 },
      cooldown: 2.2,
      patrolRadius: 22,
      patrolSpeed: 0.24,
      altitude: 36,
      bodyLength: 3.8,
      wingSpan: 8.2
    }]
    : [];

  return {
    terrainConfig,
    arenaRadius,
    worldBounds: {
      shape: 'circle',
      radius: arenaRadius
    },
    worldProps: stageProps,
    creatures
  };
}

export function createArenaEnvironment(options: any = {}) {
  if (options.stagePreset !== EXPLORER_TERRAIN_PRESET) {
    return isArenaEventTerrainPreset(options.stagePreset)
      ? createArenaEventEnvironment(options.stagePreset)
      : null;
  }

  const world = createExplorerWorld(options.explorerSeed);
  return {
    terrainConfig: world.terrainConfig,
    arenaRadius: world.worldBounds.radius,
    worldBounds: world.worldBounds,
    worldProps: world.props,
    creatures: world.creatures
  };
}
