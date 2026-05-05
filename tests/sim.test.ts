import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { BotController } from '../src/sim/BotController.js';
import { MatchSimulation, MATCH_TICK_DURATION } from '../src/sim/MatchSimulation.js';
import { DEFAULT_TUNING_CONFIG } from '../src/sim/Tuning.js';
import {
  STALK_EYE_BOUNCE_RESTITUTION,
  applyStalkCollisionConstraints,
  buildStalkSegmentSamples,
  createInitialStalkNodes,
  evaluateStalkImpact,
  getStalkRootWorldPosition,
  reflectIncidentVector,
  simulateStalkRope
} from '../src/sim/StalkRope.js';
import { getTerrainHeight } from '../src/world/Terrain.js';
import { getTerrainBodyGroundHeight } from '../src/world/TerrainClearance.js';

function stepMany(simulation, count, inputA, inputB) {
  for (let index = 0; index < count; index += 1) {
    simulation.setPlayerInput(1, inputA);
    simulation.setPlayerInput(2, inputB);
    simulation.step(MATCH_TICK_DURATION);
  }
}

function setPlayerOnTerrain(player, x, z) {
  player.position.set(x, getTerrainBodyGroundHeight({
    x,
    z,
    rotationY: player.rotationY,
    aboveGroundHeight: player.profile.groundHeight
  }), z);
  player.previousPosition.copy(player.position);
  player.grounded = true;
  player.verticalVelocity = 0;
}

function getExpectedPlayerGroundHeight(player, terrainConfig) {
  return getTerrainBodyGroundHeight({
    x: player.position.x,
    z: player.position.z,
    rotationY: player.rotationY,
    terrainConfig,
    aboveGroundHeight: player.profile.groundHeight
  });
}

function settleSimulation(simulation, maxSteps = 120) {
  for (let index = 0; index < maxSteps; index += 1) {
    simulation.step(MATCH_TICK_DURATION);
    if ((Array.from(simulation.players.values()) as any[]).every((player) => player.grounded)) {
      return;
    }
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

test('powerup props mutate snail stats and leave the world snapshot', () => {
  const simulation = new MatchSimulation({
    players: [
      { slot: 1, profile: 'human', connected: true, position: { x: 0, z: 6 }, rotationY: Math.PI },
      { slot: 2, profile: 'human', connected: true, position: { x: 0, z: -60 }, rotationY: 0 }
    ],
    worldProps: [
      {
        id: 'test-dew',
        kind: 'dew_bead',
        displayName: 'Test Dew',
        position: { x: 0, z: 6 },
        bodyRadius: 1,
        blocking: false,
        climbable: false,
        collisionShape: { type: 'sphere', radius: 1 },
        powerup: { type: 'dew', amount: 5, label: 'Test Dew' }
      },
      {
        id: 'test-grit',
        kind: 'sharp_grit',
        displayName: 'Test Grit',
        position: { x: 20, z: 6 },
        bodyRadius: 1,
        blocking: false,
        climbable: false,
        collisionShape: { type: 'sphere', radius: 1 },
        powerup: { type: 'grit', amount: 3, label: 'Test Grit' }
      }
    ]
  });

  simulation.step(MATCH_TICK_DURATION);

  const snapshot = simulation.getSnapshot();
  const player = snapshot.players.find((candidate) => candidate.slot === 1);
  assert.equal(player.snailStats.dew, 5);
  assert(player.snailStats.speedMultiplier > 1);
  assert.equal(snapshot.worldProps.some((prop) => prop.id === 'test-dew'), false);
  assert.equal(snapshot.worldProps.some((prop) => prop.id === 'test-grit'), true);
  assert(snapshot.events.some((event) => event.type === 'powerup' && event.powerupType === 'dew'));
});

test('jump raises the player above ground in the shared simulation', () => {
  const simulation = new MatchSimulation();
  settleSimulation(simulation);
  const startHeight = simulation.getPlayerState(1).position.y;
  let peakHeight = startHeight;

  for (let index = 0; index < 45; index += 1) {
    simulation.setPlayerInput(1, { jumpPressed: index === 0 });
    simulation.step(MATCH_TICK_DURATION);
    peakHeight = Math.max(peakHeight, simulation.getPlayerState(1).position.y);
  }

  assert(peakHeight > startHeight + 2.5);
});

test('players spawn above terrain and fall to grounded clearance', () => {
  const simulation = new MatchSimulation();
  const player = simulation.getPlayerState(1);
  const groundHeight = getExpectedPlayerGroundHeight(player, simulation.getSnapshot().terrain);

  assert.equal(player.grounded, false);
  assert.equal(player.position.y, groundHeight + player.profile.spawnDropHeight);

  settleSimulation(simulation);

  assert.equal(player.grounded, true);
  assert.equal(player.position.y, getExpectedPlayerGroundHeight(player, simulation.getSnapshot().terrain));
});

test('grounded players keep body clearance above terrain', () => {
  const simulation = new MatchSimulation();
  settleSimulation(simulation);
  const player = simulation.getPlayerState(1);
  const terrainHeight = getTerrainHeight(player.position.x, player.position.z, simulation.getSnapshot().terrain);

  assert(player.position.y >= terrainHeight + player.profile.groundHeight);
  assert.equal(player.position.y, getExpectedPlayerGroundHeight(player, simulation.getSnapshot().terrain));
});

test('grounded players follow the bowl surface when moving across the arena', () => {
  const simulation = new MatchSimulation({
    tuning: {
      terrainPreset: 'hyperboloid_bowl'
    }
  });
  settleSimulation(simulation);
  const player = simulation.getPlayerState(1);
  const initialHeight = player.position.y;

  simulation.setPlayerInput(1, { moveX: 1, moveZ: 0 });
  simulation.step(MATCH_TICK_DURATION);

  assert(player.position.y > initialHeight);
  assert.equal(
    player.position.y,
    getExpectedPlayerGroundHeight(player, simulation.getSnapshot().terrain)
  );
});

test('body collisions separate overlapping snails', () => {
  const simulation = new MatchSimulation();
  const playerA = simulation.getPlayerState(1);
  const playerB = simulation.getPlayerState(2);

  setPlayerOnTerrain(playerA, 0, 0);
  setPlayerOnTerrain(playerB, 0.5, 0);
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

test('network snapshots omit authoritative stalk payloads', () => {
  const simulation = new MatchSimulation();
  const fullSnapshot = simulation.getSnapshot();
  const networkSnapshot = simulation.getNetworkSnapshot();
  const fullBytes = Buffer.byteLength(JSON.stringify(fullSnapshot));
  const networkBytes = Buffer.byteLength(JSON.stringify(networkSnapshot));

  assert.equal(Array.isArray(fullSnapshot.players[0].stalks.left.nodes), true);
  assert.equal('stalks' in networkSnapshot.players[0], false);
  assert(networkBytes < fullBytes * 0.45);
});

test('bird creatures are snapshotted without becoming lock-on targets', () => {
  const simulation = new MatchSimulation({
    players: [
      { slot: 1, profile: 'human', connected: true, position: { x: 0, z: 0 }, rotationY: 0 }
    ],
    creatures: [
      { id: 'bird-test', kind: 'bird', home: { x: 0, z: 0 }, cooldown: 30 }
    ]
  });
  const snapshot = simulation.getSnapshot();
  const networkSnapshot = simulation.getNetworkSnapshot();

  assert.equal(snapshot.players.length, 1);
  assert.equal(snapshot.creatures.length, 1);
  assert.equal(snapshot.creatures[0].kind, 'bird');
  assert.equal(networkSnapshot.creatures[0].id, 'bird-test');
  assert.equal(simulation.findPreferredTarget(simulation.getPlayerState(1)), null);
});

test('predator bird swoop salts an exposed snail', () => {
  const simulation = new MatchSimulation({
    players: [
      { slot: 1, profile: 'human', connected: true, position: { x: 0, z: 0 }, rotationY: 0 }
    ],
    creatures: [
      {
        id: 'bird-test',
        kind: 'bird',
        home: { x: 0, z: 0 },
        shadowPosition: { x: 0, z: 0 },
        phase: 'swoop',
        phaseTimer: 1.09,
        targetSlot: 1,
        cooldown: 0,
        altitude: 20
      }
    ]
  });

  simulation.step(MATCH_TICK_DURATION);
  const snapshot = simulation.getSnapshot();

  assert.equal(simulation.getPlayerState(1).health, 0);
  assert.equal(snapshot.events.some((event) => event.type === 'bird_attack' && event.targetSlot === 1), true);
});

test('predator bird swoop misses when the snail is outside the impact shadow', () => {
  const simulation = new MatchSimulation({
    players: [
      { slot: 1, profile: 'human', connected: true, position: { x: 0, z: 0 }, rotationY: 0 }
    ],
    creatures: [
      {
        id: 'bird-test',
        kind: 'bird',
        home: { x: 0, z: 0 },
        shadowPosition: { x: 8, z: 0 },
        phase: 'swoop',
        phaseTimer: 1.09,
        targetSlot: 1,
        cooldown: 0,
        altitude: 20
      }
    ]
  });
  const healthBefore = simulation.getPlayerState(1).health;

  simulation.step(MATCH_TICK_DURATION);
  const snapshot = simulation.getSnapshot();

  assert.equal(simulation.getPlayerState(1).health, healthBefore);
  assert.equal(snapshot.events.some((event) => event.type === 'bird_miss'), true);
});

test('predator bird swoop misses when the snail reaches cover', () => {
  const simulation = new MatchSimulation({
    players: [
      { slot: 1, profile: 'human', connected: true, position: { x: 0, z: 0 }, rotationY: 0 }
    ],
    worldProps: [
      {
        id: 'cover-shrub',
        kind: 'shrub',
        position: { x: 0, z: 0 },
        bodyRadius: 4,
        blocking: false,
        climbable: false,
        collisionShape: { type: 'cylinder', radius: 4, halfHeight: 4 },
        visual: { radius: 18, height: 12 }
      }
    ],
    creatures: [
      {
        id: 'bird-test',
        kind: 'bird',
        home: { x: 0, z: 0 },
        shadowPosition: { x: 0, z: 0 },
        phase: 'swoop',
        phaseTimer: 1.09,
        targetSlot: 1,
        cooldown: 0,
        altitude: 20
      }
    ]
  });
  const healthBefore = simulation.getPlayerState(1).health;

  simulation.step(MATCH_TICK_DURATION);
  const snapshot = simulation.getSnapshot();

  assert.equal(simulation.getPlayerState(1).health, healthBefore);
  assert.equal(snapshot.events.some((event) => event.type === 'bird_miss'), true);
});

test('idle dual ropes sag under gravity in the shared simulation', () => {
  const simulation = new MatchSimulation();
  const initialLeftY = simulation.getPlayerState(1).stalks.left.nodes[3].y;
  const initialRightY = simulation.getPlayerState(1).stalks.right.nodes[3].y;

  stepMany(simulation, 45, {}, {});

  assert(simulation.getPlayerState(1).stalks.left.nodes[3].y < initialLeftY - 0.15);
  assert(simulation.getPlayerState(1).stalks.right.nodes[3].y < initialRightY - 0.15);
});

test('incident vectors reflect across a collision plane normal', () => {
  const reflected = reflectIncidentVector(
    new THREE.Vector3(1, -2, 0),
    new THREE.Vector3(0, 1, 0)
  );
  assert.deepEqual(reflected.toArray(), [1, 2, 0]);

  const damped = reflectIncidentVector(
    new THREE.Vector3(2, -3, 0),
    new THREE.Vector3(0, 1, 0),
    0.5,
    0.25
  );
  assert.deepEqual(damped.toArray(), [1.5, 1.5, 0]);
});

test('eye terrain collision bounces the terminal node upward', () => {
  const rootWorld = new THREE.Vector3(0, 1, 0);
  const nodes = [
    rootWorld.clone(),
    new THREE.Vector3(0, -0.2, 0)
  ];
  const previousNodes = [
    rootWorld.clone(),
    new THREE.Vector3(0, 0.3, 0)
  ];

  applyStalkCollisionConstraints({
    nodes,
    previousNodes,
    rootWorld,
    terrainHeightAt: () => 0,
    segmentRadius: 0.05,
    eyeRadius: 0.2,
    includeSegmentMidpoints: false
  });

  assert.equal(nodes[1].y, 0.2);
  assert(nodes[1].y - previousNodes[1].y > 0);
});

test('eye body collision bounces away from the body surface normal', () => {
  const rootWorld = new THREE.Vector3(2, 0, 0);
  const bodyPosition = new THREE.Vector3(0, 0, 0);
  const nodes = [
    rootWorld.clone(),
    new THREE.Vector3(0.6, 0, 0)
  ];
  const previousNodes = [
    rootWorld.clone(),
    new THREE.Vector3(1, 0, 0)
  ];

  applyStalkCollisionConstraints({
    nodes,
    previousNodes,
    rootWorld,
    bodyObstacles: [{ position: bodyPosition, radius: 1 }],
    segmentRadius: 0.05,
    eyeRadius: 0.2,
    includeSegmentMidpoints: false
  });

  assert(Math.abs(nodes[1].x - 1.2) < 0.0001);
  assert(nodes[1].x - previousNodes[1].x > 0);
});

test('eye box collision bounces from a flat cube face', () => {
  const rootWorld = new THREE.Vector3(3, 0, 0);
  const nodes = [
    rootWorld.clone(),
    new THREE.Vector3(1.1, 0, 0)
  ];
  const previousNodes = [
    rootWorld.clone(),
    new THREE.Vector3(1.6, 0, 0)
  ];

  applyStalkCollisionConstraints({
    nodes,
    previousNodes,
    rootWorld,
    bodyObstacles: [{
      position: new THREE.Vector3(0, 0, 0),
      radius: 2,
      shape: {
        type: 'box',
        halfExtents: { x: 1, y: 1, z: 1 }
      }
    }],
    segmentRadius: 0.05,
    eyeRadius: 0.2,
    includeSegmentMidpoints: false
  });

  assert.equal(nodes[1].x, 1.2);
  assert(nodes[1].x - previousNodes[1].x > 0);
});

test('eye box collision respects obstacle yaw rotation', () => {
  const rootWorld = new THREE.Vector3(3, 0, 0);
  const nodes = [
    rootWorld.clone(),
    new THREE.Vector3(0.6, 0, 0)
  ];
  const previousNodes = [
    rootWorld.clone(),
    new THREE.Vector3(0.2, 0, 0)
  ];

  applyStalkCollisionConstraints({
    nodes,
    previousNodes,
    rootWorld,
    bodyObstacles: [{
      position: new THREE.Vector3(0, 0, 0),
      radius: 3,
      rotationY: Math.PI / 2,
      shape: {
        type: 'box',
        halfExtents: { x: 3, y: 1, z: 0.5 }
      }
    }],
    segmentRadius: 0.05,
    eyeRadius: 0.2,
    includeSegmentMidpoints: false
  });

  assert(Math.abs(nodes[1].x - 0.7) < 0.0001);
  assert(Math.abs(nodes[1].z) < 0.0001);
});

test('eye cylinder collision bounces from the curved side normal', () => {
  const rootWorld = new THREE.Vector3(3, 0, 0);
  const nodes = [
    rootWorld.clone(),
    new THREE.Vector3(1.05, 0, 0)
  ];
  const previousNodes = [
    rootWorld.clone(),
    new THREE.Vector3(1.5, 0, 0)
  ];

  applyStalkCollisionConstraints({
    nodes,
    previousNodes,
    rootWorld,
    bodyObstacles: [{
      position: new THREE.Vector3(0, 0, 0),
      radius: 1.5,
      shape: {
        type: 'cylinder',
        radius: 1,
        halfHeight: 1.4
      }
    }],
    segmentRadius: 0.05,
    eyeRadius: 0.2,
    includeSegmentMidpoints: false
  });

  assert.equal(nodes[1].x, 1.2);
  assert(nodes[1].x - previousNodes[1].x > 0);
});

test('stalk rope collision keeps nodes and eyes above terrain', () => {
  const rootWorld = new THREE.Vector3(0, 1, 0);
  const nodes = [
    rootWorld.clone(),
    new THREE.Vector3(0, -0.8, 0),
    new THREE.Vector3(0, -0.8, 1)
  ];
  const previousNodes = nodes.map((node) => node.clone());

  simulateStalkRope({
    nodes,
    previousNodes,
    rootWorld,
    goalWorld: nodes[2].clone(),
    delta: MATCH_TICK_DURATION,
    gravity: 0,
    damping: 1,
    goalPull: 0,
    constraintIterations: 0,
    collision: {
      terrainHeightAt: () => 0,
      segmentRadius: 0.2,
      eyeRadius: 0.4,
      includeSegmentMidpoints: false
    }
  });

  assert(nodes[1].y >= 0.2 - 0.0001);
  assert(nodes[2].y >= 0.4 - 0.0001);
  assert.equal(previousNodes[2].y, nodes[2].y);
});

test('stalk rope collision pushes nodes outside body obstacles', () => {
  const rootWorld = new THREE.Vector3(0, 2, 0);
  const bodyPosition = new THREE.Vector3(0, 0, 0);
  const nodes = [
    rootWorld.clone(),
    bodyPosition.clone(),
    new THREE.Vector3(0, 2, 2)
  ];
  const previousNodes = nodes.map((node) => node.clone());

  simulateStalkRope({
    nodes,
    previousNodes,
    rootWorld,
    goalWorld: nodes[2].clone(),
    delta: MATCH_TICK_DURATION,
    gravity: 0,
    damping: 1,
    goalPull: 0,
    constraintIterations: 0,
    collision: {
      bodyObstacles: [{ position: bodyPosition, radius: 1 }],
      segmentRadius: 0.2,
      eyeRadius: 0.2,
      includeSegmentMidpoints: false
    }
  });

  assert(nodes[1].distanceTo(bodyPosition) >= 1.2 - 0.0001);
  assert(previousNodes[1].distanceTo(bodyPosition) >= 1.2 - 0.0001);
});

test('stalk rope collision corrects visible segment midpoint body clipping', () => {
  const rootWorld = new THREE.Vector3(-2, 2, 0);
  const bodyPosition = new THREE.Vector3(0, 0, 0);
  const nodes = [
    rootWorld.clone(),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(1, 0, 0)
  ];
  const previousNodes = nodes.map((node) => node.clone());

  simulateStalkRope({
    nodes,
    previousNodes,
    rootWorld,
    goalWorld: nodes[2].clone(),
    delta: MATCH_TICK_DURATION,
    gravity: 0,
    damping: 1,
    goalPull: 0,
    constraintIterations: 0,
    collision: {
      bodyObstacles: [{ position: bodyPosition, radius: 0.5 }],
      segmentRadius: 0.1,
      eyeRadius: 0.1
    }
  });

  const midpoint = nodes[1].clone().add(nodes[2]).multiplyScalar(0.5);
  assert(midpoint.distanceTo(bodyPosition) >= 0.6 - 0.0001);
});

test('self body collision leaves the root grace segment stable', () => {
  const rootWorld = new THREE.Vector3(0, 0.55, 0);
  const bodyPosition = new THREE.Vector3(0, 0, 0);
  const nodes = [
    rootWorld.clone(),
    new THREE.Vector3(0, 0.4, 0.2),
    new THREE.Vector3(0, 0.4, 0.3)
  ];
  const previousNodes = nodes.map((node) => node.clone());
  const graceNode = nodes[1].clone();

  simulateStalkRope({
    nodes,
    previousNodes,
    rootWorld,
    goalWorld: nodes[2].clone(),
    delta: MATCH_TICK_DURATION,
    gravity: 0,
    damping: 1,
    goalPull: 0,
    constraintIterations: 0,
    collision: {
      bodyObstacles: [{ position: bodyPosition, radius: 1, self: true }],
      segmentRadius: 0.1,
      eyeRadius: 0.1,
      selfRootGraceSegments: 1
    }
  });

  assert(nodes[1].distanceTo(graceNode) < 0.0001);
  assert(nodes[2].distanceTo(bodyPosition) >= 1.1 - 0.0001);
});

test('authoritative stalk nodes stay above terrain in the shared simulation', () => {
  const simulation = new MatchSimulation({
    tuning: {
      terrainPreset: 'hyperboloid_bowl'
    }
  });

  stepMany(simulation, 60, {}, {});

  const snapshot = simulation.getSnapshot();
  const player = simulation.getPlayerState(1);
  for (const [, stalk] of Object.entries(player.stalks) as any[]) {
    for (let index = 0; index < stalk.nodes.length; index += 1) {
      const node = stalk.nodes[index];
      const radius = index === stalk.nodes.length - 1
        ? stalk.segmentRadius * 1.35
        : stalk.segmentRadius;
      assert(
        node.y >= getTerrainHeight(node.x, node.z, snapshot.terrain) + radius - 0.001,
        `node ${index} should be above terrain`
      );
    }
  }
});

test('authoritative stalk nodes stay outside opposing snail bodies', () => {
  const simulation = new MatchSimulation();
  const attacker = simulation.getPlayerState(1);
  const defender = simulation.getPlayerState(2);

  setPlayerOnTerrain(attacker, 0, 0);
  setPlayerOnTerrain(defender, 0, 3.8);
  attacker.stalks.left.nodes[2].copy(defender.position);
  attacker.stalks.left.previousNodes[2].copy(defender.position);

  simulation.step(MATCH_TICK_DURATION);

  const node = attacker.stalks.left.nodes[2];
  assert(node.distanceTo(defender.position) >= defender.bodyRadius + attacker.stalks.left.segmentRadius - 0.001);
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

test('segment impact evaluation uses fixture shape normals', () => {
  const nodes = [
    new THREE.Vector3(1.3, 0.7, 0),
    new THREE.Vector3(1.3, 0.7, 0.5)
  ];
  const previousNodes = [
    new THREE.Vector3(2.3, 0.7, 0),
    new THREE.Vector3(2.3, 0.7, 0.5)
  ];
  const samples = buildStalkSegmentSamples(nodes, previousNodes, MATCH_TICK_DURATION, 0.2);
  const impact = evaluateStalkImpact(
    samples,
    new THREE.Vector3(0, 0, 0),
    2.1,
    new THREE.Vector3(),
    0,
    {
      type: 'box',
      halfExtents: { x: 1.25, y: 1.25, z: 1.25 }
    }
  );

  assert.equal(impact.collision, true);
  assert.deepEqual(impact.contactSample.surfaceNormal.toArray(), [1, 0, 0]);
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

test('both eye tips can damage the opposing player in the same exchange', () => {
  const simulation = new MatchSimulation();
  const attacker = simulation.getPlayerState(1);
  const defender = simulation.getPlayerState(2);
  const configureEyeHit = (stalk, y) => {
    stalk.nodes = [
      new THREE.Vector3(3, y, 0),
      new THREE.Vector3(1.2, y, 0),
      new THREE.Vector3(1.6, y, 0)
    ];
    stalk.previousNodes = [
      new THREE.Vector3(3, y, 0),
      new THREE.Vector3(2.2, y, 0),
      new THREE.Vector3(2.6, y, 0)
    ];
    stalk.incidentNodes = stalk.nodes.map((node) => node.clone());
    stalk.incidentPreviousNodes = stalk.previousNodes.map((node) => node.clone());
  };

  defender.position.set(0, 0, 0);
  defender.health = 10;
  configureEyeHit(attacker.stalks.left, -0.2);
  configureEyeHit(attacker.stalks.right, 0.2);

  simulation.resolveImpact(attacker, defender, MATCH_TICK_DURATION);
  const events = simulation.getSnapshot().events;

  assert.equal(events.length, 2);
  assert(events.some((event) => event.side === 'left'));
  assert(events.some((event) => event.side === 'right'));
  assert(defender.health < 10);
});

function resolveDirectStalkHit(segmentRadius = null) {
  const simulation = new MatchSimulation();
  const attacker = simulation.getPlayerState(1);
  const defender = simulation.getPlayerState(2);
  const stalk = attacker.stalks.left;

  defender.position.set(0, 0, 0);
  defender.health = 600;
  defender.grounded = true;
  defender.supportKind = 'terrain';
  defender.verticalVelocity = 0;
  stalk.held = true;
  if (segmentRadius !== null) {
    stalk.segmentRadius = segmentRadius;
  }

  stalk.nodes = [
    new THREE.Vector3(3, 0, 0),
    new THREE.Vector3(1.2, 0, 0),
    new THREE.Vector3(1.6, 0, 0)
  ];
  stalk.previousNodes = [
    new THREE.Vector3(3, 0, 0),
    new THREE.Vector3(2.2, 0, 0),
    new THREE.Vector3(2.6, 0, 0)
  ];
  stalk.incidentNodes = stalk.nodes.map((node) => node.clone());
  stalk.incidentPreviousNodes = stalk.previousNodes.map((node) => node.clone());

  simulation.resolveImpact(attacker, defender, MATCH_TICK_DURATION);
  return { simulation, defender };
}

test('damage snapshots include floating indicator events at the impact site', () => {
  const { simulation, defender } = resolveDirectStalkHit();
  const snapshot = simulation.getSnapshot();
  const event = snapshot.events[0];

  assert(defender.health < defender.maxHealth);
  assert.equal(snapshot.events.length, 1);
  assert.equal(event.type, 'damage');
  assert.equal(event.measurement, 'bash');
  assert.equal(event.attackerSlot, 1);
  assert.equal(event.targetSlot, 2);
  assert.equal(event.side, 'left');
  assert(event.amount > 0);
  const expectedImpulse = 60 * (1 + STALK_EYE_BOUNCE_RESTITUTION);
  assert(Math.abs(event.impactSpeed - 60) < 0.0001);
  assert(Math.abs(event.bashImpulse - expectedImpulse) < 0.0001);
  assert(Math.abs(event.bashDamage - event.amount) < 0.0001);
  assert(event.bashDamage < expectedImpulse / DEFAULT_TUNING_CONFIG.impactThreshold);
  assert.equal('scrapeImpulse' in event, false);
  assert.equal('scrapeDamage' in event, false);
  assert(Math.abs(event.position.x - defender.bodyRadius) < 0.0001);
  assert.equal(event.position.y, 0);
  assert.equal(event.position.z, 0);
});

test('bash damage knocks the target away from the impact vector', () => {
  const { simulation, defender } = resolveDirectStalkHit();
  const event = simulation.getSnapshot().events[0];

  assert(event.knockback.x < -2.5);
  assert(Math.abs(event.knockback.y) < 0.0001);
  assert(Math.abs(event.knockback.z) < 0.0001);
  assert(defender.position.x < -2.5);
  assert.equal(defender.grounded, true);
  assert.equal(defender.supportKind, 'terrain');
});

test('grounded vertical impact flips knockback upward', () => {
  const simulation = new MatchSimulation();
  const attacker = simulation.getPlayerState(1);
  const defender = simulation.getPlayerState(2);
  const stalk = attacker.stalks.left;

  defender.position.set(0, 0, 0);
  defender.health = 600;
  defender.grounded = true;
  defender.supportKind = 'terrain';
  stalk.held = true;
  stalk.nodes = [
    new THREE.Vector3(0, 4, 0),
    new THREE.Vector3(0, 2.4, 0),
    new THREE.Vector3(0, 1.6, 0)
  ];
  stalk.previousNodes = [
    new THREE.Vector3(0, 4, 0),
    new THREE.Vector3(0, 3.4, 0),
    new THREE.Vector3(0, 2.6, 0)
  ];
  stalk.incidentNodes = stalk.nodes.map((node) => node.clone());
  stalk.incidentPreviousNodes = stalk.previousNodes.map((node) => node.clone());

  simulation.resolveImpact(attacker, defender, MATCH_TICK_DURATION);

  const event = simulation.getSnapshot().events[0];

  assert(event.knockback.y > 1);
  assert(defender.position.y > 1);
  assert.equal(defender.grounded, false);
  assert.equal(defender.supportKind, 'air');
  assert(defender.verticalVelocity > 0);
});

test('tangent contact against a sphere deals scrape damage without bash', () => {
  const simulation = new MatchSimulation();
  const attacker = simulation.getPlayerState(1);
  const defender = simulation.getPlayerState(2);
  const stalk = attacker.stalks.left;

  defender.position.set(0, 0, 0);
  defender.health = 600;
  const healthBefore = defender.health;
  stalk.nodes = [
    new THREE.Vector3(1.6, -0.5, 0),
    new THREE.Vector3(1.6, 0.5, 0),
    new THREE.Vector3(1.6, 0, 0)
  ];
  stalk.previousNodes = [
    new THREE.Vector3(1.6, -0.5, -1),
    new THREE.Vector3(1.6, 0.5, -1),
    new THREE.Vector3(1.6, 0, -1)
  ];
  stalk.incidentNodes = stalk.nodes.map((node) => node.clone());
  stalk.incidentPreviousNodes = stalk.previousNodes.map((node) => node.clone());

  simulation.resolveImpact(attacker, defender, MATCH_TICK_DURATION);

  const scrapeSnapshot = simulation.getSnapshot();
  const scrape = scrapeSnapshot.events[0];

  assert.equal(scrapeSnapshot.events.length, 1);
  assert(defender.health < healthBefore);
  assert.equal(scrape.measurement, 'scrape');
  assert.equal(scrape.bashDamage, 0);
  assert(scrape.scrapeDamage > 0);
  assert(scrape.scrapeImpulse > 0);
  assert(Math.abs(scrape.impactSpeed) < 0.0001);
  assert(scrape.tangentSpeed > 50);

  simulation.events = [];
  stalk.nodes = [
    new THREE.Vector3(3, 0, 0),
    new THREE.Vector3(1.2, 0, 0),
    new THREE.Vector3(1.6, 0, 0)
  ];
  stalk.previousNodes = [
    new THREE.Vector3(3, 0, 0),
    new THREE.Vector3(2.2, 0, 0),
    new THREE.Vector3(2.6, 0, 0)
  ];
  stalk.incidentNodes = stalk.nodes.map((node) => node.clone());
  stalk.incidentPreviousNodes = stalk.previousNodes.map((node) => node.clone());
  simulation.resolveImpact(attacker, defender, MATCH_TICK_DURATION);

  const bashSnapshot = simulation.getSnapshot();

  assert.equal(bashSnapshot.events.length, 1);
  assert.equal(bashSnapshot.events[0].measurement, 'bash');
});

test('shaft contact does not produce damage while eye is clear', () => {
  const simulation = new MatchSimulation();
  const attacker = simulation.getPlayerState(1);
  const defender = simulation.getPlayerState(2);
  const stalk = attacker.stalks.left;

  defender.position.set(0, 0, 0);
  defender.health = 600;
  stalk.nodes = [
    new THREE.Vector3(1.6, -0.5, 0),
    new THREE.Vector3(1.6, 0.5, 0),
    new THREE.Vector3(3, 0.5, 0)
  ];
  stalk.previousNodes = [
    new THREE.Vector3(1.6, -0.5, -1),
    new THREE.Vector3(1.6, 0.5, -1),
    new THREE.Vector3(3, 0.5, 0)
  ];
  stalk.incidentNodes = stalk.nodes.map((node) => node.clone());
  stalk.incidentPreviousNodes = stalk.previousNodes.map((node) => node.clone());

  simulation.resolveImpact(attacker, defender, MATCH_TICK_DURATION);

  assert.equal(simulation.getSnapshot().events.length, 0);
  assert.equal(defender.health, 600);
});

test('right eye sweep bashes once against a blocking cube face and reports scrape sliding', () => {
  const cubeHalfExtents = Object.freeze({ x: 0.75, y: 0.75, z: 0.75 });
  const simulation = new MatchSimulation({
    mode: 'test',
    players: [
      { slot: 1, profile: 'human', connected: true },
      {
        slot: 9001,
        profile: 'fixture',
        fixtureKind: 'cube',
        displayName: 'Blocking Cube',
        immortal: true,
        maxHealth: 999999,
        position: { x: 2.8, z: 1.9 },
        bodyRadius: 1.3,
        collisionShape: {
          type: 'box',
          halfExtents: cubeHalfExtents
        }
      }
    ],
    tuning: {
      terrainPreset: 'plane',
      spawnDropHeight: 0
    }
  });
  const attacker = simulation.getPlayerState(1);
  const cube = simulation.getPlayerState(9001);
  const stalk = attacker.stalks.right;
  const startDirection = new THREE.Vector3(1, 0, 0);
  const targetDirection = new THREE.Vector3(0, 0, 1);
  const cubeObstacles = [{
    slot: cube.slot,
    position: cube.position,
    radius: cube.bodyRadius,
    shape: cube.collisionShape
  }];
  const events = [];

  attacker.position.set(0, 0, 0);
  attacker.previousPosition.copy(attacker.position);
  attacker.rotationY = 0;
  attacker.bodyVelocity.set(0, 0, 0);

  const rootWorld = getStalkRootWorldPosition(attacker.position, attacker.rotationY, stalk.rootOffset);
  const startGoal = rootWorld.clone().addScaledVector(startDirection, attacker.profile.stalkTotalLength);

  stalk.nodes = createInitialStalkNodes(rootWorld, startGoal, attacker.profile.stalkSegmentCount);
  stalk.previousNodes = stalk.nodes.map((node) => node.clone());
  stalk.incidentNodes = stalk.nodes.map((node) => node.clone());
  stalk.incidentPreviousNodes = stalk.previousNodes.map((node) => node.clone());
  stalk.held = true;
  stalk.desiredVector.copy(targetDirection);
  stalk.targetVector.copy(targetDirection);
  stalk.appliedVector.copy(startDirection);
  stalk.currentVector.copy(startDirection);
  stalk.desiredReach = 1;
  stalk.appliedReach = 1;
  stalk.targetReach = 1;
  stalk.currentReach = 1;

  for (let tick = 0; tick < 24; tick += 1) {
    simulation.events = [];
    simulation.updateStalkRopes(attacker, MATCH_TICK_DURATION, cubeObstacles);
    simulation.resolveImpact(attacker, cube, MATCH_TICK_DURATION);
    events.push(...simulation.getSnapshot().events.map((event) => ({ ...event, localTick: tick })));
    simulation.tick += 1;
  }

  const bashEvents = events.filter((event) => event.bashDamage > 0);
  const scrapeEvents = events.filter((event) => event.scrapeDamage > 0);
  const bash = bashEvents[0];
  const faceX = cube.position.x + cubeHalfExtents.x;

  assert.equal(events.some((event) => event.side !== 'right'), false);
  assert(events.length >= 1);
  assert.equal(bashEvents.length, 1);
  assert(scrapeEvents.length >= 1);
  assert(bash.bashDamage > 0.5);
  assert(Math.abs(bash.position.x - faceX) < 0.0001);
  assert(bash.position.y >= cube.position.y - cubeHalfExtents.y);
  assert(bash.position.y <= cube.position.y + cubeHalfExtents.y);
  assert(bash.position.z >= cube.position.z - cubeHalfExtents.z);
  assert(bash.position.z <= cube.position.z + cubeHalfExtents.z);
});

test('larger stalk radius increases damage through the impulse mass scale', () => {
  const base = resolveDirectStalkHit(0.18).simulation.getSnapshot().events[0].amount;
  const large = resolveDirectStalkHit(0.36).simulation.getSnapshot().events[0].amount;

  assert(large > base * 3);
});

test('winner is declared when a player reaches zero health', () => {
  const simulation = new MatchSimulation();
  const attacker = simulation.getPlayerState(1);
  const defender = simulation.getPlayerState(2);
  const stalk = attacker.stalks.left;

  defender.position.set(0, 0, 0);
  defender.health = 1;
  stalk.nodes = [
    new THREE.Vector3(3, 0, 0),
    new THREE.Vector3(1.2, 0, 0),
    new THREE.Vector3(1.6, 0, 0)
  ];
  stalk.previousNodes = [
    new THREE.Vector3(3, 0, 0),
    new THREE.Vector3(2.2, 0, 0),
    new THREE.Vector3(2.6, 0, 0)
  ];
  stalk.incidentNodes = stalk.nodes.map((node) => node.clone());
  stalk.incidentPreviousNodes = stalk.previousNodes.map((node) => node.clone());

  simulation.resolveImpact(attacker, defender, MATCH_TICK_DURATION);
  simulation.evaluateEndState();

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

  setPlayerOnTerrain(player, 0, 0);
  setPlayerOnTerrain(enemy, 0, -3.2);

  let input = null;
  for (let index = 0; index < 40; index += 1) {
    input = bot.getInput(simulation, 2, 1, MATCH_TICK_DURATION);
  }

  assert(input.lockOnHeld);
  assert.equal(typeof input.leftHeld, 'boolean');
  assert.equal(typeof input.rightHeld, 'boolean');
});
