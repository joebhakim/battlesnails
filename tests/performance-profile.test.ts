import test from 'node:test';
import assert from 'node:assert/strict';

import { runArenaPerformanceProfile } from '../src/sim/ArenaPerformance.js';

test('arena performance profile reports finite headless frame buckets', () => {
  const profile = runArenaPerformanceProfile({
    botCount: 2,
    seconds: 0.2,
    warmupSeconds: 0.05,
    snapshotSampleEvery: 2
  });

  assert.equal(profile.scenario.mode, 'arena');
  assert.equal(profile.scenario.botCount, 2);
  assert.equal(profile.scenario.inputMode, 'mixed-15s');
  assert.equal(profile.presentationObjects.actors, 3);
  assert(profile.presentationObjects.meshCount > 0);
  assert(profile.metrics.localFrame.samples > 0);
  assert(Number.isFinite(profile.metrics.localFrame.averageMs));
  assert(Number.isFinite(profile.metrics.simulationStep.averageMs));
  assert(Number.isFinite(profile.metrics.presentationSync.averageMs));
  assert(profile.byteSizes.fullSnapshot.averageBytes > profile.byteSizes.networkSnapshot.averageBytes);
  assert.equal(profile.diagnostics.validationFailureCount, 0);
  assert(profile.inputCoverage.movementTicks > 0);
});

test('headless mixed arena input covers movement, navigation, swinging, reach, and jumps within fifteen seconds', () => {
  const profile = runArenaPerformanceProfile({
    botCount: 1,
    seconds: 15,
    warmupSeconds: 0,
    snapshotSampleEvery: 60,
    includePresentation: false
  });

  assert.equal(profile.scenario.inputMode, 'mixed-15s');
  assert.equal(profile.scenario.ticks, 900);
  assert.equal(profile.diagnostics.validationFailureCount, 0);
  assert(profile.inputCoverage.movementTicks > 0);
  assert(profile.inputCoverage.lockOnTicks > 0);
  assert(profile.inputCoverage.freeTurnTicks > 0);
  assert(profile.inputCoverage.stalkHeldTicks > 0);
  assert(profile.inputCoverage.dualStalkTicks > 0);
  assert(profile.inputCoverage.leftOnlyTicks > 0);
  assert(profile.inputCoverage.rightOnlyTicks > 0);
  assert(profile.inputCoverage.jumpPresses > 0);
  assert(profile.inputCoverage.reachTicks > 0);
});
