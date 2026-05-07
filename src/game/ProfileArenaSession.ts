import { BotController } from '../sim/BotController.js';
import { createArenaEnvironment } from '../sim/ArenaEnvironment.js';
import { normalizePlayerInput } from '../protocol/InputProtocol.js';
import {
  MATCH_TICK_DURATION,
  MatchSimulation,
  normalizeStalkAuthorityMode
} from '../sim/MatchSimulation.js';
import { DEFAULT_TUNING_CONFIG, createBotControllerConfig, normalizeTuningConfig } from '../sim/Tuning.js';
import { ARENA_TERRAIN_PRESET_OPTIONS, DEFAULT_TERRAIN_CONFIG } from '../world/Terrain.js';
import { accumulateFixedStepTime, getFixedStepCount } from './FixedStepClock.js';

const LOCAL_SLOT = 1;
const DEFAULT_PROFILE_BOT_COUNT = 40;
const MAX_PROFILE_BOT_COUNT = 120;
const VALID_STAGE_PRESETS = new Set(ARENA_TERRAIN_PRESET_OPTIONS.map((option) => option.value));

function clampInteger(value, fallback, min, max) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(numericValue)));
}

function normalizeOptionalStalkAuthorityMode(rawOptions: any) {
  const value = rawOptions.stalkAuthorityMode ?? rawOptions.stalkAuthority;
  return value === undefined ? undefined : normalizeStalkAuthorityMode(value);
}

export function normalizeProfileArenaOptions(rawOptions: any = {}) {
  return {
    botCount: clampInteger(rawOptions.botCount ?? rawOptions.bots, DEFAULT_PROFILE_BOT_COUNT, 0, MAX_PROFILE_BOT_COUNT),
    stagePreset: VALID_STAGE_PRESETS.has(rawOptions.stagePreset)
      ? rawOptions.stagePreset
      : DEFAULT_TERRAIN_CONFIG.preset,
    stalkAuthorityMode: normalizeOptionalStalkAuthorityMode(rawOptions)
  };
}

function createProfileParticipants(botCount) {
  return [
    { slot: LOCAL_SLOT, profile: 'human', connected: true },
    ...Array.from({ length: botCount }, (_, index) => ({
      slot: index + 2,
      profile: 'bot',
      connected: true
    }))
  ];
}

export class ProfileArenaSession {
  declare accumulator: any;
  declare botControllers: any;
  declare localSlot: any;
  declare mode: any;
  declare options: any;
  declare simulation: any;
  declare snapshot: any;
  declare staticWorldProps: any;
  declare tuningConfig: any;
  constructor(options: any = {}) {
    this.mode = 'singleplayer';
    this.localSlot = LOCAL_SLOT;
    this.accumulator = 0;
    this.options = normalizeProfileArenaOptions(options);
    this.botControllers = new Map();
    this.snapshot = null;
    this.staticWorldProps = [];

    this.rebuildSimulation();
  }

  rebuildSimulation() {
    const participants = createProfileParticipants(this.options.botCount);
    this.tuningConfig = normalizeTuningConfig({
      ...DEFAULT_TUNING_CONFIG,
      terrainPreset: this.options.stagePreset,
      botCount: this.options.botCount,
      playerMaxHealth: 2000,
      botMaxHealth: 2000
    });
    const environment = createArenaEnvironment({ stagePreset: this.options.stagePreset });

    this.simulation = new MatchSimulation({
      mode: 'singleplayer',
      players: participants,
      tuning: this.tuningConfig,
      terrainConfig: environment?.terrainConfig,
      arenaRadius: environment?.arenaRadius,
      worldBounds: environment?.worldBounds,
      worldProps: environment?.worldProps,
      stalkAuthorityMode: this.options.stalkAuthorityMode
    });

    const botControllerConfig = createBotControllerConfig(this.tuningConfig);
    this.botControllers.clear();
    for (const participant of participants) {
      if (participant.profile === 'bot') {
        this.botControllers.set(participant.slot, new BotController(botControllerConfig));
      }
    }

    this.snapshot = this.simulation.getSnapshot();
    this.staticWorldProps = this.snapshot.worldProps ?? [];
    this.accumulator = 0;
  }

  update(delta, localInput) {
    this.accumulator = accumulateFixedStepTime(this.accumulator, delta, MATCH_TICK_DURATION);
    const steps = getFixedStepCount(this.accumulator, MATCH_TICK_DURATION);

    if (this.simulation.phase !== 'running') {
      this.snapshot = {
        ...this.simulation.getSnapshot({ includeWorldProps: false }),
        worldProps: this.staticWorldProps
      };
      this.accumulator = 0;
      return;
    }

    if (steps === 0) {
      return;
    }

    const dividedInput = normalizePlayerInput({
      ...localInput,
      lookX: localInput.lookX / steps,
      lookY: localInput.lookY / steps,
      turnX: localInput.turnX / steps,
      reachDelta: localInput.reachDelta / steps,
      leftHeld: localInput.leftHeld,
      rightHeld: localInput.rightHeld
    });

    for (let index = 0; index < steps && this.accumulator >= MATCH_TICK_DURATION; index += 1) {
      this.simulation.setPlayerInput(this.localSlot, {
        ...dividedInput,
        jumpPressed: index === 0 && localInput.jumpPressed,
        interactPressed: index === 0 && localInput.interactPressed
      });
      for (const [botSlot, botController] of this.botControllers.entries()) {
        this.simulation.setPlayerInput(
          botSlot,
          botController.getInput(this.simulation, botSlot, this.localSlot, MATCH_TICK_DURATION)
        );
      }
      this.snapshot = {
        ...this.simulation.step(MATCH_TICK_DURATION, { includeWorldProps: false }),
        worldProps: this.staticWorldProps
      };
      this.accumulator -= MATCH_TICK_DURATION;
    }
  }

  leave() { }

  resetArena() {
    this.rebuildSimulation();
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
    const enemies = this.getOtherPlayerStates();
    const livingEnemies = enemies.filter((player) => player.connected && player.health > 0);
    const pool = livingEnemies.length > 0 ? livingEnemies : enemies;
    if (pool.length === 0) {
      return null;
    }

    if (!localPlayer) {
      return pool[0];
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
      opponent: targetState && this.getOtherPlayerStates().length > 1 ? 'Nearest Profile Bot' : 'Profile Bot'
    };
  }

  getDefaultOpponentMaxHealth() {
    return this.tuningConfig.botMaxHealth;
  }

  getOverlayState() {
    return null;
  }

  getConnectionState() {
    return 'profile-arena';
  }
}
