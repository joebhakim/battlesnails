import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { BotController } from '../src/sim/BotController.js';
import { MatchSimulation, MATCH_TICK_DURATION } from '../src/sim/MatchSimulation.js';
import { buildStalkSegmentSamples, evaluateStalkImpact } from '../src/sim/StalkRope.js';

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

test('jump raises the player above ground in the shared simulation', () => {
  const simulation = new MatchSimulation();

  simulation.setPlayerInput(1, { jumpPressed: true });
  simulation.step(MATCH_TICK_DURATION);

  assert(simulation.getPlayerState(1).position.y > 1);
});

test('body collisions separate overlapping snails', () => {
  const simulation = new MatchSimulation();
  const playerA = simulation.getPlayerState(1);
  const playerB = simulation.getPlayerState(2);

  playerA.position.set(0, 1, 0);
  playerB.position.set(0.5, 1, 0);
  simulation.step(MATCH_TICK_DURATION);

  assert(playerA.position.distanceTo(playerB.position) > 0.5);
});

test('snapshots include authoritative rope nodes', () => {
  const simulation = new MatchSimulation();
  const snapshot = simulation.getSnapshot();
  const player = snapshot.players[0];

  assert.equal(Array.isArray(player.stalkNodes), true);
  assert.equal(player.stalkNodes.length > 4, true);
  assert.equal(typeof player.stalkSegmentRadius, 'number');
});

test('idle rope sags under gravity in the shared simulation', () => {
  const simulation = new MatchSimulation();
  const initialMidY = simulation.getPlayerState(1).stalkNodes[3].y;

  stepMany(simulation, 45, {}, {});

  const settledMidY = simulation.getPlayerState(1).stalkNodes[3].y;
  assert(settledMidY < initialMidY - 0.15);
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

test('repeated thrust input can damage the opposing player', () => {
  const simulation = new MatchSimulation();
  const attacker = simulation.getPlayerState(1);
  const defender = simulation.getPlayerState(2);

  attacker.position.set(0, 1, 0.8);
  defender.position.set(0, 1, -1.8);
  attacker.rotationY = Math.PI;
  defender.rotationY = 0;

  stepMany(
    simulation,
    20,
    { moveZ: -1, lockOnHeld: true, combatMode: 'thrust', lookY: -18 },
    { lockOnHeld: true }
  );

  assert(defender.health < defender.maxHealth);
});

test('winner is declared when a player reaches zero health', () => {
  const simulation = new MatchSimulation();
  const attacker = simulation.getPlayerState(1);
  const defender = simulation.getPlayerState(2);

  attacker.position.set(0, 1, 0.8);
  defender.position.set(0, 1, -1.8);
  attacker.rotationY = Math.PI;
  defender.rotationY = 0;
  defender.health = 1;

  stepMany(
    simulation,
    20,
    { moveZ: -1, lockOnHeld: true, combatMode: 'thrust', lookY: -18 },
    { lockOnHeld: true }
  );

  assert.equal(simulation.getSnapshot().phase, 'ended');
  assert.equal(simulation.getSnapshot().winnerSlot, 1);
});

test('bot controller produces active attack input when in range', () => {
  const simulation = new MatchSimulation({
    players: [
      { slot: 1, profile: 'human', connected: true },
      { slot: 2, profile: 'bot', connected: true }
    ]
  });
  const bot = new BotController();
  const player = simulation.getPlayerState(1);
  const enemy = simulation.getPlayerState(2);

  player.position.set(0, 1, 0);
  enemy.position.set(0, 1, -3.2);

  let input = null;
  for (let index = 0; index < 40; index += 1) {
    input = bot.getInput(simulation, 2, 1, MATCH_TICK_DURATION);
  }

  assert(input.lockOnHeld);
  assert(['idle', 'swing', 'thrust'].includes(input.combatMode));
});
