import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { BotController } from '../src/sim/BotController.js';
import { MatchSimulation, MATCH_TICK_DURATION } from '../src/sim/MatchSimulation.js';
import { DEFAULT_TUNING_CONFIG } from '../src/sim/Tuning.js';
import { buildStalkSegmentSamples, evaluateStalkImpact } from '../src/sim/StalkRope.js';
import { getTerrainHeight } from '../src/world/Terrain.js';

function stepMany(simulation, count, inputA, inputB) {
  for (let index = 0; index < count; index += 1) {
    simulation.setPlayerInput(1, inputA);
    simulation.setPlayerInput(2, inputB);
    simulation.step(MATCH_TICK_DURATION);
  }
}

test('free movement is faster than lock-on movement in the shared simulation', () => {
  const freeSim = new MatchSimulation();
  const lockedSim = new MatchSimulation();

  freeSim.setPlayerInput(1, { moveZ: -1, lockOnHeld: false });
  lockedSim.setPlayerInput(1, { moveZ: -1, lockOnHeld: true });
  freeSim.step(MATCH_TICK_DURATION);
  lockedSim.step(MATCH_TICK_DURATION);

  assert(freeSim.getPlayerState(1).position.z < lockedSim.getPlayerState(1).position.z);
});

test('wet trail boosts movement speed by roughly 500 percent and persists in snapshots', () => {
  const baseSim = new MatchSimulation();
  const trailSim = new MatchSimulation();
  const baseStart = baseSim.getPlayerState(1).position.clone();
  const trailStart = trailSim.getPlayerState(1).position.clone();

  trailSim.markTrailAtPosition(trailStart);
  baseSim.setPlayerInput(1, { moveZ: -1 });
  trailSim.setPlayerInput(1, { moveZ: -1 });
  baseSim.step(MATCH_TICK_DURATION);
  trailSim.step(MATCH_TICK_DURATION);

  const baseDistance = baseSim.getPlayerState(1).position.distanceTo(baseStart);
  const trailDistance = trailSim.getPlayerState(1).position.distanceTo(trailStart);
  const snapshot = trailSim.getSnapshot();

  assert(trailDistance > baseDistance * 5.5);
  assert.equal(trailSim.getPlayerState(1).onTrail, true);
  assert.equal(Array.isArray(snapshot.trailCells), true);
  assert(snapshot.trailCells.length > 0);
  assert.equal(typeof snapshot.trailCellSize, 'number');
});

test('jump raises the player above ground in the shared simulation', () => {
  const simulation = new MatchSimulation();
  const startHeight = simulation.getPlayerState(1).position.y;
  let peakHeight = startHeight;

  for (let index = 0; index < 45; index += 1) {
    simulation.setPlayerInput(1, { jumpPressed: index === 0 });
    simulation.step(MATCH_TICK_DURATION);
    peakHeight = Math.max(peakHeight, simulation.getPlayerState(1).position.y);
  }

  assert(peakHeight > startHeight + 2.8);
});

test('grounded players follow the bowl surface when moving across the arena', () => {
  const simulation = new MatchSimulation({
    tuning: {
      terrainPreset: 'hyperboloid_bowl'
    }
  });
  const player = simulation.getPlayerState(1);
  const initialHeight = player.position.y;

  simulation.setPlayerInput(1, { moveX: 1, moveZ: 0 });
  simulation.step(MATCH_TICK_DURATION);

  assert(player.position.y > initialHeight);
  assert.equal(player.position.y, getTerrainHeight(player.position.x, player.position.z, simulation.getSnapshot().terrain));
});

test('body collisions separate overlapping snails', () => {
  const simulation = new MatchSimulation();
  const playerA = simulation.getPlayerState(1);
  const playerB = simulation.getPlayerState(2);

  playerA.position.set(0, getTerrainHeight(0, 0), 0);
  playerB.position.set(0.5, getTerrainHeight(0.5, 0), 0);
  simulation.step(MATCH_TICK_DURATION);

  assert(playerA.position.distanceTo(playerB.position) > 0.5);
});

test('snapshots include authoritative left and right rope nodes', () => {
  const simulation = new MatchSimulation();
  const snapshot = simulation.getSnapshot();
  const player = snapshot.players[0];

  assert.equal(player.profileName, 'human');
  assert.equal(Array.isArray(player.stalks.left.nodes), true);
  assert.equal(Array.isArray(player.stalks.right.nodes), true);
  assert.equal(player.stalks.left.nodes.length > 4, true);
  assert.equal(typeof player.stalks.left.segmentRadius, 'number');
  assert.equal(typeof player.stalks.left.targetVector.x, 'number');
});

test('idle dual ropes sag under gravity in the shared simulation', () => {
  const simulation = new MatchSimulation();
  const initialLeftY = simulation.getPlayerState(1).stalks.left.nodes[3].y;
  const initialRightY = simulation.getPlayerState(1).stalks.right.nodes[3].y;

  stepMany(simulation, 45, {}, {});

  assert(simulation.getPlayerState(1).stalks.left.nodes[3].y < initialLeftY - 0.15);
  assert(simulation.getPlayerState(1).stalks.right.nodes[3].y < initialRightY - 0.15);
});

test('segment impact evaluation can use a non-terminal rope segment', () => {
  const nodes = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(2, 0, 0),
    new THREE.Vector3(3, 0, 0)
  ];
  const previousNodes = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.2, 0, 0),
    new THREE.Vector3(1.2, 0, 0),
    new THREE.Vector3(3.1, 0, 0)
  ];
  const samples = buildStalkSegmentSamples(nodes, previousNodes, MATCH_TICK_DURATION, 0.2);
  const impact = evaluateStalkImpact(
    samples,
    new THREE.Vector3(1.5, 0, 0),
    0.3,
    new THREE.Vector3(),
    0
  );

  assert.equal(impact.collision, true);
  assert.equal(impact.contactSample?.index, 1);
});

test('held left input changes only the left stalk target in the shared simulation', () => {
  const simulation = new MatchSimulation();
  const player = simulation.getPlayerState(1);
  const leftBefore = player.stalks.left.targetVector.clone();
  const rightBefore = player.stalks.right.targetVector.clone();

  simulation.setPlayerInput(1, { leftHeld: true, lookX: 12 });
  simulation.step(MATCH_TICK_DURATION);

  assert(player.stalks.left.targetVector.x < leftBefore.x);
  assert(Math.abs(player.stalks.left.targetVector.y) < 0.0001);
  assert(player.stalks.right.targetVector.distanceTo(rightBefore) < 0.0001);
});

test('all selectable stalk control modes produce bounded hemisphere targets', () => {
  const modes = [
    'top_down_plane',
    'yaw_pitch',
    'absolute_dome',
    'trackball',
    'tangent_velocity',
    'spring_dome'
  ];

  for (const mode of modes) {
    const simulation = new MatchSimulation({
      tuning: {
        stalkControlMode: mode
      }
    });
    const player = simulation.getPlayerState(1);
    const before = player.stalks.left.targetVector.clone();

    stepMany(simulation, 4, { leftHeld: true, lookX: 16, lookY: -12 }, {});

    const target = player.stalks.left.targetVector;
    assert(target.distanceTo(before) > 0.001, mode);
    assert(Math.abs(target.length() - 1) < 0.0001, mode);
    assert.equal(Number.isFinite(target.x), true, mode);
    assert.equal(Number.isFinite(target.y), true, mode);
    assert.equal(Number.isFinite(target.z), true, mode);
  }
});

test('top-down plane is the default flat stalk control mapping', () => {
  assert.equal(DEFAULT_TUNING_CONFIG.stalkControlMode, 'top_down_plane');

  const simulation = new MatchSimulation();
  const player = simulation.getPlayerState(1);

  assert.equal(player.profile.stalkControlMode, 'top_down_plane');
  assert(Math.abs(player.stalks.left.targetVector.y) < 0.0001);

  simulation.setPlayerInput(1, { leftHeld: true, lookY: -20 });
  simulation.step(MATCH_TICK_DURATION);

  const target = player.stalks.left.targetVector;
  assert(Math.abs(target.y) < 0.0001);
  assert(target.z > 0.99);
  assert(player.stalks.left.targetReach > 1);
});

test('scroll moves the top-down control plane vertically', () => {
  const simulation = new MatchSimulation();
  const player = simulation.getPlayerState(1);
  const before = player.stalks.left.targetVector.clone();

  simulation.setPlayerInput(1, { leftHeld: true, reachDelta: 3 });
  simulation.step(MATCH_TICK_DURATION);

  const snapshotStalk = simulation.getSnapshot().players[0].stalks.left;
  const leftPoint = player.stalks.left.targetVector.clone().multiplyScalar(player.stalks.left.targetReach);
  const rightPoint = player.stalks.right.targetVector.clone().multiplyScalar(player.stalks.right.targetReach);
  assert(player.stalks.left.targetVector.y > before.y);
  assert(leftPoint.y > 0);
  assert(Math.abs(leftPoint.x) < 0.0001);
  assert(Math.abs(leftPoint.z - 1) < 0.0001);
  assert.equal(rightPoint.y, 0);
  assert.equal(typeof snapshotStalk.targetPoint.y, 'number');
});

test('scroll reach input still scales depth in yaw-pitch stalk mode', () => {
  const simulation = new MatchSimulation({
    tuning: {
      stalkControlMode: 'yaw_pitch'
    }
  });
  const player = simulation.getPlayerState(1);

  simulation.setPlayerInput(1, { leftHeld: true, reachDelta: 3 });
  simulation.step(MATCH_TICK_DURATION);

  assert(player.stalks.left.targetReach > 1);
  assert.equal(player.stalks.right.targetReach, 1);
  assert.equal(typeof simulation.getSnapshot().players[0].stalks.left.targetReach, 'number');
});

test('top-down left-right thrash keeps the sweep on the forward ground plane', () => {
  const simulation = new MatchSimulation();
  const player = simulation.getPlayerState(1);

  stepMany(simulation, 10, { leftHeld: true, lookX: 80 }, {});
  const leftTarget = player.stalks.left.targetVector.clone();

  let maxForward = -Infinity;
  let maxAbsVertical = 0;
  for (let index = 0; index < 12; index += 1) {
    simulation.setPlayerInput(1, { leftHeld: true, lookX: index === 0 ? -160 : 0 });
    simulation.step(MATCH_TICK_DURATION);
    maxForward = Math.max(maxForward, player.stalks.left.appliedVector.z);
    maxAbsVertical = Math.max(maxAbsVertical, Math.abs(player.stalks.left.appliedVector.y));
  }

  assert(player.stalks.left.targetVector.x > 0);
  assert(leftTarget.x < 0);
  assert(maxForward > 0.99);
  assert(maxAbsVertical < 0.0001);
});

test('large left-right thrash sweeps around the outside of the dome', () => {
  const simulation = new MatchSimulation({
    tuning: {
      stalkControlMode: 'yaw_pitch'
    }
  });
  const player = simulation.getPlayerState(1);

  stepMany(simulation, 10, { leftHeld: true, lookX: 80 }, {});
  const leftTarget = player.stalks.left.targetVector.clone();

  let maxForward = -Infinity;
  for (let index = 0; index < 6; index += 1) {
    simulation.setPlayerInput(1, { leftHeld: true, lookX: index === 0 ? -260 : 0 });
    simulation.step(MATCH_TICK_DURATION);
    maxForward = Math.max(maxForward, player.stalks.left.appliedVector.z);
  }

  assert(player.stalks.left.targetVector.x > 0);
  assert(leftTarget.x < 0);
  assert(maxForward > 0.95);
});

test('turgidity blends held stalks from flaccid rope toward stiff reach', () => {
  const loose = new MatchSimulation({
    tuning: {
      stalkTurgidity: 0
    }
  });
  const stiff = new MatchSimulation({
    tuning: {
      stalkTurgidity: 1
    }
  });

  stepMany(loose, 3, { leftHeld: true, reachDelta: 4 }, {});
  stepMany(stiff, 3, { leftHeld: true, reachDelta: 4 }, {});

  const looseReach = loose.getPlayerState(1).stalks.left.currentReach;
  const stiffReach = stiff.getPlayerState(1).stalks.left.currentReach;

  assert(stiffReach > looseReach + 0.1);
  assert(stiffReach > 1.2);
});

test('released stalks remain inertial while target vectors stay frozen', () => {
  const simulation = new MatchSimulation();
  const player = simulation.getPlayerState(1);

  simulation.setPlayerInput(1, { leftHeld: true, lookX: 14, lookY: -10 });
  simulation.step(MATCH_TICK_DURATION);

  const frozenTarget = player.stalks.left.targetVector.clone();
  const releasedTip = player.stalks.left.tipPosition.clone();

  stepMany(simulation, 20, {}, {});

  assert(player.stalks.left.targetVector.distanceTo(frozenTarget) < 0.0001);
  assert(player.stalks.left.tipPosition.distanceTo(releasedTip) > 0.05);
});

test('both stalks can damage the opposing player in the same exchange', () => {
  const simulation = new MatchSimulation();
  const attacker = simulation.getPlayerState(1);
  const defender = simulation.getPlayerState(2);

  attacker.position.set(0, getTerrainHeight(0, 0.2), 0.2);
  defender.position.set(0, getTerrainHeight(0, -1.6), -1.6);
  attacker.rotationY = Math.PI;
  defender.rotationY = 0;
  defender.health = 3;

  stepMany(
    simulation,
    25,
    { moveZ: -1, lockOnHeld: true, leftHeld: true, rightHeld: true, lookY: -18 },
    { lockOnHeld: true }
  );

  assert(defender.health <= 1);
});

test('winner is declared when a player reaches zero health', () => {
  const simulation = new MatchSimulation();
  const attacker = simulation.getPlayerState(1);
  const defender = simulation.getPlayerState(2);

  attacker.position.set(0, getTerrainHeight(0, 0.2), 0.2);
  defender.position.set(0, getTerrainHeight(0, -1.6), -1.6);
  attacker.rotationY = Math.PI;
  defender.rotationY = 0;
  defender.health = 1;

  stepMany(
    simulation,
    25,
    { moveZ: -1, lockOnHeld: true, leftHeld: true, rightHeld: true, lookY: -18 },
    { lockOnHeld: true }
  );

  assert.equal(simulation.getSnapshot().phase, 'ended');
  assert.equal(simulation.getSnapshot().winnerSlot, 1);
});

test('multiplayer win state ignores surviving bots once one human remains', () => {
  const simulation = new MatchSimulation({
    mode: 'multiplayer',
    players: [
      { slot: 1, profile: 'human', connected: true },
      { slot: 2, profile: 'human', connected: true },
      { slot: 3, profile: 'bot', connected: true }
    ]
  });

  simulation.getPlayerState(2).health = 0;
  simulation.step(MATCH_TICK_DURATION);

  assert.equal(simulation.getSnapshot().phase, 'ended');
  assert.equal(simulation.getSnapshot().winnerSlot, 1);
});

test('bot controller produces dual-stalk hold states when in range', () => {
  const simulation = new MatchSimulation({
    players: [
      { slot: 1, profile: 'human', connected: true },
      { slot: 2, profile: 'bot', connected: true }
    ]
  });
  const bot = new BotController();
  const player = simulation.getPlayerState(1);
  const enemy = simulation.getPlayerState(2);

  player.position.set(0, getTerrainHeight(0, 0), 0);
  enemy.position.set(0, getTerrainHeight(0, -3.2), -3.2);

  let input = null;
  for (let index = 0; index < 40; index += 1) {
    input = bot.getInput(simulation, 2, 1, MATCH_TICK_DURATION);
  }

  assert(input.lockOnHeld);
  assert.equal(typeof input.leftHeld, 'boolean');
  assert.equal(typeof input.rightHeld, 'boolean');
});
