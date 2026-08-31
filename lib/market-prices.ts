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
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<MarketPriceSnapshot> {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey) throw new Error('กรุณากรอก Twelve Data API key');

  const entries = await Promise.all(
    (Object.entries(MARKET_DATA_SYMBOLS) as [SymbolCode, string][]).map(
      async ([symbol, providerSymbol]) => {
        const url = new URL('https://api.twelvedata.com/price');
        url.searchParams.set('symbol', providerSymbol);
        url.searchParams.set('dp', '5');

        const response = await fetcher(url, {
          headers: { Authorization: `apikey ${normalizedKey}` },
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
