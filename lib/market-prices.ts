import type { SymbolCode } from '@/lib/portfolio';

export const MARKET_DATA_PROVIDER = 'Twelve Data ผ่าน Proxy ที่ปลอดภัย';
export const MARKET_PRICE_ENDPOINT =
  'https://cal-risk-forex.chonnateefamilylove.workers.dev/api/prices';

export const MARKET_DATA_SYMBOLS: Record<SymbolCode, string> = {
  XAUUSD: 'XAU/USD',
  USOIL: 'WTI/USD',
};

export type MarketPriceSnapshot = {
  prices: Record<SymbolCode, number>;
  fetchedAt: string;
};

export async function fetchCurrentMarketPrices(
  proxyUrl?: string,
  fetcher: typeof fetch = fetch,
): Promise<MarketPriceSnapshot> {
  const normalized = (proxyUrl ?? '').trim();
  if (!normalized) {
    throw new Error('กรุณาตั้งค่า Cloudflare Proxy URL ก่อนดึงราคาตลาด');
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('Proxy URL ไม่ถูกต้อง');
  }
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) {
    throw new Error('Proxy URL ต้องใช้ HTTPS');
  }
  if (!url.pathname.endsWith('/api/prices')) {
    throw new Error('Proxy URL ต้องลงท้ายด้วย /api/prices');
  }

  const response = await fetcher(url);
  const payload = (await response.json()) as {
    prices?: Partial<Record<SymbolCode, number>>;
    fetchedAt?: string;
    message?: string;
    error?: string;
  };
  const xauPrice = Number(payload.prices?.XAUUSD);
  const oilPrice = Number(payload.prices?.USOIL);

  if (!response.ok || !(xauPrice > 0) || !(oilPrice > 0)) {
    throw new Error(
      payload.message ||
        payload.error ||
        `ดึงราคา XAU/USD และ WTI/USD ผ่าน Proxy ไม่สำเร็จ (HTTP ${response.status})`,
    );
  }

  return {
    prices: { XAUUSD: xauPrice, USOIL: oilPrice },
    fetchedAt:
      payload.fetchedAt && Number.isFinite(Date.parse(payload.fetchedAt))
        ? payload.fetchedAt
        : new Date().toISOString(),
  };
}
