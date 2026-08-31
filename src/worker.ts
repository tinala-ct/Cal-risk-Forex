interface Env {
  TWELVE_DATA_API_KEY?: string;
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API ดึงราคา Realtime
    if (url.pathname === '/api/prices') {
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      const apiKey = env.TWELVE_DATA_API_KEY;
      if (!apiKey) {
        return new Response(
          JSON.stringify({
            error: 'ยังไม่ได้ตั้งค่า TWELVE_DATA_API_KEY ใน Cloudflare Secrets',
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      // Cache บน Cloudflare 30 วินาที
      // @ts-expect-error caches.default is available in Cloudflare Workers runtime
      const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
      const cacheUrl = new URL(request.url);
      cacheUrl.search = '';
      const cacheKey = new Request(cacheUrl.toString(), request);
      if (cache) {
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) return cachedResponse;
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

        const dataXAU = (await resXAU.json()) as { price?: string; message?: string };
        const dataOIL = (await resOIL.json()) as { price?: string; message?: string };

        const xauPrice = Number(dataXAU.price);
        const oilPrice = Number(dataOIL.price);

        if (!(xauPrice > 0) || !(oilPrice > 0)) {
          throw new Error(
            dataXAU.message || dataOIL.message || 'ไม่สามารถดึงราคาจาก Twelve Data ได้',
          );
        }

        const body = JSON.stringify({
          prices: { XAUUSD: xauPrice, USOIL: oilPrice },
          fetchedAt: new Date().toISOString(),
        });

        const response = new Response(body, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=30',
          },
        });

        if (cache) {
          await cache.put(cacheKey, response.clone());
        }
        return response;
      } catch (err) {
        return new Response(
          JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }
    }

    // ส่งไฟล์หน้าเว็บ Frontend (HTML, JS, CSS) จาก ./dist
    return env.ASSETS.fetch(request);
  },
};
