import { MatchSimulation, MATCH_TICK_DURATION, normalizePlayerInput } from '../sim/MatchSimulation.js';
import {
  DEFAULT_TUNING_CONFIG,
  TUNING_SCHEMA,
  TUNING_STORAGE_KEY,
  getDefaultTuningConfig,
  hasStructuralTuningChanges,
  normalizeTuningConfig
} from '../sim/Tuning.js';

function getSafeStorage(storageOverride) {
  if (storageOverride) {
    return storageOverride;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function loadStoredTuningConfig(storage) {
  if (!storage?.getItem) {
    return getDefaultTuningConfig();
  }

  try {
    const raw = storage.getItem(TUNING_STORAGE_KEY);
    if (!raw) {
      return getDefaultTuningConfig();
    }

    return normalizeTuningConfig(JSON.parse(raw));
  } catch {
    return getDefaultTuningConfig();
  }
}

function saveStoredTuningConfig(storage, tuningConfig) {
  if (!storage?.setItem) {
    return;
  }

  storage.setItem(TUNING_STORAGE_KEY, JSON.stringify(tuningConfig));
}

function clearStoredTuningConfig(storage) {
  if (!storage?.removeItem) {
    return;
  }

  storage.removeItem(TUNING_STORAGE_KEY);
}

export class TestSession {
  constructor(options = {}) {
    this.mode = 'test';
    this.localSlot = 1;
    this.accumulator = 0;
    this.storage = getSafeStorage(options.storage);
    this.tuningConfig = loadStoredTuningConfig(this.storage);
    this.snapshot = null;
    this.lastRebuilt = false;

    this.rebuildSimulation();
  }

  rebuildSimulation() {
    const participants = [
      { slot: this.localSlot, profile: 'human', connected: true },
      ...Array.from({ length: this.tuningConfig.botCount }, (_, index) => ({
        slot: index + 2,
        profile: 'bot',
        connected: true
      }))
    ];

    this.simulation = new MatchSimulation({
      mode: 'test',
      players: participants,
      tuning: this.tuningConfig
    });

    this.snapshot = this.simulation.getSnapshot();
    this.accumulator = 0;
    this.lastRebuilt = true;
  }

  update(delta, localInput) {
    this.accumulator += delta;
    const steps = Math.max(1, Math.floor(this.accumulator / MATCH_TICK_DURATION));

    const dividedInput = normalizePlayerInput({
      ...localInput,
      lookX: localInput.lookX / steps,
      lookY: localInput.lookY / steps,
      reachDelta: localInput.reachDelta / steps
    });

    for (let index = 0; index < steps && this.accumulator >= MATCH_TICK_DURATION; index += 1) {
      this.simulation.setPlayerInput(this.localSlot, {
        ...dividedInput,
        jumpPressed: index === 0 && localInput.jumpPressed
      });

      this.snapshot = this.simulation.step(MATCH_TICK_DURATION);
      this.accumulator -= MATCH_TICK_DURATION;
    }
  }

  leave() { }

  resetArena() {
    this.rebuildSimulation();
  }

  resetToDefaults() {
    this.tuningConfig = getDefaultTuningConfig();
    clearStoredTuningConfig(this.storage);
    this.rebuildSimulation();
  }

  setTuningValue(id, value) {
    const nextConfig = normalizeTuningConfig({
      ...this.tuningConfig,
      [id]: value
    });

    return this.setTuningConfig(nextConfig);
  }

  setTuningConfig(nextConfig) {
    const normalized = normalizeTuningConfig(nextConfig);
    const rebuilt = hasStructuralTuningChanges(this.tuningConfig, normalized);

    this.tuningConfig = normalized;
    saveStoredTuningConfig(this.storage, this.tuningConfig);

    if (rebuilt) {
      this.rebuildSimulation();
      return { rebuilt: true };
    }

    this.simulation.setTuningConfig(this.tuningConfig);
    this.snapshot = this.simulation.getSnapshot();
    this.lastRebuilt = false;
    return { rebuilt: false };
  }

  consumeLastRebuildFlag() {
    const rebuilt = this.lastRebuilt;
    this.lastRebuilt = false;
    return rebuilt;
  }

  getSnapshot() {
    return this.snapshot;
  }

  getLocalSlot() {
    return this.localSlot;
  }

  getLocalPlayerState() {
    return this.snapshot?.players.find((player) => player.slot === this.localSlot) ?? null;
  }

  getOtherPlayerStates() {
    return this.snapshot?.players.filter((player) => player.slot !== this.localSlot) ?? [];
  }

  getOpponentPlayerState() {
    return this.getFocusTargetState();
  }

  getFocusTargetState() {
    const localPlayer = this.getLocalPlayerState();
    const others = this.getOtherPlayerStates();
    if (others.length === 0) {
      return null;
    }

    const livingOthers = others.filter((player) => player.connected && player.health > 0);
    const pool = livingOthers.length > 0 ? livingOthers : others;
    if (!localPlayer) {
      return pool[0] ?? null;
    }

    return pool.reduce((nearest, player) => {
      if (!nearest) {
        return player;
      }

      const nearestDistance = (
        (nearest.position.x - localPlayer.position.x) ** 2 +
        (nearest.position.z - localPlayer.position.z) ** 2
      );
      const candidateDistance = (
        (player.position.x - localPlayer.position.x) ** 2 +
        (player.position.z - localPlayer.position.z) ** 2
      );
      return candidateDistance < nearestDistance ? player : nearest;
    }, null);
  }

  getHudLabels(targetState = this.getFocusTargetState()) {
    return {
      opponent: targetState?.profileName === 'bot' ? 'Target' : 'Opponent'
    };
  }

  getOverlayState() {
    return null;
  }

  getConnectionState() {
    return 'test';
  }

  getDefaultOpponentMaxHealth() {
    return this.tuningConfig.botMaxHealth ?? DEFAULT_TUNING_CONFIG.botMaxHealth;
  }

  getTuningSchema() {
    return TUNING_SCHEMA;
  }

  getTuningConfig() {
    return { ...this.tuningConfig };
  }

  getTestPanelState() {
    const localPlayer = this.getLocalPlayerState();
    const bots = this.snapshot?.players.filter((player) => player.profileName === 'bot') ?? [];
    const livingBots = bots.filter((player) => player.health > 0).length;

    return {
      playerAlive: Boolean(localPlayer && localPlayer.health > 0),
      livingBots,
      totalBots: bots.length,
      storedLocally: Boolean(this.storage),
      values: this.getTuningConfig()
    };
  }
}
