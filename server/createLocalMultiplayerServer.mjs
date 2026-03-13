import { createMinimalWebSocketServer } from './MinimalWebSocketServer.mjs';
import { MatchSimulation, MATCH_TICK_DURATION, createIdleInput, normalizePlayerInput } from '../src/sim/MatchSimulation.js';

function createBufferedInput() {
  return {
    moveX: 0,
    moveZ: 0,
    jumpPressed: false,
    lockOnHeld: false,
    combatMode: 'idle',
    lookX: 0,
    lookY: 0
  };
}

export function createLocalMultiplayerServer(options = {}) {
  const port = options.port ?? 2567;
  const host = options.host ?? '0.0.0.0';
  const tickDuration = options.tickDuration ?? MATCH_TICK_DURATION;
  const { server, onConnection } = createMinimalWebSocketServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, mode: 'localhost-multiplayer' }));
  });

  const room = {
    clients: new Map(),
    inputs: new Map(),
    simulation: null,
    intervalId: null,
    phase: 'waiting'
  };

  function stopTickLoop() {
    if (room.intervalId) {
      clearInterval(room.intervalId);
      room.intervalId = null;
    }
  }

  function buildWaitingPayload(reason = null) {
    return {
      type: 'waiting',
      connectedSlots: Array.from(room.clients.keys()).sort((left, right) => left - right),
      reason
    };
  }

  function broadcast(payload) {
    for (const connection of room.clients.values()) {
      connection.sendJson(payload);
    }
  }

  function consumeBufferedInput(slot) {
    const buffered = room.inputs.get(slot) ?? createBufferedInput();
    const frame = normalizePlayerInput(buffered);
    room.inputs.set(slot, createBufferedInput());
    room.inputs.get(slot).moveX = buffered.moveX;
    room.inputs.get(slot).moveZ = buffered.moveZ;
    room.inputs.get(slot).lockOnHeld = buffered.lockOnHeld;
    room.inputs.get(slot).combatMode = buffered.combatMode;
    return frame;
  }

  function startMatch() {
    room.simulation = new MatchSimulation({
      mode: 'multiplayer',
      players: [
        { slot: 1, profile: 'human', connected: true },
        { slot: 2, profile: 'human', connected: true }
      ]
    });

    room.phase = 'running';
    room.inputs.set(1, createBufferedInput());
    room.inputs.set(2, createBufferedInput());

    const snapshot = room.simulation.getSnapshot();
    for (const [slot, connection] of room.clients.entries()) {
      connection.sendJson({
        type: 'match_start',
        slot,
        snapshot
      });
    }

    stopTickLoop();
    room.intervalId = setInterval(() => {
      if (!room.simulation || room.phase !== 'running') {
        return;
      }

      room.simulation.setPlayerInput(1, consumeBufferedInput(1));
      room.simulation.setPlayerInput(2, consumeBufferedInput(2));
      const nextSnapshot = room.simulation.step(tickDuration);
      broadcast({ type: 'snapshot', snapshot: nextSnapshot });

      if (nextSnapshot.phase === 'ended') {
        room.phase = 'ended';
        stopTickLoop();
        broadcast({ type: 'match_end', snapshot: nextSnapshot });
      }
    }, tickDuration * 1000);
  }

  function handleDisconnect(disconnectedSlot) {
    const remainingSlots = Array.from(room.clients.keys()).filter((slot) => slot !== disconnectedSlot);
    stopTickLoop();

    if (remainingSlots.length === 0) {
      room.phase = 'waiting';
      room.simulation = null;
      room.inputs.clear();
      return;
    }

    const remainingSlot = remainingSlots[0];
    const remainingConnection = room.clients.get(remainingSlot);
    room.phase = 'waiting';
    room.simulation = null;
    room.inputs.delete(disconnectedSlot);
    room.inputs.set(remainingSlot, createBufferedInput());

    remainingConnection.sendJson({
      type: 'match_end',
      snapshot: null,
      winnerSlot: remainingSlot,
      reason: 'opponent_disconnected'
    });
    remainingConnection.sendJson(buildWaitingPayload('opponent_disconnected'));
  }

  function assignSlot() {
    return room.clients.has(1) ? room.clients.has(2) ? null : 2 : 1;
  }

  onConnection((connection) => {
    let assignedSlot = null;

    connection.on('message', (message) => {
      switch (message.type) {
        case 'join': {
          if (assignedSlot !== null) {
            return;
          }

          const slot = assignSlot();
          if (!slot) {
            connection.sendJson({
              type: 'error',
              code: 'room_full',
              message: 'The localhost room is already full.'
            });
            connection.close(1000, 'Room full');
            return;
          }

          assignedSlot = slot;
          room.clients.set(slot, connection);
          room.inputs.set(slot, createBufferedInput());
          connection.sendJson({ type: 'welcome', slot });

          if (room.clients.size === 2) {
            startMatch();
          } else {
            connection.sendJson(buildWaitingPayload());
          }
          break;
        }
        case 'input': {
          if (assignedSlot === null) {
            return;
          }

          const input = normalizePlayerInput(message.input);
          const buffered = room.inputs.get(assignedSlot) ?? createBufferedInput();
          buffered.moveX = input.moveX;
          buffered.moveZ = input.moveZ;
          buffered.lockOnHeld = input.lockOnHeld;
          buffered.combatMode = input.combatMode;
          buffered.lookX += input.lookX;
          buffered.lookY += input.lookY;
          buffered.jumpPressed = buffered.jumpPressed || input.jumpPressed;
          room.inputs.set(assignedSlot, buffered);
          break;
        }
        case 'leave':
          connection.close();
          break;
      }
    });

    connection.on('close', () => {
      if (assignedSlot === null) {
        return;
      }

      room.clients.delete(assignedSlot);
      handleDisconnect(assignedSlot);
      assignedSlot = null;
    });
  });

  return {
    async start() {
      await new Promise((resolve) => {
        server.listen(port, host, resolve);
      });
      return server.address();
    },
    async stop() {
      stopTickLoop();
      for (const connection of room.clients.values()) {
        connection.close();
      }
      room.clients.clear();
      room.inputs.clear();
      room.simulation = null;

      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
    getPort() {
      const address = server.address();
      return typeof address === 'object' && address ? address.port : port;
    },
    getHost() {
      return host;
    },
    getState() {
      return {
        phase: room.phase,
        connectedSlots: Array.from(room.clients.keys()).sort((left, right) => left - right)
      };
    }
  };
}
