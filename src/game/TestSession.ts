import { normalizePlayerInput } from '../protocol/InputProtocol.js';
import {
  MatchSimulation,
  MATCH_TICK_DURATION,
  normalizeStalkAuthorityMode
} from '../sim/MatchSimulation.js';
import {
  ANNOYING_LECTURER_DISPLAY_NAME,
  ANNOYING_LECTURER_SLOT,
  ANNOYING_LECTURER_SPEAKER_KIND,
  ANNOYING_LECTURER_VOICE_SOURCE,
  PROXIMITY_CHAT_MAX_DISTANCE,
  PROXIMITY_CHAT_TEST_DISTANCE
} from '../audio/ProximityChat.js';
import { getPlayerGroundHeight } from '../sim/MovementSupportSystem.js';
import {
  DEFAULT_TUNING_CONFIG,
  TUNING_SCHEMA,
  TUNING_STORAGE_KEY,
  getDefaultTuningConfig,
  hasStructuralTuningChanges,
  normalizeTuningConfig,
  createTerrainConfigFromTuning
} from '../sim/Tuning.js';
import { TEST_PLAYGROUND_FIXTURES } from '../sim/TestFixtures.js';
import { EXPLORER_TERRAIN_PRESET } from '../world/Terrain.js';
import { EXPLORER_DEFAULT_SEED, createExplorerWorld } from '../world/ExplorerWorld.js';
import { accumulateFixedStepTime, getFixedStepCount } from './FixedStepClock.js';

const LECTURER_CHASE_SPEED = 2.4;

function createAnnoyingLecturerParticipant(playerStart: any = { x: 0, z: 6, rotationY: Math.PI }) {
  const rotationY = Number.isFinite(playerStart.rotationY) ? playerStart.rotationY : Math.PI;
  const angle = rotationY + Math.PI * 0.58;
  return {
    slot: ANNOYING_LECTURER_SLOT,
    profile: 'bot',
    connected: true,
    immortal: true,
    displayName: ANNOYING_LECTURER_DISPLAY_NAME,
    speakerKind: ANNOYING_LECTURER_SPEAKER_KIND,
    portraitKey: ANNOYING_LECTURER_SPEAKER_KIND,
    voiceSource: ANNOYING_LECTURER_VOICE_SOURCE,
    position: {
      x: (playerStart.x ?? 0) + Math.sin(angle) * PROXIMITY_CHAT_TEST_DISTANCE,
      z: (playerStart.z ?? 6) + Math.cos(angle) * PROXIMITY_CHAT_TEST_DISTANCE
    },
    rotationY
  };
}

function createTestWorldForTuning(tuningConfig) {
  if (tuningConfig.terrainPreset === EXPLORER_TERRAIN_PRESET) {
    const world = createExplorerWorld(EXPLORER_DEFAULT_SEED);
    return {
      terrainConfig: world.terrainConfig,
      worldBounds: world.worldBounds,
      arenaRadius: world.worldBounds.radius,
      worldProps: world.props,
      creatures: world.creatures,
      playerStart: world.playerStart
    };
  }

  const terrainConfig = createTerrainConfigFromTuning(tuningConfig);
  return {
    terrainConfig,
    worldBounds: null,
    arenaRadius: terrainConfig.worldRadius,
    worldProps: [],
    creatures: [],
    playerStart: { x: 0, z: 6, rotationY: Math.PI }
  };
}

function getSafeStorage(storageOverride) {
  if (storageOverride) {
    return storageOverride;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function loadStoredTuningConfig(storage) {
  if (!storage?.getItem) {
    return getDefaultTuningConfig();
  }

  try {
    const raw = storage.getItem(TUNING_STORAGE_KEY);
    if (!raw) {
      return getDefaultTuningConfig();
    }

    return normalizeTuningConfig(JSON.parse(raw));
  } catch {
    return getDefaultTuningConfig();
  }
}

function saveStoredTuningConfig(storage, tuningConfig) {
  if (!storage?.setItem) {
    return;
  }

  storage.setItem(TUNING_STORAGE_KEY, JSON.stringify(tuningConfig));
}

function clearStoredTuningConfig(storage) {
  if (!storage?.removeItem) {
    return;
  }

  storage.removeItem(TUNING_STORAGE_KEY);
}

export class TestSession {
  declare localSlot: any;
  declare tuningConfig: any;
  declare accumulator: any;
  declare lastRebuilt: any;
  declare lecturerTime: any;
  declare mode: any;
  declare simulation: any;
  declare snapshot: any;
  declare stalkAuthorityMode: any;
  declare staticWorldProps: any[];
  declare storage: any;
  constructor(options: any = {}) {
    this.mode = 'test';
    this.localSlot = 1;
    this.accumulator = 0;
    this.storage = getSafeStorage(options.storage);
    this.stalkAuthorityMode = options.stalkAuthorityMode || options.stalkAuthority
      ? normalizeStalkAuthorityMode(options.stalkAuthorityMode ?? options.stalkAuthority)
      : undefined;
    this.tuningConfig = loadStoredTuningConfig(this.storage);
    this.snapshot = null;
    this.staticWorldProps = [];
    this.lastRebuilt = false;
    this.lecturerTime = 0;

    this.rebuildSimulation();
  }

  rebuildSimulation() {
    const testWorld = createTestWorldForTuning(this.tuningConfig);
    const participants = [
      {
        slot: this.localSlot,
        profile: 'human',
        connected: true,
        position: {
          x: testWorld.playerStart.x,
          z: testWorld.playerStart.z
        },
        rotationY: testWorld.playerStart.rotationY
      },
      createAnnoyingLecturerParticipant(testWorld.playerStart),
      ...TEST_PLAYGROUND_FIXTURES,
      ...Array.from({ length: this.tuningConfig.botCount }, (_, index) => ({
        slot: index + 2,
        profile: 'bot',
        connected: true
      }))
    ];

    this.simulation = new MatchSimulation({
      mode: 'test',
      players: participants,
      tuning: this.tuningConfig,
      terrainConfig: testWorld.terrainConfig,
      arenaRadius: testWorld.arenaRadius,
      worldBounds: testWorld.worldBounds,
      worldProps: testWorld.worldProps,
      creatures: testWorld.creatures,
      stalkAuthorityMode: this.stalkAuthorityMode
    });

    this.snapshot = this.simulation.getSnapshot();
    this.staticWorldProps = this.snapshot.worldProps ?? [];
    this.accumulator = 0;
    this.lastRebuilt = true;
    this.lecturerTime = 0;
  }

  updateAnnoyingLecturer(delta) {
    const player = this.simulation?.getPlayerState?.(this.localSlot);
    const lecturer = this.simulation?.getPlayerState?.(ANNOYING_LECTURER_SLOT);
    if (!player?.position || !lecturer?.position || player.health <= 0) {
      return;
    }

    this.lecturerTime += delta;
    const targetDistance = PROXIMITY_CHAT_TEST_DISTANCE;
    const angle = player.rotationY + Math.PI * 0.58 + Math.sin(this.lecturerTime * 0.75) * 0.16;
    const desiredX = player.position.x + Math.sin(angle) * targetDistance;
    const desiredZ = player.position.z + Math.cos(angle) * targetDistance;
    const offsetX = desiredX - lecturer.position.x;
    const offsetZ = desiredZ - lecturer.position.z;
    const desiredDelta = Math.hypot(offsetX, offsetZ);

    lecturer.previousPosition.copy(lecturer.position);
    if (desiredDelta > 0.0001) {
      const chaseDistance = Math.min(desiredDelta, LECTURER_CHASE_SPEED * delta);
      lecturer.position.x += (offsetX / desiredDelta) * chaseDistance;
      lecturer.position.z += (offsetZ / desiredDelta) * chaseDistance;
    }

    this.simulation.clampPlanarPosition?.(lecturer);
    lecturer.position.y = getPlayerGroundHeight(lecturer, this.simulation.terrainConfig);
    lecturer.rotationY = Math.atan2(
      player.position.x - lecturer.position.x,
      player.position.z - lecturer.position.z
    );
    lecturer.health = lecturer.maxHealth;
    lecturer.controlMode = 'idle';
    lecturer.controlIntensity = 0;
    lecturer.lockOnHeld = false;
  }

  syncConsumedPowerups(events: any[] = []) {
    const consumedIds = events
      .filter((event) => event.type === 'powerup' && event.propId)
      .map((event) => event.propId);
    if (consumedIds.length === 0) {
      return;
    }

    const consumedSet = new Set(consumedIds);
    this.staticWorldProps = this.staticWorldProps.filter((prop) => !consumedSet.has(prop.id));
  }

  update(delta, localInput) {
    this.accumulator = accumulateFixedStepTime(this.accumulator, delta, MATCH_TICK_DURATION);
    const steps = getFixedStepCount(this.accumulator, MATCH_TICK_DURATION);
    if (steps === 0) {
      return;
    }

    const dividedInput = normalizePlayerInput({
      ...localInput,
      lookX: localInput.lookX / steps,
      lookY: localInput.lookY / steps,
      turnX: localInput.turnX / steps,
      reachDelta: localInput.reachDelta / steps
    });

    for (let index = 0; index < steps && this.accumulator >= MATCH_TICK_DURATION; index += 1) {
      this.simulation.setPlayerInput(this.localSlot, {
        ...dividedInput,
        jumpPressed: index === 0 && localInput.jumpPressed,
        interactPressed: index === 0 && localInput.interactPressed
      });

      this.snapshot = {
        ...this.simulation.step(MATCH_TICK_DURATION, { includeWorldProps: false }),
        worldProps: this.staticWorldProps
      };
      this.updateAnnoyingLecturer(MATCH_TICK_DURATION);
      this.snapshot = {
        ...this.simulation.getSnapshot({ includeWorldProps: false }),
        worldProps: this.staticWorldProps
      };
      this.syncConsumedPowerups(this.snapshot.events ?? []);
      this.snapshot.worldProps = this.staticWorldProps;
      this.accumulator -= MATCH_TICK_DURATION;
    }
  }

  leave() { }

  resetArena() {
    this.rebuildSimulation();
  }

  resetToDefaults() {
    this.tuningConfig = getDefaultTuningConfig();
    clearStoredTuningConfig(this.storage);
    this.rebuildSimulation();
  }

  setTuningValue(id, value) {
    const nextConfig = normalizeTuningConfig({
      ...this.tuningConfig,
      [id]: value
    });

    return this.setTuningConfig(nextConfig);
  }

  setTuningConfig(nextConfig) {
    const normalized = normalizeTuningConfig(nextConfig);
    const rebuilt = hasStructuralTuningChanges(this.tuningConfig, normalized);

    this.tuningConfig = normalized;
    saveStoredTuningConfig(this.storage, this.tuningConfig);

    if (rebuilt) {
      this.rebuildSimulation();
      return { rebuilt: true };
    }

    this.simulation.setTuningConfig(this.tuningConfig);
    this.snapshot = {
      ...this.simulation.getSnapshot({ includeWorldProps: false }),
      worldProps: this.staticWorldProps
    };
    this.lastRebuilt = false;
    return { rebuilt: false };
  }

  consumeLastRebuildFlag() {
    const rebuilt = this.lastRebuilt;
    this.lastRebuilt = false;
    return rebuilt;
  }

  getSnapshot() {
    return this.snapshot;
  }

  grantDebugResource(type, amount) {
    const applied = this.simulation?.grantPowerupToSlot?.(this.localSlot, type, amount, `Debug ${type}`) ?? false;
    if (!applied) {
      return false;
    }

    this.snapshot = {
      ...this.simulation.getSnapshot({ includeWorldProps: false }),
      worldProps: this.staticWorldProps
    };
    return true;
  }

  getLocalSlot() {
    return this.localSlot;
  }

  getLocalPlayerState() {
    return this.snapshot?.players.find((player) => player.slot === this.localSlot) ?? null;
  }

  getOtherPlayerStates() {
    return this.snapshot?.players.filter((player) => player.slot !== this.localSlot) ?? [];
  }

  getOpponentPlayerState() {
    return this.getFocusTargetState();
  }

  getFocusTargetState() {
    const localPlayer = this.getLocalPlayerState();
    const others = this.getOtherPlayerStates();
    if (others.length === 0) {
      return null;
    }

    const livingOthers = others.filter((player) => player.connected && player.health > 0);
    const pool = livingOthers.length > 0 ? livingOthers : others;
    if (!localPlayer) {
      return pool[0] ?? null;
    }

    return pool.reduce((nearest, player) => {
      if (!nearest) {
        return player;
      }

      const nearestDistance = (
        (nearest.position.x - localPlayer.position.x) ** 2 +
        (nearest.position.z - localPlayer.position.z) ** 2
      );
      const candidateDistance = (
        (player.position.x - localPlayer.position.x) ** 2 +
        (player.position.z - localPlayer.position.z) ** 2
      );
      return candidateDistance < nearestDistance ? player : nearest;
    }, null);
  }

  getHudLabels(targetState = this.getFocusTargetState()) {
    return {
      opponent: targetState?.displayName
        ? `${targetState.displayName}${targetState.immortal ? ' (infinite health)' : ''}`
        : targetState?.profileName === 'bot'
          ? 'Target'
          : 'Opponent'
    };
  }

  getOverlayState() {
    return null;
  }

  getConnectionState() {
    return 'test';
  }

  getDefaultOpponentMaxHealth() {
    return this.tuningConfig.botMaxHealth ?? DEFAULT_TUNING_CONFIG.botMaxHealth;
  }

  getTuningSchema() {
    return TUNING_SCHEMA;
  }

  getTuningConfig() {
    return { ...this.tuningConfig };
  }

  getTestPanelState() {
    const localPlayer = this.getLocalPlayerState();
    const bots = this.snapshot?.players.filter((player) => (
      player.profileName === 'bot' &&
      player.speakerKind !== ANNOYING_LECTURER_SPEAKER_KIND
    )) ?? [];
    const fixtures = this.snapshot?.players.filter((player) => player.profileName === 'fixture') ?? [];
    const livingBots = bots.filter((player) => player.health > 0).length;

    return {
      playerAlive: Boolean(localPlayer && localPlayer.health > 0),
      livingBots,
      totalBots: bots.length,
      fixtures: fixtures.length,
      storedLocally: Boolean(this.storage),
      values: this.getTuningConfig()
    };
  }
}
