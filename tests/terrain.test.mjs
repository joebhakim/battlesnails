import test from 'node:test';
import assert from 'node:assert/strict';

import { MatchSimulation } from '../src/sim/MatchSimulation.js';
import {
  DEFAULT_TERRAIN_CONFIG,
  getTerrainHeight,
  normalizeTerrainConfig
} from '../src/world/Terrain.js';

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
  const presets = [
    'hyperboloid_bowl',
    'sphere_dome',
    'sphere_bowl',
    'cone',
    'paraboloid_bowl',
    'saddle',
    'ripple_bowl'
  ];

  for (const preset of presets) {
    const terrain = createTerrainConfig({ preset });
    for (const [x, z] of SAMPLE_POINTS) {
      assert.equal(Number.isFinite(getTerrainHeight(x, z, terrain)), true, `${preset} @ ${x},${z}`);
    }
  }
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
  const expectedHeight = getTerrainHeight(player.position.x, player.position.z, snapshot.terrain);

  assert.equal(snapshot.terrain.preset, 'sphere_dome');
  assert.equal(player.position.y, expectedHeight);
});
