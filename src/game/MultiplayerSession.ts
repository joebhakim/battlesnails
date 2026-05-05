import { LocalMultiplayerClient } from '../network/LocalMultiplayerClient.js';
import { normalizePlayerInput } from '../protocol/InputProtocol.js';
import { mergeNetworkSnapshot } from '../protocol/SnapshotProtocol.js';
import {
  MULTIPLAYER_MATCH_MODE,
  normalizeMultiplayerOptions
} from '../sim/MultiplayerOptions.js';

export { mergeNetworkSnapshot as mergeMultiplayerSnapshot } from '../protocol/SnapshotProtocol.js';

export class MultiplayerSession {
  declare connectionState: any;
  declare localSlot: any;
  declare client: any;
  declare closedByUser: any;
  declare errorMessage: any;
  declare mode: any;
  declare options: any;
  declare snapshot: any;
  declare waitingReason: any;
  constructor(options: any = {}) {
    this.mode = 'multiplayer';
    this.options = normalizeMultiplayerOptions(options.options ?? options);
    this.client = new LocalMultiplayerClient(options.url, this.options);
    this.localSlot = null;
    this.snapshot = null;
    this.connectionState = 'connecting';
    this.waitingReason = null;
    this.errorMessage = '';
    this.closedByUser = false;

    this.client.onMessage = this.handleMessage.bind(this);
    this.client.onClose = this.handleClose.bind(this);
    this.client.onError = this.handleError.bind(this);
    this.client.connect();
  }

  update(_delta, localInput) {
    if (!this.client.isConnected || !this.localSlot) {
      return;
    }

    if (this.connectionState !== 'waiting' && this.connectionState !== 'running') {
      return;
    }

    this.client.send({
      type: 'input',
      input: normalizePlayerInput(localInput)
    });
  }

  leave() {
    this.closedByUser = true;
    this.client.close();
  }

  handleMessage(message) {
    switch (message.type) {
      case 'welcome':
        this.localSlot = message.slot;
        this.options = normalizeMultiplayerOptions(message.options ?? this.options);
        this.connectionState = 'waiting';
        this.waitingReason = null;
        break;
      case 'waiting':
        this.connectionState = 'waiting';
        this.waitingReason = message.reason ?? null;
        break;
      case 'match_start':
        this.options = normalizeMultiplayerOptions(message.options ?? this.options);
        this.connectionState = 'running';
        this.snapshot = this.mergeSnapshot(message.snapshot ?? null, true);
        this.waitingReason = null;
        break;
      case 'snapshot':
        this.connectionState = 'running';
        this.snapshot = this.mergeSnapshot(message.snapshot ?? null);
        break;
      case 'match_end':
        this.connectionState = 'ended';
        this.snapshot = this.mergeSnapshot(message.snapshot ?? null);
        break;
      case 'error':
        this.connectionState = 'error';
        this.errorMessage = message.message ?? 'Connection error';
        break;
    }
  }

  mergeSnapshot(update, replace = false) {
    return mergeNetworkSnapshot(this.snapshot, update, { replace });
  }

  handleClose() {
    if (this.closedByUser) {
      return;
    }

    if (this.connectionState === 'error') {
      return;
    }

    this.connectionState = 'error';
    this.errorMessage = `Connection to ${this.client.url} closed.`;
  }

  handleError() {
    this.connectionState = 'error';
    this.errorMessage = `Unable to connect to ${this.client.url}. If you are using the dev server, reload the page. Otherwise run npm run mp:server.`;
  }

  getSnapshot() {
    return this.snapshot;
  }

  getLocalSlot() {
    return this.localSlot;
  }

  getLocalPlayerState() {
    if (!this.snapshot || !this.localSlot) {
      return null;
    }

    return this.snapshot.players.find((player) => player.slot === this.localSlot) ?? null;
  }

  getOpponentPlayerState() {
    return this.getFocusTargetState();
  }

  getOtherPlayerStates() {
    if (!this.snapshot || !this.localSlot) {
      return [];
    }

    return this.snapshot.players.filter((player) => player.slot !== this.localSlot);
  }

  getFocusTargetState() {
    const localPlayer = this.getLocalPlayerState();
    const others = this.getOtherPlayerStates();
    if (others.length === 0) {
      return null;
    }

    const wantsPveTarget = this.options.matchMode === MULTIPLAYER_MATCH_MODE.ADVENTURE_COOP;
    const targetableOthers = wantsPveTarget
      ? others.filter((player) => player.profileName === 'bot')
      : others;
    const livingOthers = targetableOthers.filter((player) => player.connected && player.health > 0);
    const pool = livingOthers.length > 0 ? livingOthers : others;
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
      opponent: targetState?.profileName === 'bot'
        ? 'Enemy'
        : this.options.matchMode === MULTIPLAYER_MATCH_MODE.ADVENTURE_COOP
          ? 'Ally'
          : 'Opponent'
    };
  }

  getDefaultOpponentMaxHealth() {
    return this.snapshot?.players.find((player) => player.slot !== this.localSlot)?.maxHealth ?? 2;
  }

  getOverlayState() {
    switch (this.connectionState) {
      case 'connecting':
        return {
          variant: 'info',
          title: 'Joining the confluence of the snails.',
          body: 'Snails are emerging..',
          actions: [{ id: 'leave', label: 'Back to Menu' }]
        };
      case 'waiting':
        return {
          variant: this.waitingReason === 'opponent_disconnected' ? 'warning' : 'info',
          title: 'Waiting',
          body: this.waitingReason === 'opponent_disconnected'
            ? 'the Coward snailed away'
            : 'Waiting for a second smail to emerge',
          actions: [{ id: 'leave', label: 'Leave Match' }]
        };
      case 'ended': {
        const playerWon = this.snapshot?.winnerSlot === this.localSlot;
        const isDraw = this.snapshot?.reason === 'draw';
        const title = isDraw
          ? 'Draw'
          : playerWon
            ? 'SNAILED'
            : 'SALTED';
        const body = isDraw
          ? 'Both snails fell in the same exchange.'
          : playerWon
            ? 'Snailed. (btw snailed equals winning in this game)'
            : 'SALTED.';
        const variant = isDraw
          ? 'info'
          : playerWon
            ? 'victory'
            : 'defeat';
        return {
          variant,
          title,
          body,
          actions: [{ id: 'leave', label: 'Leave Match' }]
        };
      }
      case 'error':
        return {
          variant: 'error',
          title: 'Multiplayer Error',
          body: this.errorMessage || 'Unable to run multiplayer.',
          actions: [{ id: 'leave', label: 'Back to Menu' }]
        };
      default:
        return null;
    }
  }

  getConnectionState() {
    return this.connectionState;
  }
}
