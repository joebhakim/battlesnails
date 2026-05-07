import { performance } from 'node:perf_hooks';

import { NPCSnail } from '../entities/NPCSnail.js';
import { PlayerSnail } from '../entities/PlayerSnail.js';
import { DEFAULT_TERRAIN_CONFIG } from '../world/Terrain.js';
import { createIdleInput } from '../protocol/InputProtocol.js';
import { createArenaEnvironment } from './ArenaEnvironment.js';
import { BotController } from './BotController.js';
import {
  MATCH_TICK_DURATION,
  MatchSimulation,
  normalizeSimulationProfileLevel,
  normalizeStalkAuthorityMode
} from './MatchSimulation.js';
import {
  DEFAULT_TUNING_CONFIG,
  createBotControllerConfig,
  normalizeTuningConfig
} from './Tuning.js';

const HUMAN_SLOT = 1;
const DEFAULT_BOT_COUNT = 40;
const DEFAULT_PROFILE_SECONDS = 15;
const DEFAULT_WARMUP_SECONDS = 1;
const DEFAULT_SNAPSHOT_SAMPLE_EVERY = 10;
const DEFAULT_INPUT_MODE = 'mixed-15s';
const PROFILE_INPUT_MODES = new Set(['idle', 'walk', 'mixed-15s', 'mixed', 'stress']);

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

function summarizeMetricMap(samplesByKey) {
  const summaries = {};
  for (const [key, samples] of samplesByKey.entries()) {
    summaries[key] = summarizeMetric(samples);
  }
  return summaries;
}

function recordSimulationProfileSamples(samples, bucketSamples, countSamples) {
  for (const sample of samples ?? []) {
    for (const [bucket, value] of Object.entries(sample?.buckets ?? {})) {
      if (!Number.isFinite(value)) {
        continue;
      }

      if (!bucketSamples.has(bucket)) {
        bucketSamples.set(bucket, []);
      }
      bucketSamples.get(bucket).push(value);
    }

    for (const [counter, value] of Object.entries(sample?.counts ?? {})) {
      if (!Number.isFinite(value)) {
        continue;
      }

      if (!countSamples.has(counter)) {
        countSamples.set(counter, []);
      }
      countSamples.get(counter).push(value);
    }
  }
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
    { slot: HUMAN_SLOT, profile: 'human', connected: true, immortal: true },
    ...Array.from({ length: botCount }, (_, index) => ({
      slot: index + 2,
      profile: 'bot',
      connected: true,
      immortal: true
    }))
  ];
}

function normalizeInputMode(value) {
  const mode = String(value ?? DEFAULT_INPUT_MODE);
  return PROFILE_INPUT_MODES.has(mode) ? mode : DEFAULT_INPUT_MODE;
}

function smoothstep(value) {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - (2 * t));
}

function hashUnit(seed) {
  const value = Math.sin(seed * 127.1) * 43758.5453123;
  return value - Math.floor(value);
}

function hashSigned(seed) {
  return (hashUnit(seed) * 2) - 1;
}

function smoothNoise(elapsedSeconds, channel, period) {
  const scaled = elapsedSeconds / period;
  const bucket = Math.floor(scaled);
  const alpha = smoothstep(scaled - bucket);
  const left = hashSigned((bucket * 19.91) + (channel * 37.17));
  const right = hashSigned(((bucket + 1) * 19.91) + (channel * 37.17));
  return left + ((right - left) * alpha);
}

function clampUnitVector2(x, z) {
  const length = Math.hypot(x, z);
  if (length <= 1 || length <= 0.000001) {
    return { x, z };
  }

  return {
    x: x / length,
    z: z / length
  };
}

function getPulse(elapsedSeconds, previousElapsedSeconds, interval, offset = 0) {
  if (elapsedSeconds < offset) {
    return false;
  }

  return Math.floor((elapsedSeconds - offset) / interval) !==
    Math.floor((previousElapsedSeconds - offset) / interval);
}

function createNavigationVector(simulation, elapsedSeconds, randomX, randomZ) {
  const player = simulation.getPlayerState(HUMAN_SLOT);
  const target = player ? simulation.findPreferredTarget(player) : null;
  if (!player || !target) {
    return clampUnitVector2(randomX, randomZ);
  }

  const dx = target.position.x - player.position.x;
  const dz = target.position.z - player.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 0.000001) {
    return clampUnitVector2(randomX, randomZ);
  }

  const forwardX = dx / distance;
  const forwardZ = dz / distance;
  const sideX = forwardZ;
  const sideZ = -forwardX;
  const approach = distance > 13
    ? 0.95
    : distance < 6
      ? -0.75
      : Math.sin(elapsedSeconds * 0.73) * 0.35;
  const orbit = (Math.sin(elapsedSeconds * 1.07) > 0 ? 1 : -1) * 0.65;

  return clampUnitVector2(
    (forwardX * approach) + (sideX * orbit) + (randomX * 0.22),
    (forwardZ * approach) + (sideZ * orbit) + (randomZ * 0.22)
  );
}

export function createHeadlessArenaInput({
  inputMode = DEFAULT_INPUT_MODE,
  simulation,
  tick = 0,
  delta = MATCH_TICK_DURATION
}: any = {}) {
  const mode = normalizeInputMode(inputMode);
  if (mode === 'idle') {
    return createIdleInput();
  }

  const elapsedSeconds = tick * delta;
  const previousElapsedSeconds = Math.max(0, elapsedSeconds - delta);
  const baseInput = createIdleInput();
  const randomX = smoothNoise(elapsedSeconds, 1, 0.85);
  const randomZ = smoothNoise(elapsedSeconds, 2, 0.95);
  const jumpPressed = getPulse(elapsedSeconds, previousElapsedSeconds, 1.55, 0.55);

  if (mode === 'walk') {
    return {
      ...baseInput,
      moveZ: -1,
      jumpPressed
    };
  }

  const phase = (elapsedSeconds % 15) / 15;
  const navigation = createNavigationVector(simulation, elapsedSeconds, randomX, randomZ);
  const freeMove = clampUnitVector2(
    (randomX * 0.85) + (Math.sin(elapsedSeconds * 0.47) * 0.25),
    (randomZ * 0.85) - 0.2
  );
  const combatMove = clampUnitVector2(
    (navigation.x * 0.75) + (Math.sin(elapsedSeconds * 1.91) * 0.3),
    (navigation.z * 0.75) + (Math.cos(elapsedSeconds * 1.37) * 0.25)
  );
  const navigating = phase >= 0.18 && phase < 0.72;
  const combat = phase >= 0.36 && phase < 0.9;
  const movement = navigating ? (combat ? combatMove : navigation) : freeMove;
  const stalkBurst = combat || Math.sin(elapsedSeconds * 1.6) > 0.55;
  const leftHeld = stalkBurst && Math.sin(elapsedSeconds * 1.31) > -0.72;
  const rightHeld = stalkBurst && Math.cos(elapsedSeconds * 1.17) > -0.72;
  const jerkX = smoothNoise(elapsedSeconds, 10, 0.18) * 15;
  const jerkY = smoothNoise(elapsedSeconds, 11, 0.22) * 11;
  const strikePulse = getPulse(elapsedSeconds, previousElapsedSeconds, 0.72, 0.34)
    ? hashSigned(Math.floor(elapsedSeconds / 0.72) + 301) * 18
    : 0;
  const reachDelta = getPulse(elapsedSeconds, previousElapsedSeconds, 1.05, 0.2)
    ? hashSigned(Math.floor(elapsedSeconds / 1.05) + 811) * 2.2
    : 0;

  return {
    ...baseInput,
    moveX: movement.x,
    moveZ: movement.z,
    lockOnHeld: navigating || combat,
    turnX: navigating ? 0 : (smoothNoise(elapsedSeconds, 8, 0.7) * 15),
    lookX: leftHeld || rightHeld
      ? (Math.sin(elapsedSeconds * 8.9) * 12) + jerkX + strikePulse
      : 0,
    lookY: leftHeld || rightHeld
      ? (Math.cos(elapsedSeconds * 6.1) * 8) + jerkY
      : 0,
    reachDelta,
    jumpPressed,
    leftHeld,
    rightHeld
  };
}

function createInputCoverage() {
  return {
    totalTicks: 0,
    movementTicks: 0,
    lockOnTicks: 0,
    freeTurnTicks: 0,
    jumpPresses: 0,
    stalkHeldTicks: 0,
    dualStalkTicks: 0,
    leftOnlyTicks: 0,
    rightOnlyTicks: 0,
    reachTicks: 0
  };
}

function recordInputCoverage(coverage, input) {
  coverage.totalTicks += 1;
  if (Math.hypot(input.moveX, input.moveZ) > 0.001) {
    coverage.movementTicks += 1;
  }
  if (input.lockOnHeld) {
    coverage.lockOnTicks += 1;
  }
  if (Math.abs(input.turnX) > 0.001) {
    coverage.freeTurnTicks += 1;
  }
  if (input.jumpPressed) {
    coverage.jumpPresses += 1;
  }
  if (input.leftHeld || input.rightHeld) {
    coverage.stalkHeldTicks += 1;
  }
  if (input.leftHeld && input.rightHeld) {
    coverage.dualStalkTicks += 1;
  } else if (input.leftHeld) {
    coverage.leftOnlyTicks += 1;
  } else if (input.rightHeld) {
    coverage.rightOnlyTicks += 1;
  }
  if (Math.abs(input.reachDelta) > 0.001) {
    coverage.reachTicks += 1;
  }
}

function createDiagnostics() {
  return {
    validationFailureCount: 0,
    validationFailures: [] as string[]
  };
}

function recordValidationFailure(diagnostics, message) {
  diagnostics.validationFailureCount += 1;
  if (diagnostics.validationFailures.length < 20) {
    diagnostics.validationFailures.push(message);
  }
}

function isFiniteNumber(value) {
  return Number.isFinite(value) && Math.abs(value) < 1000000;
}

function validateNumber(diagnostics, label, value) {
  if (!isFiniteNumber(value)) {
    recordValidationFailure(diagnostics, `${label} is ${value}`);
  }
}

function validateVector(diagnostics, label, vector) {
  if (!vector) {
    recordValidationFailure(diagnostics, `${label} is missing`);
    return;
  }

  validateNumber(diagnostics, `${label}.x`, vector.x);
  validateNumber(diagnostics, `${label}.y`, vector.y);
  validateNumber(diagnostics, `${label}.z`, vector.z);
}

function validateSnapshot(snapshot, diagnostics, { includeTrails = false } = {}) {
  validateNumber(diagnostics, 'snapshot.tick', snapshot?.tick);
  for (const player of snapshot?.players ?? []) {
    const label = `tick ${snapshot.tick} player ${player.slot}`;
    validateVector(diagnostics, `${label} position`, player.position);
    validateVector(diagnostics, `${label} supportNormal`, player.supportNormal);
    validateNumber(diagnostics, `${label} rotationY`, player.rotationY);
    validateNumber(diagnostics, `${label} health`, player.health);
    validateNumber(diagnostics, `${label} impactPower`, player.impactPower);

    for (const side of ['left', 'right']) {
      const stalk = player.stalks?.[side];
      validateVector(diagnostics, `${label} ${side} targetVector`, stalk?.targetVector);
      validateVector(diagnostics, `${label} ${side} currentVector`, stalk?.currentVector);
      validateVector(diagnostics, `${label} ${side} tipPosition`, stalk?.tipPosition);
      validateVector(diagnostics, `${label} ${side} tipVelocity`, stalk?.tipVelocity);
      for (const [nodeIndex, node] of (stalk?.nodes ?? []).entries()) {
        validateVector(diagnostics, `${label} ${side} node ${nodeIndex}`, node);
      }
    }
  }

  for (const [eventIndex, event] of (snapshot?.events ?? []).entries()) {
    if ('amount' in event) {
      validateNumber(diagnostics, `tick ${snapshot.tick} event ${eventIndex} amount`, event.amount);
    }
    if (event.position) {
      validateVector(diagnostics, `tick ${snapshot.tick} event ${eventIndex} position`, event.position);
    }
  }

  if (includeTrails) {
    for (const [cellIndex, cell] of (snapshot?.trailCells ?? []).entries()) {
      validateNumber(diagnostics, `tick ${snapshot.tick} trail ${cellIndex}.x`, cell.x);
      validateNumber(diagnostics, `tick ${snapshot.tick} trail ${cellIndex}.z`, cell.z);
    }
  }
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
  const inputMode = normalizeInputMode(rawOptions.inputMode ?? rawOptions.input);
  const rawStalkAuthorityMode = rawOptions.stalkAuthorityMode ?? rawOptions.stalkAuthority;
  const stalkAuthorityMode = rawStalkAuthorityMode === undefined
    ? undefined
    : normalizeStalkAuthorityMode(rawStalkAuthorityMode);
  const simulationProfileLevel = normalizeSimulationProfileLevel(
    rawOptions.simulationProfileLevel ?? rawOptions.simProfileLevel ?? rawOptions.simProfile
  );

  return {
    botCount,
    seconds,
    warmupSeconds,
    snapshotSampleEvery,
    stagePreset,
    inputMode,
    stalkAuthorityMode,
    simulationProfileLevel,
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
    worldBounds: environment?.worldBounds,
    worldProps: environment?.worldProps,
    stalkAuthorityMode: options.stalkAuthorityMode,
    simulationProfileLevel: options.simulationProfileLevel
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
  const simulationProfileBucketSamples = new Map<string, number[]>();
  const simulationProfileCountSamples = new Map<string, number[]>();
  const inputCoverage = createInputCoverage();
  const diagnostics = createDiagnostics();
  let snapshot: any = initialSnapshot;

  for (let tick = 0; tick < totalTicks; tick += 1) {
    const inputTiming = timeOperation(() => {
      const humanInput = createHeadlessArenaInput({
        inputMode: options.inputMode,
        simulation,
        tick,
        delta: MATCH_TICK_DURATION
      });
      recordInputCoverage(inputCoverage, humanInput);
      simulation.setPlayerInput(HUMAN_SLOT, humanInput);
      for (const [botSlot, botController] of botControllers.entries()) {
        simulation.setPlayerInput(
          botSlot,
          botController.getInput(simulation, botSlot, HUMAN_SLOT, MATCH_TICK_DURATION)
        );
      }
    });

    const stepTiming = timeOperation(() => simulation.step(MATCH_TICK_DURATION, { includeWorldProps: false }));
    const stepProfileSamples = simulation.drainSimulationProfileSamples();
    snapshot = {
      ...stepTiming.value,
      worldProps: staticWorldProps
    };
    validateSnapshot(snapshot, diagnostics, { includeTrails: tick % 60 === 0 });

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
    recordSimulationProfileSamples(
      stepProfileSamples,
      simulationProfileBucketSamples,
      simulationProfileCountSamples
    );

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
      inputMode: options.inputMode,
      stalkAuthorityMode: simulation.stalkAuthorityMode,
      botCount: options.botCount,
      playerCount: participants.length,
      seconds: options.seconds,
      warmupSeconds: options.warmupSeconds,
      ticks: totalTicks,
      measuredTicks,
      tickDurationMs: round(MATCH_TICK_DURATION * 1000),
      snapshotSampleEvery: options.snapshotSampleEvery,
      simulationProfileLevel: options.simulationProfileLevel,
      includePresentation: options.includePresentation
    },
    metrics: {
      input: summarizeMetric(metrics.inputMs),
      simulationStep: summarizeMetric(metrics.simulationStepMs),
      presentationSync: summarizeMetric(metrics.presentationSyncMs),
      localFrame: summarizeMetric(metrics.localFrameMs),
      networkSnapshot: summarizeMetric(metrics.networkSnapshotMs),
      networkJson: summarizeMetric(metrics.networkJsonMs),
      fullSnapshotJson: summarizeMetric(metrics.fullSnapshotJsonMs),
      simulationProfile: {
        buckets: summarizeMetricMap(simulationProfileBucketSamples),
        counts: summarizeMetricMap(simulationProfileCountSamples)
      }
    },
    inputCoverage,
    diagnostics,
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
