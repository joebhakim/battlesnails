import { ProfileArenaSession, normalizeProfileArenaOptions } from './ProfileArenaSession.js';

const DEFAULT_MAX_SAMPLES = 60000;

function countSceneObjects(scene) {
  const counts = {
    objectCount: 0,
    meshCount: 0,
    visibleMeshCount: 0,
    materialCount: 0
  };

  scene?.traverse?.((object) => {
    counts.objectCount += 1;
    if (!object.isMesh) {
      return;
    }

    counts.meshCount += 1;
    counts.visibleMeshCount += object.visible ? 1 : 0;
    counts.materialCount += Array.isArray(object.material) ? object.material.length : 1;
  });

  return counts;
}

function getRendererStats(renderer) {
  const info = renderer?.info;
  return {
    calls: info?.render?.calls ?? 0,
    triangles: info?.render?.triangles ?? 0,
    points: info?.render?.points ?? 0,
    lines: info?.render?.lines ?? 0,
    geometries: info?.memory?.geometries ?? 0,
    textures: info?.memory?.textures ?? 0,
    programs: Array.isArray(info?.programs) ? info.programs.length : 0
  };
}

function getProfileState(game) {
  const snapshot = game.currentSession?.getSnapshot?.() ?? null;
  const renderer = game.renderer?.renderer ?? null;

  return {
    connectionState: game.currentSession?.getConnectionState?.() ?? 'none',
    rendererProfile: game.renderer?.profileId ?? null,
    rendererStats: getRendererStats(renderer),
    sceneCounts: countSceneObjects(game.scene?.scene),
    snapshot: snapshot
      ? {
        phase: snapshot.phase,
        tick: snapshot.tick,
        playerCount: snapshot.players?.length ?? 0,
        livingPlayers: snapshot.players?.filter((player) => player.connected && player.health > 0).length ?? 0,
        trailCells: snapshot.trailCells?.length ?? 0,
        worldProps: snapshot.worldProps?.length ?? 0
      }
      : null
  };
}

export function installBrowserProfileHarness(game) {
  let samples: any[] = [];
  let restoreProfiler: any = null;
  let latestUpdateMs = 0;
  let latestSessionUpdateMs = 0;
  let latestViewSyncMs = 0;
  let latestTicksAdvanced = 0;
  let latestDeltaSeconds = 0;
  let lastRenderTimestampMs = null;
  let frameIndex = 0;

  function trimSamples(maxSamples) {
    if (samples.length <= maxSamples) {
      return;
    }

    samples.splice(0, samples.length - maxSamples);
  }

  function resetSamples() {
    samples = [];
    latestUpdateMs = 0;
    latestSessionUpdateMs = 0;
    latestViewSyncMs = 0;
    latestTicksAdvanced = 0;
    latestDeltaSeconds = 0;
    lastRenderTimestampMs = null;
    frameIndex = 0;
  }

  function uninstallFrameProfiler() {
    if (!restoreProfiler) {
      return;
    }

    restoreProfiler();
    restoreProfiler = null;
  }

  function installFrameProfiler(rawOptions: any = {}) {
    uninstallFrameProfiler();
    resetSamples();

    const options = {
      glFinish: rawOptions.glFinish !== false,
      maxSamples: Math.max(1, Math.floor(Number(rawOptions.maxSamples) || DEFAULT_MAX_SAMPLES))
    };
    const originalUpdate = game.update;
    const originalRender = game.renderer.render;

    game.update = function profileUpdate(delta) {
      const start = performance.now();
      const session = game.currentSession;
      const tickBefore = session?.getSnapshot?.()?.tick ?? null;
      let sessionUpdateMs = 0;
      let restoreSessionUpdate: any = null;

      if (session?.update) {
        const originalSessionUpdate = session.update;
        session.update = function profileSessionUpdate(...args) {
          const sessionStart = performance.now();
          try {
            return originalSessionUpdate.apply(session, args);
          } finally {
            sessionUpdateMs += performance.now() - sessionStart;
          }
        };
        restoreSessionUpdate = () => {
          session.update = originalSessionUpdate;
        };
      }

      try {
        return originalUpdate.call(game, delta);
      } finally {
        restoreSessionUpdate?.();
        const updateEnd = performance.now();
        const tickAfter = session?.getSnapshot?.()?.tick ?? null;
        latestUpdateMs = updateEnd - start;
        latestSessionUpdateMs = sessionUpdateMs;
        latestViewSyncMs = Math.max(0, latestUpdateMs - latestSessionUpdateMs);
        latestTicksAdvanced = Number.isFinite(tickBefore) && Number.isFinite(tickAfter)
          ? Math.max(0, tickAfter - tickBefore)
          : 0;
        latestDeltaSeconds = delta;
      }
    };

    game.renderer.render = function profileRender(scene, camera) {
      const renderer = game.renderer?.renderer ?? null;
      const gl = options.glFinish ? renderer?.getContext?.() : null;
      const renderStart = performance.now();
      const value = originalRender.call(game.renderer, scene, camera);
      const renderCpuEnd = performance.now();

      if (gl?.finish) {
        gl.finish();
      }

      const renderEnd = performance.now();
      const rafIntervalMs = lastRenderTimestampMs === null ? null : renderEnd - lastRenderTimestampMs;
      lastRenderTimestampMs = renderEnd;
      frameIndex += 1;

      samples.push({
        frameIndex,
        timestampMs: renderEnd,
        deltaSeconds: latestDeltaSeconds,
        updateMs: latestUpdateMs,
        sessionUpdateMs: latestSessionUpdateMs,
        viewSyncMs: latestViewSyncMs,
        ticksAdvanced: latestTicksAdvanced,
        sessionMsPerTick: latestTicksAdvanced > 0 ? latestSessionUpdateMs / latestTicksAdvanced : null,
        renderCpuMs: renderCpuEnd - renderStart,
        renderFinishMs: renderEnd - renderStart,
        finishOnlyMs: renderEnd - renderCpuEnd,
        gameFrameMs: latestUpdateMs + (renderEnd - renderStart),
        rafIntervalMs,
        rendererStats: getRendererStats(renderer),
        sceneCounts: countSceneObjects(scene)
      });
      trimSamples(options.maxSamples);

      return value;
    };

    restoreProfiler = () => {
      game.update = originalUpdate;
      game.renderer.render = originalRender;
    };

    return {
      glFinish: options.glFinish,
      maxSamples: options.maxSamples
    };
  }

  return {
    startArena(rawOptions: any = {}) {
      const options = normalizeProfileArenaOptions(rawOptions);
      game.enterSession(new ProfileArenaSession(options));
      return {
        options,
        state: getProfileState(game)
      };
    },
    installFrameProfiler,
    uninstallFrameProfiler,
    resetSamples,
    getSamples() {
      return samples.slice();
    },
    getState() {
      return getProfileState(game);
    },
    dispose() {
      uninstallFrameProfiler();
      resetSamples();
    }
  };
}
