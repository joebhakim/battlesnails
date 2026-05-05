import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeMultiplayerSnapshot } from '../src/game/MultiplayerSession.js';
import { resolveDefaultUrl } from '../src/network/LocalMultiplayerClient.js';

test('resolveDefaultUrl falls back from 0.0.0.0 to localhost', () => {
  assert.equal(
    resolveDefaultUrl({ protocol: 'http:', hostname: '0.0.0.0' }),
    'ws://localhost:2567'
  );
});

test('resolveDefaultUrl uses wss for https pages', () => {
  assert.equal(
    resolveDefaultUrl({ protocol: 'https:', hostname: 'localhost' }),
    'wss://localhost:2567'
  );
});

test('resolveDefaultUrl preserves explicit LAN IP hosts', () => {
  assert.equal(
    resolveDefaultUrl({ protocol: 'http:', hostname: '192.168.0.241' }),
    'ws://192.168.0.241:2567'
  );
});

test('mergeMultiplayerSnapshot preserves static metadata and appends trail deltas', () => {
  const start = {
    tick: 0,
    terrain: { preset: 'plane' },
    trailCellSize: 1,
    trailCells: [{ x: 0, z: 0 }],
    worldProps: [{ id: 'static-prop' }],
    creatures: [{ id: 'bird-0', phase: 'patrol' }],
    events: [],
    players: [
      {
        slot: 1,
        profileName: 'human',
        maxHealth: 600,
        position: { x: 0, y: 1, z: 0 },
        health: 600
      }
    ]
  };
  const update = {
    tick: 2,
    events: [{ type: 'damage', amount: 1 }],
    trailCellsDelta: [{ x: 0, z: 0 }, { x: 1, z: 0 }],
    creatures: [{ id: 'bird-0', phase: 'swoop' }],
    players: [
      {
        slot: 1,
        position: { x: 2, y: 1, z: 0 },
        health: 599
      }
    ]
  };

  const merged = mergeMultiplayerSnapshot(start, update);

  assert.equal(merged.tick, 2);
  assert.deepEqual(merged.terrain, start.terrain);
  assert.deepEqual(merged.worldProps, start.worldProps);
  assert.equal(merged.creatures[0].phase, 'swoop');
  assert.equal(merged.players[0].profileName, 'human');
  assert.equal(merged.players[0].maxHealth, 600);
  assert.equal(merged.players[0].position.x, 2);
  assert.deepEqual(merged.trailCells, [{ x: 0, z: 0 }, { x: 1, z: 0 }]);
  assert.equal(merged.events[0].type, 'damage');
});
