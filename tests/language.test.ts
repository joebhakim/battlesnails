import test from 'node:test';
import assert from 'node:assert/strict';

import { MultiplayerSession } from '../src/game/MultiplayerSession.js';
import { SinglePlayerSession } from '../src/game/SinglePlayerSession.js';

function createMultiplayerOverlayState({ connectionState, localSlot = 1, winnerSlot = null, reason = null, waitingReason = null }) {
  const session = Object.create(MultiplayerSession.prototype);
  session.connectionState = connectionState;
  session.localSlot = localSlot;
  session.waitingReason = waitingReason;
  session.errorMessage = '';
  session.snapshot = {
    winnerSlot,
    reason,
    players: []
  };
  return session.getOverlayState();
}

test('single player uses canonical snail end language', () => {
  const winSession = new SinglePlayerSession();
  winSession.simulation.endMatch(winSession.localSlot, 'knockout');
  winSession.snapshot = winSession.simulation.getSnapshot();

  assert.equal(winSession.getOverlayState().title, 'SNAILED');
  assert.equal(winSession.getOverlayState().body, 'The other guy got SNAILED.');

  const lossSession = new SinglePlayerSession();
  lossSession.simulation.endMatch(lossSession.opponentSlot, 'knockout');
  lossSession.snapshot = lossSession.simulation.getSnapshot();

  assert.equal(lossSession.getOverlayState().title, 'SALTED');
  assert.equal(lossSession.getOverlayState().body, 'SALTED.');
});

test('multiplayer restores the old snail room and end language', () => {
  const connecting = createMultiplayerOverlayState({ connectionState: 'connecting' });
  assert.equal(connecting.title, 'Joining the confluence of the snails.');
  assert.equal(connecting.body, 'Snails are emerging..');

  const waiting = createMultiplayerOverlayState({ connectionState: 'waiting' });
  assert.equal(waiting.body, 'Waiting for a second smail to emerge');

  const disconnected = createMultiplayerOverlayState({
    connectionState: 'waiting',
    waitingReason: 'opponent_disconnected'
  });
  assert.equal(disconnected.body, 'the Coward snailed away');

  const win = createMultiplayerOverlayState({
    connectionState: 'ended',
    winnerSlot: 1,
    reason: 'knockout'
  });
  assert.equal(win.title, 'SNAILED');
  assert.equal(win.body, 'Snailed. (btw snailed equals winning in this game)');

  const loss = createMultiplayerOverlayState({
    connectionState: 'ended',
    winnerSlot: 2,
    reason: 'knockout'
  });
  assert.equal(loss.title, 'SALTED');
  assert.equal(loss.body, 'SALTED.');
});
