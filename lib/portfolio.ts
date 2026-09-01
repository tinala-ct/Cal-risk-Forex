export type SymbolCode = 'XAUUSD' | 'USOIL';
export type Side = 'BUY' | 'SELL';

export type InstrumentConfig = {
  symbol: SymbolCode;
  label: string;
  contractSize: number;
  priceDecimals: number;
};

export type Order = {
  id: string;
  symbol: SymbolCode;
  side: Side;
  entryPrice: number;
  initialLots: number;
  openLots: number;
  openedAt: string;
  note: string;
};

export type CloseEvent = {
  id: string;
  orderId: string;
  symbol: SymbolCode;
  side: Side;
  lots: number;
  entryPrice: number;
  exitPrice: number;
  contractSize: number;
  realizedPnl: number;
  closedAt: string;
  note: string;
  reversedAt?: string;
  reversalNote?: string;
};

export type CashFlow = {
  id: string;
  kind: 'DEPOSIT' | 'WITHDRAWAL' | 'BALANCE_ADJUSTMENT';
  amount: number;
  occurredAt: string;
  note: string;
  balanceBefore?: number;
  balanceAfter?: number;
  reversedAt?: string;
  reversalNote?: string;
};

export type PortfolioState = {
  version: 2;
  revision: number;
  initialBalance: number;
  stopOutEquity: number;
  currentPrices: Record<SymbolCode, number>;
  instruments: Record<SymbolCode, InstrumentConfig>;
  orders: Order[];
  closes: CloseEvent[];
  cashFlows: CashFlow[];
  updatedAt: string;
};

export type PositionSummary = {
  symbol: SymbolCode;
  side: Side;
  lots: number;
  averageEntry: number;
  currentPrice: number;
  unrealizedPnl: number;
};

// Fixed to the workbook and the XM instruments used by this portfolio.
// GOLD on an Ultra Low Micro account is 1 oz per lot. The workbook's Oil
// position is OIL/OILCash (100 barrels per lot), not the OILMn mini contract.
export const LIQUIDATION_EQUITY = 0;
export const FIXED_INSTRUMENTS: Record<SymbolCode, InstrumentConfig> = {
  XAUUSD: {
    symbol: 'XAUUSD',
    label: 'XM GOLD Ultra Low Micro',
    contractSize: 1,
    priceDecimals: 2,
  },
  USOIL: {
    symbol: 'USOIL',
    label: 'XM OIL / OILCash',
    contractSize: 100,
    priceDecimals: 2,
  },
};

const sideSign = (side: Side) => (side === 'BUY' ? 1 : -1);
const positiveLots = (lots: number) => (lots > 1e-9 ? lots : 0);
export const getContractSize = (symbol: SymbolCode) =>
  FIXED_INSTRUMENTS[symbol].contractSize;

export function calculateOrderUnrealized(
  order: Order,
  currentPrice: number,
  contractSize: number,
) {
  return (
    sideSign(order.side) *
    (currentPrice - order.entryPrice) *
    positiveLots(order.openLots) *
    contractSize
  );
}

export function calculateClosePnl(
  side: Side,
  entryPrice: number,
  exitPrice: number,
  lots: number,
  contractSize: number,
) {
  return sideSign(side) * (exitPrice - entryPrice) * lots * contractSize;
}

export function getOpenOrders(state: PortfolioState) {
  return state.orders.filter((order) => positiveLots(order.openLots) > 0);
}

export function getPositionSummaries(state: PortfolioState): PositionSummary[] {
  const keys: Array<[SymbolCode, Side]> = [
    ['XAUUSD', 'BUY'],
    ['XAUUSD', 'SELL'],
    ['USOIL', 'BUY'],
    ['USOIL', 'SELL'],
  ];

  return keys.flatMap(([symbol, side]) => {
    const orders = getOpenOrders(state).filter(
      (order) => order.symbol === symbol && order.side === side,
    );
    const lots = orders.reduce((total, order) => total + order.openLots, 0);
    if (lots <= 1e-9) return [];
    const averageEntry =
      orders.reduce(
        (total, order) => total + order.entryPrice * order.openLots,
        0,
      ) / lots;
    const currentPrice = state.currentPrices[symbol];
    const contractSize = getContractSize(symbol);
    const unrealizedPnl = orders.reduce(
      (total, order) =>
        total + calculateOrderUnrealized(order, currentPrice, contractSize),
      0,
    );
    return [{ symbol, side, lots, averageEntry, currentPrice, unrealizedPnl }];
  });
}

export function getRealizedPnl(state: PortfolioState) {
  return state.closes.reduce(
    (total, close) => total + (close.reversedAt ? 0 : close.realizedPnl),
    0,
  );
}

export function getCashFlowImpact(flow: CashFlow) {
  if (flow.reversedAt) return 0;
  if (flow.kind === 'BALANCE_ADJUSTMENT') return flow.amount;
  return flow.kind === 'DEPOSIT' ? flow.amount : -flow.amount;
}

export function getCashFlowTotal(state: PortfolioState) {
  return state.cashFlows.reduce(
    (total, flow) => total + getCashFlowImpact(flow),
    0,
  );
}

export function getAccountBalance(state: PortfolioState) {
  return state.initialBalance + getCashFlowTotal(state) + getRealizedPnl(state);
}

export function getUnrealizedPnl(state: PortfolioState) {
  return getOpenOrders(state).reduce((total, order) => {
    const contractSize = getContractSize(order.symbol);
    return (
      total +
      calculateOrderUnrealized(
        order,
        state.currentPrices[order.symbol],
        contractSize,
      )
    );
  }, 0);
}

export function getEquity(state: PortfolioState) {
  return getAccountBalance(state) + getUnrealizedPnl(state);
}

export function getStandaloneLiquidationPrice(
  state: PortfolioState,
  targetSymbol: SymbolCode,
  side: Side,
) {
  const position = getPositionSummaries(state).find(
    (item) => item.symbol === targetSymbol && item.side === side,
  );

  if (!position) {
    return {
      kind: 'NO_EXPOSURE' as const,
      price: null,
      lots: 0,
      averageEntry: null,
    };
  }

  // This is the workbook's original model, expressed as the actual price:
  // BUY  = average entry - balance / (lots * contract size)
  // SELL = average entry + balance / (lots * contract size)
  // It intentionally treats each position independently and does not deduct
  // unrealized P/L from the other instrument.
  const price =
    position.averageEntry -
    (sideSign(side) * getAccountBalance(state)) /
      (position.lots * getContractSize(targetSymbol));

  return {
    kind: price < 0 ? ('BELOW_ZERO' as const) : ('PRICE' as const),
    price,
    lots: position.lots,
    averageEntry: position.averageEntry,
  };
}

export function getSharedPortfolioLiquidationPrice(
  state: PortfolioState,
  targetSymbol: SymbolCode,
) {
  const balance = getAccountBalance(state);
  let targetExposure = 0;
  let targetEntryValue = 0;
  let otherPnl = 0;

  for (const order of getOpenOrders(state)) {
    const signedExposure =
      sideSign(order.side) * order.openLots * getContractSize(order.symbol);
    if (order.symbol === targetSymbol) {
      targetExposure += signedExposure;
      targetEntryValue += signedExposure * order.entryPrice;
    } else {
      otherPnl += calculateOrderUnrealized(
        order,
        state.currentPrices[order.symbol],
        getContractSize(order.symbol),
      );
    }
  }

  if (Math.abs(targetExposure) <= 1e-9) {
    return {
      kind: 'NO_EXPOSURE' as const,
      price: null,
      targetExposure,
      otherPnl,
    };
  }

  const price =
    (LIQUIDATION_EQUITY - balance - otherPnl + targetEntryValue) /
    targetExposure;
  return {
    kind: price < 0 ? ('BELOW_ZERO' as const) : ('PRICE' as const),
    price,
    targetExposure,
    otherPnl,
  };
}

export function closeOrder(
  state: PortfolioState,
  input: {
    orderId: string;
    lots: number;
    exitPrice: number;
    closedAt: string;
    note: string;
  },
): PortfolioState {
  const order = state.orders.find((item) => item.id === input.orderId);
  if (!order) throw new Error('ไม่พบออเดอร์ที่ต้องการปิด');
  if (input.lots <= 0 || input.lots - order.openLots > 1e-9) {
    throw new Error('จำนวน Lot ที่ปิดไม่ถูกต้อง');
  }
  if (input.exitPrice <= 0) throw new Error('ราคาปิดต้องมากกว่า 0');
  if (!Number.isFinite(Date.parse(input.closedAt))) {
    throw new Error('วันที่และเวลาปิดไม่ถูกต้อง');
  }

  const contractSize = getContractSize(order.symbol);
  const realizedPnl = calculateClosePnl(
    order.side,
    order.entryPrice,
    input.exitPrice,
    input.lots,
    contractSize,
  );
  const nextOpenLots = positiveLots(order.openLots - input.lots);

  return {
    ...state,
    orders: state.orders.map((item) =>
      item.id === order.id ? { ...item, openLots: nextOpenLots } : item,
    ),
    closes: [
      {
        id: crypto.randomUUID(),
        orderId: order.id,
        symbol: order.symbol,
        side: order.side,
        lots: input.lots,
        entryPrice: order.entryPrice,
        exitPrice: input.exitPrice,
        contractSize,
        realizedPnl,
        closedAt: input.closedAt,
        note: input.note,
      },
      ...state.closes,
    ],
    revision: state.revision + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function addCashFlow(state: PortfolioState, flow: CashFlow) {
  if (!Number.isFinite(flow.amount) || Math.abs(flow.amount) <= 1e-9) {
    throw new Error('จำนวนเงินต้องมากกว่า 0');
  }
  if (!Number.isFinite(Date.parse(flow.occurredAt))) {
    throw new Error('วันที่และเวลารายการไม่ถูกต้อง');
  }
  if (
    flow.kind !== 'BALANCE_ADJUSTMENT' &&
    (!(flow.amount > 0) ||
      flow.balanceBefore !== undefined ||
      flow.balanceAfter !== undefined)
  ) {
    throw new Error('รูปแบบรายการฝาก/ถอนไม่ถูกต้อง');
  }
  if (
    flow.kind === 'BALANCE_ADJUSTMENT' &&
    (flow.balanceBefore === undefined ||
      flow.balanceAfter === undefined ||
      Math.abs(flow.balanceBefore - getAccountBalance(state)) > 0.011 ||
      Math.abs(flow.balanceAfter - flow.balanceBefore - flow.amount) > 0.011)
  ) {
    throw new Error('รายการปรับ Balance ไม่ตรงกับ Balance ปัจจุบัน');
  }
  if (
    flow.kind === 'WITHDRAWAL' &&
    flow.amount - getAccountBalance(state) > 1e-9
  ) {
    throw new Error('ยอดถอนมากกว่า Balance ปัจจุบัน');
  }

  return touchPortfolioState({
    ...state,
    cashFlows: [flow, ...state.cashFlows],
  });
}

export function createBalanceAdjustment(
  state: PortfolioState,
  targetBalance: number,
  note: string,
  occurredAt = new Date().toISOString(),
): CashFlow | null {
  if (!Number.isFinite(targetBalance) || targetBalance < 0) {
    throw new Error('Balance ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
  }
  const balanceBefore = getAccountBalance(state);
  const difference = Number((targetBalance - balanceBefore).toFixed(2));
  if (Math.abs(difference) < 0.005) return null;
  return {
    id: crypto.randomUUID(),
    kind: 'BALANCE_ADJUSTMENT',
    amount: difference,
    occurredAt,
    note: note.trim() || `ปรับยอด Balance เป็น ${targetBalance.toFixed(2)} USD`,
    balanceBefore: Number(balanceBefore.toFixed(2)),
    balanceAfter: Number(targetBalance.toFixed(2)),
  };
}

export function updateCashFlowNote(
  state: PortfolioState,
  flowId: string,
  note: string,
) {
  if (!state.cashFlows.some((flow) => flow.id === flowId)) {
    throw new Error('ไม่พบรายการเงินที่ต้องการแก้ไข');
  }
  return touchPortfolioState({
    ...state,
    cashFlows: state.cashFlows.map((flow) =>
      flow.id === flowId ? { ...flow, note: note.trim() } : flow,
    ),
  });
}

export function updateCloseNote(
  state: PortfolioState,
  closeId: string,
  note: string,
) {
  if (!state.closes.some((close) => close.id === closeId)) {
    throw new Error('ไม่พบรายการปิดออเดอร์ที่ต้องการแก้ไข');
  }
  return touchPortfolioState({
    ...state,
    closes: state.closes.map((close) =>
      close.id === closeId ? { ...close, note: note.trim() } : close,
    ),
  });
}

export function reverseCashFlow(
  state: PortfolioState,
  flowId: string,
  reversalNote: string,
) {
  const flow = state.cashFlows.find((item) => item.id === flowId);
  if (!flow) throw new Error('ไม่พบรายการเงินที่ต้องการย้อน');
  if (flow.reversedAt) throw new Error('รายการนี้ถูกย้อนแล้ว');

  const projectedBalance = getAccountBalance(state) - getCashFlowImpact(flow);
  if (projectedBalance < -1e-9) {
    throw new Error('ย้อนรายการนี้ไม่ได้ เพราะจะทำให้ Balance ติดลบ');
  }

  return touchPortfolioState({
    ...state,
    cashFlows: state.cashFlows.map((item) =>
      item.id === flowId
        ? {
            ...item,
            reversedAt: new Date().toISOString(),
            reversalNote: reversalNote.trim() || 'ย้อนรายการที่บันทึกผิด',
          }
        : item,
    ),
  });
}

export function reverseClose(
  state: PortfolioState,
  closeId: string,
  reversalNote: string,
) {
  const close = state.closes.find((item) => item.id === closeId);
  if (!close) throw new Error('ไม่พบรายการปิดออเดอร์ที่ต้องการย้อน');
  if (close.reversedAt) throw new Error('รายการนี้ถูกย้อนแล้ว');
  const order = state.orders.find((item) => item.id === close.orderId);
  if (!order) throw new Error('ไม่พบออเดอร์ต้นทางของรายการปิด');
  if (order.openLots + close.lots - order.initialLots > 1e-9) {
    throw new Error('ย้อนรายการไม่ได้ เพราะ Lot จะมากกว่า Lot เริ่มต้น');
  }

  return touchPortfolioState({
    ...state,
    orders: state.orders.map((item) =>
      item.id === order.id
        ? { ...item, openLots: positiveLots(item.openLots + close.lots) }
        : item,
    ),
    closes: state.closes.map((item) =>
      item.id === closeId
        ? {
            ...item,
            reversedAt: new Date().toISOString(),
            reversalNote: reversalNote.trim() || 'ย้อนรายการปิดที่บันทึกผิด',
          }
        : item,
    ),
  });
}

export function touchPortfolioState(
  state: PortfolioState,
  updatedAt = new Date().toISOString(),
): PortfolioState {
  return {
    ...state,
    version: 2,
    revision: state.revision + 1,
    updatedAt,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isString = (value: unknown): value is string => typeof value === 'string';
const isTimestamp = (value: unknown): value is string =>
  isNonEmptyString(value) && Number.isFinite(Date.parse(value));
const isSymbol = (value: unknown): value is SymbolCode =>
  value === 'XAUUSD' || value === 'USOIL';
const isSide = (value: unknown): value is Side =>
  value === 'BUY' || value === 'SELL';

function isOrder(value: unknown): value is Order {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isSymbol(value.symbol) &&
    isSide(value.side) &&
    isFiniteNumber(value.entryPrice) &&
    value.entryPrice > 0 &&
    isFiniteNumber(value.initialLots) &&
    value.initialLots > 0 &&
    isFiniteNumber(value.openLots) &&
    value.openLots >= 0 &&
    value.openLots <= value.initialLots + 1e-9 &&
    isTimestamp(value.openedAt) &&
    isString(value.note)
  );
}

function isClose(value: unknown): value is CloseEvent {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.orderId) &&
    isSymbol(value.symbol) &&
    isSide(value.side) &&
    isFiniteNumber(value.lots) &&
    value.lots > 0 &&
    isFiniteNumber(value.entryPrice) &&
    value.entryPrice > 0 &&
    isFiniteNumber(value.exitPrice) &&
    value.exitPrice > 0 &&
    isFiniteNumber(value.contractSize) &&
    value.contractSize === getContractSize(value.symbol) &&
    isFiniteNumber(value.realizedPnl) &&
    isTimestamp(value.closedAt) &&
    isString(value.note) &&
    (value.reversedAt === undefined || isTimestamp(value.reversedAt)) &&
    (value.reversalNote === undefined || isString(value.reversalNote))
  );
}

function isCashFlow(value: unknown): value is CashFlow {
  if (!isRecord(value)) return false;
  const kindIsValid =
    value.kind === 'DEPOSIT' ||
    value.kind === 'WITHDRAWAL' ||
    value.kind === 'BALANCE_ADJUSTMENT';
  const amountIsValid =
    isFiniteNumber(value.amount) &&
    (value.kind === 'BALANCE_ADJUSTMENT'
      ? Math.abs(value.amount) > 1e-9
      : value.amount > 0);
  return (
    isNonEmptyString(value.id) &&
    kindIsValid &&
    amountIsValid &&
    isTimestamp(value.occurredAt) &&
    isString(value.note) &&
    (value.balanceBefore === undefined ||
      (isFiniteNumber(value.balanceBefore) && value.balanceBefore >= 0)) &&
    (value.balanceAfter === undefined ||
      (isFiniteNumber(value.balanceAfter) && value.balanceAfter >= 0)) &&
    (value.reversedAt === undefined || isTimestamp(value.reversedAt)) &&
    (value.reversalNote === undefined || isString(value.reversalNote))
  );
}

export function parsePortfolioState(value: unknown): PortfolioState {
  if (!isRecord(value)) throw new Error('ข้อมูลพอร์ตต้องเป็น object');
  if (value.version !== 1 && value.version !== 2) {
    throw new Error('ไม่รองรับเวอร์ชันของไฟล์สำรอง');
  }
  if (!isFiniteNumber(value.initialBalance) || value.initialBalance < 0) {
    throw new Error('ทุนตั้งต้นไม่ถูกต้อง');
  }
  if (!isFiniteNumber(value.stopOutEquity))
    throw new Error('ค่า Equity ไม่ถูกต้อง');
  if (!isRecord(value.currentPrices)) throw new Error('ราคาปัจจุบันไม่ถูกต้อง');
  if (
    !isFiniteNumber(value.currentPrices.XAUUSD) ||
    value.currentPrices.XAUUSD <= 0 ||
    !isFiniteNumber(value.currentPrices.USOIL) ||
    value.currentPrices.USOIL <= 0
  ) {
    throw new Error('ราคาปัจจุบันต้องมากกว่า 0');
  }
  if (!Array.isArray(value.orders) || !value.orders.every(isOrder)) {
    throw new Error('รายการออเดอร์ไม่ถูกต้อง');
  }
  if (!Array.isArray(value.closes) || !value.closes.every(isClose)) {
    throw new Error('รายการปิดออเดอร์ไม่ถูกต้อง');
  }
  if (!Array.isArray(value.cashFlows) || !value.cashFlows.every(isCashFlow)) {
    throw new Error('รายการฝากถอนหรือปรับยอดไม่ถูกต้อง');
  }
  if (!isTimestamp(value.updatedAt)) throw new Error('เวลาอัปเดตไม่ถูกต้อง');

  const orderIds = new Set(value.orders.map((order) => order.id));
  const closeIds = new Set(value.closes.map((close) => close.id));
  const cashFlowIds = new Set(value.cashFlows.map((flow) => flow.id));
  if (
    orderIds.size !== value.orders.length ||
    closeIds.size !== value.closes.length ||
    cashFlowIds.size !== value.cashFlows.length
  ) {
    throw new Error('พบ ID รายการซ้ำในไฟล์ข้อมูล');
  }
  for (const close of value.closes) {
    const order = value.orders.find((item) => item.id === close.orderId);
    if (
      !order ||
      close.symbol !== order.symbol ||
      close.side !== order.side ||
      Math.abs(close.entryPrice - order.entryPrice) > 1e-9
    ) {
      throw new Error('รายการปิดไม่ตรงกับออเดอร์ต้นทาง');
    }
  }
  for (const order of value.orders) {
    const activeClosedLots = value.closes.reduce(
      (total, close) =>
        close.orderId === order.id && !close.reversedAt
          ? total + close.lots
          : total,
      0,
    );
    if (
      Math.abs(order.openLots + activeClosedLots - order.initialLots) > 1e-7
    ) {
      throw new Error('Lot คงเหลือไม่ตรงกับประวัติการปิด');
    }
  }
  for (const flow of value.cashFlows) {
    if (
      flow.kind === 'BALANCE_ADJUSTMENT' &&
      (flow.balanceBefore === undefined ||
        flow.balanceAfter === undefined ||
        Math.abs(flow.balanceAfter - flow.balanceBefore - flow.amount) > 0.011)
    ) {
      throw new Error('รายการปรับ Balance ไม่สอดคล้องกับยอดก่อนและหลัง');
    }
  }

  const migrated: PortfolioState = {
    version: 2,
    revision:
      value.version === 2 &&
      isFiniteNumber(value.revision) &&
      value.revision >= 0
        ? Math.floor(value.revision)
        : 0,
    initialBalance: value.initialBalance,
    stopOutEquity: value.stopOutEquity,
    currentPrices: {
      XAUUSD: value.currentPrices.XAUUSD,
      USOIL: value.currentPrices.USOIL,
    },
    instruments: {
      XAUUSD: { ...FIXED_INSTRUMENTS.XAUUSD },
      USOIL: { ...FIXED_INSTRUMENTS.USOIL },
    },
    orders: value.orders,
    closes: value.closes,
    cashFlows: value.cashFlows,
    updatedAt: value.updatedAt,
  };
  return normalizePortfolioState(migrated);
}

export function normalizePortfolioState(state: PortfolioState): PortfolioState {
  return {
    ...state,
    version: 2,
    revision: Number.isFinite(state.revision) ? Math.max(0, state.revision) : 0,
    // Keep all journal data, but repair calculation settings that older app
    // versions allowed users/imports to alter.
    stopOutEquity: LIQUIDATION_EQUITY,
    instruments: {
      XAUUSD: { ...FIXED_INSTRUMENTS.XAUUSD },
      USOIL: { ...FIXED_INSTRUMENTS.USOIL },
    },
  };
}

const xauPrices = [
  5143.42, 5078.17, 5044.09, 5012.29, 4941.92, 4833.53, 4774.08, 4721.03,
  4711.75, 4696.56, 4679.61, 4675.12, 4671.01, 4665.7, 4662.84, 4625.39,
  4629.38,
];
const oilOrders = [
  [107.3, 0.01],
  [102.88, 0.01],
  [98.95, 0.01],
  [96.77, 0.1],
  [96.26, 0.01],
  [95.57, 0.01],
  [89.85, 0.01],
] as const;

export function createDefaultState(): PortfolioState {
  const seededAt = '2026-08-31T09:00:00.000Z';
  const xau: Order[] = xauPrices.map((entryPrice, index) => ({
    id: `excel-xau-${index + 1}`,
    symbol: 'XAUUSD',
    side: 'BUY',
    entryPrice,
    initialLots: 0.1,
    openLots: 0.1,
    openedAt: seededAt,
    note: `นำเข้าจาก Excel รายการที่ ${index + 1}`,
  }));
  const oil: Order[] = oilOrders.map(([entryPrice, lots], index) => ({
    id: `excel-oil-${index + 1}`,
    symbol: 'USOIL',
    side: 'BUY',
    entryPrice,
    initialLots: lots,
    openLots: lots,
    openedAt: seededAt,
    note: `นำเข้าจาก Excel รายการที่ ${index + 1}`,
  }));

  return {
    version: 2,
    revision: 0,
    initialBalance: 4300,
    stopOutEquity: LIQUIDATION_EQUITY,
    currentPrices: { XAUUSD: 3300, USOIL: 60 },
    instruments: {
      XAUUSD: { ...FIXED_INSTRUMENTS.XAUUSD },
      USOIL: { ...FIXED_INSTRUMENTS.USOIL },
    },
    orders: [...xau, ...oil],
    closes: [],
    cashFlows: [],
    updatedAt: seededAt,
  };
}
