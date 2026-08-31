import assert from 'node:assert/strict';

import {
  fetchCurrentMarketPrices,
  MARKET_DATA_SYMBOLS,
} from '../lib/market-prices.ts';

const requestedSymbols: string[] = [];
const snapshot = await fetchCurrentMarketPrices(
  'local-test-key',
  async (input) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    const symbol = url.searchParams.get('symbol') ?? '';
    requestedSymbols.push(symbol);

    return new Response(
      JSON.stringify({ price: symbol === 'XAU/USD' ? '3388.125' : '64.875' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  },
);

assert.deepEqual(MARKET_DATA_SYMBOLS, {
  XAUUSD: 'XAU/USD',
  USOIL: 'WTI/USD',
});
assert.deepEqual(requestedSymbols.sort(), ['WTI/USD', 'XAU/USD']);
assert.equal(snapshot.prices.XAUUSD, 3388.125);
assert.equal(snapshot.prices.USOIL, 64.875);

await assert.rejects(
  () =>
    fetchCurrentMarketPrices(
      'bad-key',
      async () =>
        new Response(
          JSON.stringify({ status: 'error', message: 'API key is invalid' }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
    ),
  /API key is invalid/,
);

console.log(
  'Market price checks passed: XAU/USD and WTI/USD mapping and errors.',
);
