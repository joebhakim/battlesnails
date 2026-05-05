import test from 'node:test';
import assert from 'node:assert/strict';

import { MatchSimulation } from '../src/sim/MatchSimulation.js';
import {
  ALL_TERRAIN_PRESET_OPTIONS,
  ARENA_DEW_RUSH_STAGE,
  ARENA_TERRAIN_PRESET_OPTIONS,
  DEFAULT_TERRAIN_CONFIG,
  EXPLORER_TERRAIN_PRESET,
  TERRAIN_PRESET_OPTIONS,
  getTerrainHeight,
  getTerrainConfigKey,
  normalizeTerrainConfig
} from '../src/world/Terrain.js';
import {
  EXPLORER_TERRAIN_FEATURE_RADIUS,
  EXPLORER_WORLD_RADIUS,
  createExplorerWorld
} from '../src/world/ExplorerWorld.js';
import {
  BODY_CAPSULE_VISUAL_RADIUS,
  DEFAULT_ABOVE_GROUND_HEIGHT,
  estimateTerrainBodyClearance,
  getTerrainBodyGroundHeight
} from '../src/world/TerrainClearance.js';

const SAMPLE_POINTS = [
  [0, 0],
  [4, 2],
  [-7, 3],
  [10, -8],
  [18, 18]
];

function createTerrainConfig(overrides) {
  return normalizeTerrainConfig({
    ...DEFAULT_TERRAIN_CONFIG,
    ...overrides
  });
}

test('all shipped terrain presets produce finite heights across the arena', () => {
  const presets = ALL_TERRAIN_PRESET_OPTIONS.map((option) => option.value);

  for (const preset of presets) {
    const terrain = createTerrainConfig({ preset });
    for (const [x, z] of SAMPLE_POINTS) {
      assert.equal(Number.isFinite(getTerrainHeight(x, z, terrain)), true, `${preset} @ ${x},${z}`);
    }
  }
});

test('explorer mossland is valid but reserved for The Hunt', () => {
  const terrain = normalizeTerrainConfig({ preset: EXPLORER_TERRAIN_PRESET });

  assert.equal(terrain.preset, EXPLORER_TERRAIN_PRESET);
  assert.equal(TERRAIN_PRESET_OPTIONS.some((option) => option.value === EXPLORER_TERRAIN_PRESET), false);
  assert.equal(ARENA_TERRAIN_PRESET_OPTIONS.some((option) => option.value === EXPLORER_TERRAIN_PRESET), false);
  assert.equal(ARENA_TERRAIN_PRESET_OPTIONS.some((option) => option.value === ARENA_DEW_RUSH_STAGE), true);
  assert.equal(ALL_TERRAIN_PRESET_OPTIONS.some((option) => option.value === EXPLORER_TERRAIN_PRESET), true);
});

test('default terrain is a flat plane', () => {
  const terrain = normalizeTerrainConfig();

  assert.equal(terrain.preset, 'plane');
  assert.equal(getTerrainHeight(0, 0, terrain), 0);
  assert.equal(getTerrainHeight(12, -7, terrain), 0);
});

test('sphere dome is high in the center and sphere bowl is low in the center', () => {
  const dome = createTerrainConfig({ preset: 'sphere_dome' });
  const bowl = createTerrainConfig({ preset: 'sphere_bowl' });
  const domeCenter = getTerrainHeight(0, 0, dome);
  const domeRim = getTerrainHeight(dome.horizontalScale, 0, dome);
  const bowlCenter = getTerrainHeight(0, 0, bowl);
  const bowlRim = getTerrainHeight(bowl.horizontalScale, 0, bowl);

  assert(domeCenter > domeRim);
  assert(bowlCenter < bowlRim);
});

test('saddle changes sign by axis while ripple bowl deviates from the base bowl', () => {
  const saddle = createTerrainConfig({ preset: 'saddle', centerHeight: 0, horizontalScale: 8, verticalScale: 10 });
  const ripple = createTerrainConfig({ preset: 'ripple_bowl' });
  const base = createTerrainConfig({ preset: 'hyperboloid_bowl' });

  assert(getTerrainHeight(6, 0, saddle) > 0);
  assert(getTerrainHeight(0, 6, saddle) < 0);
  assert.notEqual(getTerrainHeight(7, 0, ripple), getTerrainHeight(7, 0, base));
});

test('shared simulation follows the selected terrain and snapshots include terrain metadata', () => {
  const simulation = new MatchSimulation({
    tuning: {
      terrainPreset: 'sphere_dome',
      terrainCenterHeight: 1.5,
      terrainHorizontalScale: 12,
      terrainVerticalScale: 9
    }
  });

  const player = simulation.getPlayerState(1);
  const snapshot = simulation.getSnapshot();
  const expectedHeight = getTerrainBodyGroundHeight({
    x: player.position.x,
    z: player.position.z,
    rotationY: player.rotationY,
    terrainConfig: snapshot.terrain,
    aboveGroundHeight: player.profile.groundHeight
  });

  assert.equal(snapshot.terrain.preset, 'sphere_dome');
  assert.equal(player.position.y, expectedHeight + player.profile.spawnDropHeight);
});

test('terrain body clearance adds slope and curvature margin on conic starts', () => {
  const start = { x: 0, z: 6 };
  const clearances = Object.fromEntries(
    TERRAIN_PRESET_OPTIONS.map((option) => [
      option.value,
      estimateTerrainBodyClearance({
        ...start,
        rotationY: 0,
        terrainConfig: createTerrainConfig({ preset: option.value })
      })
    ])
  );

  assert.equal(clearances.plane, BODY_CAPSULE_VISUAL_RADIUS + DEFAULT_ABOVE_GROUND_HEIGHT);
  assert(clearances.hyperboloid_bowl > clearances.plane);
  assert(clearances.cone > clearances.hyperboloid_bowl);
  assert(clearances.paraboloid_bowl > clearances.cone);
  assert(clearances.saddle > clearances.cone);
});

test('terrain body clearance is numerically derived from terrain shape', () => {
  const start = { x: 0, z: 6, rotationY: 0 };
  const shallow = estimateTerrainBodyClearance({
    ...start,
    terrainConfig: createTerrainConfig({
      preset: 'paraboloid_bowl',
      verticalScale: 4
    })
  });
  const steep = estimateTerrainBodyClearance({
    ...start,
    terrainConfig: createTerrainConfig({
      preset: 'paraboloid_bowl',
      verticalScale: 20
    })
  });

  assert(steep > shallow);
});

test('explorer world has stable landmarks and seeded filler props', () => {
  const first = createExplorerWorld(44);
  const second = createExplorerWorld(44);
  const different = createExplorerWorld(45);

  assert.deepEqual(first.landmarks, second.landmarks);
  assert.deepEqual(
    first.props.slice(0, first.landmarks.length).map((prop) => prop.id),
    second.props.slice(0, second.landmarks.length).map((prop) => prop.id)
  );
  assert.notDeepEqual(
    first.props.map((prop) => [prop.id, prop.position.x, prop.position.z]).slice(first.landmarks.length),
    different.props.map((prop) => [prop.id, prop.position.x, prop.position.z]).slice(first.landmarks.length)
  );
});

test('explorer terrain key changes with seed and uses a large visual map', () => {
  const first = createExplorerWorld(90).terrainConfig;
  const second = createExplorerWorld(91).terrainConfig;

  assert.notEqual(getTerrainConfigKey(first), getTerrainConfigKey(second));
  assert.equal(first.worldRadius, EXPLORER_TERRAIN_FEATURE_RADIUS);
  assert.equal(first.visualSize, EXPLORER_WORLD_RADIUS * 2.2);
  assert(first.visualSize > DEFAULT_TERRAIN_CONFIG.visualSize);
  assert(first.worldRadius > DEFAULT_TERRAIN_CONFIG.worldRadius);
});
