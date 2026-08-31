import type { SymbolCode } from '@/lib/portfolio';

export const MARKET_DATA_PROVIDER = 'Twelve Data';

export const MARKET_DATA_SYMBOLS: Record<SymbolCode, string> = {
  XAUUSD: 'XAU/USD',
  USOIL: 'WTI/USD',
};

export type MarketPriceSnapshot = {
  prices: Record<SymbolCode, number>;
  fetchedAt: string;
};

type PriceResponse = {
  price?: string;
  status?: string;
  code?: number;
  message?: string;
};

export async function fetchCurrentMarketPrices(
  apiKeyOrUrl?: string,
  fetcher: typeof fetch = fetch,
): Promise<MarketPriceSnapshot> {
  const normalized = (apiKeyOrUrl ?? '').trim();

  // หากเป็น URL (เช่น Cloudflare Worker / Serverless Proxy)
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    const response = await fetcher(normalized);
    const payload = (await response.json()) as {
      prices?: Record<SymbolCode, number>;
      fetchedAt?: string;
      message?: string;
      error?: string;
    };

    if (!response.ok || !payload.prices) {
      throw new Error(
        payload.message || payload.error || `ดึงราคาผ่าน Proxy ไม่สำเร็จ (HTTP ${response.status})`,
      );
    }

    return {
      prices: payload.prices,
      fetchedAt: payload.fetchedAt || new Date().toISOString(),
    };
  }

  // หากไม่ได้ระบุ key หรือ URL ให้ลองเรียก /api/prices ของ Cloudflare ก่อน
  if (!normalized) {
    try {
      const response = await fetcher('/api/prices');
      if (response.ok) {
        const payload = (await response.json()) as {
          prices?: Record<SymbolCode, number>;
          fetchedAt?: string;
        };
        if (payload.prices) {
          return {
            prices: payload.prices,
            fetchedAt: payload.fetchedAt || new Date().toISOString(),
          };
        }
      }
    } catch {
      // Ignored
    }
    throw new Error('กรุณากรอก Twelve Data API key หรือ Proxy URL');
  }

  const entries = await Promise.all(
    (Object.entries(MARKET_DATA_SYMBOLS) as [SymbolCode, string][]).map(
      async ([symbol, providerSymbol]) => {
        const url = new URL('https://api.twelvedata.com/price');
        url.searchParams.set('symbol', providerSymbol);
        url.searchParams.set('dp', '5');

        const response = await fetcher(url, {
          headers: { Authorization: `apikey ${normalized}` },
        });
        const payload = (await response.json()) as PriceResponse;
        const price = Number(payload.price);

        if (!response.ok || payload.status === 'error' || !(price > 0)) {
          throw new Error(
            payload.message ||
              `ดึงราคา ${providerSymbol} ไม่สำเร็จ (HTTP ${response.status})`,
          );
        }

        return [symbol, price] as const;
      },
    ),
  );

  return {
    prices: Object.fromEntries(entries) as Record<SymbolCode, number>,
    fetchedAt: new Date().toISOString(),
  };
}
