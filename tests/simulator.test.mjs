import test from 'node:test';
import assert from 'node:assert/strict';

import { runBalanceBatch } from '../src/sim/BalanceRunner.js';
import { HumanLikeController } from '../src/sim/HumanLikeController.js';
import { createVisionMemory, createVisionObservation } from '../src/sim/HumanVision.js';
import { MatchSimulation } from '../src/sim/MatchSimulation.js';
import { SeededRandom } from '../src/sim/SeededRandom.js';
import { SIMULATOR_TUNING_STORAGE_KEY, SimulatorSession } from '../src/game/SimulatorSession.js';
import { DEFAULT_TUNING_CONFIG } from '../src/sim/Tuning.js';
import { ENCOUNTER_PRESETS } from '../src/sim/EncounterPresets.js';
import { TERRAIN_PRESET_OPTIONS } from '../src/world/Terrain.js';

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

test('seeded random sequences are repeatable', () => {
  const first = new SeededRandom('sim-suite');
  const second = new SeededRandom('sim-suite');
  const third = new SeededRandom('other-seed');

  const firstValues = Array.from({ length: 6 }, () => first.nextUint32());
  const secondValues = Array.from({ length: 6 }, () => second.nextUint32());
  const thirdValues = Array.from({ length: 6 }, () => third.nextUint32());

  assert.deepEqual(firstValues, secondValues);
  assert.notDeepEqual(firstValues, thirdValues);
});

test('geometric vision sees targets in front and keeps a short noisy memory', () => {
  const simulation = new MatchSimulation();
  const viewer = simulation.getPlayerState(1);
  const target = simulation.getPlayerState(2);
  const memory = createVisionMemory();
  const config = {
    fovRadians: Math.PI / 2,
    range: 10,
    positionNoise: 0,
    memoryDuration: 0.5,
    memoryDriftPerSecond: 0
  };

  viewer.position.set(0, 0, 0);
  viewer.rotationY = 0;
  target.position.set(0, 0, 6);

  const visible = createVisionObservation(
    simulation.getSnapshot(),
    1,
    config,
    memory,
    new SeededRandom(1),
    1 / 60
  );
  assert.equal(visible.canSeeTarget, true);
  assert.equal(visible.visibleTarget.slot, 2);

  target.position.set(0, 0, -6);
  const remembered = createVisionObservation(
    simulation.getSnapshot(),
    1,
    config,
    memory,
    new SeededRandom(1),
    0.1
  );
  assert.equal(remembered.canSeeTarget, false);
  assert.equal(remembered.rememberedTarget.slot, 2);

  const expired = createVisionObservation(
    simulation.getSnapshot(),
    1,
    config,
    memory,
    new SeededRandom(1),
    0.6
  );
  assert.equal(expired.canSeeTarget, false);
  assert.equal(expired.rememberedTarget, null);
});

test('humanlike controller is deterministic for a fixed seed and observation stream', () => {
  const observation = {
    self: {
      health: 15,
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0
    },
    target: {
      slot: 2,
      position: { x: 0, y: 0, z: 4.5 },
      age: 0
    },
    rememberedTarget: {
      slot: 2,
      position: { x: 0, y: 0, z: 4.5 },
      age: 0
    },
    canSeeTarget: true
  };
  const first = new HumanLikeController({ seed: 'human-seed', attackCooldown: 0.1 });
  const second = new HumanLikeController({ seed: 'human-seed', attackCooldown: 0.1 });
  const firstInputs = [];
  const secondInputs = [];

  for (let index = 0; index < 50; index += 1) {
    firstInputs.push(first.getInput(observation, 1 / 60));
    secondInputs.push(second.getInput(observation, 1 / 60));
  }

  assert.deepEqual(firstInputs, secondInputs);
  assert(firstInputs.some((input) => input.leftHeld || input.rightHeld));
});

test('humanlike navigation approaches distant targets and backs away from close targets', () => {
  const baseObservation = {
    self: {
      health: 15,
      position: { x: 0, y: 0, z: 6 },
      rotationY: Math.PI
    },
    rememberedTarget: null,
    canSeeTarget: true
  };
  const config = {
    seed: 'nav-suite',
    attackCooldown: 10,
    movementNoise: 0,
    jumpChancePerSecond: 0
  };

  const approachController = new HumanLikeController(config);
  const approach = approachController.getInput({
    ...baseObservation,
    target: {
      slot: 2,
      position: { x: 0, y: 0, z: -6 },
      age: 0
    }
  }, 1 / 60);
  assert(approach.moveZ < 0);
  assert(Math.abs(approach.moveX) < 0.001);

  const retreatController = new HumanLikeController(config);
  const retreat = retreatController.getInput({
    ...baseObservation,
    target: {
      slot: 2,
      position: { x: 0, y: 0, z: 4.2 },
      age: 0
    }
  }, 1 / 60);
  assert(retreat.moveZ > 0);
  assert(Math.abs(retreat.moveX) < 0.001);
});

test('humanlike search movement follows current facing instead of a fixed world axis', () => {
  const controller = new HumanLikeController({
    seed: 'search-suite',
    movementNoise: 0,
    jumpChancePerSecond: 0
  });
  const input = controller.getInput({
    self: {
      health: 15,
      position: { x: 0, y: 0, z: 0 },
      rotationY: Math.PI
    },
    target: null,
    rememberedTarget: null,
    canSeeTarget: false
  }, 1 / 60);

  assert(input.moveZ < 0);
  assert.equal(input.leftHeld, false);
  assert.equal(input.rightHeld, false);
});

test('humanlike eye thrash has bounded windup, opposite strike, and recovery release', () => {
  const controller = new HumanLikeController({
    seed: 'thrash-suite',
    attackCooldown: 0,
    windupDuration: 2 / 60,
    strikeDuration: 2 / 60,
    recoverDuration: 2 / 60,
    movementNoise: 0,
    mouseNoise: 0,
    jumpChancePerSecond: 0,
    bothAttackChance: 0
  });
  controller.attackCooldownRemaining = 0;
  const observation = {
    self: {
      health: 15,
      position: { x: 0, y: 0, z: 6 },
      rotationY: Math.PI
    },
    target: {
      slot: 2,
      position: { x: 0, y: 0, z: 1.6 },
      age: 0
    },
    rememberedTarget: {
      slot: 2,
      position: { x: 0, y: 0, z: 1.6 },
      age: 0
    },
    canSeeTarget: true
  };

  controller.getInput(observation, 1 / 60);
  const windup = controller.getInput(observation, 1 / 60);
  controller.getInput(observation, 1 / 60);
  const strike = controller.getInput(observation, 1 / 60);
  const recover = controller.getInput(observation, 1 / 60);
  const released = controller.getInput(observation, 1 / 60);

  assert.equal(windup.leftHeld || windup.rightHeld, true);
  assert.equal(strike.leftHeld || strike.rightHeld, true);
  assert(Math.sign(windup.lookX) === -Math.sign(strike.lookX));
  assert(Math.abs(windup.lookX) <= 24);
  assert(Math.abs(strike.lookX) <= 28);
  assert.equal(recover.leftHeld || recover.rightHeld, true);
  assert.equal(released.leftHeld, false);
  assert.equal(released.rightHeld, false);
});

test('balance batches are deterministic and JSON-safe', () => {
  const first = runBalanceBatch({ seed: 'batch-suite', matchCount: 3, maxSeconds: 1 });
  const second = runBalanceBatch({ seed: 'batch-suite', matchCount: 3, maxSeconds: 1 });

  assert.deepEqual(first, second);
  assert.equal(first.completed, 3);
  assert.equal(first.matches.length, 3);
  assert.equal(typeof first.summary.humanWinRate, 'number');
  assert.doesNotThrow(() => JSON.stringify(first));
});

test('balance batches can search stage and enemy mode grids', () => {
  const report = runBalanceBatch({
    seed: 'batch-grid-suite',
    matchCount: 1,
    maxSeconds: 0.1,
    searchConfig: {
      stageSearch: 'all',
      encounterSearch: 'all'
    }
  });

  assert.equal(report.scenarioCount, TERRAIN_PRESET_OPTIONS.length * ENCOUNTER_PRESETS.length);
  assert.equal(report.completed, report.scenarioCount);
  assert.equal(report.scenarios.length, report.scenarioCount);
  assert(report.scenarios.some((entry) => entry.scenario.stagePreset === 'sphere_bowl'));
  assert(report.scenarios.some((entry) => (
    entry.scenario.encounterPreset === 'many_strong_comical' &&
    entry.scenario.botCount > 1
  )));
  assert.doesNotThrow(() => JSON.stringify(report));
});

test('simulator session runs batches and exposes a visible match snapshot', () => {
  const session = new SimulatorSession({
    seed: 'session-suite',
    matchCount: 3,
    maxSeconds: 0.5,
    batchMatchesPerFrame: 2
  });

  assert.equal(session.getSimulatorPanelState().batchState, 'running');
  session.update(1 / 60);
  assert.equal(session.getSimulatorPanelState().progress.completed, 2);
  session.update(1 / 60);

  const state = session.getSimulatorPanelState();
  assert.equal(state.batchState, 'complete');
  assert.equal(state.report.completed, 3);
  assert.equal(session.getSnapshot().players.length, 2);
  assert.equal(session.getLocalPlayerState().slot, 1);
  assert.equal(session.getFocusTargetState().slot, 2);
  assert.doesNotThrow(() => JSON.parse(session.getSimulatorReportJson()));
});

test('simulator session exposes configurable duel tuning for stage and HPs', () => {
  const session = new SimulatorSession({
    seed: 'sim-tuning-suite',
    matchCount: 2,
    maxSeconds: 0.25,
    storage: new MemoryStorage()
  });
  const schemaIds = session.getTuningSchema().map((entry) => entry.id);

  const result = session.setTuningConfig({
    ...session.getTuningConfig(),
    stageSearch: 'current',
    encounterSearch: 'selected',
    terrainPreset: 'sphere_bowl',
    playerMaxHealth: 19,
    botMaxHealth: 8,
    botCount: 10
  });
  const state = session.getSimulatorPanelState();
  const snapshot = session.getSnapshot();

  assert(!schemaIds.includes('botCount'));
  assert(schemaIds.includes('stageSearch'));
  assert(schemaIds.includes('encounterSearch'));
  assert(schemaIds.includes('encounterPreset'));
  assert.equal(result.rebuilt, true);
  assert.equal(snapshot.players.length, 2);
  assert.equal(snapshot.terrain.preset, 'sphere_bowl');
  assert.equal(snapshot.players.find((player) => player.slot === 1).maxHealth, 19);
  assert.equal(snapshot.players.find((player) => player.slot === 2).maxHealth, 8);
  assert.equal(session.getTuningConfig().botCount, DEFAULT_TUNING_CONFIG.botCount);
  assert.equal(state.batchState, 'running');
  assert.equal(state.tuningValues.terrainPreset, 'sphere_bowl');
});

test('simulator selected enemy modes rebuild the visible match population', () => {
  const session = new SimulatorSession({
    seed: 'sim-mode-suite',
    matchCount: 1,
    maxSeconds: 0.1,
    storage: new MemoryStorage()
  });

  session.setTuningConfig({
    ...session.getTuningConfig(),
    encounterSearch: 'selected',
    encounterPreset: 'many_strong_comical'
  });

  const snapshot = session.getSnapshot();

  assert.equal(snapshot.players.length, 9);
  assert.equal(snapshot.players.filter((player) => player.profileName === 'bot').length, 8);
  assert.equal(session.getSimulatorPanelState().tuningValues.encounterPreset, 'many_strong_comical');
});

test('simulator session expands search progress for all stages and modes', () => {
  const session = new SimulatorSession({
    seed: 'sim-search-suite',
    matchCount: 1,
    maxSeconds: 0.1,
    storage: new MemoryStorage()
  });

  session.setTuningConfig({
    ...session.getTuningConfig(),
    stageSearch: 'all',
    encounterSearch: 'all'
  });

  const state = session.getSimulatorPanelState();
  const scenarioCount = TERRAIN_PRESET_OPTIONS.length * ENCOUNTER_PRESETS.length;

  assert.equal(state.progress.total, scenarioCount);
  assert.equal(state.report.scenarioCount, scenarioCount);
  assert.equal(state.report.scenarios.length, scenarioCount);
});

test('simulator tuning persists separately and resetToDefaults clears it', () => {
  const storage = new MemoryStorage();
  const firstSession = new SimulatorSession({
    seed: 'sim-storage-suite',
    matchCount: 1,
    maxSeconds: 0.1,
    storage
  });

  firstSession.setTuningConfig({
    ...firstSession.getTuningConfig(),
    terrainPreset: 'cone',
    botMaxHealth: 6
  });

  const secondSession = new SimulatorSession({
    seed: 'sim-storage-suite',
    matchCount: 1,
    maxSeconds: 0.1,
    storage
  });
  assert.equal(secondSession.getTuningConfig().terrainPreset, 'cone');
  assert.equal(secondSession.getTuningConfig().botMaxHealth, 6);

  secondSession.resetToDefaults();

  assert.equal(secondSession.getTuningConfig().terrainPreset, DEFAULT_TUNING_CONFIG.terrainPreset);
  assert.equal(secondSession.getTuningConfig().botMaxHealth, DEFAULT_TUNING_CONFIG.botMaxHealth);
  assert.equal(storage.getItem(SIMULATOR_TUNING_STORAGE_KEY), null);
});
