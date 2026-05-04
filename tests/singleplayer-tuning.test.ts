import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SINGLE_PLAYER_OPTIONS_STORAGE_KEY,
  SinglePlayerSession,
  getStoredSinglePlayerOptions
} from '../src/game/SinglePlayerSession.js';
import { Game } from '../src/game/Game.js';
import { DEFAULT_TUNING_CONFIG } from '../src/sim/Tuning.js';
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

test('arena exposes only stage and encounter options', () => {
  const session = new SinglePlayerSession({ storage: new MemoryStorage() });
  const schemaIds = session.getTuningSchema().map((entry) => entry.id);
  const snapshot = session.getSnapshot();
  const player = snapshot.players.find((state) => state.slot === 1);
  const bot = snapshot.players.find((state) => state.slot === 2);

  assert.deepEqual(schemaIds, ['stagePreset', 'encounterPreset']);
  assert(!schemaIds.includes('playerMaxHealth'));
  assert(!schemaIds.includes('botMaxHealth'));
  assert(!schemaIds.includes('botCount'));
  assert.equal(snapshot.players.length, 2);
  assert.equal(snapshot.terrain.preset, 'plane');
  assert.equal(player.maxHealth, DEFAULT_TUNING_CONFIG.playerMaxHealth);
  assert.equal(bot.maxHealth, DEFAULT_TUNING_CONFIG.botMaxHealth);
});

test('arena stage and encounter options rebuild the match', () => {
  const session = new SinglePlayerSession({ storage: new MemoryStorage() });

  const result = session.setTuningConfig({
    ...session.getTuningConfig(),
    stagePreset: 'sphere_dome',
    encounterPreset: 'many_weak'
  });
  const snapshot = session.getSnapshot();
  const enemies = snapshot.players.filter((state) => state.slot !== 1);

  assert.equal(result.rebuilt, true);
  assert.equal(snapshot.players.length, 9);
  assert.equal(snapshot.terrain.preset, 'sphere_dome');
  assert(enemies.every((state) => state.maxHealth === 80));
  assert.equal(session.getTestPanelState().livingBots, 8);
  assert.equal(session.getTestPanelState().entityLabel, 'enemies');
});

test('arena can use the generated forest-floor map as a stage', () => {
  const session = new SinglePlayerSession({
    storage: new MemoryStorage(),
    options: {
      stagePreset: EXPLORER_TERRAIN_PRESET,
      encounterPreset: 'one_strong'
    }
  });
  const snapshot = session.getSnapshot();

  assert.equal(snapshot.terrain.preset, EXPLORER_TERRAIN_PRESET);
  assert(snapshot.terrain.worldRadius > 100);
  assert(snapshot.worldProps.length > 0);
});

test('arena options persist separately from test mode tuning', () => {
  const storage = new MemoryStorage();
  const firstSession = new SinglePlayerSession({ storage });

  firstSession.setTuningConfig({
    ...firstSession.getTuningConfig(),
    stagePreset: 'cone',
    encounterPreset: 'one_weak'
  });

  const secondSession = new SinglePlayerSession({ storage });
  assert.equal(secondSession.getTuningConfig().stagePreset, 'cone');
  assert.equal(secondSession.getTuningConfig().encounterPreset, 'one_weak');
  assert.equal(secondSession.getSnapshot().players.find((state) => state.slot === 2).maxHealth, 120);

  secondSession.resetToDefaults();

  assert.equal(secondSession.getTuningConfig().stagePreset, DEFAULT_TUNING_CONFIG.terrainPreset);
  assert.equal(secondSession.getTuningConfig().encounterPreset, 'one_strong');
  assert.equal(storage.getItem(SINGLE_PLAYER_OPTIONS_STORAGE_KEY), null);
});

test('arena launch options are stored from the mode menu flow', () => {
  const storage = new MemoryStorage();

  new SinglePlayerSession({
    storage,
    options: {
      stagePreset: 'saddle',
      encounterPreset: 'many_strong_comical'
    }
  });

  assert.deepEqual(getStoredSinglePlayerOptions(storage), {
    stagePreset: 'saddle',
    encounterPreset: 'many_strong_comical'
  });
});

test('arena does not use the in-game tuning panel hook', () => {
  const game = Object.create(Game.prototype);
  game.currentSession = new SinglePlayerSession({ storage: new MemoryStorage() });

  assert.equal(game.isTuningSession(), false);

  game.currentSession = {
    mode: 'test',
    getTuningSchema() {},
    getTuningConfig() {},
    setTuningConfig() {},
    getTestPanelState() {}
  };
  assert.equal(game.isTuningSession(), true);
});
