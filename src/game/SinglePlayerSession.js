import { BotController } from '../sim/BotController.js';
import { MatchSimulation, MATCH_TICK_DURATION, normalizePlayerInput } from '../sim/MatchSimulation.js';
import {
  DEFAULT_TUNING_CONFIG,
  DUEL_TUNING_SCHEMA,
  createBotControllerConfig,
  getDefaultTuningConfig,
  hasStructuralTuningChanges,
  normalizeDuelTuningConfig
} from '../sim/Tuning.js';

export const SINGLE_PLAYER_TUNING_STORAGE_KEY = 'battlesnails:singleplayer-tuning-v4';
export const SINGLE_PLAYER_TUNING_SCHEMA = DUEL_TUNING_SCHEMA;

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
    const raw = storage.getItem(SINGLE_PLAYER_TUNING_STORAGE_KEY);
    if (!raw) {
      return getDefaultTuningConfig();
    }

    return normalizeDuelTuningConfig(JSON.parse(raw));
  } catch {
    return getDefaultTuningConfig();
  }
}

function saveStoredTuningConfig(storage, tuningConfig) {
  if (!storage?.setItem) {
    return;
  }

  storage.setItem(SINGLE_PLAYER_TUNING_STORAGE_KEY, JSON.stringify(tuningConfig));
}

function clearStoredTuningConfig(storage) {
  if (!storage?.removeItem) {
    return;
  }

  storage.removeItem(SINGLE_PLAYER_TUNING_STORAGE_KEY);
}

export class SinglePlayerSession {
  constructor(options = {}) {
    this.mode = 'singleplayer';
    this.localSlot = 1;
    this.opponentSlot = 2;
    this.accumulator = 0;
    this.storage = getSafeStorage(options.storage);
    this.tuningConfig = loadStoredTuningConfig(this.storage);
    this.botControllerConfig = createBotControllerConfig(this.tuningConfig);
    this.botController = null;
    this.snapshot = null;

    this.rebuildSimulation();
  }

  rebuildSimulation() {
    this.simulation = new MatchSimulation({
      mode: 'singleplayer',
      players: [
        { slot: 1, profile: 'human', connected: true },
        { slot: 2, profile: 'bot', connected: true }
      ],
      tuning: this.tuningConfig
    });

    this.botControllerConfig = createBotControllerConfig(this.tuningConfig);
    this.botController = new BotController(this.botControllerConfig);
    this.snapshot = this.simulation.getSnapshot();
    this.accumulator = 0;
  }

  update(delta, localInput) {
    this.accumulator += delta;
    const steps = Math.max(1, Math.floor(this.accumulator / MATCH_TICK_DURATION));

    if (this.simulation.phase === 'running') {
      const dividedInput = normalizePlayerInput({
        ...localInput,
        lookX: localInput.lookX / steps,
        lookY: localInput.lookY / steps,
        reachDelta: localInput.reachDelta / steps,
        leftHeld: localInput.leftHeld,
        rightHeld: localInput.rightHeld
      });

      for (let index = 0; index < steps && this.accumulator >= MATCH_TICK_DURATION; index += 1) {
        this.simulation.setPlayerInput(this.localSlot, {
          ...dividedInput,
          jumpPressed: index === 0 && localInput.jumpPressed
        });
        this.simulation.setPlayerInput(
          this.opponentSlot,
          this.botController.getInput(this.simulation, this.opponentSlot, this.localSlot, MATCH_TICK_DURATION)
        );
        this.snapshot = this.simulation.step(MATCH_TICK_DURATION);
        this.accumulator -= MATCH_TICK_DURATION;
      }
    } else {
      this.snapshot = this.simulation.getSnapshot();
      this.accumulator = 0;
    }
  }

  restart() {
    this.rebuildSimulation();
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
    return this.setTuningConfig({
      ...this.tuningConfig,
      [id]: value
    });
  }

  setTuningConfig(nextConfig) {
    const normalized = normalizeDuelTuningConfig(nextConfig);
    const rebuilt = hasStructuralTuningChanges(this.tuningConfig, normalized);

    this.tuningConfig = normalized;
    saveStoredTuningConfig(this.storage, this.tuningConfig);

    if (rebuilt) {
      this.rebuildSimulation();
      return { rebuilt: true };
    }

    this.simulation.setTuningConfig(this.tuningConfig);
    this.botControllerConfig = createBotControllerConfig(this.tuningConfig);
    this.botController.setConfig(this.botControllerConfig);
    this.snapshot = this.simulation.getSnapshot();
    return { rebuilt: false };
  }

  getSnapshot() {
    return this.snapshot;
  }

  getLocalSlot() {
    return this.localSlot;
  }

  getLocalPlayerState() {
    return this.snapshot.players.find((player) => player.slot === this.localSlot) ?? null;
  }

  getOpponentPlayerState() {
    return this.getFocusTargetState();
  }

  getOtherPlayerStates() {
    return this.snapshot.players.filter((player) => player.slot !== this.localSlot);
  }

  getFocusTargetState() {
    return this.snapshot.players.find((player) => player.slot === this.opponentSlot) ?? null;
  }

  getHudLabels(targetState = this.getFocusTargetState()) {
    return {
      opponent: targetState?.profileName === 'bot' ? 'Enemy' : 'Opponent'
    };
  }

  getDefaultOpponentMaxHealth() {
    return this.tuningConfig.botMaxHealth ?? DEFAULT_TUNING_CONFIG.botMaxHealth;
  }

  getOverlayState() {
    if (this.snapshot.phase !== 'ended') {
      return null;
    }

    const playerWon = this.snapshot.winnerSlot === this.localSlot;
    return {
      variant: playerWon ? 'victory' : 'defeat',
      title: playerWon ? 'SNAILED' : 'SALTED',
      body: playerWon
        ? 'The other guy got SNAILED.'
        : 'SALTED.',
      actions: [
        { id: 'restart', label: 'Restart' },
        { id: 'menu', label: 'Back to Menu' }
      ]
    };
  }

  getConnectionState() {
    return 'local';
  }

  getTuningSchema() {
    return SINGLE_PLAYER_TUNING_SCHEMA;
  }

  getTuningConfig() {
    return { ...this.tuningConfig };
  }

  getTestPanelState() {
    const localPlayer = this.getLocalPlayerState();
    const bot = this.getFocusTargetState();
    const livingBots = bot && bot.health > 0 ? 1 : 0;

    return {
      playerAlive: Boolean(localPlayer && localPlayer.health > 0),
      livingBots,
      totalBots: 1,
      storedLocally: Boolean(this.storage),
      values: this.getTuningConfig()
    };
  }
}
