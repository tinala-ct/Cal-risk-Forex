import assert from 'node:assert/strict';

import {
  calculateClosePnl,
  createDefaultState,
  getCriticalPrice,
  getEquity,
  getPositionSummaries,
  getUnrealizedPnl,
} from '../lib/portfolio.ts';

const closeTo = (actual: number, expected: number, tolerance = 1e-6) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

const state = createDefaultState();
const positions = getPositionSummaries(state);
const xau = positions.find((position) => position.symbol === 'XAUUSD');
const oil = positions.find((position) => position.symbol === 'USOIL');

assert.ok(xau);
assert.ok(oil);
closeTo(xau.lots, 1.7);
closeTo(xau.averageEntry, 4797.993529411763);
closeTo(oil.lots, 0.16);
closeTo(oil.averageEntry, 97.406875);

closeTo(xau.unrealizedPnl, -2546.589);
closeTo(oil.unrealizedPnl, -598.51);
closeTo(getUnrealizedPnl(state), -3145.099);
closeTo(getEquity(state), 1154.901);

const xauCritical = getCriticalPrice(state, 'XAUUSD');
const oilCritical = getCriticalPrice(state, 'USOIL');
assert.equal(xauCritical.kind, 'PRICE');
assert.equal(oilCritical.kind, 'BELOW_ZERO');
closeTo(xauCritical.price ?? 0, 2620.646470588234);
closeTo(oilCritical.price ?? 0, -12.1813125);

closeTo(calculateClosePnl('BUY', 100, 110, 0.2, 100), 200);
closeTo(calculateClosePnl('SELL', 100, 90, 0.2, 100), 200);
closeTo(calculateClosePnl('SELL', 100, 110, 0.2, 100), -200);

console.log('Calculation checks passed: Excel seed, shared equity, BUY and SELL.');
