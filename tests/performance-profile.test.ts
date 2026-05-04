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
  assert.equal(profile.presentationObjects.actors, 3);
  assert(profile.presentationObjects.meshCount > 0);
  assert(profile.metrics.localFrame.samples > 0);
  assert(Number.isFinite(profile.metrics.localFrame.averageMs));
  assert(Number.isFinite(profile.metrics.simulationStep.averageMs));
  assert(Number.isFinite(profile.metrics.presentationSync.averageMs));
  assert(profile.byteSizes.fullSnapshot.averageBytes > profile.byteSizes.networkSnapshot.averageBytes);
});
