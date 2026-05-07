import { BotController } from '../sim/BotController.js';
import {
  BALANCE_ENCOUNTER_SEARCH_OPTIONS,
  BALANCE_STAGE_SEARCH_OPTIONS,
  BalanceBatchJob,
  DEFAULT_BALANCE_OPTIONS,
  DEFAULT_BALANCE_SEARCH_CONFIG,
  createBalanceScenarios,
  normalizeBalanceSearchConfig
} from '../sim/BalanceRunner.js';
import {
  ENCOUNTER_PRESETS,
  createParticipantsForScenario,
  createTuningConfigFromScenario
} from '../sim/EncounterPresets.js';
import { HumanLikeController } from '../sim/HumanLikeController.js';
import { createVisionMemory, createVisionObservation } from '../sim/HumanVision.js';
import { MatchSimulation, MATCH_TICK_DURATION } from '../sim/MatchSimulation.js';
import {
  DUEL_TUNING_SCHEMA,
  createBotControllerConfig,
  getDefaultTuningConfig,
  normalizeDuelTuningConfig
} from '../sim/Tuning.js';
import { SeededRandom, createRandomSeed, normalizeSeed } from '../sim/SeededRandom.js';
import { accumulateFixedStepTime, getFixedStepCount } from './FixedStepClock.js';

export const SIMULATOR_TUNING_STORAGE_KEY = 'battlesnails:simulator-tuning-v4';

const SIMULATOR_SEARCH_SCHEMA = Object.freeze([
  Object.freeze({
    id: 'stageSearch',
    label: 'Stage Search',
    section: 'Search',
    defaultValue: DEFAULT_BALANCE_SEARCH_CONFIG.stageSearch,
    structural: true,
    kind: 'choice',
    options: BALANCE_STAGE_SEARCH_OPTIONS
  }),
  Object.freeze({
    id: 'encounterSearch',
    label: 'Mode Search',
    section: 'Search',
    defaultValue: DEFAULT_BALANCE_SEARCH_CONFIG.encounterSearch,
    structural: true,
    kind: 'choice',
    options: BALANCE_ENCOUNTER_SEARCH_OPTIONS
  }),
  Object.freeze({
    id: 'encounterPreset',
    label: 'Mode',
    section: 'Search',
    defaultValue: DEFAULT_BALANCE_SEARCH_CONFIG.encounterPreset,
    structural: true,
    kind: 'choice',
    options: ENCOUNTER_PRESETS.map((preset) => ({
      value: preset.value,
      label: preset.label
    })),
    visibleWhen: {
      id: 'encounterSearch',
      equals: 'selected'
    }
  })
]);

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

function normalizeSimulatorConfig(rawConfig: any = {}) {
  return {
    tuningConfig: normalizeDuelTuningConfig(rawConfig),
    searchConfig: normalizeBalanceSearchConfig(rawConfig)
  };
}

function getDefaultSimulatorConfig() {
  return normalizeSimulatorConfig(getDefaultTuningConfig());
}

function loadStoredSimulatorConfig(storage, fallbackConfig) {
  if (fallbackConfig) {
    return normalizeSimulatorConfig(fallbackConfig);
  }

  if (!storage?.getItem) {
    return getDefaultSimulatorConfig();
  }

  try {
    const raw = storage.getItem(SIMULATOR_TUNING_STORAGE_KEY);
    if (!raw) {
      return getDefaultSimulatorConfig();
    }

    return normalizeSimulatorConfig(JSON.parse(raw));
  } catch {
    return getDefaultSimulatorConfig();
  }
}

function saveStoredSimulatorConfig(storage, tuningConfig, searchConfig) {
  if (!storage?.setItem) {
    return;
  }

  storage.setItem(SIMULATOR_TUNING_STORAGE_KEY, JSON.stringify({
    ...tuningConfig,
    ...searchConfig
  }));
}

function clearStoredTuningConfig(storage) {
  if (!storage?.removeItem) {
    return;
  }

  storage.removeItem(SIMULATOR_TUNING_STORAGE_KEY);
}

export class SimulatorSession {
  declare localSlot: any;
  declare tuningConfig: any;
  declare batchJob: any;
  declare batchMatchesPerFrame: any;
  declare batchReport: any;
  declare batchState: any;
  declare matchCount: any;
  declare maxSeconds: any;
  declare mode: any;
  declare opponentSlot: any;
  declare searchConfig: any;
  declare seed: any;
  declare snapshot: any;
  declare storage: any;
  declare visibleAccumulator: any;
  declare visibleRuntime: any;
  declare visibleSeed: any;
  constructor(options: any = {}) {
    this.mode = 'simulator';
    this.localSlot = 1;
    this.opponentSlot = 2;
    this.storage = getSafeStorage(options.storage);
    const simulatorConfig = loadStoredSimulatorConfig(this.storage, options.tuning);
    this.tuningConfig = simulatorConfig.tuningConfig;
    this.searchConfig = simulatorConfig.searchConfig;
    this.seed = normalizeSeed(options.seed ?? createRandomSeed());
    this.matchCount = Math.max(1, Math.floor(options.matchCount ?? DEFAULT_BALANCE_OPTIONS.matchCount));
    this.maxSeconds = options.maxSeconds ?? DEFAULT_BALANCE_OPTIONS.maxSeconds;
    this.batchMatchesPerFrame = Math.max(1, Math.floor(options.batchMatchesPerFrame ?? 1));

    this.batchJob = null;
    this.batchReport = null;
    this.batchState = 'idle';
    this.visibleSeed = this.seed;
    this.visibleAccumulator = 0;

    this.restartVisualMatch(this.visibleSeed);
    this.startBatch();
  }

  getDefaultVisibleScenario() {
    return createBalanceScenarios(this.tuningConfig, this.searchConfig)[0];
  }

  createVisibleRuntime(seed, scenario = this.getDefaultVisibleScenario()) {
    const rng = new SeededRandom(seed);
    const tuning = createTuningConfigFromScenario(scenario, this.tuningConfig);
    const participants = createParticipantsForScenario(scenario);
    const botControllerConfig = createBotControllerConfig(tuning);
    const botControllers = new Map(participants
      .filter((participant) => participant.profile === 'bot')
      .map((participant) => {
        const botRng = rng.fork(`visible-bot:${participant.slot}`);
        return [
          participant.slot,
          new BotController({
            ...botControllerConfig,
            rng: () => botRng.next()
          })
        ];
      }));
    const simulation = new MatchSimulation({
      mode: 'singleplayer',
      players: participants,
      tuning
    });

    return {
      scenario,
      tuning,
      simulation,
      rng,
      humanController: new HumanLikeController({ rng: rng.fork('visible-human') }),
      botControllers,
      visionMemory: createVisionMemory(),
      snapshot: simulation.getSnapshot()
    };
  }

  startBatch(nextConfig: any = {}) {
    if (nextConfig.seed !== undefined) {
      this.seed = normalizeSeed(nextConfig.seed);
    }

    if (nextConfig.matchCount !== undefined) {
      this.matchCount = Math.max(1, Math.floor(Number(nextConfig.matchCount) || DEFAULT_BALANCE_OPTIONS.matchCount));
    }

    this.batchJob = new BalanceBatchJob({
      seed: this.seed,
      matchCount: this.matchCount,
      maxSeconds: this.maxSeconds,
      tuning: this.tuningConfig,
      searchConfig: this.searchConfig
    });
    this.batchReport = this.batchJob.getReport();
    this.batchState = 'running';
  }

  setTuningConfig(nextConfig) {
    const simulatorConfig = normalizeSimulatorConfig(nextConfig);
    this.tuningConfig = simulatorConfig.tuningConfig;
    this.searchConfig = simulatorConfig.searchConfig;
    saveStoredSimulatorConfig(this.storage, this.tuningConfig, this.searchConfig);
    this.restartVisualMatch(this.visibleSeed);
    this.startBatch();
    return { rebuilt: true };
  }

  resetToDefaults() {
    const simulatorConfig = getDefaultSimulatorConfig();
    this.tuningConfig = simulatorConfig.tuningConfig;
    this.searchConfig = simulatorConfig.searchConfig;
    clearStoredTuningConfig(this.storage);
    this.restartVisualMatch(this.seed);
    this.startBatch();
  }

  restartVisualMatch(seed = null, scenario = null) {
    const representative = this.getRepresentativeMatch();
    const nextSeed = seed ?? representative?.seed ?? this.seed;
    const nextScenario = scenario ?? representative?.scenario ?? this.getDefaultVisibleScenario();

    this.visibleSeed = normalizeSeed(nextSeed);
    this.visibleRuntime = this.createVisibleRuntime(this.visibleSeed, nextScenario);
    this.snapshot = this.visibleRuntime.snapshot;
    this.visibleAccumulator = 0;
  }

  update(delta) {
    if (this.batchState === 'running' && this.batchJob) {
      this.batchReport = this.batchJob.step(this.batchMatchesPerFrame);
      if (this.batchReport.finished) {
        this.batchState = 'complete';
        const representative = this.getRepresentativeMatch();
        this.restartVisualMatch(representative?.seed ?? this.seed, representative?.scenario);
      }
      return;
    }

    this.updateVisibleMatch(delta);
  }

  updateVisibleMatch(delta) {
    const runtime = this.visibleRuntime;
    if (!runtime || runtime.simulation.phase !== 'running') {
      return;
    }

    this.visibleAccumulator = accumulateFixedStepTime(this.visibleAccumulator, delta, MATCH_TICK_DURATION);
    const steps = getFixedStepCount(this.visibleAccumulator, MATCH_TICK_DURATION);
    for (let index = 0; index < steps && runtime.simulation.phase === 'running'; index += 1) {
      const observation = createVisionObservation(
        runtime.snapshot,
        this.localSlot,
        {},
        runtime.visionMemory,
        runtime.rng,
        MATCH_TICK_DURATION
      );
      runtime.simulation.setPlayerInput(
        this.localSlot,
        runtime.humanController.getInput(observation, MATCH_TICK_DURATION)
      );
      for (const [botSlot, botController] of runtime.botControllers.entries()) {
        runtime.simulation.setPlayerInput(
          botSlot,
          botController.getInput(runtime.simulation, botSlot, this.localSlot, MATCH_TICK_DURATION)
        );
      }
      runtime.snapshot = runtime.simulation.step(MATCH_TICK_DURATION);
      this.visibleAccumulator -= MATCH_TICK_DURATION;
    }

    this.snapshot = runtime.snapshot;
  }

  leave() { }

  getRepresentativeMatch() {
    const matches = this.batchReport?.matches ?? [];
    if (matches.length === 0) {
      return null;
    }

    const averageDuration = this.batchReport?.summary?.averageDurationSeconds ?? matches[0].durationSeconds;
    return matches.reduce((best, match) => (
      Math.abs(match.durationSeconds - averageDuration) < Math.abs(best.durationSeconds - averageDuration)
        ? match
        : best
    ), matches[0]);
  }

  getRepresentativeMatchSeed() {
    return this.getRepresentativeMatch()?.seed ?? null;
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
    const enemies = this.getOtherPlayerStates();
    const livingEnemies = enemies.filter((player) => player.connected && player.health > 0);
    const pool = livingEnemies.length > 0 ? livingEnemies : enemies;
    if (pool.length === 0) {
      return null;
    }

    if (!localPlayer) {
      return pool[0];
    }

    return pool.reduce((nearest, enemy) => {
      if (!nearest) {
        return enemy;
      }

      const nearestDistance = ((nearest.position.x - localPlayer.position.x) ** 2)
        + ((nearest.position.z - localPlayer.position.z) ** 2);
      const enemyDistance = ((enemy.position.x - localPlayer.position.x) ** 2)
        + ((enemy.position.z - localPlayer.position.z) ** 2);
      return enemyDistance < nearestDistance ? enemy : nearest;
    }, null);
  }

  getHudLabels() {
    return {
      opponent: 'Bot'
    };
  }

  getDefaultOpponentMaxHealth() {
    return this.getFocusTargetState()?.maxHealth ?? this.tuningConfig.botMaxHealth;
  }

  getOverlayState() {
    return null;
  }

  getConnectionState() {
    return this.batchState === 'running' ? 'simulator-batch' : 'simulator';
  }

  getSimulatorPanelState() {
    const progress = this.batchJob?.getProgress() ?? {
      completed: this.batchReport?.completed ?? 0,
      total: this.matchCount,
      finished: this.batchState === 'complete'
    };

    return {
      seed: this.seed,
      matchCount: this.matchCount,
      batchState: this.batchState,
      progress,
      report: this.batchReport,
      visualSeed: this.visibleSeed,
      visualPhase: this.snapshot?.phase ?? 'idle',
      visualWinnerSlot: this.snapshot?.winnerSlot ?? null,
      visualDurationSeconds: Number(((this.snapshot?.tick ?? 0) * MATCH_TICK_DURATION).toFixed(2)),
      tuningValues: this.getTuningConfig(),
      tuningStoredLocally: Boolean(this.storage)
    };
  }

  getSimulatorReportJson() {
    return JSON.stringify(this.batchReport ?? {}, null, 2);
  }

  getTuningSchema() {
    return [
      ...SIMULATOR_SEARCH_SCHEMA,
      ...DUEL_TUNING_SCHEMA
    ];
  }

  getTuningConfig() {
    return {
      ...this.searchConfig,
      ...this.tuningConfig
    };
  }
}
