import { BotController } from '../sim/BotController.js';
import { MatchSimulation, MATCH_TICK_DURATION, normalizePlayerInput } from '../sim/MatchSimulation.js';
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

export class ExplorerSession {
  declare localSlot: any;
  declare accumulator: any;
  declare botControllers: any;
  declare bossSlot: any;
  declare extraNpcCount: any;
  declare mode: any;
  declare seed: any;
  declare simulation: any;
  declare snapshot: any;
  declare staticWorldProps: any;
  declare tuningConfig: any;
  declare world: any;
  constructor(options: any = {}) {
    this.mode = 'explorer';
    this.localSlot = 1;
    this.bossSlot = EXPLORER_BOSS_SLOT;
    this.seed = options.seed ?? EXPLORER_DEFAULT_SEED;
    this.extraNpcCount = Math.max(0, Math.floor(Number(options.npcCount) || 0));
    this.accumulator = 0;
    this.botControllers = new Map();
    this.snapshot = null;

    this.rebuildSimulation();
  }

  createExplorerTuning() {
    return normalizeTuningConfig({
      ...DEFAULT_TUNING_CONFIG,
      botMaxHealth: 1200,
      botMoveSpeed: 3.6,
      attackCooldown: 1.05
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

  rebuildSimulation() {
    this.world = createExplorerWorld(this.seed);
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
      worldProps: this.world.props
    });

    this.snapshot = this.simulation.getSnapshot();
    this.staticWorldProps = this.snapshot.worldProps;
    this.accumulator = 0;
  }

  update(delta, localInput) {
    this.accumulator += delta;
    const steps = Math.max(1, Math.floor(this.accumulator / MATCH_TICK_DURATION));
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

    return {
      variant: 'defeat',
      title: 'SALTED',
      body: 'SALTED.',
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
