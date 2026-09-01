import assert from 'node:assert/strict';

import {
  addCashFlow,
  calculateClosePnl,
  closeOrder,
  createBalanceAdjustment,
  createDefaultState,
  getAccountBalance,
  getEquity,
  getPositionSummaries,
  getSharedPortfolioLiquidationPrice,
  getStandaloneLiquidationPrice,
  getUnrealizedPnl,
  normalizePortfolioState,
  parsePortfolioState,
  reverseCashFlow,
  reverseClose,
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

const deposited = addCashFlow(state, {
  id: 'deposit-test',
  kind: 'DEPOSIT',
  amount: 100,
  occurredAt: '2026-09-01T10:00:00.000Z',
  note: 'test',
});
closeTo(getAccountBalance(deposited), 4400);
const withdrawn = addCashFlow(deposited, {
  id: 'withdraw-test',
  kind: 'WITHDRAWAL',
  amount: 200,
  occurredAt: '2026-09-01T10:01:00.000Z',
  note: 'test',
});
closeTo(getAccountBalance(withdrawn), 4200);
assert.throws(
  () =>
    addCashFlow(withdrawn, {
      id: 'over-withdraw-test',
      kind: 'WITHDRAWAL',
      amount: 5000,
      occurredAt: '2026-09-01T10:02:00.000Z',
      note: 'must fail',
    }),
  /ยอดถอนมากกว่า Balance/,
);

const adjustment = createBalanceAdjustment(
  withdrawn,
  4400,
  'ตรงกับ MT5',
  '2026-09-01T10:03:00.000Z',
);
assert.ok(adjustment);
assert.equal(adjustment.kind, 'BALANCE_ADJUSTMENT');
const adjusted = addCashFlow(withdrawn, adjustment);
closeTo(getAccountBalance(adjusted), 4400);
const reversedAdjustment = reverseCashFlow(
  adjusted,
  adjustment.id,
  'test reversal',
);
closeTo(getAccountBalance(reversedAdjustment), 4200);

const closeScenario = {
  ...createDefaultState(),
  initialBalance: 1000,
  currentPrices: { XAUUSD: 2100, USOIL: 60 },
  orders: [
    {
      id: 'buy-close-check',
      symbol: 'XAUUSD' as const,
      side: 'BUY' as const,
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
const equityBeforeClose = getEquity(closeScenario);
const closed = closeOrder(closeScenario, {
  orderId: 'buy-close-check',
  lots: 0.4,
  exitPrice: 2100,
  closedAt: '2026-09-01T10:04:00.000Z',
  note: '',
});
closeTo(getEquity(closed), equityBeforeClose);
closeTo(getAccountBalance(closed), 1040);
const reopened = reverseClose(closed, closed.closes[0].id, 'บันทึกผิด');
closeTo(reopened.orders[0].openLots, 1);
closeTo(getAccountBalance(reopened), 1000);

assert.throws(
  () => parsePortfolioState({ ...state, orders: [{}] }),
  /รายการออเดอร์ไม่ถูกต้อง/,
);
assert.throws(
  () => parsePortfolioState({ ...state, initialBalance: -1 }),
  /ทุนตั้งต้นไม่ถูกต้อง/,
);
assert.throws(
  () =>
    parsePortfolioState({ ...state, currentPrices: { XAUUSD: 0, USOIL: 60 } }),
  /ราคาปัจจุบันต้องมากกว่า 0/,
);
const { revision: _revision, ...versionTwoWithoutRevision } = state;
const migrated = parsePortfolioState({
  ...versionTwoWithoutRevision,
  version: 1,
});
assert.equal(migrated.version, 2);
assert.equal(migrated.revision, 0);

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
  'Calculation checks passed: exact Excel model, BUY/SELL, cash flow, adjustment, reversal and validation.',
);
