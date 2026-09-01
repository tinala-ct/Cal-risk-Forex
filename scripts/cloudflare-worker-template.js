/**
 * Cloudflare Worker สำหรับซ่อน Twelve Data API key
 *
 * Secrets / Variables:
 * - TWELVE_DATA_API_KEY: API key ของ Twelve Data (Secret)
 * - ALLOWED_ORIGINS: https://tinala-ct.github.io (Variable)
 *
 * หลัง Deploy ให้นำ URL ที่ลงท้ายด้วย /api/prices ไปใส่ในหน้าเว็บ เช่น
 * https://riskledger-prices.<account>.workers.dev/api/prices
 */

const rateByIp = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || 'https://tinala-ct.github.io')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''));
  return origin && allowed.includes(origin.replace(/\/$/, '')) ? origin : null;
}

function headers(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  };
}

function json(body, status, origin, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers(origin), ...extra },
  });
}

function rateLimited(request) {
  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const entry = rateByIp.get(ip);
  if (!entry || now - entry.startedAt >= RATE_WINDOW_MS) {
    rateByIp.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/prices') {
      return new Response('Not found', { status: 404 });
    }
    const origin = allowedOrigin(request, env);
    if (!origin) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: headers(origin) });
    }
    if (request.method !== 'GET')
      return json({ error: 'GET only' }, 405, origin);
    if (rateLimited(request)) {
      return json({ error: 'เรียกดูราคาถี่เกินไป' }, 429, origin, {
        'Retry-After': '60',
      });
    }
    if (!env.TWELVE_DATA_API_KEY) {
      return json({ error: 'ยังไม่ได้ตั้งค่า TWELVE_DATA_API_KEY' }, 500, origin);
    }

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/api/prices`);
    const cached = await cache.match(cacheKey);
    if (cached) {
      return json(await cached.json(), 200, origin, {
        'Cache-Control': 'public, max-age=30',
        'X-Market-Cache': 'HIT',
      });
    }

    try {
      const authorization = `apikey ${env.TWELVE_DATA_API_KEY}`;
      const [xauResponse, oilResponse] = await Promise.all([
        fetch('https://api.twelvedata.com/price?symbol=XAU/USD&dp=5', {
          headers: { Authorization: authorization },
        }),
        fetch('https://api.twelvedata.com/price?symbol=WTI/USD&dp=5', {
          headers: { Authorization: authorization },
        }),
      ]);
      const [xau, oil] = await Promise.all([
        xauResponse.json(),
        oilResponse.json(),
      ]);
      const xauPrice = Number(xau.price);
      const oilPrice = Number(oil.price);
      if (
        !xauResponse.ok ||
        !oilResponse.ok ||
        !(xauPrice > 0) ||
        !(oilPrice > 0)
      ) {
        throw new Error(xau.message || oil.message || 'ดึงราคาไม่สำเร็จ');
      }
      const payload = {
        prices: { XAUUSD: xauPrice, USOIL: oilPrice },
        fetchedAt: new Date().toISOString(),
      };
      await cache.put(
        cacheKey,
        new Response(JSON.stringify(payload), {
          headers: { 'Cache-Control': 'public, max-age=30' },
        }),
      );
      return json(payload, 200, origin, {
        'Cache-Control': 'public, max-age=30',
        'X-Market-Cache': 'MISS',
      });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : String(error) },
        502,
        origin,
      );
    }
  },
};

export default worker;
