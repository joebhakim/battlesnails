import { BotController } from './BotController.js';
import { HumanLikeController } from './HumanLikeController.js';
import { createVisionMemory, createVisionObservation } from './HumanVision.js';
import { MatchSimulation, MATCH_TICK_DURATION } from './MatchSimulation.js';
import { DEFAULT_TUNING_CONFIG, createBotControllerConfig, createSimulationProfiles, normalizeTuningConfig } from './Tuning.js';
import { SeededRandom, normalizeSeed } from './SeededRandom.js';
import {
  DEFAULT_SINGLE_PLAYER_OPTIONS,
  ENCOUNTER_PRESETS,
  createParticipantsForScenario,
  createScenarioDescriptor,
  createTuningConfigFromScenario,
  normalizeScenarioOptions
} from './EncounterPresets.js';
import { TERRAIN_PRESET_OPTIONS } from '../world/Terrain.js';

export const DEFAULT_BALANCE_OPTIONS = Object.freeze({
  matchCount: 100,
  maxSeconds: 90
});

export const BALANCE_STAGE_SEARCH_OPTIONS = Object.freeze([
  Object.freeze({ value: 'current', label: 'Current Stage' }),
  Object.freeze({ value: 'all', label: 'All Stages' })
]);

export const BALANCE_ENCOUNTER_SEARCH_OPTIONS = Object.freeze([
  Object.freeze({ value: 'selected', label: 'Selected Mode' }),
  Object.freeze({ value: 'all', label: 'All Modes' })
]);

export const DEFAULT_BALANCE_SEARCH_CONFIG = Object.freeze({
  stageSearch: 'current',
  encounterSearch: 'selected',
  encounterPreset: DEFAULT_SINGLE_PLAYER_OPTIONS.encounterPreset
});

const HUMAN_SLOT = 1;
const VALID_STAGE_SEARCH_OPTIONS = new Set(BALANCE_STAGE_SEARCH_OPTIONS.map((option) => option.value));
const VALID_ENCOUNTER_SEARCH_OPTIONS = new Set(BALANCE_ENCOUNTER_SEARCH_OPTIONS.map((option) => option.value));
const VALID_STAGE_PRESETS = new Set(TERRAIN_PRESET_OPTIONS.map((option) => option.value));
const VALID_ENCOUNTER_PRESETS = new Set(ENCOUNTER_PRESETS.map((preset) => preset.value));

function findPlayer(snapshot, slot) {
  return snapshot.players.find((player) => player.slot === slot) ?? null;
}

function getEnemyPlayers(snapshot) {
  return (snapshot?.players ?? []).filter((player) => player.slot !== HUMAN_SLOT && player.profileName === 'bot');
}

function sumHealth(players) {
  return players.reduce((total, player) => total + Math.max(0, player.health ?? 0), 0);
}

function hasImpact(players, threshold) {
  return players.some((player) => (player.impactPower ?? 0) >= threshold);
}

function roundMetric(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function createEmptyTotals() {
  return {
    humanWins: 0,
    botWins: 0,
    draws: 0,
    timeouts: 0,
    durationSeconds: 0,
    humanDamage: 0,
    botDamage: 0,
    humanDamageEvents: 0,
    botDamageEvents: 0,
    humanImpactTicks: 0,
    botImpactTicks: 0,
    humanTrailSeconds: 0,
    botTrailSeconds: 0,
    humanRemainingHp: 0,
    botRemainingHp: 0
  };
}

function updateTotals(totals, match) {
  if (match.winnerSlot === HUMAN_SLOT) {
    totals.humanWins += 1;
  } else if (match.winnerSlot !== null && match.winnerSlot !== undefined) {
    totals.botWins += 1;
  } else if (match.reason === 'timeout') {
    totals.timeouts += 1;
  } else {
    totals.draws += 1;
  }

  totals.durationSeconds += match.durationSeconds;
  totals.humanDamage += match.humanDamage;
  totals.botDamage += match.botDamage;
  totals.humanDamageEvents += match.humanDamageEvents;
  totals.botDamageEvents += match.botDamageEvents;
  totals.humanImpactTicks += match.humanImpactTicks;
  totals.botImpactTicks += match.botImpactTicks;
  totals.humanTrailSeconds += match.humanTrailSeconds;
  totals.botTrailSeconds += match.botTrailSeconds;
  totals.humanRemainingHp += match.finalHumanHealth;
  totals.botRemainingHp += match.finalBotHealth;
}

function summarize(totals, matchCount) {
  const safeCount = Math.max(1, matchCount);
  return {
    humanWinRate: roundMetric(totals.humanWins / safeCount),
    botWinRate: roundMetric(totals.botWins / safeCount),
    drawRate: roundMetric((totals.draws + totals.timeouts) / safeCount),
    averageDurationSeconds: roundMetric(totals.durationSeconds / safeCount),
    averageHumanDamage: roundMetric(totals.humanDamage / safeCount),
    averageBotDamage: roundMetric(totals.botDamage / safeCount),
    averageHumanDamageEvents: roundMetric(totals.humanDamageEvents / safeCount),
    averageBotDamageEvents: roundMetric(totals.botDamageEvents / safeCount),
    averageHumanImpactTicks: roundMetric(totals.humanImpactTicks / safeCount),
    averageBotImpactTicks: roundMetric(totals.botImpactTicks / safeCount),
    averageHumanTrailSeconds: roundMetric(totals.humanTrailSeconds / safeCount),
    averageBotTrailSeconds: roundMetric(totals.botTrailSeconds / safeCount),
    averageHumanRemainingHp: roundMetric(totals.humanRemainingHp / safeCount),
    averageBotRemainingHp: roundMetric(totals.botRemainingHp / safeCount)
  };
}

export function normalizeBalanceSearchConfig(rawConfig: any = {}) {
  return {
    stageSearch: VALID_STAGE_SEARCH_OPTIONS.has(rawConfig.stageSearch)
      ? rawConfig.stageSearch
      : DEFAULT_BALANCE_SEARCH_CONFIG.stageSearch,
    encounterSearch: VALID_ENCOUNTER_SEARCH_OPTIONS.has(rawConfig.encounterSearch)
      ? rawConfig.encounterSearch
      : DEFAULT_BALANCE_SEARCH_CONFIG.encounterSearch,
    encounterPreset: VALID_ENCOUNTER_PRESETS.has(rawConfig.encounterPreset)
      ? rawConfig.encounterPreset
      : DEFAULT_BALANCE_SEARCH_CONFIG.encounterPreset
  };
}

export function createBalanceScenarios(tuning = DEFAULT_TUNING_CONFIG, searchConfig = DEFAULT_BALANCE_SEARCH_CONFIG) {
  const normalizedTuning = normalizeTuningConfig(tuning);
  const normalizedSearch = normalizeBalanceSearchConfig(searchConfig);
  const stagePresets = normalizedSearch.stageSearch === 'all'
    ? TERRAIN_PRESET_OPTIONS.map((option) => option.value)
    : [VALID_STAGE_PRESETS.has(normalizedTuning.terrainPreset)
      ? normalizedTuning.terrainPreset
      : DEFAULT_SINGLE_PLAYER_OPTIONS.stagePreset];
  const encounterPresets = normalizedSearch.encounterSearch === 'all'
    ? ENCOUNTER_PRESETS.map((preset) => preset.value)
    : [normalizedSearch.encounterPreset];

  return stagePresets.flatMap((stagePreset) => encounterPresets.map((encounterPreset) => (
    createScenarioDescriptor(normalizeScenarioOptions({ stagePreset, encounterPreset }))
  )));
}

export function runBalanceMatch(options: any = {}) {
  const seed = normalizeSeed(options.seed ?? 1);
  const rng = new SeededRandom(seed);
  const scenario = createScenarioDescriptor(options.scenario ?? {
    stagePreset: options.stagePreset ?? options.tuning?.terrainPreset,
    encounterPreset: options.encounterPreset
  });
  const tuning = createTuningConfigFromScenario(
    scenario,
    normalizeTuningConfig(options.tuning ?? DEFAULT_TUNING_CONFIG)
  );
  const profiles = createSimulationProfiles(tuning);
  const participants = createParticipantsForScenario(scenario);
  const simulation = new MatchSimulation({
    mode: 'singleplayer',
    players: participants,
    tuning
  });
  const humanController = new HumanLikeController({
    ...(options.humanConfig ?? {}),
    rng: rng.fork('human')
  });
  const botControllerConfig = createBotControllerConfig(tuning);
  const botControllers = new Map(participants
    .filter((participant) => participant.profile === 'bot')
    .map((participant) => {
      const botRng = rng.fork(`bot:${participant.slot}`);
      return [
        participant.slot,
        new BotController({
          ...botControllerConfig,
          rng: () => botRng.next()
        })
      ];
    }));
  const visionMemory = createVisionMemory();
  const maxTicks = Math.max(1, Math.floor((options.maxSeconds ?? DEFAULT_BALANCE_OPTIONS.maxSeconds) / MATCH_TICK_DURATION));
  const metrics = {
    humanDamage: 0,
    botDamage: 0,
    humanDamageEvents: 0,
    botDamageEvents: 0,
    humanImpactTicks: 0,
    botImpactTicks: 0,
    humanTrailSeconds: 0,
    botTrailSeconds: 0
  };

  let snapshot = simulation.getSnapshot();
  let ticks = 0;

  while (simulation.phase === 'running' && ticks < maxTicks) {
    const previousHuman = findPlayer(snapshot, HUMAN_SLOT);
    const previousEnemies = getEnemyPlayers(snapshot);
    const observation = createVisionObservation(
      snapshot,
      HUMAN_SLOT,
      options.visionConfig,
      visionMemory,
      rng,
      MATCH_TICK_DURATION
    );
    const humanInput = humanController.getInput(observation, MATCH_TICK_DURATION);

    simulation.setPlayerInput(HUMAN_SLOT, humanInput);
    for (const [botSlot, botController] of botControllers.entries()) {
      simulation.setPlayerInput(
        botSlot,
        botController.getInput(simulation, botSlot, HUMAN_SLOT, MATCH_TICK_DURATION)
      );
    }
    snapshot = simulation.step(MATCH_TICK_DURATION);

    const human = findPlayer(snapshot, HUMAN_SLOT);
    const enemies = getEnemyPlayers(snapshot);
    const humanDamage = Math.max(0, sumHealth(previousEnemies) - sumHealth(enemies));
    const botDamage = Math.max(0, (previousHuman?.health ?? 0) - (human?.health ?? 0));
    metrics.humanDamage += humanDamage;
    metrics.botDamage += botDamage;
    metrics.humanDamageEvents += humanDamage > 0 ? 1 : 0;
    metrics.botDamageEvents += botDamage > 0 ? 1 : 0;
    metrics.humanImpactTicks += (human?.impactPower ?? 0) >= profiles.human.impactThreshold ? 1 : 0;
    metrics.botImpactTicks += hasImpact(enemies, profiles.bot.impactThreshold) ? 1 : 0;
    metrics.humanTrailSeconds += human?.onTrail ? MATCH_TICK_DURATION : 0;
    metrics.botTrailSeconds += enemies.length > 0
      ? (enemies.filter((enemy) => enemy.onTrail).length / enemies.length) * MATCH_TICK_DURATION
      : 0;
    ticks += 1;
  }

  const finalHuman = findPlayer(snapshot, HUMAN_SLOT);
  const finalEnemies = getEnemyPlayers(snapshot);
  const timedOut = simulation.phase === 'running';

  return {
    seed,
    scenario,
    enemyCount: scenario.botCount,
    winnerSlot: timedOut ? null : snapshot.winnerSlot,
    reason: timedOut ? 'timeout' : snapshot.reason,
    durationSeconds: roundMetric(ticks * MATCH_TICK_DURATION),
    humanDamage: metrics.humanDamage,
    botDamage: metrics.botDamage,
    humanDamageEvents: metrics.humanDamageEvents,
    botDamageEvents: metrics.botDamageEvents,
    humanImpactTicks: metrics.humanImpactTicks,
    botImpactTicks: metrics.botImpactTicks,
    humanTrailSeconds: roundMetric(metrics.humanTrailSeconds),
    botTrailSeconds: roundMetric(metrics.botTrailSeconds),
    finalHumanHealth: finalHuman?.health ?? 0,
    finalBotHealth: sumHealth(finalEnemies)
  };
}

export class BalanceBatchJob {
  declare completed: any;
  declare finished: any;
  declare humanConfig: any;
  declare matchCount: any;
  declare matches: any;
  declare maxSeconds: any;
  declare scenarioCompleted: any;
  declare scenarioTotals: any;
  declare scenarios: any;
  declare searchConfig: any;
  declare seed: any;
  declare totalMatchCount: any;
  declare totals: any;
  declare tuning: any;
  declare visionConfig: any;
  constructor(options: any = {}) {
    this.seed = normalizeSeed(options.seed ?? 1);
    this.matchCount = Math.max(1, Math.floor(options.matchCount ?? DEFAULT_BALANCE_OPTIONS.matchCount));
    this.maxSeconds = options.maxSeconds ?? DEFAULT_BALANCE_OPTIONS.maxSeconds;
    this.tuning = normalizeTuningConfig(options.tuning ?? DEFAULT_TUNING_CONFIG);
    this.searchConfig = normalizeBalanceSearchConfig(options.searchConfig ?? DEFAULT_BALANCE_SEARCH_CONFIG);
    this.scenarios = createBalanceScenarios(this.tuning, this.searchConfig);
    this.totalMatchCount = this.matchCount * this.scenarios.length;
    this.humanConfig = options.humanConfig ?? {};
    this.visionConfig = options.visionConfig ?? {};
    this.completed = 0;
    this.matches = [];
    this.totals = createEmptyTotals();
    this.scenarioTotals = this.scenarios.map(() => createEmptyTotals());
    this.scenarioCompleted = this.scenarios.map(() => 0);
    this.finished = false;
  }

  step(matchLimit = 1) {
    if (this.finished) {
      return this.getReport();
    }

    const limit = Math.max(1, Math.floor(matchLimit));
    for (let index = 0; index < limit && this.completed < this.totalMatchCount; index += 1) {
      const scenarioIndex = this.completed % this.scenarios.length;
      const scenarioMatchIndex = this.scenarioCompleted[scenarioIndex];
      const scenario = this.scenarios[scenarioIndex];
      const matchSeed = normalizeSeed(`${this.seed}:scenario:${scenario.id}:match:${scenarioMatchIndex}`);
      const match = runBalanceMatch({
        seed: matchSeed,
        scenario,
        maxSeconds: this.maxSeconds,
        tuning: this.tuning,
        humanConfig: this.humanConfig,
        visionConfig: this.visionConfig
      });
      this.matches.push({
        matchIndex: this.completed,
        scenarioIndex,
        scenarioMatchIndex,
        ...match
      });
      updateTotals(this.totals, match);
      updateTotals(this.scenarioTotals[scenarioIndex], match);
      this.scenarioCompleted[scenarioIndex] += 1;
      this.completed += 1;
    }

    this.finished = this.completed >= this.totalMatchCount;
    return this.getReport();
  }

  runToEnd() {
    while (!this.finished) {
      this.step(8);
    }

    return this.getReport();
  }

  getProgress() {
    return {
      completed: this.completed,
      total: this.totalMatchCount,
      finished: this.finished
    };
  }

  getReport() {
    return {
      seed: this.seed,
      matchCount: this.matchCount,
      scenarioCount: this.scenarios.length,
      totalMatchCount: this.totalMatchCount,
      completed: this.completed,
      maxSeconds: this.maxSeconds,
      finished: this.finished,
      searchConfig: { ...this.searchConfig },
      totals: { ...this.totals },
      summary: summarize(this.totals, this.completed),
      scenarios: this.scenarios.map((scenario, index) => ({
        scenario: { ...scenario },
        completed: this.scenarioCompleted[index],
        totals: { ...this.scenarioTotals[index] },
        summary: summarize(this.scenarioTotals[index], this.scenarioCompleted[index])
      })),
      matches: this.matches.map((match) => ({ ...match }))
    };
  }
}

export function runBalanceBatch(options: any = {}) {
  return new BalanceBatchJob(options).runToEnd();
}
