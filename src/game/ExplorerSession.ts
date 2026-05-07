import { BotController } from '../sim/BotController.js';
import { normalizePlayerInput } from '../protocol/InputProtocol.js';
import { MatchSimulation, MATCH_TICK_DURATION } from '../sim/MatchSimulation.js';
import {
  DEFAULT_TUNING_CONFIG,
  createBotControllerConfig,
  normalizeTuningConfig
} from '../sim/Tuning.js';
import {
  EXPLORER_BOSS_SLOT,
  EXPLORER_DEFAULT_SEED,
  createExplorerWorld
} from '../world/ExplorerWorld.js';
import { getTerrainHeight } from '../world/Terrain.js';
import { accumulateFixedStepTime, getFixedStepCount } from './FixedStepClock.js';

const FORAGE_DURATION = 180;
const TRIAL_DURATION = 75;
export const HUNT_OPTIONS_STORAGE_KEY = 'battlesnails:hunt-options-v1';
export const DEFAULT_HUNT_OPTIONS = Object.freeze({
  npcCount: 4,
  npcStrength: 5
});
export const HUNT_OPTIONS_SCHEMA: ReadonlyArray<any> = Object.freeze([
  Object.freeze({
    id: 'npcCount',
    label: 'NPC Snails',
    section: 'Setup',
    defaultValue: DEFAULT_HUNT_OPTIONS.npcCount,
    structural: true,
    kind: 'choice',
    options: Array.from({ length: 16 }, (_, index) => ({
      value: `${index + 1}`,
      label: `${index + 1}`
    }))
  }),
  Object.freeze({
    id: 'npcStrength',
    label: 'Strength',
    section: 'Setup',
    defaultValue: DEFAULT_HUNT_OPTIONS.npcStrength,
    structural: true,
    kind: 'choice',
    options: Array.from({ length: 9 }, (_, index) => ({
      value: `${index + 1}`,
      label: `${index + 1}`
    }))
  })
]);
const TRIAL_KINDS = Object.freeze([
  'dew_rush',
  'salt_bowl',
  'shell_derby',
  'feast_frenzy',
  'high_leaf',
  'bird_panic',
  'calcium_crown'
]);

const TRIAL_COPY = Object.freeze({
  dew_rush: {
    title: 'Dew Rush',
    objective: 'Reach the Dawn Dew before the wet window closes.'
  },
  salt_bowl: {
    title: 'Salt Bowl',
    objective: 'Stay inside the shrinking moss ring.'
  },
  shell_derby: {
    title: 'Shell Derby',
    objective: 'Salt the rivals in a straight brawl.'
  },
  feast_frenzy: {
    title: 'Feast Frenzy',
    objective: 'Gobble the most soft food before dawn.'
  },
  high_leaf: {
    title: 'High Leaf',
    objective: 'Climb highest and hold the vantage.'
  },
  bird_panic: {
    title: 'Bird Panic',
    objective: 'Survive by reading shade and cover.'
  },
  calcium_crown: {
    title: 'Calcium Crown',
    objective: 'Hold the shell shrine.'
  }
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeInteger(value, fallback, min, max) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.round(clamp(numericValue, min, max));
}

function getSafeStorage(storageOverride = null) {
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

export function normalizeHuntOptions(rawOptions: any = {}) {
  return {
    npcCount: normalizeInteger(rawOptions.npcCount, DEFAULT_HUNT_OPTIONS.npcCount, 1, 16),
    npcStrength: normalizeInteger(rawOptions.npcStrength, DEFAULT_HUNT_OPTIONS.npcStrength, 1, 9)
  };
}

function loadStoredHuntOptions(storage) {
  if (!storage?.getItem) {
    return { ...DEFAULT_HUNT_OPTIONS };
  }

  try {
    const raw = storage.getItem(HUNT_OPTIONS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_HUNT_OPTIONS };
    }

    return normalizeHuntOptions(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_HUNT_OPTIONS };
  }
}

export function getStoredHuntOptions(storageOverride = null) {
  return loadStoredHuntOptions(getSafeStorage(storageOverride));
}

function saveStoredHuntOptions(storage, options) {
  if (!storage?.setItem) {
    return;
  }

  storage.setItem(HUNT_OPTIONS_STORAGE_KEY, JSON.stringify(options));
}

export function saveHuntOptions(rawOptions, storageOverride = null) {
  const storage = getSafeStorage(storageOverride);
  const options = normalizeHuntOptions(rawOptions);
  saveStoredHuntOptions(storage, options);
  return options;
}

function getTrialKindFromOptions(options: any = {}, seed = EXPLORER_DEFAULT_SEED) {
  const explicit = options.trialKind ?? options.trial;
  if (TRIAL_KINDS.includes(explicit)) {
    return explicit;
  }

  return TRIAL_KINDS[Math.abs(Math.floor(Number(seed) || 0)) % TRIAL_KINDS.length];
}

function makeTrialProp({
  id,
  kind,
  displayName,
  x,
  z,
  terrainConfig,
  radius = 3,
  height = 1,
  rotationY = 0,
  blocking = false,
  climbable = false,
  powerup = null,
  visual = {}
}: any) {
  const halfHeight = height / 2;
  return {
    id,
    kind,
    displayName,
    position: {
      x,
      y: getTerrainHeight(x, z, terrainConfig) + halfHeight,
      z
    },
    rotationY,
    bodyRadius: radius,
    blocking,
    climbable,
    powerup,
    collisionShape: {
      type: 'cylinder',
      radius,
      halfHeight
    },
    visual: {
      radius,
      height,
      ...visual
    }
  };
}

export class ExplorerSession {
  declare localSlot: any;
  declare accumulator: any;
  declare botControllers: any;
  declare bossSlot: any;
  declare extraNpcCount: any;
  declare forageDuration: any;
  declare huntOptions: any;
  declare mode: any;
  declare npcStrength: any;
  declare seed: any;
  declare simulation: any;
  declare snapshot: any;
  declare staticWorldProps: any;
  declare trialElapsed: any;
  declare trialKind: any;
  declare trialPhase: any;
  declare trialScores: any;
  declare trialStartedAt: any;
  declare startInTrial: any;
  declare storage: any;
  declare tuningConfig: any;
  declare world: any;
  constructor(options: any = {}) {
    this.mode = 'explorer';
    this.localSlot = 1;
    this.bossSlot = EXPLORER_BOSS_SLOT;
    this.seed = options.seed ?? EXPLORER_DEFAULT_SEED;
    this.storage = getSafeStorage(options.storage);
    const hasExplicitHuntOptions = options.options !== undefined ||
      options.npcCount !== undefined ||
      options.totalNpcCount !== undefined ||
      options.npcStrength !== undefined;
    this.huntOptions = hasExplicitHuntOptions
      ? normalizeHuntOptions({
        ...(options.options ?? {}),
        npcCount: options.totalNpcCount ?? options.npcCount ?? options.options?.npcCount,
        npcStrength: options.npcStrength ?? options.options?.npcStrength
      })
      : { npcCount: 1, npcStrength: 6 };
    if (hasExplicitHuntOptions) {
      saveStoredHuntOptions(this.storage, this.huntOptions);
    }
    this.extraNpcCount = Math.max(0, this.huntOptions.npcCount - 1);
    this.npcStrength = this.huntOptions.npcStrength;
    this.trialKind = getTrialKindFromOptions(options, this.seed);
    this.forageDuration = Number.isFinite(options.forageDuration) ? Math.max(0, options.forageDuration) : FORAGE_DURATION;
    this.startInTrial = Boolean(options.startInTrial || options.trialNow);
    this.accumulator = 0;
    this.botControllers = new Map();
    this.trialScores = new Map();
    this.snapshot = null;

    this.rebuildSimulation();
  }

  createExplorerTuning() {
    const strength = normalizeInteger(this.npcStrength, 6, 1, 9);
    return normalizeTuningConfig({
      ...DEFAULT_TUNING_CONFIG,
      botMaxHealth: Math.round(360 + strength * 140),
      botMoveSpeed: Number((3 + strength * 0.13).toFixed(2)),
      attackCooldown: Number(clamp(1.48 - strength * 0.065, 0.86, 1.45).toFixed(2))
    });
  }

  createExtraNpcParticipants() {
    const participants: any[] = [];
    const start = this.world.playerStart;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let index = 0; index < this.extraNpcCount; index += 1) {
      const ring = Math.floor(index / 8);
      const radius = 18 + ring * 10 + (index % 3) * 2.5;
      const angle = index * goldenAngle;
      const x = start.x + Math.sin(angle) * radius;
      const z = start.z + Math.cos(angle) * radius;

      participants.push({
        slot: EXPLORER_BOSS_SLOT + 1 + index,
        profile: 'bot',
        connected: true,
        position: { x, z },
        rotationY: Math.atan2(start.x - x, start.z - z),
        displayName: `Wild Snail ${index + 1}`
      });
    }

    return participants;
  }

  getTrialCenter() {
    switch (this.trialKind) {
      case 'dew_rush':
        return { x: -120, z: 370 };
      case 'salt_bowl':
        return { x: -40, z: 70 };
      case 'feast_frenzy':
        return { x: 210, z: 180 };
      case 'high_leaf':
        return { x: -240, z: 360 };
      case 'bird_panic':
        return { x: -260, z: 240 };
      case 'calcium_crown':
        return { x: 500, z: -320 };
      case 'shell_derby':
      default:
        return { x: 0, z: 40 };
    }
  }

  createTrialProps() {
    const terrainConfig = this.world.terrainConfig;
    const center = this.getTrialCenter();
    const props: any[] = [];

    if (this.trialKind === 'dew_rush') {
      props.push(makeTrialProp({
        id: 'trial-dawn-dew',
        kind: 'dew_bead',
        displayName: 'Dawn Dew',
        x: center.x,
        z: center.z,
        terrainConfig,
        radius: 18,
        height: 36,
        blocking: true,
        climbable: true,
        powerup: { type: 'dew', amount: 18, label: 'Dawn Dew' },
        visual: { radius: 18 }
      }));
    }

    if (this.trialKind === 'salt_bowl') {
      for (let index = 0; index < 22; index += 1) {
        const angle = (index / 22) * Math.PI * 2;
        const radius = 210 + (index % 2) * 18;
        props.push(makeTrialProp({
          id: `trial-salt-bowl-${index}`,
          kind: 'salt_cone',
          displayName: 'Salt Rim',
          x: center.x + Math.cos(angle) * radius,
          z: center.z + Math.sin(angle) * radius,
          terrainConfig,
          radius: 7,
          height: 5,
          blocking: true,
          climbable: true
        }));
      }
    }

    if (this.trialKind === 'shell_derby') {
      for (let index = 0; index < 18; index += 1) {
        const angle = (index / 18) * Math.PI * 2;
        const distance = 35 + (index % 3) * 18;
        props.push(makeTrialProp({
          id: `trial-derby-grit-${index}`,
          kind: 'sharp_grit',
          displayName: 'Derby Grit',
          x: center.x + Math.cos(angle) * distance,
          z: center.z + Math.sin(angle) * distance,
          terrainConfig,
          radius: 1.4,
          height: 2.8,
          powerup: { type: 'grit', amount: 2.5, label: 'Derby Grit' },
          visual: { radius: 1.4, color: 0xc8bd98 }
        }));
      }
    }

    if (this.trialKind === 'feast_frenzy') {
      for (let index = 0; index < 34; index += 1) {
        const angle = index * 2.399963229728653;
        const distance = 12 + Math.sqrt(index) * 11;
        props.push(makeTrialProp({
          id: `trial-feast-food-${index}`,
          kind: 'soft_food',
          displayName: 'Feast Rot',
          x: center.x + Math.cos(angle) * distance,
          z: center.z + Math.sin(angle) * distance,
          terrainConfig,
          radius: 4.8,
          height: 1.4,
          powerup: { type: 'food', amount: 85, label: 'Feast Rot' },
          visual: { radius: 4.8, height: 1.4, color: 0xb58a4a }
        }));
      }
    }

    if (this.trialKind === 'high_leaf') {
      props.push(makeTrialProp({
        id: 'trial-high-leaf',
        kind: 'lichen_tower',
        displayName: 'High Leaf',
        x: center.x,
        z: center.z,
        terrainConfig,
        radius: 15,
        height: 90,
        blocking: true,
        climbable: true,
        visual: { radius: 15, height: 90, color: 0x8fa85c }
      }));
    }

    if (this.trialKind === 'bird_panic') {
      for (let index = 0; index < 10; index += 1) {
        const angle = (index / 10) * Math.PI * 2;
        props.push(makeTrialProp({
          id: `trial-bird-cover-${index}`,
          kind: index % 2 === 0 ? 'shrub' : 'rotting_log',
          displayName: 'Panic Cover',
          x: center.x + Math.cos(angle) * (50 + (index % 3) * 18),
          z: center.z + Math.sin(angle) * (50 + (index % 3) * 18),
          terrainConfig,
          radius: 16,
          height: 14,
          blocking: true,
          climbable: true,
          visual: { radius: 16, height: 14, length: 48, color: 0x405f32 }
        }));
      }
    }

    if (this.trialKind === 'calcium_crown') {
      props.push(makeTrialProp({
        id: 'trial-calcium-crown',
        kind: 'shell_shard',
        displayName: 'Calcium Crown',
        x: center.x,
        z: center.z,
        terrainConfig,
        radius: 12,
        height: 3,
        powerup: { type: 'calcium', amount: 35, label: 'Calcium Crown' },
        visual: { length: 28, width: 12, thickness: 3, color: 0xe2d6b4 }
      }));
      for (let index = 0; index < 18; index += 1) {
        const angle = (index / 18) * Math.PI * 2;
        props.push(makeTrialProp({
          id: `trial-crown-shard-${index}`,
          kind: 'shell_shard',
          displayName: 'Crown Shard',
          x: center.x + Math.cos(angle) * (18 + (index % 4) * 8),
          z: center.z + Math.sin(angle) * (18 + (index % 4) * 8),
          terrainConfig,
          radius: 2.5,
          height: 0.5,
          powerup: { type: 'calcium', amount: 10, label: 'Crown Shard' },
          visual: { length: 6, width: 2.5, thickness: 0.5, color: 0xe2d6b4 }
        }));
      }
    }

    return props;
  }

  rebuildSimulation() {
    this.world = createExplorerWorld(this.seed);
    this.world.props = [
      ...this.world.props,
      ...this.createTrialProps()
    ];
    this.tuningConfig = this.createExplorerTuning();
    const participants = [
      {
        slot: this.localSlot,
        profile: 'human',
        connected: true,
        position: {
          x: this.world.playerStart.x,
          z: this.world.playerStart.z
        },
        rotationY: this.world.playerStart.rotationY
      },
      this.world.bossParticipant,
      ...this.createExtraNpcParticipants()
    ];
    const botControllerConfig = createBotControllerConfig(this.tuningConfig);
    this.botControllers = new Map(participants
      .filter((participant) => participant.profile === 'bot')
      .map((participant) => [participant.slot, new BotController(botControllerConfig)]));

    this.simulation = new MatchSimulation({
      mode: 'explorer',
      players: participants,
      tuning: this.tuningConfig,
      terrainConfig: this.world.terrainConfig,
      arenaRadius: this.world.worldBounds.radius,
      worldBounds: this.world.worldBounds,
      worldProps: this.world.props,
      creatures: this.world.creatures
    });

    this.snapshot = this.simulation.getSnapshot();
    this.staticWorldProps = this.snapshot.worldProps;
    this.trialPhase = this.startInTrial ? 'trial' : 'forage';
    this.trialElapsed = this.startInTrial ? 0 : -this.forageDuration;
    this.trialScores = new Map(participants.map((participant) => [participant.slot, {
      feast: 0,
      crown: 0,
      leaf: 0,
      survived: 0
    }]));
    this.attachTrialState(this.snapshot);
    this.accumulator = 0;
  }

  getLivingPlayers() {
    return this.snapshot?.players?.filter((player) => player.connected && player.health > 0 && !player.fixtureKind) ?? [];
  }

  getTrialScore(slot) {
    if (!this.trialScores.has(slot)) {
      this.trialScores.set(slot, { feast: 0, crown: 0, leaf: 0, survived: 0 });
    }

    return this.trialScores.get(slot);
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

  accumulatePowerupScores(events: any[] = []) {
    for (const event of events) {
      if (event.type !== 'powerup' || !event.playerSlot) {
        continue;
      }

      const score = this.getTrialScore(event.playerSlot);
      if (event.powerupType === 'food') {
        score.feast += event.amount ?? 0;
      }
    }
  }

  startTrialIfNeeded() {
    if (this.trialPhase !== 'forage' || this.trialElapsed < 0) {
      return;
    }

    this.trialPhase = 'trial';
    this.trialElapsed = 0;
  }

  getSaltBowlRadius() {
    const progress = clamp(this.trialElapsed / TRIAL_DURATION, 0, 1);
    return 220 - progress * 155;
  }

  updateTrialRules(delta) {
    if (this.snapshot?.phase === 'ended') {
      return;
    }

    this.trialElapsed += delta;
    this.startTrialIfNeeded();
    if (this.trialPhase !== 'trial') {
      return;
    }

    const center = this.getTrialCenter();
    const players = Array.from<any>(this.simulation.players.values())
      .filter((player: any) => player.connected && player.health > 0 && !player.fixtureKind);

    for (const player of players) {
      const score = this.getTrialScore(player.slot);
      score.survived += delta;
      const distance = Math.hypot(player.position.x - center.x, player.position.z - center.z);

      if (this.trialKind === 'dew_rush' && distance < player.bodyRadius + 20) {
        this.simulation.endMatch(player.slot, 'dew_rush');
        return;
      }

      if (this.trialKind === 'salt_bowl') {
        const safeRadius = this.getSaltBowlRadius();
        if (distance > safeRadius) {
          player.health = Math.max(0, player.health - 24 * delta);
        }
      }

      if (this.trialKind === 'high_leaf') {
        const heightScore = Math.max(0, player.position.y - getTerrainHeight(player.position.x, player.position.z, this.world.terrainConfig));
        score.leaf = Math.max(score.leaf, heightScore);
      }

      if (this.trialKind === 'bird_panic' && !this.simulation.isPlayerUnderBirdCover(player)) {
        player.health = Math.max(0, player.health - 4.5 * delta);
      }

      if (this.trialKind === 'calcium_crown' && distance < player.bodyRadius + 42) {
        score.crown += delta;
      }
    }

    if (this.trialElapsed < TRIAL_DURATION) {
      return;
    }

    this.endTrialByScore();
  }

  endTrialByScore() {
    const livingPlayers = Array.from<any>(this.simulation.players.values())
      .filter((player: any) => player.connected && player.health > 0 && !player.fixtureKind);
    const candidates = livingPlayers.length > 0
      ? livingPlayers
      : Array.from<any>(this.simulation.players.values()).filter((player: any) => !player.fixtureKind);

    let bestPlayer = null;
    let bestScore = -Infinity;
    for (const player of candidates) {
      const score = this.getTrialScore(player.slot);
      const stats = player.snailStats ?? {};
      const value = this.trialKind === 'feast_frenzy'
        ? score.feast
        : this.trialKind === 'high_leaf'
          ? score.leaf
          : this.trialKind === 'calcium_crown'
            ? score.crown
            : this.trialKind === 'shell_derby'
              ? player.health + (stats.grit ?? 0) * 12
              : this.trialKind === 'dew_rush'
                ? (stats.dew ?? 0)
                : score.survived + player.health * 0.02;
      if (value > bestScore) {
        bestScore = value;
        bestPlayer = player;
      }
    }

    this.simulation.endMatch(bestPlayer?.slot ?? null, this.trialKind);
  }

  getTrialScoreRows() {
    return Array.from(this.trialScores.entries()).map(([slot, score]) => ({
      slot,
      feast: Number(score.feast.toFixed(1)),
      crown: Number(score.crown.toFixed(1)),
      leaf: Number(score.leaf.toFixed(1)),
      survived: Number(score.survived.toFixed(1))
    }));
  }

  attachTrialState(snapshot) {
    if (!snapshot) {
      return snapshot;
    }

    const copy = TRIAL_COPY[this.trialKind] ?? TRIAL_COPY.dew_rush;
    const timeRemaining = this.trialPhase === 'forage'
      ? Math.max(0, -this.trialElapsed)
      : Math.max(0, TRIAL_DURATION - this.trialElapsed);
    snapshot.trialState = {
      phase: this.trialPhase,
      kind: this.trialKind,
      title: copy.title,
      objective: copy.objective,
      timeRemaining,
      forageDuration: this.forageDuration,
      trialDuration: TRIAL_DURATION,
      center: this.getTrialCenter(),
      saltRadius: this.trialKind === 'salt_bowl' ? this.getSaltBowlRadius() : null,
      scores: this.getTrialScoreRows()
    };
    return snapshot;
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

      const player = this.simulation.getPlayerState(this.localSlot);
      if (player?.connected && player.health > 0) {
        for (const [botSlot, botController] of this.botControllers.entries()) {
          const bot = this.simulation.getPlayerState(botSlot);
          if (!bot?.connected || bot.health <= 0) {
            continue;
          }

          this.simulation.setPlayerInput(
            botSlot,
            botController.getInput(this.simulation, botSlot, this.localSlot, MATCH_TICK_DURATION)
          );
        }
      }

      this.snapshot = {
        ...this.simulation.step(MATCH_TICK_DURATION, { includeWorldProps: false }),
        worldProps: this.staticWorldProps
      };
      this.syncConsumedPowerups(this.snapshot.events ?? []);
      this.accumulatePowerupScores(this.snapshot.events ?? []);
      this.updateTrialRules(MATCH_TICK_DURATION);
      if (this.simulation.phase === 'ended') {
        this.snapshot.phase = this.simulation.phase;
        this.snapshot.winnerSlot = this.simulation.winnerSlot;
        this.snapshot.reason = this.simulation.endReason;
      }
      this.snapshot.worldProps = this.staticWorldProps;
      this.attachTrialState(this.snapshot);
      this.accumulator -= MATCH_TICK_DURATION;
    }
  }

  restart() {
    this.rebuildSimulation();
  }

  leave() { }

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
    this.attachTrialState(this.snapshot);
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
    const local = this.getLocalPlayerState();
    const candidates = this.getOtherPlayerStates()
      .filter((player) => player.connected && player.health > 0);
    if (!local || candidates.length === 0) {
      return null;
    }

    return candidates
      .map((player) => ({
        player,
        distanceSq: (player.position.x - local.position.x) ** 2 + (player.position.z - local.position.z) ** 2
      }))
      .sort((left, right) => left.distanceSq - right.distanceSq)[0]?.player ?? null;
  }

  getHudLabels(focusState = null) {
    return {
      opponent: focusState?.displayName ?? 'Rocky Crown'
    };
  }

  getDefaultOpponentMaxHealth() {
    return this.tuningConfig.botMaxHealth;
  }

  getOverlayState() {
    if (this.snapshot?.phase !== 'ended') {
      return null;
    }

    const playerWon = this.snapshot?.winnerSlot === this.localSlot;
    const trialTitle = this.snapshot?.trialState?.title ?? 'Dawn Trial';
    return {
      variant: playerWon ? 'victory' : 'defeat',
      title: playerWon ? 'SURVIVED DAWN' : 'SALTED',
      body: playerWon
        ? `${trialTitle} claimed.`
        : `${trialTitle} was too dry.`,
      actions: [
        { id: 'restart', label: 'Restart' },
        { id: 'menu', label: 'Back to Menu' }
      ]
    };
  }

  getConnectionState() {
    return 'explorer';
  }
}
