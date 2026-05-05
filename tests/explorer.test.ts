import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { PlayerSnail } from '../src/entities/PlayerSnail.js';
import {
  ExplorerSession,
  HUNT_OPTIONS_STORAGE_KEY,
  getStoredHuntOptions
} from '../src/game/ExplorerSession.js';
import { MatchSimulation, MATCH_TICK_DURATION } from '../src/sim/MatchSimulation.js';
import { DEFAULT_TUNING_CONFIG } from '../src/sim/Tuning.js';
import { getExplorerTerrainRegionWeights, getTerrainWaterInfo } from '../src/world/Terrain.js';
import {
  EXPLORER_BIRD_COUNT,
  EXPLORER_BEACH_WIDTH,
  EXPLORER_MAP_DEFAULT_CELL_SIZE,
  EXPLORER_TERRAIN_FEATURE_RADIUS,
  EXPLORER_WATER_MARGIN,
  EXPLORER_WORLD_RADIUS,
  EXPLORER_WORLDGEN_VERSION,
  createExplorerMapGrids,
  createExplorerTerrainConfig,
  createExplorerWorld
} from '../src/world/ExplorerWorld.js';
import { getTerrainBodyGroundHeight } from '../src/world/TerrainClearance.js';

function createPropCollisionSim(prop) {
  return new MatchSimulation({
    mode: 'explorer',
    players: [
      { slot: 1, profile: 'human', connected: true, position: { x: 0, z: 0 }, rotationY: 0 }
    ],
    tuning: DEFAULT_TUNING_CONFIG,
    terrainConfig: createExplorerTerrainConfig(12),
    arenaRadius: 100,
    worldProps: [prop]
  });
}

function setPlayerGrounded(simulation, slot = 1) {
  const player = simulation.getPlayerState(slot);
  player.grounded = true;
  player.verticalVelocity = 0;
  player.position.y = getTerrainBodyGroundHeight({
    x: player.position.x,
    z: player.position.z,
    rotationY: player.rotationY,
    terrainConfig: simulation.getSnapshot().terrain,
    aboveGroundHeight: player.profile.groundHeight
  });
  player.previousPosition.copy(player.position);
  return player;
}

function toVector3(point) {
  return new THREE.Vector3(point.x, point.y ?? 0, point.z);
}

function getYawWorldOffset(local, rotationY = 0) {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return new THREE.Vector3(
    (local.x * cos) + (local.z * sin),
    local.y ?? 0,
    (-local.x * sin) + (local.z * cos)
  );
}

function getPropWorldPoint(prop, local = { x: 0, z: 0 }) {
  return toVector3(prop.position).add(getYawWorldOffset(local, prop.rotationY ?? 0));
}

function getPolygonCentroid(points) {
  const total = points.reduce((sum, point) => ({
    x: sum.x + point.x,
    z: sum.z + point.z
  }), { x: 0, z: 0 });

  return {
    x: total.x / Math.max(1, points.length),
    z: total.z / Math.max(1, points.length)
  };
}

function getPlanarRadius(points) {
  return points.reduce((radius, point) => Math.max(radius, Math.hypot(point.x, point.z)), 0);
}

function findExplorerProp(world, kind, predicate = (_candidate) => true) {
  const prop = world.props.find((candidate) => candidate.kind === kind && predicate(candidate));
  assert(prop, `expected generated ${kind} prop`);
  return prop;
}

class MemoryStorage {
  declare store: any;
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }
}

test('explorer session exposes large mossland props without making props players', () => {
  const session = new ExplorerSession({ seed: 12 });
  const snapshot = session.getSnapshot();

  assert.equal(snapshot.terrain.preset, 'explorer_mossland');
  assert.equal(snapshot.terrain.worldRadius, EXPLORER_TERRAIN_FEATURE_RADIUS);
  assert.equal(snapshot.terrain.worldRadius, 1000);
  assert(snapshot.worldProps.length > 3000);
  assert.equal(snapshot.creatures.length, EXPLORER_BIRD_COUNT);
  assert.equal(snapshot.players.some((player) => player.fixtureKind), false);
  assert.equal(session.getFocusTargetState()?.slot, 2);
});

test('explorer session keeps static world props stable after the first snapshot', () => {
  const session = new ExplorerSession({ seed: 12 });
  const staticWorldProps = session.getSnapshot().worldProps;

  session.update(MATCH_TICK_DURATION, {
    moveX: 0,
    moveZ: 0,
    lookX: 0,
    lookY: 0,
    turnX: 0,
    reachDelta: 0,
    jumpPressed: false,
    lockOnHeld: false,
    interactPressed: false,
    leftHeld: false,
    rightHeld: false
  });

  assert.equal(session.getSnapshot().worldProps, staticWorldProps);
  assert.equal(session.getSnapshot().worldProps.length, staticWorldProps.length);
});

test('hunt setup controls only NPC snail count and strength', () => {
  const storage = new MemoryStorage();
  const session = new ExplorerSession({
    seed: 12,
    storage,
    options: {
      npcCount: 6,
      npcStrength: 9
    }
  });
  const snapshot = session.getSnapshot();
  const enemies = snapshot.players.filter((player) => player.slot !== 1);

  assert.equal(enemies.length, 6);
  assert(enemies.every((enemy) => enemy.maxHealth === 1620));
  assert.equal(snapshot.terrain.preset, 'explorer_mossland');
  assert.equal(snapshot.terrain.worldRadius, EXPLORER_TERRAIN_FEATURE_RADIUS);
  assert.deepEqual(getStoredHuntOptions(storage), {
    npcCount: 6,
    npcStrength: 9
  });
  assert.equal(storage.getItem(HUNT_OPTIONS_STORAGE_KEY), JSON.stringify({ npcCount: 6, npcStrength: 9 }));
});

test('explorer dawn trials expose stage state and can resolve a dew rush', () => {
  const session = new ExplorerSession({
    seed: 12,
    trialKind: 'dew_rush',
    startInTrial: true
  });
  const snapshot = session.getSnapshot();
  const center = snapshot.trialState.center;
  const player = session.simulation.getPlayerState(1);

  assert.equal(snapshot.trialState.phase, 'trial');
  assert.equal(snapshot.trialState.title, 'Dew Rush');
  assert(snapshot.worldProps.some((prop) => prop.id === 'trial-dawn-dew'));

  player.position.x = center.x;
  player.position.z = center.z;
  session.update(MATCH_TICK_DURATION, {
    moveX: 0,
    moveZ: 0,
    lookX: 0,
    lookY: 0,
    turnX: 0,
    reachDelta: 0,
    jumpPressed: false,
    lockOnHeld: false,
    interactPressed: false,
    leftHeld: false,
    rightHeld: false
  });

  assert.equal(session.getSnapshot().phase, 'ended');
  assert.equal(session.getSnapshot().winnerSlot, 1);
  assert.equal(session.getSnapshot().reason, 'dew_rush');
});

test('explorer generated coveted props carry powerup metadata', () => {
  const world = createExplorerWorld(12);
  const dew = findExplorerProp(world, 'dew_bead');
  const food = findExplorerProp(world, 'soft_food');
  const calcium = findExplorerProp(world, 'shell_shard');
  const grit = findExplorerProp(world, 'sharp_grit');

  assert.equal(dew.powerup.type, 'dew');
  assert.equal(food.powerup.type, 'food');
  assert.equal(calcium.powerup.type, 'calcium');
  assert.equal(grit.powerup.type, 'grit');
});

test('explorer v8 scale makes landmarks enormous while floor clutter stays dense', () => {
  const world = createExplorerWorld(12);
  const elderTree = world.landmarks.find((landmark) => landmark.id === 'elder-tree');
  const gravel = world.props.filter((prop) => prop.kind === 'gravel');
  const dew = world.props.filter((prop) => prop.kind === 'dew_bead');
  const rottingLogs = world.props.filter((prop) => prop.kind === 'rotting_log');
  const mushrooms = world.props.filter((prop) => prop.kind === 'mushroom');
  const dryLeaves = world.props.filter((prop) => prop.kind === 'dry_leaf');
  const dryLeafPatches = world.props.filter((prop) => prop.kind === 'dry_leaf_patch');
  const mossMats = world.props.filter((prop) => prop.kind === 'moss_mat');
  const dirtStickPatches = world.props.filter((prop) => prop.kind === 'dirt_stick_patch');
  const flowerPetals = world.props.filter((prop) => prop.kind === 'flower_petal');
  const rootBranches = world.props.filter((prop) => prop.kind === 'root_branch');
  const fallenBranches = world.props.filter((prop) => prop.kind === 'fallen_branch');
  const forestRocks = world.props.filter((prop) => prop.kind === 'forest_rock');
  const sprouts = world.props.filter((prop) => prop.kind === 'sprout');
  const oldYoungPlants = world.props.filter((prop) => prop.kind === 'young_plant');
  const shrubs = world.props.filter((prop) => prop.kind === 'shrub');
  const talusRocks = world.props.filter((prop) => prop.kind === 'talus_rock' || prop.kind === 'rock_cluster');
  const deciduousTrees = world.props.filter((prop) => prop.kind === 'deciduous_tree');
  const coniferTrees = world.props.filter((prop) => prop.kind === 'conifer_tree');
  const anxieties = world.props.filter((prop) => (
    prop.kind === 'salt_cone' ||
    prop.kind === 'dry_leaf_patch' ||
    prop.kind === 'ant_trail'
  ));

  assert.equal(world.worldgenVersion, EXPLORER_WORLDGEN_VERSION);
  assert.equal(world.creatures.length, EXPLORER_BIRD_COUNT);
  assert(world.creatures.every((creature) => creature.kind === 'bird'));
  assert(world.creatures.every((creature) => Number.isFinite(creature.home.x) && Number.isFinite(creature.home.z)));
  assert(world.creatures.every((creature) => creature.cooldown >= 1.5 && creature.cooldown <= 6.5));
  assert.equal(world.worldBounds.radius, EXPLORER_WORLD_RADIUS);
  assert.equal(world.worldBounds.shape, 'coastal_hex_cluster');
  assert.equal(world.worldBounds.landBounds.shape, 'hex_cluster');
  assert.equal(world.worldBounds.beachWidth, EXPLORER_BEACH_WIDTH);
  assert.equal(world.worldBounds.waterMargin, EXPLORER_WATER_MARGIN);
  assert.equal(elderTree.x, -240);
  assert.equal(elderTree.height, 520);
  assert(elderTree.radius < 20);
  assert(elderTree.height / elderTree.radius > 30);
  assert(gravel.length > 20);
  assert(gravel.every((prop) => prop.visual.radius >= 0.14 && prop.visual.radius <= 0.52));
  assert(dew.length > 50);
  assert(dew.some((prop) => prop.visual.radius > 1.5));
  assert(rottingLogs.length > 6);
  assert(rottingLogs.every((prop) => prop.visual.length > 55 && prop.visual.radius > 3));
  assert(
    Math.min(...rottingLogs.map((prop) => prop.visual.radius)) /
      Math.max(...dew.map((prop) => prop.visual.radius)) > 1
  );
  assert(mushrooms.length > 20);
  assert(mushrooms.some((prop) => prop.visual.capRadius > 10));
  assert.equal(dryLeaves.length, 0);
  assert.equal(flowerPetals.length, 0);
  assert.equal(oldYoungPlants.length, 0);
  const groundPatchCount = dryLeafPatches.length + mossMats.length + dirtStickPatches.length;
  assert(groundPatchCount > 500);
  assert(dryLeafPatches.length / groundPatchCount > 0.55 && dryLeafPatches.length / groundPatchCount < 0.65);
  assert(mossMats.length / groundPatchCount > 0.25 && mossMats.length / groundPatchCount < 0.36);
  assert(dirtStickPatches.length / groundPatchCount > 0.06 && dirtStickPatches.length / groundPatchCount < 0.13);
  assert([...dryLeafPatches, ...mossMats, ...dirtStickPatches].every((prop) => prop.blocking === true && prop.climbable === true));
  assert([...dryLeafPatches, ...mossMats, ...dirtStickPatches].every((prop) => prop.collisionShape.type === 'polygon_prism'));
  assert([...dryLeafPatches, ...mossMats, ...dirtStickPatches].every((prop) => prop.rotationY === 0));
  assert([...dryLeafPatches, ...mossMats, ...dirtStickPatches].every((prop) => prop.visual.footprint?.length >= 3));
  assert(new Set([...dryLeafPatches, ...mossMats, ...dirtStickPatches].map((prop) => prop.visual.footprint.length)).size > 2);
  assert(dryLeafPatches.some((prop) => prop.visual.thickness > 1 && prop.visual.relief > 1));
  assert(dryLeafPatches.every((prop) => prop.visual.roughness >= 0.55));
  assert(dryLeafPatches.every((prop) => prop.visual.maxPlates >= 90));
  assert(dryLeafPatches.some((prop) => prop.visual.scaleLength > 10 && prop.visual.scaleWidth > 3));
  assert(mossMats.some((prop) => prop.visual.relief > 2.5 && prop.visual.maxPlates > 50));
  assert(rootBranches.length > 50);
  assert(fallenBranches.length > 60);
  assert(fallenBranches.every((prop) => prop.climbable === true && prop.collisionShape.type === 'visual_mesh'));
  assert(fallenBranches.every((prop) => prop.visual.tilt >= 10 * Math.PI / 180 && prop.visual.tilt <= 60 * Math.PI / 180));
  assert(forestRocks.length > 20);
  assert(forestRocks.every((prop) => prop.collisionShape.type === 'sphere' && prop.visual.radius > 2));
  assert(sprouts.length > 250);
  assert(sprouts.some((prop) => prop.visual.height < 1.5));
  assert(sprouts.some((prop) => prop.visual.height > 40));
  assert(shrubs.length > 80);
  assert(shrubs.some((prop) => prop.visual.height > 40));
  assert(shrubs.every((prop) => prop.blocking === true && prop.climbable === true));
  assert(shrubs.every((prop) => prop.collisionShape.type === 'visual_mesh'));
  assert(shrubs.every((prop) => prop.collisionShape.radius >= prop.visual.radius));
  assert(shrubs.every((prop) => !prop.collisionShape.meshParts));
  assert(talusRocks.length > 100);
  assert(deciduousTrees.length > 90);
  assert(coniferTrees.length > 80);
  assert(deciduousTrees.every((prop) => prop.visual.height / prop.visual.trunkRadius > 25));
  assert(deciduousTrees.every((prop) => prop.visual.branchReach >= prop.visual.canopyRadius * 0.85));
  assert(deciduousTrees.every((prop) => prop.collisionShape.type === 'visual_mesh'));
  assert(deciduousTrees.every((prop) => !prop.collisionShape.meshParts));
  assert(coniferTrees.every((prop) => prop.visual.branchReach >= prop.visual.canopyRadius * 0.58));
  assert(coniferTrees.every((prop) => prop.visual.treeType === 'conifer'));
  assert(coniferTrees.every((prop) => prop.collisionShape.type === 'visual_mesh'));
  assert(coniferTrees.every((prop) => !prop.collisionShape.meshParts));
  assert(anxieties.length > 30);
});

test('non-climbable explorer prop collisions block player movement without entering target state', () => {
  const prop = {
    id: 'test-rock',
    kind: 'rock',
    position: { x: 0, z: 0 },
    bodyRadius: 1,
    blocking: true,
    climbable: false,
    collisionShape: { type: 'sphere', radius: 1 }
  };
  const simulation = createPropCollisionSim(prop);

  simulation.step(MATCH_TICK_DURATION);

  const player = simulation.getPlayerState(1);
  assert(Math.hypot(player.position.x - prop.position.x, player.position.z - prop.position.z) >= 2.79);
  assert.equal(simulation.getSnapshot().players.length, 1);
  assert.equal(simulation.getSnapshot().worldProps[0].id, 'test-rock');
});

test('explorer prop broadphase returns local clutter without scanning distant props', () => {
  const nearProp = {
    id: 'near-root',
    kind: 'root_branch',
    position: { x: 4, y: 1, z: 0 },
    bodyRadius: 5,
    blocking: true,
    climbable: true,
    collisionShape: { type: 'box', halfExtents: { x: 5, y: 0.5, z: 0.5 } },
    visual: { length: 10, radius: 0.5 }
  };
  const farProp = {
    id: 'far-root',
    kind: 'root_branch',
    position: { x: 200, y: 1, z: 0 },
    bodyRadius: 5,
    blocking: true,
    climbable: true,
    collisionShape: { type: 'box', halfExtents: { x: 5, y: 0.5, z: 0.5 } },
    visual: { length: 10, radius: 0.5 }
  };
  const simulation = new MatchSimulation({
    mode: 'explorer',
    players: [
      { slot: 1, profile: 'human', connected: true, position: { x: 0, z: 0 }, rotationY: 0 }
    ],
    tuning: DEFAULT_TUNING_CONFIG,
    terrainConfig: createExplorerTerrainConfig(12),
    arenaRadius: 300,
    worldProps: [nearProp, farProp]
  });

  const nearbyIds = simulation.getNearbyWorldProps(new THREE.Vector3(0, 0, 0), 12).map((prop) => prop.id);
  assert.deepEqual(nearbyIds, ['near-root']);
});

test('generated prop contact footprints are discoverable by gameplay nearby queries', () => {
  const world = createExplorerWorld(137);
  const simulation = new MatchSimulation({
    mode: 'explorer',
    players: [
      {
        slot: 1,
        profile: 'human',
        connected: true,
        position: {
          x: world.playerStart.x,
          z: world.playerStart.z
        },
        rotationY: world.playerStart.rotationY
      }
    ],
    tuning: DEFAULT_TUNING_CONFIG,
    terrainConfig: world.terrainConfig,
    arenaRadius: world.worldBounds.radius,
    worldProps: world.props
  });
  const player = simulation.getPlayerState(1);
  const supportQueryRadius = player.bodyRadius + 2.2 + 30;
  const collisionQueryRadius = player.bodyRadius + 30;
  const samples = [];
  const addSample = (prop, local = { x: 0, z: 0 }) => {
    samples.push({
      prop,
      point: getPropWorldPoint(prop, local)
    });
  };
  const addGroundPatchSample = (kind) => {
    const prop = findExplorerProp(world, kind, (candidate) => (
      Array.isArray(candidate.collisionShape?.points) &&
      candidate.collisionShape.points.length >= 3
    ));
    addSample(prop, getPolygonCentroid(prop.collisionShape.points));
  };
  const addLongPropSamples = (kind) => {
    const prop = findExplorerProp(world, kind);
    const length = prop.visual?.length ?? prop.collisionShape?.radius ?? prop.bodyRadius;
    const width = prop.visual?.sideSpan ?? prop.visual?.radius ?? prop.bodyRadius;
    addSample(prop);
    addSample(prop, { x: length * 0.36, z: 0 });
    addSample(prop, { x: -length * 0.36, z: 0 });
    addSample(prop, { x: 0, z: width * 0.36 });
  };
  const addRadialSample = (kind) => {
    const prop = findExplorerProp(world, kind);
    const radius = prop.collisionShape?.radius ?? prop.bodyRadius;
    addSample(prop);
    addSample(prop, { x: radius * 0.85, z: 0 });
  };

  for (const kind of ['dry_leaf_patch', 'moss_mat', 'dirt_stick_patch', 'rock_floor_patch']) {
    addGroundPatchSample(kind);
  }
  for (const kind of ['rotting_log', 'root_branch', 'fallen_branch', 'twig', 'bamboo_stick']) {
    addLongPropSamples(kind);
  }
  for (const kind of ['shell_shard', 'forest_rock', 'talus_rock', 'rock_cluster', 'mushroom', 'salt_cone']) {
    addRadialSample(kind);
  }

  for (const { prop, point } of samples) {
    const supportIds = new Set(simulation.getNearbyWorldProps(point, supportQueryRadius).map((candidate) => candidate.id));
    assert(
      supportIds.has(prop.id),
      `${prop.kind} ${prop.id} missing from support query at ${point.x.toFixed(2)},${point.z.toFixed(2)}`
    );

    if (prop.blocking) {
      const collisionIds = new Set(simulation.getNearbyWorldProps(point, collisionQueryRadius).map((candidate) => candidate.id));
      assert(
        collisionIds.has(prop.id),
        `${prop.kind} ${prop.id} missing from collision query at ${point.x.toFixed(2)},${point.z.toFixed(2)}`
      );
    }
  }
});

test('explorer boss death does not end the mode while player is alive', () => {
  const session = new ExplorerSession({ seed: 15 });
  const boss = session.simulation.getPlayerState(2);
  boss.health = 0;

  session.snapshot = session.simulation.step(MATCH_TICK_DURATION);

  assert.equal(session.getSnapshot().phase, 'running');
  assert.equal(session.getFocusTargetState(), null);
});

test('explorer player death ends the mode', () => {
  const session = new ExplorerSession({ seed: 15 });
  const player = session.simulation.getPlayerState(1);
  player.health = 0;

  session.snapshot = session.simulation.step(MATCH_TICK_DURATION);

  assert.equal(session.getSnapshot().phase, 'ended');
  assert.equal(session.getOverlayState()?.title, 'SALTED');
});

test('interacting near a rotting log emits a nibble event only nearby', () => {
  const world = createExplorerWorld(18);
  const log = world.props.find((prop) => prop.kind === 'rotting_log');
  const simulation = new MatchSimulation({
    mode: 'explorer',
    players: [
      {
        slot: 1,
        profile: 'human',
        connected: true,
        position: { x: log.position.x + log.bodyRadius + 0.5, z: log.position.z },
        rotationY: 0
      }
    ],
    tuning: DEFAULT_TUNING_CONFIG,
    terrainConfig: world.terrainConfig,
    arenaRadius: world.worldBounds.radius,
    worldProps: [log]
  });

  simulation.setPlayerInput(1, { interactPressed: true });
  let snapshot = simulation.step(MATCH_TICK_DURATION);
  assert.equal(snapshot.events.some((event) => event.type === 'log_nibble' && event.propId === log.id), true);

  simulation.getPlayerState(1).position.x = log.position.x + log.bodyRadius + 40;
  simulation.setPlayerInput(1, { interactPressed: true });
  snapshot = simulation.step(MATCH_TICK_DURATION);
  assert.equal(snapshot.events.some((event) => event.type === 'log_nibble'), false);
});

test('explorer map grids expose sparse machine-readable feature and elevation rows', () => {
  const grids = createExplorerMapGrids(12);

  assert.equal(grids.cellSize, EXPLORER_MAP_DEFAULT_CELL_SIZE);
  assert.equal(grids.worldgenVersion, EXPLORER_WORLDGEN_VERSION);
  assert.equal(grids.shape, 'coastal_hex_cluster');
  assert.equal(grids.clip.tileCount, 7);
  assert.equal(grids.width, 47);
  assert.equal(grids.height, 47);
  assert.equal(grids.featureRows.length, 47);
  assert.equal(grids.elevationRows.length, 47);
  assert(grids.featureRows.every((row) => Array.from(row).length === 47));
  assert(grids.elevationRows.every((row) => Array.from(row).length === 47));
  assert.equal(grids.legend.features.playerStart.symbol, 'S');
  assert.equal(grids.legend.features.boss.symbol, 'B');
  assert.match(grids.featureGrid, /S/);
  assert.match(grids.featureGrid, /B/);
  assert.match(grids.featureGrid, /♣/);
  assert.match(grids.featureGrid, /♤/);
  assert.match(grids.featureGrid, /▲/);
  assert.match(grids.featureGrid, /◌/);
  assert.match(grids.featureGrid, /♠/);
  assert.equal(grids.legend.features.antTrail.symbol, '=');
  assert.equal(grids.legend.features.leafLitter.symbol, ',');
  assert.equal(grids.legend.features.rootDirt.symbol, ':');
  assert.equal(grids.legend.features.beach.symbol, '∴');
  assert.equal(grids.legend.features.water.symbol, '≈');
  assert.equal(grids.legend.features.birdHome.symbol, 'V');
  assert.match(grids.featureGrid, /▒/);
  assert.match(grids.featureGrid, /;/);
  assert.equal(grids.legend.features.dirtStickPatch.symbol, ';');
  assert.match(grids.featureGrid, /▴/);
  assert.equal(grids.legend.features.rockFloorPatch.symbol, '▴');
  assert.match(grids.featureGrid, /\//);
  assert.match(grids.featureGrid, /╲/);
  assert.match(grids.featureGrid, /♧/);
  assert.match(grids.featureGrid, /♮/);
  assert.match(grids.featureGrid, /◇|◈/);
  assert.match(grids.featureGrid, /∴/);
  assert.match(grids.featureGrid, /≈/);
  assert.match(grids.featureGrid, /V/);
  assert(grids.maxHeight > grids.minHeight);
  assert.equal(grids.heightRows.length, 47);
});

test('explorer shoreline water gives snails a cheap floating support surface', () => {
  const world = createExplorerWorld(12);
  const waterZ = world.worldBounds.radius - (world.worldBounds.waterMargin * 0.35);
  const water = getTerrainWaterInfo(0, waterZ, world.terrainConfig);
  assert(water.waterWeight > 0.5);
  assert.notEqual(water.surfaceHeight, null);

  const simulation = new MatchSimulation({
    mode: 'explorer',
    players: [
      { slot: 1, profile: 'human', connected: true, position: { x: 0, z: waterZ }, rotationY: 0 }
    ],
    tuning: DEFAULT_TUNING_CONFIG,
    terrainConfig: world.terrainConfig,
    arenaRadius: world.worldBounds.radius,
    worldBounds: world.worldBounds,
    worldProps: []
  });
  const player = simulation.getPlayerState(1);

  for (let index = 0; index < 12; index += 1) {
    simulation.setPlayerInput(1, {});
    simulation.step(MATCH_TICK_DURATION);
  }

  assert.equal(player.grounded, true);
  assert.equal(player.supportKind, 'water');
  assert(player.position.y > water.surfaceHeight);
});

test('explorer map grids can preview a regular hex clip without changing default world bounds', () => {
  const world = createExplorerWorld(12);
  const grids = createExplorerMapGrids(world, {
    shape: 'hex',
    hexRadius: 900,
    hexRotation: Math.PI / 6,
    cellSize: 100
  });
  const middle = Math.floor(grids.height / 2);

  assert.equal(world.worldBounds.radius, EXPLORER_WORLD_RADIUS);
  assert.equal(grids.shape, 'hex');
  assert.equal(grids.clip.shape, 'hex');
  assert.equal(grids.clip.hexRadius, 900);
  assert.equal(grids.clip.hexRotationDegrees, 30);
  assert.equal(Array.from(grids.featureRows[0])[0], '□');
  assert.equal(Array.from(grids.featureRows[0]).at(-1), '□');
  assert.notEqual(Array.from(grids.featureRows[middle])[middle], '□');
  assert.match(grids.featureGrid, /S/);
  assert.match(grids.featureGrid, /B/);
  assert(grids.maxHeight > grids.minHeight);
});

test('generated ground-cover polygons are climbable rough support surfaces', () => {
  const world = createExplorerWorld(21);
  const patch = world.props.find((prop) => prop.kind === 'dry_leaf_patch' && prop.collisionShape.type === 'polygon_prism');
  const simulation = new MatchSimulation({
    mode: 'explorer',
    players: [
      {
        slot: 1,
        profile: 'human',
        connected: true,
        position: { x: patch.position.x, z: patch.position.z },
        rotationY: 0
      }
    ],
    tuning: DEFAULT_TUNING_CONFIG,
    terrainConfig: world.terrainConfig,
    arenaRadius: world.worldBounds.radius,
    worldProps: [patch]
  });
  const player = setPlayerGrounded(simulation);
  const terrainOnlyHeight = player.position.y;

  for (let index = 0; index < 120; index += 1) {
    simulation.step(MATCH_TICK_DURATION);
  }

  assert.equal(player.supportKind, 'prop');
  assert.equal(player.supportSurfaceId, `prop:${patch.id}:polygon:top`);
  assert(player.position.y > terrainOnlyHeight + 0.7);
  assert(player.supportNormal.y > 0.45);
});

test('generated ground-cover boundary vertices share world heights', () => {
  const world = createExplorerWorld(137);
  const verticesByPosition = new Map();
  const patches = world.props.filter((prop) => (
    ['dry_leaf_patch', 'moss_mat', 'dirt_stick_patch', 'rock_floor_patch'].includes(prop.kind) &&
    Array.isArray(prop.collisionShape?.points)
  ));

  for (const patch of patches) {
    for (const point of patch.collisionShape.points) {
      assert(Number.isFinite(point.y), `${patch.kind} ${patch.id} missing shared edge height`);
      const worldPoint = getPropWorldPoint(patch, point);
      const key = `${worldPoint.x.toFixed(3)}:${worldPoint.z.toFixed(3)}`;
      const records = verticesByPosition.get(key) ?? [];
      records.push({
        id: patch.id,
        y: worldPoint.y
      });
      verticesByPosition.set(key, records);
    }
  }

  let sharedVertexCount = 0;
  for (const records of verticesByPosition.values()) {
    const propIds = new Set(records.map((record) => record.id));
    if (propIds.size < 2) {
      continue;
    }
    sharedVertexCount += 1;
    const ys = records.map((record) => record.y);
    assert(
      Math.max(...ys) - Math.min(...ys) < 0.001,
      `shared ground-cover vertex has mismatched heights: ${ys.map((y) => y.toFixed(4)).join(', ')}`
    );
  }

  assert(sharedVertexCount > 200, 'expected many shared ground-cover vertices to validate seam heights');
});

test('generated ground-cover visuals overlap collision cells', () => {
  const world = createExplorerWorld(137);
  const patches = world.props
    .filter((prop) => (
      ['dry_leaf_patch', 'moss_mat', 'dirt_stick_patch', 'rock_floor_patch'].includes(prop.kind) &&
      Array.isArray(prop.collisionShape?.points) &&
      Array.isArray(prop.visual?.footprint)
    ))
    .slice(0, 24);

  assert.equal(patches.length, 24);
  for (const patch of patches) {
    assert(
      getPlanarRadius(patch.visual.footprint) > getPlanarRadius(patch.collisionShape.points) + 1,
      `${patch.kind} ${patch.id} visual footprint should overlap past collision cell`
    );
  }
});

test('generated ground-cover patches keep support during short movement replays', () => {
  const world = createExplorerWorld(137);
  const patches = ['dry_leaf_patch', 'moss_mat', 'dirt_stick_patch'].flatMap((kind) => (
    world.props
      .filter((prop) => (
        prop.kind === kind &&
        Array.isArray(prop.collisionShape?.points) &&
        prop.collisionShape.points.length >= 5 &&
        getExplorerTerrainRegionWeights(prop.position.x, prop.position.z, world.terrainConfig).mountainWeight < 0.2 &&
        getExplorerTerrainRegionWeights(prop.position.x, prop.position.z, world.terrainConfig).beachWeight < 0.02
      ))
      .slice(0, 8)
  ));

  assert.equal(patches.length, 24);

  for (const patch of patches) {
    const localPoint = getPolygonCentroid(patch.collisionShape.points);
    const start = getPropWorldPoint(patch, localPoint);
    const simulation = new MatchSimulation({
      mode: 'explorer',
      players: [
        {
          slot: 1,
          profile: 'human',
          connected: true,
          position: { x: start.x, z: start.z },
          rotationY: 0
        }
      ],
      tuning: DEFAULT_TUNING_CONFIG,
      terrainConfig: world.terrainConfig,
      arenaRadius: world.worldBounds.radius,
      worldProps: [patch]
    });
    const player = setPlayerGrounded(simulation);
    const lowestAllowedHeight = player.position.y - 0.001;
    const moveTrace = [
      { moveX: 0.2, moveZ: 0 },
      { moveX: 0, moveZ: 0.2 },
      { moveX: -0.2, moveZ: 0 },
      { moveX: 0, moveZ: -0.2 }
    ];

    for (let index = 0; index < 16; index += 1) {
      simulation.setPlayerInput(1, moveTrace[index % moveTrace.length]);
      simulation.step(MATCH_TICK_DURATION);

      assert.equal(player.supportKind, 'prop', `${patch.kind} ${patch.id} lost prop support on step ${index}`);
      assert.equal(player.supportSurfaceId, `prop:${patch.id}:polygon:top`);
      assert(player.position.y >= lowestAllowedHeight, `${patch.kind} ${patch.id} dropped below starting terrain support`);
      assert(player.supportNormal.y > 0.35, `${patch.kind} ${patch.id} produced too-steep ground support`);
    }
  }
});

test('rotated non-climbable box hitbox follows its rendered orientation', () => {
  const rotatedBox = {
    id: 'rotated-box',
    kind: 'debug_box',
    position: { x: 0, z: 0 },
    rotationY: Math.PI / 2,
    bodyRadius: Math.hypot(6, 1),
    blocking: true,
    climbable: false,
    collisionShape: {
      type: 'box',
      halfExtents: { x: 6, y: 1, z: 1 }
    },
    visual: { length: 12, radius: 1 }
  };
  const simulation = new MatchSimulation({
    mode: 'explorer',
    players: [
      { slot: 1, profile: 'human', connected: true, position: { x: 4, z: 0 }, rotationY: 0 }
    ],
    tuning: DEFAULT_TUNING_CONFIG,
    arenaRadius: 40,
    worldProps: [rotatedBox]
  });
  setPlayerGrounded(simulation);

  simulation.step(MATCH_TICK_DURATION);

  const player = simulation.getPlayerState(1);
  assert(Math.abs(player.position.x - 4) < 0.01);
  assert(Math.abs(player.position.z) < 0.01);

  player.position.set(2, player.position.y, 5);
  player.previousPosition.copy(player.position);
  simulation.step(MATCH_TICK_DURATION);

  assert(player.position.x > 2.75);
  assert(Math.abs(player.position.z - 5) < 0.01);
});

test('snails automatically climb vertical prop surfaces and expose support normals', () => {
  const tree = {
    id: 'climb-tree',
    kind: 'giant_tree',
    position: { x: 0, z: 0 },
    bodyRadius: 1,
    blocking: true,
    collisionShape: {
      type: 'cylinder',
      radius: 1,
      halfHeight: 20
    },
    visual: { radius: 1, height: 40 }
  };
  const simulation = new MatchSimulation({
    mode: 'explorer',
    players: [
      { slot: 1, profile: 'human', connected: true, position: { x: 2.79, z: 0 }, rotationY: 0 }
    ],
    tuning: DEFAULT_TUNING_CONFIG,
    arenaRadius: 60,
    worldProps: [tree]
  });
  const player = setPlayerGrounded(simulation);
  const startY = player.position.y;

  for (let index = 0; index < 30; index += 1) {
    simulation.setPlayerInput(1, { moveX: -1 });
    simulation.step(MATCH_TICK_DURATION);
  }

  const snapshotPlayer = simulation.getSnapshot().players.find((entry) => entry.slot === 1);
  assert(player.position.y > startY + 0.7);
  assert.equal(player.supportKind, 'prop');
  assert(player.supportNormal.x > 0.95);
  assert(snapshotPlayer.supportNormal.x > 0.95);

  simulation.setPlayerInput(1, { moveX: 1 });
  simulation.step(MATCH_TICK_DURATION);

  assert.notEqual(player.supportKind, 'prop');
  assert.deepEqual(player.supportNormal.toArray(), [0, 1, 0]);
});

test('tree side climbing transitions onto the summit instead of an invisible side wall', () => {
  const tree = {
    id: 'summit-tree',
    kind: 'giant_tree',
    position: { x: 0, y: 4, z: 0 },
    bodyRadius: 1,
    blocking: true,
    collisionShape: {
      type: 'cylinder',
      radius: 1,
      halfHeight: 4
    },
    visual: { radius: 1, height: 8 }
  };
  const simulation = new MatchSimulation({
    mode: 'explorer',
    players: [
      { slot: 1, profile: 'human', connected: true, position: { x: 2.79, z: 0 }, rotationY: 0 }
    ],
    tuning: DEFAULT_TUNING_CONFIG,
    arenaRadius: 40,
    worldProps: [tree]
  });
  const player = setPlayerGrounded(simulation);

  player.position.y = tree.position.y + tree.collisionShape.halfHeight + player.bodyRadius;
  player.supportKind = 'prop';
  player.supportSurfaceId = `prop:${tree.id}:cylinder:side`;
  player.supportNormal.set(1, 0, 0);
  simulation.setPlayerInput(1, { moveX: -1 });
  simulation.step(MATCH_TICK_DURATION);

  assert(player.position.x < 2.75);
  assert.equal(player.supportKind, 'prop');
  assert(player.supportNormal.y > 0.99);
});

test('rocks use climb support instead of a permanent planar blocker', () => {
  const rock = {
    id: 'round-rock',
    kind: 'rock',
    position: { x: 0, y: 2, z: 0 },
    bodyRadius: 2,
    blocking: true,
    collisionShape: {
      type: 'sphere',
      radius: 2
    },
    visual: { radius: 2 }
  };
  const simulation = new MatchSimulation({
    mode: 'explorer',
    players: [
      { slot: 1, profile: 'human', connected: true, position: { x: 3.75, z: 0 }, rotationY: 0 }
    ],
    tuning: {
      ...DEFAULT_TUNING_CONFIG,
      trailSpeedMultiplier: 1
    },
    arenaRadius: 40,
    worldProps: [rock]
  });
  const player = setPlayerGrounded(simulation);

  for (let index = 0; index < 24; index += 1) {
    simulation.setPlayerInput(1, { moveX: -1 });
    simulation.step(MATCH_TICK_DURATION);
  }

  assert(Math.abs(player.position.x) < 1.4);
  assert(player.position.y > rock.position.y + rock.collisionShape.radius + 1);
  assert.equal(player.supportKind, 'prop');
  assert(player.supportNormal.y > 0.85);
});

test('mushrooms climb from the side and transition onto the cap', () => {
  const mushroom = {
    id: 'summit-mushroom',
    kind: 'mushroom',
    position: { x: 0, z: 0 },
    bodyRadius: 3,
    blocking: true,
    collisionShape: {
      type: 'cylinder',
      radius: 3,
      halfHeight: 2
    },
    visual: {
      capRadius: 3,
      stemHeight: 3,
      capThickness: 1
    }
  };
  const simulation = new MatchSimulation({
    mode: 'explorer',
    players: [
      { slot: 1, profile: 'human', connected: true, position: { x: 4.75, z: 0 }, rotationY: 0 }
    ],
    tuning: DEFAULT_TUNING_CONFIG,
    arenaRadius: 60,
    worldProps: [mushroom]
  });
  const player = setPlayerGrounded(simulation);

  for (let index = 0; index < 12; index += 1) {
    simulation.setPlayerInput(1, { moveX: -1 });
    simulation.step(MATCH_TICK_DURATION);
  }

  assert.equal(player.supportKind, 'prop');
  assert.equal(player.supportSurfaceId, 'prop:summit-mushroom:cylinder:top');
  assert(player.supportNormal.y > 0.99);
});

test('dry leaf carpet patches act as low climbable rough plates instead of invisible walls', () => {
  const leaf = {
    id: 'leaf-plate',
    kind: 'dry_leaf_patch',
    position: { x: 0, z: 0 },
    bodyRadius: 4.25,
    blocking: true,
    collisionShape: {
      type: 'box',
      halfExtents: {
        x: 4,
        y: 0.08,
        z: 1.1
      }
    },
    visual: {
      length: 8,
      width: 2.2,
      thickness: 0.16
    }
  };
  const simulation = new MatchSimulation({
    mode: 'explorer',
    players: [
      { slot: 1, profile: 'human', connected: true, position: { x: 0, z: 0 }, rotationY: 0 }
    ],
    tuning: DEFAULT_TUNING_CONFIG,
    arenaRadius: 60,
    worldProps: [leaf]
  });
  const player = setPlayerGrounded(simulation);

  simulation.setPlayerInput(1, { moveX: 1 });
  simulation.step(MATCH_TICK_DURATION);

  assert.equal(player.supportKind, 'prop');
  assert.equal(player.supportSurfaceId, 'prop:leaf-plate:box:top');
  assert(player.supportNormal.y > 0.99);
  assert(player.position.x > 0.1);
});

test('jumping from rough ground-cover detaches instead of immediately re-snapping to prop support', () => {
  const leaf = {
    id: 'jump-leaf',
    kind: 'dry_leaf_patch',
    position: { x: 0, z: 0 },
    bodyRadius: 4,
    blocking: true,
    climbable: true,
    collisionShape: {
      type: 'polygon_prism',
      halfHeight: 0.5,
      points: [
        { x: -8, z: -8 },
        { x: 8, z: -8 },
        { x: 8, z: 8 },
        { x: -8, z: 8 }
      ],
      relief: 0,
      scaleLength: 4,
      scaleWidth: 2,
      edgeBlendInset: 0
    },
    visual: {
      thickness: 1,
      relief: 0,
      scaleLength: 4,
      scaleWidth: 2
    }
  };
  const simulation = new MatchSimulation({
    mode: 'test',
    players: [
      { slot: 1, profile: 'human', connected: true, position: { x: 0, z: 0 }, rotationY: 0 }
    ],
    tuning: DEFAULT_TUNING_CONFIG,
    arenaRadius: 60,
    worldProps: [leaf]
  });
  const player = setPlayerGrounded(simulation);

  for (let index = 0; index < 20; index += 1) {
    simulation.setPlayerInput(1, {});
    simulation.step(MATCH_TICK_DURATION);
  }

  assert.equal(player.supportKind, 'prop');
  const startHeight = player.position.y;
  let peakHeight = startHeight;
  for (let index = 0; index < 45; index += 1) {
    simulation.setPlayerInput(1, { jumpPressed: index === 0 });
    simulation.step(MATCH_TICK_DURATION);
    peakHeight = Math.max(peakHeight, player.position.y);
  }

  assert(peakHeight > startHeight + 2.5);
});

test('snail actor tilts its body to the authoritative support normal', () => {
  const actor = new PlayerSnail({ spawnDropHeight: 0 });
  actor.applyMatchState({
    slot: 1,
    connected: true,
    health: 10,
    maxHealth: 10,
    impactPower: 0,
    controlMode: 'idle',
    controlIntensity: 0,
    position: { x: 0, y: 2, z: 0 },
    rotationY: 0,
    supportNormal: { x: 1, y: 0, z: 0 }
  }, MATCH_TICK_DURATION);

  const tiltedUp = new THREE.Vector3(0, 1, 0).applyQuaternion(actor.tiltRoot.quaternion);
  assert(tiltedUp.distanceTo(new THREE.Vector3(1, 0, 0)) < 0.0001);
  assert.equal(actor.getStalkNodes('left').length > 4, true);
  assert.equal(Number.isFinite(actor.getEyeStalkPosition('left').x), true);
});
