interface Env {
  TWELVE_DATA_API_KEY?: string;
  ALLOWED_ORIGINS?: string;
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
}

type RateEntry = { startedAt: number; count: number };
const rateByIp = new Map<string, RateEntry>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const DEFAULT_ALLOWED_ORIGINS = [
  'https://tinala-ct.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function getAllowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (origin && allowed.includes(origin.replace(/\/$/, ''))) return origin;
  const sameOriginRequest =
    !origin && request.headers.get('Sec-Fetch-Site') === 'same-origin';
  return sameOriginRequest ? new URL(request.url).origin : null;
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      ...extraHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function isRateLimited(request: Request) {
  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const current = rateByIp.get(ip);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateByIp.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT;
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api/prices') return env.ASSETS.fetch(request);

    const allowedOrigin = getAllowedOrigin(request, env);
    if (!allowedOrigin) {
      return new Response(JSON.stringify({ error: 'Origin นี้ไม่ได้รับอนุญาต' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(allowedOrigin),
      });
    }
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'รองรับเฉพาะ GET' }, 405, allowedOrigin);
    }
    if (isRateLimited(request)) {
      return jsonResponse(
        { error: 'เรียกดูราคาถี่เกินไป กรุณารอประมาณ 1 นาที' },
        429,
        allowedOrigin,
        { 'Retry-After': '60' },
      );
    }

    const apiKey = env.TWELVE_DATA_API_KEY;
    if (!apiKey) {
      return jsonResponse(
        { error: 'ยังไม่ได้ตั้งค่า TWELVE_DATA_API_KEY ใน Cloudflare Secrets' },
        500,
        allowedOrigin,
      );
    }

    // Cache ข้อมูลดิบ 30 วินาที แล้วเติม CORS ตาม Origin ของแต่ละ request
    const workerCaches =
      typeof caches !== 'undefined'
        ? (caches as CacheStorage & { default?: Cache })
        : null;
    const cache = workerCaches?.default ?? null;
    const cacheKey = new Request(`${url.origin}/api/prices`, { method: 'GET' });
    if (cache) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const payload = (await cached.json()) as Record<string, unknown>;
        return jsonResponse(payload, 200, allowedOrigin, {
          'Cache-Control': 'public, max-age=30',
          'X-Market-Cache': 'HIT',
        });
      }
    }

    try {
      const [resXAU, resOIL] = await Promise.all([
        fetch('https://api.twelvedata.com/price?symbol=XAU/USD&dp=5', {
          headers: { Authorization: `apikey ${apiKey}` },
        }),
        fetch('https://api.twelvedata.com/price?symbol=WTI/USD&dp=5', {
          headers: { Authorization: `apikey ${apiKey}` },
        }),
      ]);
      const dataXAU = (await resXAU.json()) as {
        price?: string;
        message?: string;
      };
      const dataOIL = (await resOIL.json()) as {
        price?: string;
        message?: string;
      };
      const xauPrice = Number(dataXAU.price);
      const oilPrice = Number(dataOIL.price);
      if (!resXAU.ok || !resOIL.ok || !(xauPrice > 0) || !(oilPrice > 0)) {
        throw new Error(
          dataXAU.message ||
            dataOIL.message ||
            'ไม่สามารถดึงราคาจาก Twelve Data ได้',
        );
      }

      const payload = {
        prices: { XAUUSD: xauPrice, USOIL: oilPrice },
        fetchedAt: new Date().toISOString(),
      };
      if (cache) {
        await cache.put(
          cacheKey,
          new Response(JSON.stringify(payload), {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=30',
            },
          }),
        );
      }
      return jsonResponse(payload, 200, allowedOrigin, {
        'Cache-Control': 'public, max-age=30',
        'X-Market-Cache': 'MISS',
      });
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : String(error) },
        502,
        allowedOrigin,
      );
    }
  },
};

export default worker;
