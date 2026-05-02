import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SINGLE_PLAYER_TUNING_STORAGE_KEY,
  SinglePlayerSession
} from '../src/game/SinglePlayerSession.js';
import { DEFAULT_TUNING_CONFIG } from '../src/sim/Tuning.js';

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

test('single player exposes match tuning with sane shipped defaults', () => {
  const session = new SinglePlayerSession({ storage: new MemoryStorage() });
  const schemaIds = session.getTuningSchema().map((entry) => entry.id);
  const snapshot = session.getSnapshot();
  const player = snapshot.players.find((state) => state.slot === 1);
  const bot = snapshot.players.find((state) => state.slot === 2);

  assert(schemaIds.includes('terrainPreset'));
  assert(schemaIds.includes('playerMaxHealth'));
  assert(schemaIds.includes('botMaxHealth'));
  assert(!schemaIds.includes('botCount'));
  assert.equal(snapshot.players.length, 2);
  assert.equal(snapshot.terrain.preset, 'plane');
  assert.equal(player.maxHealth, DEFAULT_TUNING_CONFIG.playerMaxHealth);
  assert.equal(bot.maxHealth, DEFAULT_TUNING_CONFIG.botMaxHealth);
});

test('single player stage and HP tuning rebuilds the duel while keeping one bot', () => {
  const session = new SinglePlayerSession({ storage: new MemoryStorage() });

  const result = session.setTuningConfig({
    ...session.getTuningConfig(),
    terrainPreset: 'sphere_dome',
    playerMaxHealth: 21,
    botMaxHealth: 7,
    botCount: 20
  });
  const snapshot = session.getSnapshot();

  assert.equal(result.rebuilt, true);
  assert.equal(snapshot.players.length, 2);
  assert.equal(snapshot.terrain.preset, 'sphere_dome');
  assert.equal(snapshot.players.find((state) => state.slot === 1).maxHealth, 21);
  assert.equal(snapshot.players.find((state) => state.slot === 2).maxHealth, 7);
  assert.equal(session.getTuningConfig().botCount, DEFAULT_TUNING_CONFIG.botCount);
});

test('single player movement tuning applies without rebuilding the arena', () => {
  const session = new SinglePlayerSession({ storage: new MemoryStorage() });
  const initialTick = session.getSnapshot().tick;

  const result = session.setTuningValue('freeMoveSpeed', 13.5);

  assert.equal(result.rebuilt, false);
  assert.equal(session.getSnapshot().tick, initialTick);
  assert.equal(session.getTuningConfig().freeMoveSpeed, 13.5);
});

test('single player tuning persists separately from test mode tuning', () => {
  const storage = new MemoryStorage();
  const firstSession = new SinglePlayerSession({ storage });

  firstSession.setTuningConfig({
    ...firstSession.getTuningConfig(),
    terrainPreset: 'cone',
    botMaxHealth: 9
  });

  const secondSession = new SinglePlayerSession({ storage });
  assert.equal(secondSession.getTuningConfig().terrainPreset, 'cone');
  assert.equal(secondSession.getTuningConfig().botMaxHealth, 9);

  secondSession.resetToDefaults();

  assert.equal(secondSession.getTuningConfig().terrainPreset, DEFAULT_TUNING_CONFIG.terrainPreset);
  assert.equal(secondSession.getTuningConfig().botMaxHealth, DEFAULT_TUNING_CONFIG.botMaxHealth);
  assert.equal(storage.getItem(SINGLE_PLAYER_TUNING_STORAGE_KEY), null);
});
