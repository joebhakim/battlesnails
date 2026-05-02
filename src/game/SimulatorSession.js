import { BotController } from '../sim/BotController.js';
import { BalanceBatchJob, DEFAULT_BALANCE_OPTIONS } from '../sim/BalanceRunner.js';
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

export const SIMULATOR_TUNING_STORAGE_KEY = 'battlesnails:simulator-tuning-v4';

function createParticipants() {
  return [
    { slot: 1, profile: 'human', connected: true },
    { slot: 2, profile: 'bot', connected: true }
  ];
}

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

function loadStoredTuningConfig(storage, fallbackConfig) {
  if (fallbackConfig) {
    return normalizeDuelTuningConfig(fallbackConfig);
  }

  if (!storage?.getItem) {
    return getDefaultTuningConfig();
  }

  try {
    const raw = storage.getItem(SIMULATOR_TUNING_STORAGE_KEY);
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

  storage.setItem(SIMULATOR_TUNING_STORAGE_KEY, JSON.stringify(tuningConfig));
}

function clearStoredTuningConfig(storage) {
  if (!storage?.removeItem) {
    return;
  }

  storage.removeItem(SIMULATOR_TUNING_STORAGE_KEY);
}

export class SimulatorSession {
  constructor(options = {}) {
    this.mode = 'simulator';
    this.localSlot = 1;
    this.opponentSlot = 2;
    this.storage = getSafeStorage(options.storage);
    this.tuningConfig = loadStoredTuningConfig(this.storage, options.tuning);
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

  createVisibleRuntime(seed) {
    const rng = new SeededRandom(seed);
    const botRng = rng.fork('visible-bot');
    const simulation = new MatchSimulation({
      mode: 'singleplayer',
      players: createParticipants(),
      tuning: this.tuningConfig
    });

    return {
      simulation,
      rng,
      humanController: new HumanLikeController({ rng: rng.fork('visible-human') }),
      botController: new BotController({
        ...createBotControllerConfig(this.tuningConfig),
        rng: () => botRng.next()
      }),
      visionMemory: createVisionMemory(),
      snapshot: simulation.getSnapshot()
    };
  }

  startBatch(nextConfig = {}) {
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
      tuning: this.tuningConfig
    });
    this.batchReport = this.batchJob.getReport();
    this.batchState = 'running';
  }

  setTuningConfig(nextConfig) {
    this.tuningConfig = normalizeDuelTuningConfig(nextConfig);
    saveStoredTuningConfig(this.storage, this.tuningConfig);
    this.restartVisualMatch(this.visibleSeed);
    this.startBatch();
    return { rebuilt: true };
  }

  resetToDefaults() {
    this.tuningConfig = getDefaultTuningConfig();
    clearStoredTuningConfig(this.storage);
    this.restartVisualMatch(this.seed);
    this.startBatch();
  }

  restartVisualMatch(seed = this.getRepresentativeMatchSeed() ?? this.seed) {
    this.visibleSeed = normalizeSeed(seed);
    this.visibleRuntime = this.createVisibleRuntime(this.visibleSeed);
    this.snapshot = this.visibleRuntime.snapshot;
    this.visibleAccumulator = 0;
  }

  update(delta) {
    if (this.batchState === 'running' && this.batchJob) {
      this.batchReport = this.batchJob.step(this.batchMatchesPerFrame);
      if (this.batchReport.finished) {
        this.batchState = 'complete';
        this.restartVisualMatch(this.getRepresentativeMatchSeed() ?? this.seed);
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

    this.visibleAccumulator += delta;
    while (this.visibleAccumulator >= MATCH_TICK_DURATION && runtime.simulation.phase === 'running') {
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
      runtime.simulation.setPlayerInput(
        this.opponentSlot,
        runtime.botController.getInput(runtime.simulation, this.opponentSlot, this.localSlot, MATCH_TICK_DURATION)
      );
      runtime.snapshot = runtime.simulation.step(MATCH_TICK_DURATION);
      this.visibleAccumulator -= MATCH_TICK_DURATION;
    }

    this.snapshot = runtime.snapshot;
  }

  leave() { }

  getRepresentativeMatchSeed() {
    const matches = this.batchReport?.matches ?? [];
    if (matches.length === 0) {
      return null;
    }

    const averageDuration = this.batchReport?.summary?.averageDurationSeconds ?? matches[0].durationSeconds;
    return matches.reduce((best, match) => (
      Math.abs(match.durationSeconds - averageDuration) < Math.abs(best.durationSeconds - averageDuration)
        ? match
        : best
    ), matches[0]).seed;
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
    return this.snapshot?.players.find((player) => player.slot === this.opponentSlot) ?? null;
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
    return DUEL_TUNING_SCHEMA;
  }

  getTuningConfig() {
    return { ...this.tuningConfig };
  }
}
