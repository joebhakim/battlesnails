const DEFAULT_BOT_COUNT = 40;
const DEFAULT_SECONDS = 8;
const DEFAULT_WARMUP_SECONDS = 1;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_DEVICE_SCALE_FACTOR = 1;
const DEFAULT_SCENE_SAMPLE_EVERY = 10;

function normalizeBrowserProfileMode(value) {
  if (value === 'adventure' || value === 'explorer' || value === 'explore') {
    return 'adventure';
  }

  if (value === 'test' || value === 'testmode' || value === 'lab') {
    return 'test';
  }

  return 'arena';
}

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

export function summarizeMetric(samples) {
  const finiteSamples = samples.filter((value) => Number.isFinite(value));
  const sorted = [...finiteSamples].sort((left, right) => left - right);
  const total = finiteSamples.reduce((sum, value) => sum + value, 0);
  return {
    samples: finiteSamples.length,
    totalMs: round(total),
    averageMs: round(finiteSamples.length > 0 ? total / finiteSamples.length : 0),
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    maxMs: round(sorted[sorted.length - 1] ?? 0)
  };
}

function summarizeCount(samples) {
  const finiteSamples = samples.filter((value) => Number.isFinite(value));
  const sorted = [...finiteSamples].sort((left, right) => left - right);
  const total = finiteSamples.reduce((sum, value) => sum + value, 0);
  return {
    samples: finiteSamples.length,
    average: round(finiteSamples.length > 0 ? total / finiteSamples.length : 0),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted[sorted.length - 1] ?? 0)
  };
}

function getNumber(args, key, fallback = undefined) {
  if (!(key in args)) {
    return fallback;
  }

  const value = Number(args[key]);
  return Number.isFinite(value) ? value : fallback;
}

function getString(args, key, fallback = undefined) {
  return typeof args[key] === 'string' ? args[key] : fallback;
}

function getBoolean(args, key, fallback = false) {
  if (!(key in args)) {
    return fallback;
  }

  return args[key] === true || args[key] === 'true' || args[key] === '1';
}

export function parseBrowserArenaArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split('=');
    const nextToken = argv[index + 1];
    const value = inlineValue !== undefined
      ? inlineValue
      : nextToken && !nextToken.startsWith('--')
        ? argv[++index]
        : true;
    args[rawKey] = value;
  }

  const glFinish = 'gl-finish' in args
    ? getBoolean(args, 'gl-finish', true)
    : !getBoolean(args, 'no-gl-finish');
  const mode = normalizeBrowserProfileMode(getString(args, 'mode', 'arena'));
  const defaultInputMode = mode === 'adventure' || mode === 'test' ? 'roam' : 'idle';
  const botCount = clampInteger(getNumber(args, 'bots'), DEFAULT_BOT_COUNT, 0, 120);
  const npcCount = mode === 'adventure'
    ? clampInteger(getNumber(args, 'npcs', getNumber(args, 'bots', 0)), 0, 0, 120)
    : 0;

  return {
    rawArgs: args,
    mode,
    botCount,
    npcCount,
    seconds: clampNumber(getNumber(args, 'seconds'), DEFAULT_SECONDS, 0.1, 300),
    warmupSeconds: clampNumber(getNumber(args, 'warmup'), DEFAULT_WARMUP_SECONDS, 0, 60),
    stagePreset: getString(args, 'stage', undefined),
    arenaRadius: getNumber(args, 'arena-radius', undefined),
    seed: clampInteger(getNumber(args, 'seed'), 137, 0, Number.MAX_SAFE_INTEGER),
    inputMode: getString(args, 'input', defaultInputMode),
    stalkAuthority: getString(args, 'stalk-authority', undefined),
    chromiumPath: getString(args, 'chromium-path', undefined),
    url: getString(args, 'url', undefined),
    glFinish,
    headful: getBoolean(args, 'headful'),
    json: getBoolean(args, 'json'),
    verbose: getBoolean(args, 'verbose'),
    gl: getString(args, 'gl', 'default'),
    width: clampInteger(getNumber(args, 'width'), DEFAULT_WIDTH, 320, 7680),
    height: clampInteger(getNumber(args, 'height'), DEFAULT_HEIGHT, 240, 4320),
    deviceScaleFactor: clampNumber(getNumber(args, 'device-scale-factor'), DEFAULT_DEVICE_SCALE_FACTOR, 0.5, 4),
    sceneSampleEvery: clampInteger(getNumber(args, 'scene-sample-every'), DEFAULT_SCENE_SAMPLE_EVERY, 1, 600),
    thresholds: {
      maxRenderP95Ms: getNumber(args, 'max-render-p95-ms'),
      maxFrameP95Ms: getNumber(args, 'max-frame-p95-ms'),
      maxUpdateP95Ms: getNumber(args, 'max-update-p95-ms'),
      maxProjected120P95Ms: getNumber(args, 'max-projected-120-p95-ms'),
      maxDrawCalls: getNumber(args, 'max-draw-calls'),
      maxTriangles: getNumber(args, 'max-triangles'),
      minFps: getNumber(args, 'min-fps')
    }
  };
}

function getSampleValues(samples, key) {
  return samples
    .map((sample) => sample?.[key])
    .filter((value) => Number.isFinite(value));
}

function getNestedSampleValues(samples, containerKey, key) {
  return samples
    .map((sample) => sample?.[containerKey]?.[key])
    .filter((value) => Number.isFinite(value));
}

function getEffectiveFps(samples) {
  if (samples.length < 2) {
    return 0;
  }

  const first = samples[0].timestampMs;
  const last = samples[samples.length - 1].timestampMs;
  const elapsedSeconds = (last - first) / 1000;
  if (elapsedSeconds <= 0) {
    return 0;
  }

  return (samples.length - 1) / elapsedSeconds;
}

function getProjected120FrameSamples(samples) {
  return samples
    .map((sample) => {
      const sessionPerTick = sample?.sessionMsPerTick;
      const viewSyncMs = sample?.viewSyncMs;
      const ticksAdvanced = sample?.ticksAdvanced;
      const renderFinishMs = sample?.renderFinishMs;
      if (
        !Number.isFinite(sessionPerTick) ||
        !Number.isFinite(viewSyncMs) ||
        !Number.isFinite(ticksAdvanced) ||
        !Number.isFinite(renderFinishMs)
      ) {
        return null;
      }

      const perTickViewSync = ticksAdvanced > 0 ? viewSyncMs / ticksAdvanced : viewSyncMs;
      return sessionPerTick + perTickViewSync + renderFinishMs;
    })
    .filter((value) => Number.isFinite(value));
}

export function createBrowserArenaProfileResult({ options, samples, finalState, startedFromUrl }) {
  const rafIntervals = getSampleValues(samples, 'rafIntervalMs');
  const longFrameCount = rafIntervals.filter((value) => value > 50).length;
  const effectiveFps = getEffectiveFps(samples);
  const finalSnapshot = finalState?.snapshot ?? null;

  return {
    scenario: {
      mode: `browser-${options.mode ?? 'arena'}`,
      botCount: options.botCount,
      npcCount: options.npcCount ?? 0,
      playerCount: finalSnapshot?.playerCount ?? options.botCount + 1,
      stagePreset: options.stagePreset ?? null,
      arenaRadius: options.mode === 'test' ? options.arenaRadius ?? null : null,
      stalkAuthority: options.stalkAuthority ?? null,
      seed: options.mode === 'adventure' ? options.seed : null,
      inputMode: options.inputMode,
      seconds: options.seconds,
      warmupSeconds: options.warmupSeconds,
      glFinish: options.glFinish,
      headless: !options.headful,
      gl: options.gl,
      sceneSampleEvery: options.sceneSampleEvery,
      viewport: {
        width: options.width,
        height: options.height,
        deviceScaleFactor: options.deviceScaleFactor
      },
      startedFromUrl
    },
    samples: samples.length,
    frameRate: {
      effectiveFps: round(effectiveFps),
      interval: summarizeMetric(rafIntervals),
      longFramesOver50Ms: longFrameCount
    },
    metrics: {
      update: summarizeMetric(getSampleValues(samples, 'updateMs')),
      sessionUpdate: summarizeMetric(getSampleValues(samples, 'sessionUpdateMs')),
      viewSync: summarizeMetric(getSampleValues(samples, 'viewSyncMs')),
      sessionMsPerTick: summarizeMetric(getSampleValues(samples, 'sessionMsPerTick')),
      renderCpu: summarizeMetric(getSampleValues(samples, 'renderCpuMs')),
      renderFinish: summarizeMetric(getSampleValues(samples, 'renderFinishMs')),
      finishOnly: summarizeMetric(getSampleValues(samples, 'finishOnlyMs')),
      projected120Frame: summarizeMetric(getProjected120FrameSamples(samples)),
      gameFrame: summarizeMetric(getSampleValues(samples, 'gameFrameMs'))
    },
    rendererStats: {
      drawCalls: summarizeCount(getNestedSampleValues(samples, 'rendererStats', 'calls')),
      triangles: summarizeCount(getNestedSampleValues(samples, 'rendererStats', 'triangles')),
      points: summarizeCount(getNestedSampleValues(samples, 'rendererStats', 'points')),
      lines: summarizeCount(getNestedSampleValues(samples, 'rendererStats', 'lines')),
      geometries: summarizeCount(getNestedSampleValues(samples, 'rendererStats', 'geometries')),
      textures: summarizeCount(getNestedSampleValues(samples, 'rendererStats', 'textures'))
    },
    simulationCadence: {
      ticksAdvanced: summarizeCount(getSampleValues(samples, 'ticksAdvanced'))
    },
    sceneCounts: {
      objects: summarizeCount(getNestedSampleValues(samples, 'sceneCounts', 'objectCount')),
      meshes: summarizeCount(getNestedSampleValues(samples, 'sceneCounts', 'meshCount')),
      visibleMeshes: summarizeCount(getNestedSampleValues(samples, 'sceneCounts', 'visibleMeshCount')),
      materials: summarizeCount(getNestedSampleValues(samples, 'sceneCounts', 'materialCount'))
    },
    finalState
  };
}

function checkUpperThreshold(failures, label, actual, limit) {
  if (!Number.isFinite(limit)) {
    return;
  }

  if (actual > limit) {
    failures.push(`${label} ${actual} > ${limit}`);
  }
}

function checkLowerThreshold(failures, label, actual, limit) {
  if (!Number.isFinite(limit)) {
    return;
  }

  if (actual < limit) {
    failures.push(`${label} ${actual} < ${limit}`);
  }
}

export function evaluateBrowserArenaThresholds(result, thresholds) {
  const failures: string[] = [];
  checkUpperThreshold(failures, 'renderFinish.p95Ms', result.metrics.renderFinish.p95Ms, thresholds.maxRenderP95Ms);
  checkUpperThreshold(failures, 'gameFrame.p95Ms', result.metrics.gameFrame.p95Ms, thresholds.maxFrameP95Ms);
  checkUpperThreshold(failures, 'update.p95Ms', result.metrics.update.p95Ms, thresholds.maxUpdateP95Ms);
  checkUpperThreshold(failures, 'projected120Frame.p95Ms', result.metrics.projected120Frame.p95Ms, thresholds.maxProjected120P95Ms);
  checkUpperThreshold(failures, 'drawCalls.max', result.rendererStats.drawCalls.max, thresholds.maxDrawCalls);
  checkUpperThreshold(failures, 'triangles.max', result.rendererStats.triangles.max, thresholds.maxTriangles);
  checkLowerThreshold(failures, 'effectiveFps', result.frameRate.effectiveFps, thresholds.minFps);
  return failures;
}

function formatMs(metric) {
  return `avg ${metric.averageMs} ms · p95 ${metric.p95Ms} ms · max ${metric.maxMs} ms`;
}

export function formatBrowserArenaProfile(result, failures: string[] = []) {
  const modeLabel = result.scenario.mode === 'browser-adventure'
    ? 'Adventure'
    : result.scenario.mode === 'browser-test'
      ? 'Test Mode'
      : 'Arena';
  const stageOrSeed = result.scenario.mode === 'browser-adventure'
    ? `seed ${result.scenario.seed}`
    : `stage ${result.scenario.stagePreset ?? 'default'}`;
  const population = result.scenario.mode === 'browser-adventure'
    ? `npcs ${result.scenario.npcCount ?? 0}`
    : result.scenario.mode === 'browser-test'
      ? `bots ${result.scenario.botCount}`
      : `bots ${result.scenario.botCount}`;
  const lines = [
    `Browser ${modeLabel} profile: ${result.scenario.seconds}s (${result.samples} frames)`,
    `${stageOrSeed} · ${population} · input ${result.scenario.inputMode ?? 'idle'} · stalk ${result.scenario.stalkAuthority ?? 'default'} · viewport ${result.scenario.viewport.width}x${result.scenario.viewport.height}@${result.scenario.viewport.deviceScaleFactor} · gl.finish ${result.scenario.glFinish ? 'on' : 'off'}`,
    '',
    `fps:               ${result.frameRate.effectiveFps} effective · interval ${formatMs(result.frameRate.interval)} · >50ms ${result.frameRate.longFramesOver50Ms}`,
    `update:            ${formatMs(result.metrics.update)}`,
    `session update:    ${formatMs(result.metrics.sessionUpdate)} · per tick ${formatMs(result.metrics.sessionMsPerTick)}`,
    `view/UI sync:      ${formatMs(result.metrics.viewSync)}`,
    `render CPU:        ${formatMs(result.metrics.renderCpu)}`,
    `render + finish:   ${formatMs(result.metrics.renderFinish)}`,
    `finish only:       ${formatMs(result.metrics.finishOnly)}`,
    `projected 120 Hz:  ${formatMs(result.metrics.projected120Frame)}`,
    `game frame:        ${formatMs(result.metrics.gameFrame)}`,
    '',
    `draw calls:        avg ${result.rendererStats.drawCalls.average} · p95 ${result.rendererStats.drawCalls.p95} · max ${result.rendererStats.drawCalls.max}`,
    `triangles:         avg ${result.rendererStats.triangles.average} · p95 ${result.rendererStats.triangles.p95} · max ${result.rendererStats.triangles.max}`,
    `ticks/frame:       avg ${result.simulationCadence.ticksAdvanced.average} · p95 ${result.simulationCadence.ticksAdvanced.p95} · max ${result.simulationCadence.ticksAdvanced.max}`,
    `scene meshes:      avg ${result.sceneCounts.meshes.average} · visible avg ${result.sceneCounts.visibleMeshes.average}`,
    `final:             ${result.finalState?.snapshot?.phase ?? 'unknown'} · tick ${result.finalState?.snapshot?.tick ?? 'n/a'} · living ${result.finalState?.snapshot?.livingPlayers ?? 'n/a'} · props ${result.finalState?.snapshot?.worldProps ?? 'n/a'}`
  ];

  if (failures.length > 0) {
    lines.push('', 'Performance thresholds failed:');
    for (const failure of failures) {
      lines.push(`- ${failure}`);
    }
  }

  return lines.join('\n');
}
