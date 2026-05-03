import test from 'node:test';
import assert from 'node:assert/strict';

import { getDamageWindowTier } from '../src/game/DamageIndicators.js';

test('damage window tier stays minor for low rolling total and low peak hit', () => {
  assert.equal(getDamageWindowTier({ total: 1, peakAmount: 1 }), 'minor');
});

test('damage window tier becomes hit from a medium single hit', () => {
  assert.equal(getDamageWindowTier({ total: 3.4, peakAmount: 3.4 }), 'hit');
});

test('damage window tier becomes burst from clustered rolling total', () => {
  assert.equal(getDamageWindowTier({ total: 6.1, peakAmount: 1.4 }), 'burst');
});

test('damage window tier becomes hit at the rolling total threshold', () => {
  assert.equal(getDamageWindowTier({ total: 2, peakAmount: 1 }), 'hit');
});

test('damage window tier becomes burst at the peak hit threshold', () => {
  assert.equal(getDamageWindowTier({ total: 1, peakAmount: 4.5 }), 'burst');
});

test('damage window tier can cap rolling follow-up damage below burst', () => {
  assert.equal(getDamageWindowTier({ total: 7, peakAmount: 1, allowBurst: false }), 'hit');
});
