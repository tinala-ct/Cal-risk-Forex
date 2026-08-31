import type { SymbolCode } from '@/lib/portfolio';

export const MARKET_DATA_PROVIDER = 'ตลาดโลก (Binance Gold)';

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
  currentPrices?: Record<SymbolCode, number>,
): Promise<MarketPriceSnapshot> {
  const normalized = (apiKeyOrUrl ?? '').trim();

  // 1. หากเป็น URL (เช่น Cloudflare Worker / Serverless Proxy)
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

  // 2. หากไม่ได้ระบุ key ให้ใช้ Public Live Feed จากตลาดโลก (Binance Gold PAXG/USDT) อัตโนมัติ ไม่ต้องมี API Key
  if (!normalized) {
    const response = await fetcher(
      'https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT',
    );
    if (!response.ok) {
      throw new Error(`ดึงราคาจากตลาดโลกไม่สำเร็จ (HTTP ${response.status})`);
    }

    const data = (await response.json()) as { price?: string; message?: string };
    const goldPrice = Number(data.price);
    if (!(goldPrice > 0)) {
      throw new Error('รูปแบบราคาทองคำไม่ถูกต้อง');
    }

    return {
      prices: {
        XAUUSD: Number(goldPrice.toFixed(2)),
        USOIL: currentPrices?.USOIL ?? 64.8,
      },
      fetchedAt: new Date().toISOString(),
    };
  }

  // 3. หากระบุ Twelve Data API key
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
