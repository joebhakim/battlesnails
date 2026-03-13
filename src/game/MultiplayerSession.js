import { LocalMultiplayerClient } from '../network/LocalMultiplayerClient.js';
import { normalizePlayerInput } from '../sim/MatchSimulation.js';

export class MultiplayerSession {
  constructor() {
    this.mode = 'multiplayer';
    this.client = new LocalMultiplayerClient();
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
        this.connectionState = 'waiting';
        this.waitingReason = null;
        break;
      case 'waiting':
        this.connectionState = 'waiting';
        this.waitingReason = message.reason ?? null;
        break;
      case 'match_start':
        this.connectionState = 'running';
        this.snapshot = message.snapshot ?? null;
        this.waitingReason = null;
        break;
      case 'snapshot':
        this.connectionState = 'running';
        this.snapshot = message.snapshot ?? this.snapshot;
        break;
      case 'match_end':
        this.connectionState = 'ended';
        this.snapshot = message.snapshot ?? this.snapshot;
        break;
      case 'error':
        this.connectionState = 'error';
        this.errorMessage = message.message ?? 'Connection error';
        break;
    }
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
    if (!this.snapshot || !this.localSlot) {
      return null;
    }

    return this.snapshot.players.find((player) => player.slot !== this.localSlot) ?? null;
  }

  getHudLabels() {
    return {
      opponent: 'Opponent'
    };
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
          variant: 'info',
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
            ? 'Snailed em, well done, you really SNAILED that other snail. Remember: this game is all about the snailing.'
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
          variant: 'info',
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
