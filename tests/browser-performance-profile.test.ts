import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBrowserArenaProfileResult,
  evaluateBrowserArenaThresholds,
  parseBrowserArenaArgs
} from '../src/sim/BrowserArenaPerformance.js';

function createSample(frameIndex, overrides: any = {}) {
  return {
    frameIndex,
    timestampMs: frameIndex * 16,
    deltaSeconds: 1 / 60,
    updateMs: 4,
    sessionUpdateMs: 3,
    viewSyncMs: 1,
    ticksAdvanced: 1,
    sessionMsPerTick: 3,
    renderCpuMs: 2,
    renderFinishMs: 3,
    finishOnlyMs: 1,
    gameFrameMs: 7,
    rafIntervalMs: frameIndex === 1 ? null : 16,
    rendererStats: {
      calls: 180,
      triangles: 42000,
      points: 0,
      lines: 0,
      geometries: 120,
      textures: 8
    },
    sceneCounts: {
      objectCount: 900,
      meshCount: 780,
      visibleMeshCount: 760,
      materialCount: 800
    },
    ...overrides
  };
}

test('browser arena profile arguments default to gl.finish and stable viewport', () => {
  const options = parseBrowserArenaArgs(['--bots', '40', '--seconds=3', '--warmup', '0.5', '--json']);

  assert.equal(options.botCount, 40);
  assert.equal(options.seconds, 3);
  assert.equal(options.warmupSeconds, 0.5);
  assert.equal(options.glFinish, true);
  assert.equal(options.json, true);
  assert.equal(options.width, 1280);
  assert.equal(options.height, 720);
  assert.equal(options.deviceScaleFactor, 1);
});

test('browser arena profile report summarizes draw and frame metrics', () => {
  const result = createBrowserArenaProfileResult({
    options: {
      botCount: 2,
      stagePreset: 'plane',
      seconds: 1,
      warmupSeconds: 0.1,
      glFinish: true,
      gl: 'default',
      width: 1280,
      height: 720,
      deviceScaleFactor: 1
    },
    samples: [
      createSample(1),
      createSample(2, { updateMs: 5, renderFinishMs: 4, gameFrameMs: 9 }),
      createSample(3, { updateMs: 6, renderFinishMs: 5, gameFrameMs: 11, rendererStats: { calls: 200, triangles: 50000 } })
    ],
    finalState: {
      snapshot: {
        phase: 'running',
        tick: 120,
        playerCount: 3,
        livingPlayers: 3,
        trailCells: 12,
        worldProps: 0
      }
    },
    startedFromUrl: 'http://127.0.0.1:5173/?profile=1'
  });

  assert.equal(result.scenario.mode, 'browser-arena');
  assert.equal(result.samples, 3);
  assert.equal(result.metrics.renderFinish.p95Ms, 5);
  assert.equal(result.metrics.update.maxMs, 6);
  assert.equal(result.metrics.sessionUpdate.averageMs, 3);
  assert.equal(result.simulationCadence.ticksAdvanced.max, 1);
  assert.equal(result.rendererStats.drawCalls.max, 200);
  assert.equal(result.rendererStats.triangles.max, 50000);
  assert.equal(result.finalState.snapshot.tick, 120);
});

test('browser arena profile thresholds report failures', () => {
  const result = createBrowserArenaProfileResult({
    options: {
      botCount: 1,
      stagePreset: 'plane',
      seconds: 1,
      warmupSeconds: 0,
      glFinish: true,
      gl: 'default',
      width: 1280,
      height: 720,
      deviceScaleFactor: 1
    },
    samples: [createSample(1), createSample(2, { renderFinishMs: 12, gameFrameMs: 18 })],
    finalState: { snapshot: { phase: 'running', tick: 60 } },
    startedFromUrl: 'http://127.0.0.1:5173/?profile=1'
  });

  const failures = evaluateBrowserArenaThresholds(result, {
    maxRenderP95Ms: 8,
    maxFrameP95Ms: 15,
    maxUpdateP95Ms: 10,
    maxDrawCalls: 1000,
    maxTriangles: 100000,
    minFps: 1
  });

  assert.deepEqual(failures, [
    'renderFinish.p95Ms 12 > 8',
    'gameFrame.p95Ms 18 > 15'
  ]);
});
