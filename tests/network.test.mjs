import test from 'node:test';
import assert from 'node:assert/strict';

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
