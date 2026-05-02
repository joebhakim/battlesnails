import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocalMultiplayerServer } from '../server/createLocalMultiplayerServer.mjs';
import { DEFAULT_TUNING_CONFIG } from '../src/sim/Tuning.js';

class TestClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.queue = [];
    this.waiters = [];

    this.socket.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data);
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(payload);
      } else {
        this.queue.push(payload);
      }
    });
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
  }

  send(payload) {
    this.socket.send(JSON.stringify(payload));
  }

  nextMessage() {
    if (this.queue.length > 0) {
      return Promise.resolve(this.queue.shift());
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  async nextMessageOfType(type) {
    while (true) {
      const message = await this.nextMessage();
      if (message.type === type) {
        return message;
      }
    }
  }

  close() {
    this.socket.close();
  }
}

test('multiplayer server auto-pairs two clients and starts a match with 40 NPCs by default', async () => {
  const server = createLocalMultiplayerServer({ port: 0 });
  await server.start();
  const port = server.getPort();
  const url = `ws://127.0.0.1:${port}`;

  const clientA = new TestClient(url);
  const clientB = new TestClient(url);
  await clientA.open();
  await clientB.open();

  clientA.send({ type: 'join' });
  clientB.send({ type: 'join' });

  const welcomeA = await clientA.nextMessageOfType('welcome');
  const welcomeB = await clientB.nextMessageOfType('welcome');
  const matchStartA = await clientA.nextMessageOfType('match_start');
  const matchStartB = await clientB.nextMessageOfType('match_start');

  assert.equal(welcomeA.slot, 1);
  assert.equal(welcomeB.slot, 2);
  assert.equal(matchStartA.snapshot.phase, 'running');
  assert.equal(matchStartB.snapshot.players.length, 42);
  assert.equal(Array.isArray(matchStartA.snapshot.players[0].stalks.left.nodes), true);
  assert.equal(matchStartA.snapshot.players[0].stalks.left.nodes.length > 4, true);
  assert.equal(Array.isArray(matchStartA.snapshot.trailCells), true);
  assert.equal(typeof matchStartA.snapshot.trailCellSize, 'number');
  assert.equal(matchStartA.snapshot.terrain?.preset, 'plane');
  assert.equal(matchStartA.snapshot.players.filter((player) => player.profileName === 'bot').length, 40);
  assert.equal(matchStartA.snapshot.players.find((player) => player.slot === 1)?.maxHealth, DEFAULT_TUNING_CONFIG.playerMaxHealth);
  assert.equal(matchStartA.snapshot.players.find((player) => player.profileName === 'bot')?.maxHealth, DEFAULT_TUNING_CONFIG.botMaxHealth);

  clientA.close();
  clientB.close();
  await server.stop();
});

test('multiplayer server rejects a third client when the room is full', async () => {
  const server = createLocalMultiplayerServer({ port: 0 });
  await server.start();
  const port = server.getPort();
  const url = `ws://127.0.0.1:${port}`;

  const clientA = new TestClient(url);
  const clientB = new TestClient(url);
  const clientC = new TestClient(url);
  await clientA.open();
  await clientB.open();
  await clientC.open();

  clientA.send({ type: 'join' });
  clientB.send({ type: 'join' });
  await clientA.nextMessageOfType('welcome');
  await clientB.nextMessageOfType('welcome');
  await clientA.nextMessageOfType('match_start');
  await clientB.nextMessageOfType('match_start');

  clientC.send({ type: 'join' });
  const errorMessage = await clientC.nextMessageOfType('error');

  assert.equal(errorMessage.code, 'room_full');

  clientA.close();
  clientB.close();
  clientC.close();
  await server.stop();
});

test('remaining client returns to waiting when the opponent disconnects', async () => {
  const server = createLocalMultiplayerServer({ port: 0 });
  await server.start();
  const port = server.getPort();
  const url = `ws://127.0.0.1:${port}`;

  const clientA = new TestClient(url);
  const clientB = new TestClient(url);
  await clientA.open();
  await clientB.open();

  clientA.send({ type: 'join' });
  clientB.send({ type: 'join' });
  await clientA.nextMessageOfType('welcome');
  await clientB.nextMessageOfType('welcome');
  await clientA.nextMessageOfType('match_start');
  await clientB.nextMessageOfType('match_start');

  clientB.close();
  const matchEnd = await clientA.nextMessageOfType('match_end');
  const waiting = await clientA.nextMessageOfType('waiting');

  assert.equal(matchEnd.reason, 'opponent_disconnected');
  assert.equal(waiting.reason, 'opponent_disconnected');

  clientA.close();
  await server.stop();
});
