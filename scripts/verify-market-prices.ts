import assert from 'node:assert/strict';

import {
  fetchCurrentMarketPrices,
  MARKET_DATA_SYMBOLS,
  MARKET_PRICE_ENDPOINT,
} from '../lib/market-prices.ts';

let requestedUrl = '';
const snapshot = await fetchCurrentMarketPrices(
  'https://prices.example.workers.dev/api/prices',
  async (input) => {
    requestedUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    return new Response(
      JSON.stringify({
        prices: { XAUUSD: 3388.125, USOIL: 64.875 },
        fetchedAt: '2026-09-01T10:00:00.000Z',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  },
);

assert.deepEqual(MARKET_DATA_SYMBOLS, {
  XAUUSD: 'XAU/USD',
  USOIL: 'WTI/USD',
});
assert.equal(
  MARKET_PRICE_ENDPOINT,
  'https://cal-risk-forex.chonnateefamilylove.workers.dev/api/prices',
);
assert.equal(requestedUrl, 'https://prices.example.workers.dev/api/prices');
assert.equal(snapshot.prices.XAUUSD, 3388.125);
assert.equal(snapshot.prices.USOIL, 64.875);

await assert.rejects(
  () => fetchCurrentMarketPrices(),
  /ตั้งค่า Cloudflare Proxy URL/,
);
await assert.rejects(
  () => fetchCurrentMarketPrices('http://prices.example.com/api/prices'),
  /ต้องใช้ HTTPS/,
);
await assert.rejects(
  () =>
    fetchCurrentMarketPrices(
      'https://prices.example.workers.dev/api/prices',
      async () =>
        new Response(JSON.stringify({ prices: { XAUUSD: 3388.125 } }), {
          status: 200,
        }),
    ),
  /ดึงราคา XAU\/USD และ WTI\/USD/,
);

console.log(
  'Market price checks passed: secure proxy only, complete XAU/USD + WTI/USD payload and errors.',
);
