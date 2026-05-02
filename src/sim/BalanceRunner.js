import { BotController } from './BotController.js';
import { HumanLikeController } from './HumanLikeController.js';
import { createVisionMemory, createVisionObservation } from './HumanVision.js';
import { MatchSimulation, MATCH_TICK_DURATION } from './MatchSimulation.js';
import { DEFAULT_TUNING_CONFIG, createBotControllerConfig, createSimulationProfiles, normalizeTuningConfig } from './Tuning.js';
import { SeededRandom, normalizeSeed } from './SeededRandom.js';

export const DEFAULT_BALANCE_OPTIONS = Object.freeze({
  matchCount: 100,
  maxSeconds: 90
});

function createParticipants() {
  return [
    { slot: 1, profile: 'human', connected: true },
    { slot: 2, profile: 'bot', connected: true }
  ];
}

function findPlayer(snapshot, slot) {
  return snapshot.players.find((player) => player.slot === slot) ?? null;
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
  if (match.winnerSlot === 1) {
    totals.humanWins += 1;
  } else if (match.winnerSlot === 2) {
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

export function runBalanceMatch(options = {}) {
  const seed = normalizeSeed(options.seed ?? 1);
  const rng = new SeededRandom(seed);
  const tuning = normalizeTuningConfig(options.tuning ?? DEFAULT_TUNING_CONFIG);
  const profiles = createSimulationProfiles(tuning);
  const simulation = new MatchSimulation({
    mode: 'singleplayer',
    players: createParticipants(),
    tuning
  });
  const botRng = rng.fork('bot');
  const humanController = new HumanLikeController({
    ...(options.humanConfig ?? {}),
    rng: rng.fork('human')
  });
  const botController = new BotController({
    ...createBotControllerConfig(tuning),
    rng: () => botRng.next()
  });
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
    const previousHuman = findPlayer(snapshot, 1);
    const previousBot = findPlayer(snapshot, 2);
    const observation = createVisionObservation(
      snapshot,
      1,
      options.visionConfig,
      visionMemory,
      rng,
      MATCH_TICK_DURATION
    );
    const humanInput = humanController.getInput(observation, MATCH_TICK_DURATION);
    const botInput = botController.getInput(simulation, 2, 1, MATCH_TICK_DURATION);

    simulation.setPlayerInput(1, humanInput);
    simulation.setPlayerInput(2, botInput);
    snapshot = simulation.step(MATCH_TICK_DURATION);

    const human = findPlayer(snapshot, 1);
    const bot = findPlayer(snapshot, 2);
    const humanDamage = Math.max(0, (previousBot?.health ?? 0) - (bot?.health ?? 0));
    const botDamage = Math.max(0, (previousHuman?.health ?? 0) - (human?.health ?? 0));
    metrics.humanDamage += humanDamage;
    metrics.botDamage += botDamage;
    metrics.humanDamageEvents += humanDamage > 0 ? 1 : 0;
    metrics.botDamageEvents += botDamage > 0 ? 1 : 0;
    metrics.humanImpactTicks += (human?.impactPower ?? 0) >= profiles.human.impactThreshold ? 1 : 0;
    metrics.botImpactTicks += (bot?.impactPower ?? 0) >= profiles.bot.impactThreshold ? 1 : 0;
    metrics.humanTrailSeconds += human?.onTrail ? MATCH_TICK_DURATION : 0;
    metrics.botTrailSeconds += bot?.onTrail ? MATCH_TICK_DURATION : 0;
    ticks += 1;
  }

  const finalHuman = findPlayer(snapshot, 1);
  const finalBot = findPlayer(snapshot, 2);
  const timedOut = simulation.phase === 'running';

  return {
    seed,
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
    finalBotHealth: finalBot?.health ?? 0
  };
}

export class BalanceBatchJob {
  constructor(options = {}) {
    this.seed = normalizeSeed(options.seed ?? 1);
    this.matchCount = Math.max(1, Math.floor(options.matchCount ?? DEFAULT_BALANCE_OPTIONS.matchCount));
    this.maxSeconds = options.maxSeconds ?? DEFAULT_BALANCE_OPTIONS.maxSeconds;
    this.tuning = normalizeTuningConfig(options.tuning ?? DEFAULT_TUNING_CONFIG);
    this.humanConfig = options.humanConfig ?? {};
    this.visionConfig = options.visionConfig ?? {};
    this.completed = 0;
    this.matches = [];
    this.totals = createEmptyTotals();
    this.finished = false;
  }

  step(matchLimit = 1) {
    if (this.finished) {
      return this.getReport();
    }

    const limit = Math.max(1, Math.floor(matchLimit));
    for (let index = 0; index < limit && this.completed < this.matchCount; index += 1) {
      const matchSeed = normalizeSeed(`${this.seed}:match:${this.completed}`);
      const match = runBalanceMatch({
        seed: matchSeed,
        maxSeconds: this.maxSeconds,
        tuning: this.tuning,
        humanConfig: this.humanConfig,
        visionConfig: this.visionConfig
      });
      this.matches.push({
        matchIndex: this.completed,
        ...match
      });
      updateTotals(this.totals, match);
      this.completed += 1;
    }

    this.finished = this.completed >= this.matchCount;
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
      total: this.matchCount,
      finished: this.finished
    };
  }

  getReport() {
    return {
      seed: this.seed,
      matchCount: this.matchCount,
      completed: this.completed,
      maxSeconds: this.maxSeconds,
      finished: this.finished,
      totals: { ...this.totals },
      summary: summarize(this.totals, this.completed),
      matches: this.matches.map((match) => ({ ...match }))
    };
  }
}

export function runBalanceBatch(options = {}) {
  return new BalanceBatchJob(options).runToEnd();
}
