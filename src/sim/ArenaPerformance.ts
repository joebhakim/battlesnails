import { performance } from 'node:perf_hooks';

import { NPCSnail } from '../entities/NPCSnail.js';
import { PlayerSnail } from '../entities/PlayerSnail.js';
import { DEFAULT_TERRAIN_CONFIG } from '../world/Terrain.js';
import { createArenaEnvironment } from './ArenaEnvironment.js';
import { BotController } from './BotController.js';
import {
  MATCH_TICK_DURATION,
  MatchSimulation,
  createIdleInput
} from './MatchSimulation.js';
import {
  DEFAULT_TUNING_CONFIG,
  createBotControllerConfig,
  normalizeTuningConfig
} from './Tuning.js';

const HUMAN_SLOT = 1;
const DEFAULT_BOT_COUNT = 40;
const DEFAULT_PROFILE_SECONDS = 6;
const DEFAULT_WARMUP_SECONDS = 1;
const DEFAULT_SNAPSHOT_SAMPLE_EVERY = 10;

function clampInteger(value, fallback, min, max) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(numericValue)));
}

function clampNumber(value, fallback, min, max) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numericValue));
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function percentile(sortedValues, ratio) {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * ratio) - 1)
  );
  return sortedValues[index];
}

function summarizeMetric(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    samples: samples.length,
    totalMs: round(total),
    averageMs: round(samples.length > 0 ? total / samples.length : 0),
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    maxMs: round(sorted[sorted.length - 1] ?? 0)
  };
}

function summarizeByteMetric(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    samples: samples.length,
    totalBytes: Math.round(total),
    averageBytes: Math.round(samples.length > 0 ? total / samples.length : 0),
    p50Bytes: Math.round(percentile(sorted, 0.5)),
    p95Bytes: Math.round(percentile(sorted, 0.95)),
    maxBytes: Math.round(sorted[sorted.length - 1] ?? 0)
  };
}

function timeOperation(callback) {
  const start = performance.now();
  const value = callback();
  return {
    value,
    elapsedMs: performance.now() - start
  };
}

function createArenaParticipants(botCount) {
  return [
    { slot: HUMAN_SLOT, profile: 'human', connected: true },
    ...Array.from({ length: botCount }, (_, index) => ({
      slot: index + 2,
      profile: 'bot',
      connected: true
    }))
  ];
}

function createPresentationActor(state) {
  return state.profileName === 'bot'
    ? new NPCSnail()
    : new PlayerSnail();
}

function createPresentationActors(snapshot) {
  const actors = new Map();
  for (const state of snapshot.players ?? []) {
    const actor = createPresentationActor(state);
    actor.setTerrainConfig(snapshot.terrain ?? DEFAULT_TERRAIN_CONFIG);
    actor.applyMatchState(state, MATCH_TICK_DURATION);
    actors.set(state.slot, actor);
  }
  return actors;
}

function syncPresentationActors(actors, snapshot) {
  for (const state of snapshot.players ?? []) {
    let actor = actors.get(state.slot);
    if (!actor) {
      actor = createPresentationActor(state);
      actors.set(state.slot, actor);
    }

    actor.setTerrainConfig(snapshot.terrain ?? DEFAULT_TERRAIN_CONFIG);
    actor.applyMatchState(state, MATCH_TICK_DURATION);
  }
}

function countPresentationObjects(actors) {
  let objectCount = 0;
  let meshCount = 0;
  let visibleMeshCount = 0;
  let materialCount = 0;

  for (const actor of actors.values()) {
    actor.mesh.traverse((object) => {
      objectCount += 1;
      if (object.isMesh) {
        meshCount += 1;
        visibleMeshCount += object.visible ? 1 : 0;
        materialCount += Array.isArray(object.material) ? object.material.length : 1;
      }
    });
  }

  return {
    actors: actors.size,
    objectCount,
    meshCount,
    visibleMeshCount,
    materialCount
  };
}

function createBotControllers(participants, tuning): Map<number, any> {
  const botControllerConfig = createBotControllerConfig(tuning);
  return new Map(participants
    .filter((participant) => participant.profile === 'bot')
    .map((participant) => [participant.slot, new BotController(botControllerConfig)]));
}

function buildProfileOptions(rawOptions: any = {}) {
  const botCount = clampInteger(rawOptions.botCount ?? rawOptions.bots, DEFAULT_BOT_COUNT, 0, 120);
  const seconds = clampNumber(rawOptions.seconds, DEFAULT_PROFILE_SECONDS, MATCH_TICK_DURATION, 300);
  const warmupSeconds = clampNumber(rawOptions.warmupSeconds ?? rawOptions.warmup, DEFAULT_WARMUP_SECONDS, 0, 60);
  const snapshotSampleEvery = clampInteger(
    rawOptions.snapshotSampleEvery ?? rawOptions.snapshotEvery,
    DEFAULT_SNAPSHOT_SAMPLE_EVERY,
    1,
    600
  );
  const stagePreset = rawOptions.stagePreset ?? DEFAULT_TERRAIN_CONFIG.preset;

  return {
    botCount,
    seconds,
    warmupSeconds,
    snapshotSampleEvery,
    stagePreset,
    includePresentation: rawOptions.includePresentation !== false
  };
}

export function runArenaPerformanceProfile(rawOptions: any = {}) {
  const options = buildProfileOptions(rawOptions);
  const participants = createArenaParticipants(options.botCount);
  const tuning = normalizeTuningConfig({
    ...DEFAULT_TUNING_CONFIG,
    terrainPreset: options.stagePreset,
    botCount: options.botCount
  });
  const environment = createArenaEnvironment({ stagePreset: options.stagePreset });
  const simulation = new MatchSimulation({
    mode: 'singleplayer',
    players: participants,
    tuning,
    terrainConfig: environment?.terrainConfig,
    arenaRadius: environment?.arenaRadius,
    worldProps: environment?.worldProps
  });
  const botControllers = createBotControllers(participants, tuning);
  const initialSnapshot = simulation.getSnapshot();
  const staticWorldProps = initialSnapshot.worldProps ?? [];
  const actors = options.includePresentation
    ? createPresentationActors(initialSnapshot)
    : new Map();
  const presentationObjects = options.includePresentation
    ? countPresentationObjects(actors)
    : null;
  const totalTicks = Math.max(1, Math.floor(options.seconds / MATCH_TICK_DURATION));
  const warmupTicks = Math.min(totalTicks - 1, Math.floor(options.warmupSeconds / MATCH_TICK_DURATION));
  const measuredTicks = Math.max(1, totalTicks - warmupTicks);
  const metrics = {
    inputMs: [] as number[],
    simulationStepMs: [] as number[],
    presentationSyncMs: [] as number[],
    localFrameMs: [] as number[],
    networkSnapshotMs: [] as number[],
    networkJsonMs: [] as number[],
    fullSnapshotJsonMs: [] as number[]
  };
  const byteSamples = {
    networkSnapshotBytes: [] as number[],
    fullSnapshotBytes: [] as number[]
  };
  let snapshot: any = initialSnapshot;

  for (let tick = 0; tick < totalTicks; tick += 1) {
    const inputTiming = timeOperation(() => {
      simulation.setPlayerInput(HUMAN_SLOT, createIdleInput());
      for (const [botSlot, botController] of botControllers.entries()) {
        simulation.setPlayerInput(
          botSlot,
          botController.getInput(simulation, botSlot, HUMAN_SLOT, MATCH_TICK_DURATION)
        );
      }
    });

    const stepTiming = timeOperation(() => simulation.step(MATCH_TICK_DURATION, { includeWorldProps: false }));
    snapshot = {
      ...stepTiming.value,
      worldProps: staticWorldProps
    };

    const viewTiming = options.includePresentation
      ? timeOperation(() => syncPresentationActors(actors, snapshot))
      : { elapsedMs: 0 };

    if (tick < warmupTicks) {
      continue;
    }

    metrics.inputMs.push(inputTiming.elapsedMs);
    metrics.simulationStepMs.push(stepTiming.elapsedMs);
    metrics.presentationSyncMs.push(viewTiming.elapsedMs);
    metrics.localFrameMs.push(inputTiming.elapsedMs + stepTiming.elapsedMs + viewTiming.elapsedMs);

    const measuredIndex = tick - warmupTicks;
    if (measuredIndex % options.snapshotSampleEvery !== 0) {
      continue;
    }

    const networkSnapshotTiming = timeOperation(() => simulation.getNetworkSnapshot({ includeStatic: false }));
    const networkJsonTiming = timeOperation(() => JSON.stringify(networkSnapshotTiming.value));
    const fullSnapshotJsonTiming = timeOperation(() => JSON.stringify(snapshot));

    metrics.networkSnapshotMs.push(networkSnapshotTiming.elapsedMs);
    metrics.networkJsonMs.push(networkJsonTiming.elapsedMs);
    metrics.fullSnapshotJsonMs.push(fullSnapshotJsonTiming.elapsedMs);
    byteSamples.networkSnapshotBytes.push(Buffer.byteLength(networkJsonTiming.value, 'utf8'));
    byteSamples.fullSnapshotBytes.push(Buffer.byteLength(fullSnapshotJsonTiming.value, 'utf8'));
  }

  return {
    scenario: {
      mode: 'arena',
      stagePreset: options.stagePreset,
      botCount: options.botCount,
      playerCount: participants.length,
      seconds: options.seconds,
      warmupSeconds: options.warmupSeconds,
      ticks: totalTicks,
      measuredTicks,
      tickDurationMs: round(MATCH_TICK_DURATION * 1000),
      snapshotSampleEvery: options.snapshotSampleEvery,
      includePresentation: options.includePresentation
    },
    metrics: {
      input: summarizeMetric(metrics.inputMs),
      simulationStep: summarizeMetric(metrics.simulationStepMs),
      presentationSync: summarizeMetric(metrics.presentationSyncMs),
      localFrame: summarizeMetric(metrics.localFrameMs),
      networkSnapshot: summarizeMetric(metrics.networkSnapshotMs),
      networkJson: summarizeMetric(metrics.networkJsonMs),
      fullSnapshotJson: summarizeMetric(metrics.fullSnapshotJsonMs)
    },
    byteSizes: {
      networkSnapshot: summarizeByteMetric(byteSamples.networkSnapshotBytes),
      fullSnapshot: summarizeByteMetric(byteSamples.fullSnapshotBytes)
    },
    presentationObjects,
    finalState: {
      phase: snapshot.phase,
      tick: snapshot.tick,
      livingPlayers: (snapshot.players ?? []).filter((player) => player.connected && player.health > 0).length,
      trailCells: snapshot.trailCells?.length ?? 0,
      worldProps: staticWorldProps.length
    }
  };
}
