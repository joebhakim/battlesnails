import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { PlayerSnail } from '../src/entities/PlayerSnail.js';
import { ExplorerSession } from '../src/game/ExplorerSession.js';
import { MatchSimulation, MATCH_TICK_DURATION } from '../src/sim/MatchSimulation.js';
import { DEFAULT_TUNING_CONFIG } from '../src/sim/Tuning.js';
import {
  EXPLORER_MAP_DEFAULT_CELL_SIZE,
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

test('explorer session exposes large mossland props without making props players', () => {
  const session = new ExplorerSession({ seed: 12 });
  const snapshot = session.getSnapshot();

  assert.equal(snapshot.terrain.preset, 'explorer_mossland');
  assert.equal(snapshot.terrain.worldRadius, EXPLORER_WORLD_RADIUS);
  assert.equal(snapshot.terrain.worldRadius, 1000);
  assert(snapshot.worldProps.length > 1000);
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

test('explorer v7 scale makes landmarks enormous while floor clutter stays dense', () => {
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
  assert.equal(world.worldBounds.radius, EXPLORER_WORLD_RADIUS);
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
      Math.max(...dew.map((prop) => prop.visual.radius)) > 1.25
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
  assert(fallenBranches.every((prop) => prop.climbable === true && prop.collisionShape.type === 'box'));
  assert(fallenBranches.every((prop) => prop.visual.tilt >= 10 * Math.PI / 180 && prop.visual.tilt <= 60 * Math.PI / 180));
  assert(forestRocks.length > 20);
  assert(forestRocks.every((prop) => prop.collisionShape.type === 'sphere' && prop.visual.radius > 2));
  assert(sprouts.length > 250);
  assert(sprouts.some((prop) => prop.visual.height < 1.5));
  assert(sprouts.some((prop) => prop.visual.height > 40));
  assert(shrubs.length > 80);
  assert(shrubs.some((prop) => prop.visual.height > 40));
  assert(shrubs.every((prop) => prop.blocking === true && prop.climbable === true));
  assert(shrubs.every((prop) => prop.collisionShape.radius < prop.visual.radius * 0.34));
  assert(talusRocks.length > 100);
  assert(deciduousTrees.length > 90);
  assert(coniferTrees.length > 80);
  assert(deciduousTrees.every((prop) => prop.visual.height / prop.visual.trunkRadius > 25));
  assert(deciduousTrees.every((prop) => prop.visual.branchReach >= prop.visual.canopyRadius * 0.85));
  assert(coniferTrees.every((prop) => prop.visual.branchReach >= prop.visual.canopyRadius * 0.58));
  assert(coniferTrees.every((prop) => prop.visual.treeType === 'conifer'));
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
  assert.equal(grids.width, 21);
  assert.equal(grids.height, 21);
  assert.equal(grids.featureRows.length, 21);
  assert.equal(grids.elevationRows.length, 21);
  assert(grids.featureRows.every((row) => Array.from(row).length === 21));
  assert(grids.elevationRows.every((row) => Array.from(row).length === 21));
  assert.equal(grids.legend.features.playerStart.symbol, 'S');
  assert.equal(grids.legend.features.boss.symbol, 'B');
  assert.match(grids.featureGrid, /S/);
  assert.match(grids.featureGrid, /B/);
  assert.match(grids.featureGrid, /♣/);
  assert.match(grids.featureGrid, /♤/);
  assert.match(grids.featureGrid, /▲/);
  assert.match(grids.featureGrid, /◌/);
  assert.match(grids.featureGrid, /♠/);
  assert.match(grids.featureGrid, /=/);
  assert.match(grids.featureGrid, /,/);
  assert.equal(grids.legend.features.rootDirt.symbol, ':');
  assert.match(grids.featureGrid, /▒/);
  assert.match(grids.featureGrid, /;/);
  assert.equal(grids.legend.features.dirtStickPatch.symbol, ';');
  assert.match(grids.featureGrid, /\//);
  assert.match(grids.featureGrid, /╲/);
  assert.match(grids.featureGrid, /♧/);
  assert.match(grids.featureGrid, /♮/);
  assert.match(grids.featureGrid, /◇|◈/);
  assert.equal(grids.featureGrid.includes('≈'), false);
  assert(grids.maxHeight > grids.minHeight);
  assert.equal(grids.heightRows.length, 21);
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
