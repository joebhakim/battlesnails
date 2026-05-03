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
  declare bossSlot: any;
  declare botController: any;
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
    this.accumulator = 0;
    this.botController = new BotController(createBotControllerConfig(DEFAULT_TUNING_CONFIG));
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

  rebuildSimulation() {
    this.world = createExplorerWorld(this.seed);
    this.tuningConfig = this.createExplorerTuning();

    this.simulation = new MatchSimulation({
      mode: 'explorer',
      players: [
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
        this.world.bossParticipant
      ],
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

      const boss = this.simulation.getPlayerState(this.bossSlot);
      const player = this.simulation.getPlayerState(this.localSlot);
      if (boss?.connected && boss.health > 0 && player?.connected && player.health > 0) {
        this.simulation.setPlayerInput(
          this.bossSlot,
          this.botController.getInput(this.simulation, this.bossSlot, this.localSlot, MATCH_TICK_DURATION)
        );
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
    const boss = this.snapshot?.players.find((player) => player.slot === this.bossSlot) ?? null;
    return boss?.connected && boss.health > 0 ? boss : null;
  }

  getHudLabels() {
    return {
      opponent: 'Rocky Crown'
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
