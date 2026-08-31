/**
 * Cloudflare Worker Template สำหรับซ่อน Twelve Data API Key
 * และทำ Cache เพื่อไม่ให้เกินโควต้า 8 ครั้ง/นาที ของ Free Tier
 *
 * วิธีใช้งาน:
 * 1. สมัคร/เข้าเว็บ https://dash.cloudflare.com/ (ฟรี)
 * 2. ไปที่ Workers & Pages > Create application > Create Worker
 * 3. วางโค้ดนี้ลงไปในหน้า Editor แล้วกด Save and Deploy
 * 4. ไปที่แท็บ Settings > Variables and Secrets > เพิ่ม Secret ชื่อ:
 *    TWELVE_DATA_API_KEY = <ใส่ API Key ของคุณที่นี่>
 * 5. นำ URL ของ Worker ที่ได้ (เช่น https://xxx.workers.dev)
 *    มากรอกในปุ่ม "เชื่อมราคา" ในหน้าเว็บของระบบได้ทันที!
 */

export default {
  async fetch(request, env) {
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

    // Caching 30 วินาที เพื่อประหยัดโควต้า 8 ครั้ง/นาที ของ Twelve Data
    const cache = caches.default;
    const cacheUrl = new URL(request.url);
    cacheUrl.search = '';
    const cacheKey = new Request(cacheUrl.toString(), request);
    let cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      return cachedResponse;
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

      const dataXAU = (await resXAU.json());
      const dataOIL = (await resOIL.json());

      const xauPrice = Number(dataXAU.price);
      const oilPrice = Number(dataOIL.price);

      if (!(xauPrice > 0) || !(oilPrice > 0)) {
        throw new Error(
          dataXAU.message || dataOIL.message || 'ไม่สามารถดึงราคาจาก Twelve Data ได้',
        );
      }

      const body = JSON.stringify({
        prices: {
          XAUUSD: xauPrice,
          USOIL: oilPrice,
        },
        fetchedAt: new Date().toISOString(),
      });

      const response = new Response(body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=30',
        },
      });

      await cache.put(cacheKey, response.clone());
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
  },
};
