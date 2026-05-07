import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { TestSession } from '../src/game/TestSession.js';
import { ANNOYING_LECTURER_SLOT, PROXIMITY_CHAT_MAX_DISTANCE } from '../src/audio/ProximityChat.js';
import { MatchSimulation, MATCH_TICK_DURATION } from '../src/sim/MatchSimulation.js';
import { TEST_PLAYGROUND_FIXTURES } from '../src/sim/TestFixtures.js';
import { DEFAULT_TUNING_CONFIG, TUNING_STORAGE_KEY, normalizeTuningConfig } from '../src/sim/Tuning.js';
import { EXPLORER_TERRAIN_PRESET } from '../src/world/Terrain.js';

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

function forceDirectStalkHit(attacker, target) {
  const stalk = attacker.stalks.left;
  stalk.nodes = [
    new THREE.Vector3(target.position.x + 3, target.position.y, target.position.z),
    new THREE.Vector3(target.position.x + 1.2, target.position.y, target.position.z),
    new THREE.Vector3(target.position.x + 1.6, target.position.y, target.position.z)
  ];
  stalk.previousNodes = [
    new THREE.Vector3(target.position.x + 3, target.position.y, target.position.z),
    new THREE.Vector3(target.position.x + 2.2, target.position.y, target.position.z),
    new THREE.Vector3(target.position.x + 2.6, target.position.y, target.position.z)
  ];
  stalk.incidentNodes = stalk.nodes.map((node) => node.clone());
  stalk.incidentPreviousNodes = stalk.previousNodes.map((node) => node.clone());
}

function forceClearStalk(attacker, target) {
  const stalk = attacker.stalks.left;
  stalk.nodes = [
    new THREE.Vector3(target.position.x + 6, target.position.y, target.position.z),
    new THREE.Vector3(target.position.x + 5.5, target.position.y, target.position.z),
    new THREE.Vector3(target.position.x + 5, target.position.y, target.position.z)
  ];
  stalk.previousNodes = stalk.nodes.map((node) => node.clone());
  stalk.incidentNodes = stalk.nodes.map((node) => node.clone());
  stalk.incidentPreviousNodes = stalk.previousNodes.map((node) => node.clone());
}

function resolveRepeatedDirectHits(simulation, attacker, target, count = 8) {
  const eventCounts = [];
  for (let index = 0; index < count; index += 1) {
    simulation.events = [];
    forceDirectStalkHit(attacker, target);
    simulation.resolveImpact(attacker, target, MATCH_TICK_DURATION);
    eventCounts.push(simulation.getSnapshot().events.length);
  }
  return eventCounts;
}

function resolveForcedContact(simulation, attacker, target, forceContact) {
  simulation.events = [];
  forceContact(attacker, target);
  simulation.resolveImpact(attacker, target, MATCH_TICK_DURATION);
  return simulation.getSnapshot().events.length;
}

test('normalizeTuningConfig clamps and rounds slider values', () => {
  const tuning = normalizeTuningConfig({
    botCount: 99,
    stalkSegmentCount: 5.4,
    stalkDamping: 2,
    bothAttackChance: -4,
    stalkControlMode: 'trackball'
  });

  assert.equal(tuning.botCount, 40);
  assert.equal(tuning.stalkSegmentCount, 5);
  assert.equal(tuning.stalkDamping, 0.999);
  assert.equal(tuning.bothAttackChance, 0);
  assert.equal(tuning.stalkControlMode, 'trackball');

  const migrated = normalizeTuningConfig({
    aboveGroundHeight: 8
  });
  assert.equal(migrated.aboveGroundHeight, DEFAULT_TUNING_CONFIG.aboveGroundHeight);
  assert.equal(migrated.spawnDropHeight, 8);
});

test('test mode structural bot count changes rebuild the local arena immediately', () => {
  const session = new TestSession({ storage: new MemoryStorage() });

  assert.equal(session.getSnapshot().players.length, 3 + TEST_PLAYGROUND_FIXTURES.length);
  assert(session.getSnapshot().players.some((player) => player.slot === ANNOYING_LECTURER_SLOT));

  const result = session.setTuningValue('botCount', 5);

  assert.equal(result.rebuilt, true);
  assert.equal(session.getSnapshot().players.length, 7 + TEST_PLAYGROUND_FIXTURES.length);
  assert.equal(session.getTestPanelState().livingBots, 5);
});

test('test mode includes static playground fixtures as enemy objects', () => {
  const session = new TestSession({ storage: new MemoryStorage() });
  const players = session.getSnapshot().players;
  const fixtures = players.filter((player) => player.profileName === 'fixture');

  assert.equal(fixtures.length, TEST_PLAYGROUND_FIXTURES.length);
  assert(fixtures.some((fixture) => (
    fixture.fixtureKind === 'cube' &&
    fixture.displayName === 'Karl the Cube' &&
    fixture.immortal &&
    fixture.collisionShape.type === 'box'
  )));
  assert(fixtures.some((fixture) => (
    fixture.fixtureKind === 'cylinder' &&
    fixture.displayName === "Karl's Brother the Cylinder" &&
    fixture.immortal &&
    fixture.collisionShape.type === 'cylinder'
  )));
  assert(fixtures.some((fixture) => (
    fixture.fixtureKind === 'snail' &&
    fixture.displayName === 'Sifu Snail' &&
    fixture.immortal &&
    fixture.collisionShape.type === 'sphere'
  )));
  assert.equal(session.getTestPanelState().fixtures, TEST_PLAYGROUND_FIXTURES.length);
});

test('held contact does not produce repeated bash damage without separation', () => {
  const simulation = new MatchSimulation({
    mode: 'test',
    players: [
      { slot: 1, profile: 'human', connected: true },
      { slot: 2, profile: 'bot', connected: true },
      TEST_PLAYGROUND_FIXTURES.find((fixture) => fixture.fixtureKind === 'snail')
    ]
  });
  const attacker = simulation.getPlayerState(1);
  const target = simulation.getPlayerState(2);
  const sifu = simulation.getPlayerState(9003);

  target.health = 600;
  assert.deepEqual(
    resolveRepeatedDirectHits(simulation, attacker, target),
    [1, 0, 0, 0, 0, 0, 0, 0]
  );
  assert.deepEqual(
    resolveRepeatedDirectHits(simulation, attacker, sifu),
    [1, 0, 0, 0, 0, 0, 0, 0]
  );
});

test('brief contact flicker does not re-arm bash damage', () => {
  const simulation = new MatchSimulation({
    mode: 'test',
    players: [
      { slot: 1, profile: 'human', connected: true },
      { slot: 2, profile: 'bot', connected: true }
    ]
  });
  const attacker = simulation.getPlayerState(1);
  const target = simulation.getPlayerState(2);
  target.health = 600;

  assert.equal(resolveForcedContact(simulation, attacker, target, forceDirectStalkHit), 1);
  for (let index = 0; index < 3; index += 1) {
    assert.equal(resolveForcedContact(simulation, attacker, target, forceClearStalk), 0);
  }
  assert.equal(resolveForcedContact(simulation, attacker, target, forceDirectStalkHit), 0);

  for (let index = 0; index < 6; index += 1) {
    assert.equal(resolveForcedContact(simulation, attacker, target, forceClearStalk), 0);
  }
  assert.equal(resolveForcedContact(simulation, attacker, target, forceDirectStalkHit), 1);
});

test('test mode terrain changes are structural and rebuild the arena snapshot', () => {
  const session = new TestSession({ storage: new MemoryStorage() });

  const result = session.setTuningConfig({
    ...session.getTuningConfig(),
    terrainPreset: 'sphere_dome',
    terrainCenterHeight: 1.5
  });

  assert.equal(result.rebuilt, true);
  assert.equal(session.getSnapshot().terrain.preset, 'sphere_dome');
  assert.equal(session.getSnapshot().terrain.centerHeight, 1.5);
});

test('test mode arena radius can expand the proximity playground', () => {
  const session = new TestSession({ storage: new MemoryStorage() });

  const result = session.setTuningConfig({
    ...session.getTuningConfig(),
    arenaRadius: 120
  });

  assert.equal(result.rebuilt, true);
  assert.equal(session.getSnapshot().terrain.worldRadius, 120);

  for (let index = 0; index < 180; index += 1) {
    session.update(MATCH_TICK_DURATION, { moveX: 1 });
  }

  assert(session.getLocalPlayerState().position.x > 22);
});

test('test mode generated forest floor uses forest terrain and props', () => {
  const session = new TestSession({ storage: new MemoryStorage() });

  const result = session.setTuningConfig({
    ...session.getTuningConfig(),
    terrainPreset: EXPLORER_TERRAIN_PRESET
  });

  const snapshot = session.getSnapshot();
  assert.equal(result.rebuilt, true);
  assert.equal(snapshot.terrain.preset, EXPLORER_TERRAIN_PRESET);
  assert(snapshot.worldProps.length > 0);
  assert(Math.abs(session.getLocalPlayerState().position.z) > 60);

  const staticWorldProps = snapshot.worldProps;
  session.update(MATCH_TICK_DURATION, {});
  assert.equal(session.getSnapshot().worldProps, staticWorldProps);
});

test('test mode lecturer is slow enough to leave proximity range in a large arena', () => {
  const session = new TestSession({ storage: new MemoryStorage() });
  session.setTuningConfig({
    ...session.getTuningConfig(),
    arenaRadius: 240
  });

  const initialLocal = session.getLocalPlayerState();
  const initialLecturer = session.getOtherPlayerStates().find((player) => player.slot === ANNOYING_LECTURER_SLOT);
  const awayX = initialLocal.position.x - initialLecturer.position.x;
  const awayZ = initialLocal.position.z - initialLecturer.position.z;
  const distance = Math.hypot(awayX, awayZ);
  const input = { moveX: awayX / distance, moveZ: awayZ / distance };

  for (let index = 0; index < 1200; index += 1) {
    session.update(MATCH_TICK_DURATION, input);
  }

  const local = session.getLocalPlayerState();
  const lecturer = session.getOtherPlayerStates().find((player) => player.slot === ANNOYING_LECTURER_SLOT);
  const lecturerDistance = Math.hypot(
    lecturer.position.x - local.position.x,
    lecturer.position.z - local.position.z
  );
  assert(lecturerDistance > PROXIMITY_CHAT_MAX_DISTANCE);
});

test('test mode keeps spawned enemies static for lab work', () => {
  const session = new TestSession({ storage: new MemoryStorage() });
  const before = session.getSnapshot().players.find((player) => player.slot === 2);

  for (let index = 0; index < 120; index += 1) {
    session.update(MATCH_TICK_DURATION, {});
  }

  const after = session.getSnapshot().players.find((player) => player.slot === 2);
  assert.equal(after.rotationY, before.rotationY);
  assert.equal(after.position.x, before.position.x);
  assert.equal(after.position.z, before.position.z);
  assert(after.position.y < before.position.y);
  assert.equal(after.grounded, true);
  assert.equal(after.controlMode, 'idle');
});

test('test mode remembers tuning in storage and resetToDefaults clears it', () => {
  const storage = new MemoryStorage();
  const firstSession = new TestSession({ storage });

  firstSession.setTuningValue('freeMoveSpeed', 13.7);
  firstSession.setTuningValue('botCount', 4);

  const secondSession = new TestSession({ storage });
  assert.equal(secondSession.getTuningConfig().freeMoveSpeed, 13.7);
  assert.equal(secondSession.getTuningConfig().botCount, 4);

  secondSession.resetToDefaults();

  assert.equal(secondSession.getTuningConfig().freeMoveSpeed, DEFAULT_TUNING_CONFIG.freeMoveSpeed);
  assert.equal(secondSession.getTuningConfig().botCount, DEFAULT_TUNING_CONFIG.botCount);
  assert.equal(storage.getItem(TUNING_STORAGE_KEY), null);
});

test('test mode remembers terrain tuning in storage', () => {
  const storage = new MemoryStorage();
  const firstSession = new TestSession({ storage });

  firstSession.setTuningConfig({
    ...firstSession.getTuningConfig(),
    terrainPreset: 'ripple_bowl',
    terrainRippleAmplitude: 4.5
  });

  const secondSession = new TestSession({ storage });
  assert.equal(secondSession.getTuningConfig().terrainPreset, 'ripple_bowl');
  assert.equal(secondSession.getTuningConfig().terrainRippleAmplitude, 4.5);
});

test('test mode does not end automatically when a combatant dies', () => {
  const simulation = new MatchSimulation({
    mode: 'test',
    players: [
      { slot: 1, profile: 'human', connected: true },
      { slot: 2, profile: 'bot', connected: true }
    ]
  });

  simulation.getPlayerState(2).health = 0;
  simulation.step(MATCH_TICK_DURATION);

  assert.equal(simulation.getSnapshot().phase, 'running');
});

test('stalk target approach speed introduces lag between desired and applied stalk angles', () => {
  const simulation = new MatchSimulation({
    tuning: {
      ...DEFAULT_TUNING_CONFIG,
      stalkTargetApproachSpeed: 2,
      stalkMass: 4
    }
  });

  simulation.setPlayerInput(1, { leftHeld: true, lookX: 18, lookY: -12 });
  simulation.step(MATCH_TICK_DURATION);

  const stalk = simulation.getPlayerState(1).stalks.left;
  assert.notEqual(stalk.desiredYaw, stalk.appliedYaw);
  assert(Math.abs(stalk.desiredYaw - stalk.appliedYaw) > 0.01);
});

test('higher stalk mass makes held steering respond more slowly', () => {
  const lightSimulation = new MatchSimulation({
    tuning: {
      ...DEFAULT_TUNING_CONFIG,
      stalkTargetApproachSpeed: 18,
      stalkMass: 1
    }
  });
  const heavySimulation = new MatchSimulation({
    tuning: {
      ...DEFAULT_TUNING_CONFIG,
      stalkTargetApproachSpeed: 18,
      stalkMass: 6
    }
  });

  lightSimulation.setPlayerInput(1, { leftHeld: true, lookX: 20 });
  heavySimulation.setPlayerInput(1, { leftHeld: true, lookX: 20 });
  lightSimulation.step(MATCH_TICK_DURATION);
  heavySimulation.step(MATCH_TICK_DURATION);

  const lightStalk = lightSimulation.getPlayerState(1).stalks.left;
  const heavyStalk = heavySimulation.getPlayerState(1).stalks.left;
  const lightGap = Math.abs(lightStalk.desiredYaw - lightStalk.appliedYaw);
  const heavyGap = Math.abs(heavyStalk.desiredYaw - heavyStalk.appliedYaw);

  assert(heavyGap > lightGap);
});
