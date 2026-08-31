import assert from 'node:assert/strict';

import {
  calculateClosePnl,
  createDefaultState,
  getEquity,
  getPositionSummaries,
  getSharedPortfolioLiquidationPrice,
  getStandaloneLiquidationPrice,
  getUnrealizedPnl,
  normalizePortfolioState,
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

const xauExcelLiquidation = getStandaloneLiquidationPrice(
  state,
  'XAUUSD',
  'BUY',
);
const oilExcelLiquidation = getStandaloneLiquidationPrice(
  state,
  'USOIL',
  'BUY',
);
assert.equal(xauExcelLiquidation.kind, 'PRICE');
assert.equal(oilExcelLiquidation.kind, 'BELOW_ZERO');
closeTo(xauExcelLiquidation.price ?? 0, 2268.581764705881);
closeTo(oilExcelLiquidation.price ?? 0, -171.343125);

const xauShared = getSharedPortfolioLiquidationPrice(state, 'XAUUSD');
const oilShared = getSharedPortfolioLiquidationPrice(state, 'USOIL');
assert.equal(xauShared.kind, 'PRICE');
assert.equal(oilShared.kind, 'BELOW_ZERO');
closeTo(xauShared.price ?? 0, 2620.646470588234);
closeTo(oilShared.price ?? 0, -12.1813125);

closeTo(calculateClosePnl('BUY', 100, 110, 0.2, 100), 200);
closeTo(calculateClosePnl('SELL', 100, 90, 0.2, 100), 200);
closeTo(calculateClosePnl('SELL', 100, 110, 0.2, 100), -200);

const repaired = normalizePortfolioState({
  ...state,
  stopOutEquity: 500,
  instruments: {
    XAUUSD: { ...state.instruments.XAUUSD, contractSize: 100 },
    USOIL: { ...state.instruments.USOIL, contractSize: 10 },
  },
});
assert.equal(repaired.stopOutEquity, 0);
assert.equal(repaired.instruments.XAUUSD.contractSize, 1);
assert.equal(repaired.instruments.USOIL.contractSize, 100);

const sellState = {
  ...createDefaultState(),
  initialBalance: 1000,
  orders: [
    {
      id: 'sell-gold-check',
      symbol: 'XAUUSD' as const,
      side: 'SELL' as const,
      entryPrice: 2000,
      initialLots: 1,
      openLots: 1,
      openedAt: '2026-08-31T09:00:00.000Z',
      note: '',
    },
  ],
  closes: [],
  cashFlows: [],
};
const sellLiquidation = getStandaloneLiquidationPrice(
  sellState,
  'XAUUSD',
  'SELL',
);
assert.equal(sellLiquidation.kind, 'PRICE');
closeTo(sellLiquidation.price ?? 0, 3000);

console.log(
  'Calculation checks passed: exact Excel model, fixed XM contract sizes, shared equity, BUY and SELL.',
);
