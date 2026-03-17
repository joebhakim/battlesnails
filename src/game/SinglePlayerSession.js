import { BotController } from '../sim/BotController.js';
import { MatchSimulation, MATCH_TICK_DURATION, normalizePlayerInput } from '../sim/MatchSimulation.js';

export class SinglePlayerSession {
  constructor() {
    this.mode = 'singleplayer';
    this.localSlot = 1;
    this.opponentSlot = 2;
    this.accumulator = 0;

    this.simulation = new MatchSimulation({
      mode: 'singleplayer',
      players: [
        { slot: 1, profile: 'human', connected: true },
        { slot: 2, profile: 'bot', connected: true }
      ]
    });

    this.botController = new BotController();
    this.snapshot = this.simulation.getSnapshot();
  }

  update(delta, localInput) {
    this.accumulator += delta;
    const steps = Math.max(1, Math.floor(this.accumulator / MATCH_TICK_DURATION));

    if (this.simulation.phase === 'running') {
      const dividedInput = normalizePlayerInput({
        ...localInput,
        lookX: localInput.lookX / steps,
        lookY: localInput.lookY / steps,
        leftHeld: localInput.leftHeld,
        rightHeld: localInput.rightHeld
      });

      for (let index = 0; index < steps && this.accumulator >= MATCH_TICK_DURATION; index += 1) {
        this.simulation.setPlayerInput(this.localSlot, {
          ...dividedInput,
          jumpPressed: index === 0 && localInput.jumpPressed
        });
        this.simulation.setPlayerInput(
          this.opponentSlot,
          this.botController.getInput(this.simulation, this.opponentSlot, this.localSlot, MATCH_TICK_DURATION)
        );
        this.snapshot = this.simulation.step(MATCH_TICK_DURATION);
        this.accumulator -= MATCH_TICK_DURATION;
      }
    } else {
      this.snapshot = this.simulation.getSnapshot();
      this.accumulator = 0;
    }
  }

  restart() {
    this.botController.reset();
    this.simulation.restart();
    this.snapshot = this.simulation.getSnapshot();
    this.accumulator = 0;
  }

  leave() { }

  getSnapshot() {
    return this.snapshot;
  }

  getLocalSlot() {
    return this.localSlot;
  }

  getLocalPlayerState() {
    return this.snapshot.players.find((player) => player.slot === this.localSlot) ?? null;
  }

  getOpponentPlayerState() {
    return this.getFocusTargetState();
  }

  getOtherPlayerStates() {
    return this.snapshot.players.filter((player) => player.slot !== this.localSlot);
  }

  getFocusTargetState() {
    return this.snapshot.players.find((player) => player.slot === this.opponentSlot) ?? null;
  }

  getHudLabels(targetState = this.getFocusTargetState()) {
    return {
      opponent: targetState?.profileName === 'bot' ? 'Enemy' : 'Opponent'
    };
  }

  getDefaultOpponentMaxHealth() {
    return this.snapshot?.players.find((player) => player.slot === this.opponentSlot)?.maxHealth ?? 2;
  }

  getOverlayState() {
    if (this.snapshot.phase !== 'ended') {
      return null;
    }

    const playerWon = this.snapshot.winnerSlot === this.localSlot;
    return {
      variant: playerWon ? 'victory' : 'defeat',
      title: playerWon ? 'Victory' : 'Defeat',
      body: playerWon
        ? 'The other guy got SNAILED.'
        : 'SALTED.',
      actions: [
        { id: 'restart', label: 'Restart' },
        { id: 'menu', label: 'Back to Menu' }
      ]
    };
  }

  getConnectionState() {
    return 'local';
  }
}
