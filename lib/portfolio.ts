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
};

export type CashFlow = {
  id: string;
  kind: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  occurredAt: string;
  note: string;
};

export type PortfolioState = {
  version: 1;
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
  return state.closes.reduce((total, close) => total + close.realizedPnl, 0);
}

export function getCashFlowTotal(state: PortfolioState) {
  return state.cashFlows.reduce(
    (total, flow) =>
      total + (flow.kind === 'DEPOSIT' ? flow.amount : -flow.amount),
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
    updatedAt: new Date().toISOString(),
  };
}

export function isPortfolioState(value: unknown): value is PortfolioState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<PortfolioState>;
  return (
    state.version === 1 &&
    typeof state.initialBalance === 'number' &&
    typeof state.stopOutEquity === 'number' &&
    Array.isArray(state.orders) &&
    Array.isArray(state.closes) &&
    Array.isArray(state.cashFlows) &&
    Boolean(state.currentPrices?.XAUUSD) &&
    Boolean(state.currentPrices?.USOIL) &&
    Boolean(state.instruments?.XAUUSD) &&
    Boolean(state.instruments?.USOIL)
  );
}

export function normalizePortfolioState(state: PortfolioState): PortfolioState {
  return {
    ...state,
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
  5143.42, 5078.17, 5044.09, 5012.29, 4941.92, 4833.53, 4774.08,
  4721.03, 4711.75, 4696.56, 4679.61, 4675.12, 4671.01, 4665.7,
  4662.84, 4625.39, 4629.38,
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
    version: 1,
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
