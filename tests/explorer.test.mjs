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
  assert(snapshot.worldProps.length > 20);
  assert.equal(snapshot.players.some((player) => player.fixtureKind), false);
  assert.equal(session.getFocusTargetState()?.slot, 2);
});

test('explorer scale makes landmarks enormous while gravel remains snail-sized', () => {
  const world = createExplorerWorld(12);
  const elderTree = world.landmarks.find((landmark) => landmark.id === 'elder-tree');
  const gravel = world.props.filter((prop) => prop.kind === 'gravel');

  assert.equal(world.worldBounds.radius, EXPLORER_WORLD_RADIUS);
  assert.equal(elderTree.x, -240);
  assert.equal(elderTree.height, 340);
  assert(gravel.length > 20);
  assert(gravel.every((prop) => prop.visual.radius >= 0.18 && prop.visual.radius <= 0.46));
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
  assert.match(grids.featureGrid, /▲/);
  assert(grids.maxHeight > grids.minHeight);
  assert.equal(grids.heightRows.length, 21);
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
    supportNormal: { x: 1, y: 0, z: 0 },
    stalks: {}
  }, MATCH_TICK_DURATION);

  const tiltedUp = new THREE.Vector3(0, 1, 0).applyQuaternion(actor.tiltRoot.quaternion);
  assert(tiltedUp.distanceTo(new THREE.Vector3(1, 0, 0)) < 0.0001);
});
