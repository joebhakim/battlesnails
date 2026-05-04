import { BotController } from '../sim/BotController.js';
import { MatchSimulation, MATCH_TICK_DURATION, normalizePlayerInput } from '../sim/MatchSimulation.js';
import {
  DEFAULT_TUNING_CONFIG,
  createBotControllerConfig
} from '../sim/Tuning.js';
import { createArenaEnvironment } from '../sim/ArenaEnvironment.js';
import {
  DEFAULT_SINGLE_PLAYER_OPTIONS as DEFAULT_SCENARIO_OPTIONS,
  ENCOUNTER_PRESETS as SHARED_ENCOUNTER_PRESETS,
  createParticipantsForScenario,
  createTuningConfigFromScenario,
  normalizeScenarioOptions
} from '../sim/EncounterPresets.js';
import { ARENA_TERRAIN_PRESET_OPTIONS } from '../world/Terrain.js';

export const SINGLE_PLAYER_OPTIONS_STORAGE_KEY = 'battlesnails:singleplayer-options-v1';
export const SINGLE_PLAYER_TUNING_STORAGE_KEY = SINGLE_PLAYER_OPTIONS_STORAGE_KEY;
export const ENCOUNTER_PRESETS = SHARED_ENCOUNTER_PRESETS;
export const DEFAULT_SINGLE_PLAYER_OPTIONS = DEFAULT_SCENARIO_OPTIONS;

export const SINGLE_PLAYER_OPTIONS_SCHEMA: ReadonlyArray<any> = Object.freeze([
  Object.freeze({
    id: 'stagePreset',
    label: 'Stage',
    section: 'Setup',
    defaultValue: DEFAULT_SINGLE_PLAYER_OPTIONS.stagePreset,
    structural: true,
    kind: 'choice',
    options: ARENA_TERRAIN_PRESET_OPTIONS
  }),
  Object.freeze({
    id: 'encounterPreset',
    label: 'Enemies',
    section: 'Setup',
    defaultValue: DEFAULT_SINGLE_PLAYER_OPTIONS.encounterPreset,
    structural: true,
    kind: 'choice',
    options: ENCOUNTER_PRESETS.map((preset) => ({
      value: preset.value,
      label: preset.label
    }))
  })
]);
export const SINGLE_PLAYER_TUNING_SCHEMA = SINGLE_PLAYER_OPTIONS_SCHEMA;

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

export function normalizeSinglePlayerOptions(rawOptions: any = {}) {
  return normalizeScenarioOptions(rawOptions);
}

function createTuningConfigFromOptions(options) {
  return createTuningConfigFromScenario(options, DEFAULT_TUNING_CONFIG);
}

function loadStoredOptions(storage) {
  if (!storage?.getItem) {
    return { ...DEFAULT_SINGLE_PLAYER_OPTIONS };
  }

  try {
    const raw = storage.getItem(SINGLE_PLAYER_OPTIONS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SINGLE_PLAYER_OPTIONS };
    }

    return normalizeSinglePlayerOptions(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SINGLE_PLAYER_OPTIONS };
  }
}

export function getStoredSinglePlayerOptions(storageOverride = null) {
  return loadStoredOptions(getSafeStorage(storageOverride));
}

function saveStoredOptions(storage, options) {
  if (!storage?.setItem) {
    return;
  }

  storage.setItem(SINGLE_PLAYER_OPTIONS_STORAGE_KEY, JSON.stringify(options));
}

export function saveSinglePlayerOptions(rawOptions, storageOverride = null) {
  const storage = getSafeStorage(storageOverride);
  const options = normalizeSinglePlayerOptions(rawOptions);
  saveStoredOptions(storage, options);
  return options;
}

function clearStoredOptions(storage) {
  if (!storage?.removeItem) {
    return;
  }

  storage.removeItem(SINGLE_PLAYER_OPTIONS_STORAGE_KEY);
}

export class SinglePlayerSession {
  declare localSlot: any;
  declare tuningConfig: any;
  declare accumulator: any;
  declare botControllers: any;
  declare mode: any;
  declare opponentSlot: any;
  declare options: any;
  declare simulation: any;
  declare snapshot: any;
  declare staticWorldProps: any;
  declare storage: any;
  constructor(options: any = {}) {
    this.mode = 'singleplayer';
    this.localSlot = 1;
    this.opponentSlot = 2;
    this.accumulator = 0;
    this.storage = getSafeStorage(options.storage);
    const hasExplicitOptions = options.options !== undefined;
    this.options = normalizeSinglePlayerOptions(hasExplicitOptions ? options.options : loadStoredOptions(this.storage));
    if (hasExplicitOptions) {
      saveStoredOptions(this.storage, this.options);
    }
    this.tuningConfig = createTuningConfigFromOptions(this.options);
    this.botControllers = new Map();
    this.snapshot = null;
    this.staticWorldProps = [];

    this.rebuildSimulation();
  }

  rebuildSimulation() {
    this.tuningConfig = createTuningConfigFromOptions(this.options);
    const participants = createParticipantsForScenario(this.options);
    const environment = createArenaEnvironment(this.options);

    this.simulation = new MatchSimulation({
      mode: 'singleplayer',
      players: participants,
      tuning: this.tuningConfig,
      terrainConfig: environment?.terrainConfig,
      arenaRadius: environment?.arenaRadius,
      worldProps: environment?.worldProps
    });

    const botControllerConfig = createBotControllerConfig(this.tuningConfig);
    this.botControllers.clear();
    for (const participant of participants) {
      if (participant.profile === 'bot') {
        this.botControllers.set(participant.slot, new BotController(botControllerConfig));
      }
    }

    this.opponentSlot = participants.find((participant) => participant.profile === 'bot')?.slot ?? null;
    this.snapshot = this.simulation.getSnapshot();
    this.staticWorldProps = this.snapshot.worldProps ?? [];
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
        turnX: localInput.turnX / steps,
        reachDelta: localInput.reachDelta / steps,
        leftHeld: localInput.leftHeld,
        rightHeld: localInput.rightHeld
      });

      for (let index = 0; index < steps && this.accumulator >= MATCH_TICK_DURATION; index += 1) {
        this.simulation.setPlayerInput(this.localSlot, {
          ...dividedInput,
          jumpPressed: index === 0 && localInput.jumpPressed,
          interactPressed: index === 0 && localInput.interactPressed
        });
        for (const [botSlot, botController] of this.botControllers.entries()) {
          this.simulation.setPlayerInput(
            botSlot,
            botController.getInput(this.simulation, botSlot, this.localSlot, MATCH_TICK_DURATION)
          );
        }
        this.snapshot = {
          ...this.simulation.step(MATCH_TICK_DURATION, { includeWorldProps: false }),
          worldProps: this.staticWorldProps
        };
        this.accumulator -= MATCH_TICK_DURATION;
      }
    } else {
      this.snapshot = {
        ...this.simulation.getSnapshot({ includeWorldProps: false }),
        worldProps: this.staticWorldProps
      };
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
    this.options = { ...DEFAULT_SINGLE_PLAYER_OPTIONS };
    clearStoredOptions(this.storage);
    this.rebuildSimulation();
  }

  setTuningValue(id, value) {
    return this.setOptions({
      ...this.options,
      [id]: value
    });
  }

  setOptions(nextOptions) {
    const normalized = normalizeSinglePlayerOptions(nextOptions);
    this.options = normalized;
    saveStoredOptions(this.storage, this.options);
    this.rebuildSimulation();
    return { rebuilt: true };
  }

  setTuningConfig(nextConfig) {
    return this.setOptions(nextConfig);
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
    const localPlayer = this.getLocalPlayerState();
    const enemies = this.getOtherPlayerStates();
    const livingEnemies = enemies.filter((player) => player.connected && player.health > 0);
    const pool = livingEnemies.length > 0 ? livingEnemies : enemies;
    if (pool.length === 0) {
      return null;
    }

    if (!localPlayer) {
      return pool[0];
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
      opponent: targetState?.profileName === 'bot' && this.getOtherPlayerStates().length > 1
        ? 'Nearest Enemy'
        : 'Enemy'
    };
  }

  getDefaultOpponentMaxHealth() {
    return this.tuningConfig.botMaxHealth;
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
        ? this.getOtherPlayerStates().length > 1
          ? 'The other guys got SNAILED.'
          : 'The other guy got SNAILED.'
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
    return SINGLE_PLAYER_OPTIONS_SCHEMA;
  }

  getTuningConfig() {
    return { ...this.options };
  }

  getTestPanelState() {
    const localPlayer = this.getLocalPlayerState();
    const enemies = this.getOtherPlayerStates();
    const livingBots = enemies.filter((player) => player.connected && player.health > 0).length;

    return {
      playerAlive: Boolean(localPlayer && localPlayer.health > 0),
      livingBots,
      totalBots: enemies.length,
      entityLabel: enemies.length === 1 ? 'enemy' : 'enemies',
      storedLocally: Boolean(this.storage),
      values: this.getTuningConfig()
    };
  }
}
