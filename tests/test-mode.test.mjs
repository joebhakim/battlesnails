import test from 'node:test';
import assert from 'node:assert/strict';

import { TestSession } from '../src/game/TestSession.js';
import { MatchSimulation, MATCH_TICK_DURATION } from '../src/sim/MatchSimulation.js';
import { DEFAULT_TUNING_CONFIG, TUNING_STORAGE_KEY, normalizeTuningConfig } from '../src/sim/Tuning.js';

class MemoryStorage {
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

test('normalizeTuningConfig clamps and rounds slider values', () => {
  const tuning = normalizeTuningConfig({
    botCount: 99,
    stalkSegmentCount: 5.4,
    stalkDamping: 2,
    bothAttackChance: -4
  });

  assert.equal(tuning.botCount, 40);
  assert.equal(tuning.stalkSegmentCount, 5);
  assert.equal(tuning.stalkDamping, 0.999);
  assert.equal(tuning.bothAttackChance, 0);
});

test('test mode structural bot count changes rebuild the local arena immediately', () => {
  const session = new TestSession({ storage: new MemoryStorage() });

  assert.equal(session.getSnapshot().players.length, 2);

  const result = session.setTuningValue('botCount', 5);

  assert.equal(result.rebuilt, true);
  assert.equal(session.getSnapshot().players.length, 6);
  assert.equal(session.getTestPanelState().livingBots, 5);
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
