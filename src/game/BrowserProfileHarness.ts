import { ExplorerSession } from './ExplorerSession.js';
import { ProfileArenaSession, normalizeProfileArenaOptions } from './ProfileArenaSession.js';
import { TestSession } from './TestSession.js';

const DEFAULT_MAX_SAMPLES = 60000;
const DEFAULT_SIMULATION_PROFILE_LEVEL = 'off';

function normalizeSimulationProfileLevel(value: any = DEFAULT_SIMULATION_PROFILE_LEVEL) {
  const normalized = String(value ?? DEFAULT_SIMULATION_PROFILE_LEVEL).toLowerCase().replace(/-/g, '_');
  if (normalized === 'basic' || normalized === 'coarse' || normalized === '1') {
    return 'basic';
  }

  if (normalized === 'detailed' || normalized === 'detail' || normalized === 'full' || normalized === '2') {
    return 'detailed';
  }

  return 'off';
}

function createVolatileStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
    removeItem(key: string) {
      values.delete(key);
    }
  };
}

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

function aggregateSimulationProfileSamples(profileSamples: any[] = []) {
  if (profileSamples.length === 0) {
    return null;
  }

  const buckets = {};
  const counts = {};
  for (const sample of profileSamples) {
    for (const [bucket, value] of Object.entries(sample?.buckets ?? {})) {
      if (Number.isFinite(value)) {
        buckets[bucket] = (buckets[bucket] ?? 0) + value;
      }
    }
    for (const [counter, value] of Object.entries(sample?.counts ?? {})) {
      if (Number.isFinite(value)) {
        counts[counter] = (counts[counter] ?? 0) + value;
      }
    }
  }

  return {
    level: profileSamples[profileSamples.length - 1]?.level ?? null,
    ticks: profileSamples.length,
    buckets,
    counts
  };
}

function setSessionSimulationProfileLevel(session, level) {
  const simulation = session?.simulation;
  if (!simulation?.setSimulationProfileLevel) {
    return;
  }

  if (simulation.getSimulationProfileLevel?.() !== level) {
    simulation.setSimulationProfileLevel(level);
  }
}

function drainSessionSimulationProfileSamples(session) {
  return session?.simulation?.drainSimulationProfileSamples?.() ?? [];
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
  let restoreInputDriver: any = null;
  let latestUpdateMs = 0;
  let latestSessionUpdateMs = 0;
  let latestViewSyncMs = 0;
  let latestTicksAdvanced = 0;
  let latestDeltaSeconds = 0;
  let latestSimulationProfile: any = null;
  let lastRenderTimestampMs = null;
  let latestSceneCounts = countSceneObjects(game.scene?.scene);
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
    latestSimulationProfile = null;
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

  function uninstallInputDriver() {
    if (!restoreInputDriver) {
      return;
    }

    restoreInputDriver();
    restoreInputDriver = null;
  }

  function installInputDriver(rawOptions: any = {}) {
    uninstallInputDriver();

    const mode = rawOptions.mode ?? 'idle';
    if (mode === 'none') {
      return { mode };
    }

    const originalBuildLocalInput = game.buildLocalInput;
    const startTimeMs = performance.now();
    let lastJumpBucket = -1;

    game.buildLocalInput = function profileBuildLocalInput() {
      const elapsedSeconds = (performance.now() - startTimeMs) / 1000;
      const baseInput = {
        moveX: 0,
        moveZ: 0,
        jumpPressed: false,
        interactPressed: false,
        lockOnHeld: false,
        lookX: 0,
        lookY: 0,
        turnX: 0,
        reachDelta: 0,
        leftHeld: false,
        rightHeld: false
      };
      const jumpBucket = Math.floor(elapsedSeconds / 3.25);
      const shouldJump = jumpBucket !== lastJumpBucket && elapsedSeconds > 0.5;
      if (shouldJump) {
        lastJumpBucket = jumpBucket;
      }

      if (mode === 'idle') {
        return baseInput;
      }

      if (mode === 'walk') {
        return {
          ...baseInput,
          moveZ: -1
        };
      }

      if (mode === 'random-lock' || mode === 'locked-roam' || mode === 'combat-lock') {
        const stalkPulse = Math.sin(elapsedSeconds * 1.7) > -0.25;
        return {
          ...baseInput,
          moveX: Math.sin(elapsedSeconds * 0.91) * 0.85,
          moveZ: -0.55 + Math.sin(elapsedSeconds * 0.37) * 0.45,
          lockOnHeld: true,
          lookX: Math.sin(elapsedSeconds * 7.3) * 14 + Math.sin(elapsedSeconds * 2.1) * 8,
          lookY: Math.cos(elapsedSeconds * 5.1) * 10,
          reachDelta: Math.sin(elapsedSeconds * 1.3) * 0.35,
          leftHeld: stalkPulse,
          rightHeld: Math.cos(elapsedSeconds * 1.1) > -0.1,
          jumpPressed: shouldJump
        };
      }

      return {
        ...baseInput,
        moveX: Math.sin(elapsedSeconds * 0.42) * 0.5,
        moveZ: -0.85,
        turnX: Math.sin(elapsedSeconds * 0.55) * 0.75,
        jumpPressed: shouldJump
      };
    };

    restoreInputDriver = () => {
      game.buildLocalInput = originalBuildLocalInput;
    };

    return { mode };
  }

  function installFrameProfiler(rawOptions: any = {}) {
    uninstallFrameProfiler();
    resetSamples();

    const options = {
      glFinish: rawOptions.glFinish !== false,
      maxSamples: Math.max(1, Math.floor(Number(rawOptions.maxSamples) || DEFAULT_MAX_SAMPLES)),
      sceneSampleEvery: Math.max(1, Math.floor(Number(rawOptions.sceneSampleEvery) || 10)),
      simulationProfileLevel: normalizeSimulationProfileLevel(rawOptions.simulationProfileLevel ?? rawOptions.simProfileLevel)
    };
    const originalUpdate = game.update;
    const originalRender = game.renderer.render;

    game.update = function profileUpdate(delta) {
      const start = performance.now();
      const session = game.currentSession;
      setSessionSimulationProfileLevel(session, options.simulationProfileLevel);
      if (options.simulationProfileLevel !== 'off') {
        drainSessionSimulationProfileSamples(session);
      }
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
        latestSimulationProfile = options.simulationProfileLevel === 'off'
          ? null
          : aggregateSimulationProfileSamples(drainSessionSimulationProfileSamples(session));
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
      if (frameIndex === 1 || frameIndex % options.sceneSampleEvery === 0) {
        latestSceneCounts = countSceneObjects(scene);
      }

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
        simulationProfile: latestSimulationProfile,
        rendererStats: getRendererStats(renderer),
        sceneCounts: latestSceneCounts
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
      maxSamples: options.maxSamples,
      sceneSampleEvery: options.sceneSampleEvery
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
    startAdventure(rawOptions: any = {}) {
      game.enterSession(new ExplorerSession({
        seed: rawOptions.seed,
        npcCount: rawOptions.npcCount
      }));
      return {
        options: {
          seed: rawOptions.seed ?? null,
          npcCount: rawOptions.npcCount ?? 0
        },
        state: getProfileState(game)
      };
    },
    startTest(rawOptions: any = {}) {
      const session = new TestSession({
        storage: createVolatileStorage(),
        stalkAuthority: rawOptions.stalkAuthority ?? rawOptions.stalkAuthorityMode
      });
      const nextTuning = {
        ...session.getTuningConfig(),
        terrainPreset: rawOptions.stagePreset ?? rawOptions.terrainPreset ?? session.getTuningConfig().terrainPreset,
        botCount: rawOptions.botCount ?? rawOptions.bots ?? session.getTuningConfig().botCount,
        arenaRadius: rawOptions.arenaRadius ?? session.getTuningConfig().arenaRadius
      };
      session.setTuningConfig(nextTuning);
      game.enterSession(session);
      return {
        options: {
          stagePreset: nextTuning.terrainPreset,
          botCount: nextTuning.botCount,
          arenaRadius: nextTuning.arenaRadius,
          stalkAuthority: rawOptions.stalkAuthority ?? rawOptions.stalkAuthorityMode ?? null
        },
        state: getProfileState(game)
      };
    },
    startAssetStudio(rawOptions: any = {}) {
      const assetStudio = game.startAssetStudio(rawOptions);
      return {
        ...assetStudio,
        state: getProfileState(game)
      };
    },
    installFrameProfiler,
    uninstallFrameProfiler,
    installInputDriver,
    uninstallInputDriver,
    resetSamples,
    getSamples() {
      return samples.slice();
    },
    getState() {
      return getProfileState(game);
    },
    dispose() {
      uninstallFrameProfiler();
      uninstallInputDriver();
      resetSamples();
    }
  };
}
