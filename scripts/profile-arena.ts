import { runArenaPerformanceProfile } from '../src/sim/ArenaPerformance.js';

function parseArgs(argv) {
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

  return args;
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

function getBoolean(args, key) {
  return args[key] === true || args[key] === 'true' || args[key] === '1';
}

function formatMs(metric) {
  return `avg ${metric.averageMs} ms · p95 ${metric.p95Ms} ms · max ${metric.maxMs} ms`;
}

function formatKb(metric) {
  const averageKb = Number((metric.averageBytes / 1024).toFixed(2));
  const p95Kb = Number((metric.p95Bytes / 1024).toFixed(2));
  const maxKb = Number((metric.maxBytes / 1024).toFixed(2));
  return `avg ${averageKb} KB · p95 ${p95Kb} KB · max ${maxKb} KB`;
}

function printSimulationProfile(metrics) {
  const buckets = metrics.simulationProfile?.buckets ?? {};
  const keys = Object.keys(buckets);
  if (keys.length === 0) {
    return;
  }

  const preferredOrder = [
    'total',
    'setup',
    'input',
    'worldPropCollision',
    'worldPropSupport',
    'powerupCollection',
    'supportApply',
    'combatInput',
    'broadphase',
    'bodyCollision',
    'stalks',
    'stalkPropObstacleQuery',
    'stalkObstacleFilter',
    'stalkRopeSim',
    'damage',
    'creatures',
    'snapshot'
  ];
  const orderedKeys = [
    ...preferredOrder.filter((key) => key in buckets),
    ...keys.filter((key) => !preferredOrder.includes(key)).sort()
  ];

  console.log('');
  console.log('simulation profile buckets:');
  for (const key of orderedKeys) {
    console.log(`  ${key.padEnd(22)} ${formatMs(buckets[key])}`);
  }
}

function checkThreshold(failures, label, actual, limit) {
  if (!Number.isFinite(limit)) {
    return;
  }

  if (actual > limit) {
    failures.push(`${label} ${actual} > ${limit}`);
  }
}

function evaluateThresholds(result, args) {
  const failures: string[] = [];
  checkThreshold(
    failures,
    'localFrame.averageMs',
    result.metrics.localFrame.averageMs,
    getNumber(args, 'max-local-frame-avg-ms')
  );
  checkThreshold(
    failures,
    'localFrame.p95Ms',
    result.metrics.localFrame.p95Ms,
    getNumber(args, 'max-local-frame-p95-ms')
  );
  checkThreshold(
    failures,
    'simulationStep.averageMs',
    result.metrics.simulationStep.averageMs,
    getNumber(args, 'max-sim-step-avg-ms')
  );
  checkThreshold(
    failures,
    'simulationStep.p95Ms',
    result.metrics.simulationStep.p95Ms,
    getNumber(args, 'max-sim-step-p95-ms')
  );
  checkThreshold(
    failures,
    'presentationSync.averageMs',
    result.metrics.presentationSync.averageMs,
    getNumber(args, 'max-presentation-avg-ms')
  );
  checkThreshold(
    failures,
    'presentationSync.p95Ms',
    result.metrics.presentationSync.p95Ms,
    getNumber(args, 'max-presentation-p95-ms')
  );
  checkThreshold(
    failures,
    'fullSnapshot.averageKB',
    result.byteSizes.fullSnapshot.averageBytes / 1024,
    getNumber(args, 'max-full-snapshot-avg-kb')
  );
  checkThreshold(
    failures,
    'networkSnapshot.averageKB',
    result.byteSizes.networkSnapshot.averageBytes / 1024,
    getNumber(args, 'max-network-snapshot-avg-kb')
  );
  if ((result.diagnostics?.validationFailureCount ?? 0) > 0) {
    failures.push(`validation failures ${result.diagnostics.validationFailureCount} > 0`);
  }
  return failures;
}

function printHumanSummary(result) {
  const { scenario, metrics, byteSizes, presentationObjects, finalState, inputCoverage, diagnostics } = result;
  console.log(`Arena performance profile: ${scenario.botCount} bots, ${scenario.seconds}s (${scenario.measuredTicks} measured ticks)`);
  console.log(`stage ${scenario.stagePreset} · input ${scenario.inputMode} · stalk ${scenario.stalkAuthorityMode ?? 'rope'} · sim profile ${scenario.simulationProfileLevel ?? 'off'} · presentation ${scenario.includePresentation ? 'on' : 'off'} · sample every ${scenario.snapshotSampleEvery} ticks`);
  console.log('');
  console.log(`local frame:       ${formatMs(metrics.localFrame)}`);
  console.log(`input:             ${formatMs(metrics.input)}`);
  console.log(`simulation step:   ${formatMs(metrics.simulationStep)}`);
  console.log(`presentation sync: ${formatMs(metrics.presentationSync)}`);
  console.log(`network snapshot:  ${formatMs(metrics.networkSnapshot)} · ${formatKb(byteSizes.networkSnapshot)}`);
  console.log(`full snapshot JSON:${formatMs(metrics.fullSnapshotJson)} · ${formatKb(byteSizes.fullSnapshot)}`);
  if (presentationObjects) {
    console.log('');
    console.log(`presentation objects: ${presentationObjects.actors} actors · ${presentationObjects.meshCount} meshes · ${presentationObjects.visibleMeshCount} visible meshes`);
  }
  printSimulationProfile(metrics);
  if (inputCoverage) {
    console.log('');
    console.log(`input coverage: movement ${inputCoverage.movementTicks}/${inputCoverage.totalTicks} ticks · lock-on ${inputCoverage.lockOnTicks} · stalk ${inputCoverage.stalkHeldTicks} · jumps ${inputCoverage.jumpPresses} · reach ${inputCoverage.reachTicks}`);
  }
  if ((diagnostics?.validationFailureCount ?? 0) > 0) {
    console.log('');
    console.log(`validation failures: ${diagnostics.validationFailureCount}`);
    for (const failure of diagnostics.validationFailures ?? []) {
      console.log(`- ${failure}`);
    }
  }
  console.log(`final: ${finalState.phase} · tick ${finalState.tick} · living ${finalState.livingPlayers} · trails ${finalState.trailCells} · props ${finalState.worldProps}`);
}

const args = parseArgs(process.argv.slice(2));
const result = runArenaPerformanceProfile({
  botCount: getNumber(args, 'bots'),
  seconds: getNumber(args, 'seconds'),
  warmupSeconds: getNumber(args, 'warmup'),
  snapshotSampleEvery: getNumber(args, 'snapshot-every'),
  stagePreset: getString(args, 'stage'),
  inputMode: getString(args, 'input'),
  stalkAuthority: getString(args, 'stalk-authority'),
  simulationProfileLevel: getString(args, 'sim-profile', getString(args, 'sim-profile-level')),
  includePresentation: !getBoolean(args, 'no-presentation')
});
const failures = evaluateThresholds(result, args);

if (getBoolean(args, 'json')) {
  console.log(JSON.stringify({ ...result, failures }, null, 2));
} else {
  printHumanSummary(result);
  if (failures.length > 0) {
    console.error('');
    console.error('Performance thresholds failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
  }
}

if (failures.length > 0) {
  process.exitCode = 1;
}
