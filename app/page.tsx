'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArchiveRestore,
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  CloudCheck,
  Download,
  History,
  KeyRound,
  Landmark,
  LogIn,
  LogOut,
  PencilLine,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldAlert,
  TrendingUp,
  Upload,
  WalletCards,
  X,
} from 'lucide-react';

import {
  getCloudPortfolio,
  loginWithGoogle,
  logoutFirebase,
  saveCloudPortfolio,
  subscribeToAuth,
  subscribeToCloudPortfolio,
} from '@/lib/firebase';
import type { User } from 'firebase/auth';
import { TradingViewChart } from '@/components/tradingview-chart';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  calculateOrderUnrealized,
  closeOrder,
  createDefaultState,
  getAccountBalance,
  getContractSize,
  getEquity,
  getOpenOrders,
  getPositionSummaries,
  getRealizedPnl,
  getSharedPortfolioLiquidationPrice,
  getStandaloneLiquidationPrice,
  getUnrealizedPnl,
  isPortfolioState,
  LIQUIDATION_EQUITY,
  normalizePortfolioState,
  type CashFlow,
  type Order,
  type PortfolioState,
  type Side,
  type SymbolCode,
} from '@/lib/portfolio';
import { loadPortfolio, savePortfolio } from '@/lib/portfolio-storage';
import {
  fetchCurrentMarketPrices,
  MARKET_DATA_PROVIDER,
} from '@/lib/market-prices';

const MARKET_API_KEY_STORAGE = 'riskledger-twelve-data-api-key';
const MARKET_UPDATED_AT_STORAGE = 'riskledger-market-updated-at';

const nowForInput = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const money = (value: number, digits = 2) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const number = (value: number, digits = 2) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const dateTime = (value: string) =>
  new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));

export default function Home() {
  const [state, setState] = useState<PortfolioState>(() =>
    createDefaultState(),
  );
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    'loading' | 'saved' | 'saving' | 'error'
  >('loading');
  const [notice, setNotice] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [marketApiKey, setMarketApiKey] = useState(
    () => window.localStorage.getItem(MARKET_API_KEY_STORAGE) ?? '',
  );
  const [marketStatus, setMarketStatus] = useState<'idle' | 'loading'>('idle');
  const [marketUpdatedAt, setMarketUpdatedAt] = useState(
    () => window.localStorage.getItem(MARKET_UPDATED_AT_STORAGE) ?? '',
  );
  const [closingOrder, setClosingOrder] = useState<Order | null>(null);
  const [chartSymbol, setChartSymbol] = useState<'OANDA:XAUUSD' | 'TVC:USOIL'>(
    'OANDA:XAUUSD',
  );
  const [chartOpen, setChartOpen] = useState(true);
  const [autoSync, setAutoSync] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<
    'disconnected' | 'syncing' | 'synced' | 'error'
  >('disconnected');
  const isSyncingFromCloud = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoSync) return;
    void refreshMarketPrices();
    const timer = window.setInterval(() => {
      void refreshMarketPrices();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [autoSync]);

  // โหลดข้อมูลพอร์ตจาก IndexedDB ในเครื่องก่อน
  useEffect(() => {
    loadPortfolio()
      .then((saved) => {
        setState(saved);
        setReady(true);
        setSaveStatus('saved');
      })
      .catch(() => {
        setReady(true);
        setSaveStatus('error');
        setNotice('เปิดฐานข้อมูลในเบราว์เซอร์ไม่ได้ กรุณาส่งออกไฟล์สำรองก่อนปิดหน้า');
      });
  }, []);

  // ติดตามสถานะ Login Google และดึงข้อมูลพอร์ตจาก Cloud
  useEffect(() => {
    const unsub = subscribeToAuth(async (user) => {
      setCurrentUser(user);
      if (user) {
        setCloudSyncStatus('syncing');
        try {
          const cloudState = await getCloudPortfolio(user.uid);
          if (cloudState && cloudState.orders) {
            isSyncingFromCloud.current = true;
            setState(normalizePortfolioState(cloudState));
            await savePortfolio(normalizePortfolioState(cloudState));
            setTimeout(() => {
              isSyncingFromCloud.current = false;
            }, 100);
          } else {
            await saveCloudPortfolio(user.uid, state);
          }
          setCloudSyncStatus('synced');
          setNotice(`เข้าสู่ระบบ Google สำเร็จ (${user.displayName || user.email})`);
        } catch (error) {
          console.error(error);
          setCloudSyncStatus('error');
        }
      } else {
        setCloudSyncStatus('disconnected');
      }
    });
    return () => unsub();
  }, []);

  // ฟังการเปลี่ยนแปลงจากอุปกรณ์อื่นแบบ Realtime (ถ้าเปิดในคอมและมือถือพร้อมกัน)
  useEffect(() => {
    if (!currentUser) return;
    const unsub = subscribeToCloudPortfolio(
      currentUser.uid,
      (cloudData) => {
        if (cloudData && cloudData.orders) {
          isSyncingFromCloud.current = true;
          setState(normalizePortfolioState(cloudData));
          void savePortfolio(normalizePortfolioState(cloudData));
          setTimeout(() => {
            isSyncingFromCloud.current = false;
          }, 100);
          setCloudSyncStatus('synced');
        }
      },
      (error) => {
        console.error('Firestore sync error:', error);
        setCloudSyncStatus('error');
      },
    );
    return () => unsub();
  }, [currentUser]);

  // บันทึกข้อมูลลง IndexedDB ในเครื่อง และส่งขึ้น Cloud เมื่อมีการแก้ไข
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      setSaveStatus('saving');
      savePortfolio(state)
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('error'));

      // ถ้าล็อกอินอยู่และไม่ใช่จังหวะที่รับข้อมูลมาจาก Cloud ให้อัปโหลดขึ้น Cloud
      if (currentUser && !isSyncingFromCloud.current) {
        setCloudSyncStatus('syncing');
        saveCloudPortfolio(currentUser.uid, state)
          .then(() => setCloudSyncStatus('synced'))
          .catch((error) => {
            console.error('Cloud save error:', error);
            setCloudSyncStatus('error');
          });
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [ready, state, currentUser]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const openOrders = useMemo(() => getOpenOrders(state), [state]);
  const summaries = useMemo(() => getPositionSummaries(state), [state]);
  const accountBalance = useMemo(() => getAccountBalance(state), [state]);
  const unrealizedPnl = useMemo(() => getUnrealizedPnl(state), [state]);
  const realizedPnl = useMemo(() => getRealizedPnl(state), [state]);
  const equity = useMemo(() => getEquity(state), [state]);
  const standaloneLiquidations = useMemo(
    () =>
      summaries.map((position) => ({
        position,
        result: getStandaloneLiquidationPrice(
          state,
          position.symbol,
          position.side,
        ),
      })),
    [state, summaries],
  );
  const xauSharedCritical = useMemo(
    () => getSharedPortfolioLiquidationPrice(state, 'XAUUSD'),
    [state],
  );
  const oilSharedCritical = useMemo(
    () => getSharedPortfolioLiquidationPrice(state, 'USOIL'),
    [state],
  );
  const totalLots = openOrders.reduce(
    (total, order) => total + order.openLots,
    0,
  );

  const updatePrice = (symbol: SymbolCode, value: string) => {
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0) return;
    setState((current) => ({
      ...current,
      currentPrices: { ...current.currentPrices, [symbol]: price },
      updatedAt: new Date().toISOString(),
    }));
  };

  const refreshMarketPrices = async (apiKey = marketApiKey) => {
    setMarketStatus('loading');
    try {
      const snapshot = await fetchCurrentMarketPrices(
        apiKey,
        fetch,
        state.currentPrices,
      );
      setState((current) => ({
        ...current,
        currentPrices: {
          ...current.currentPrices,
          ...snapshot.prices,
        },
        updatedAt: snapshot.fetchedAt,
      }));
      setMarketUpdatedAt(snapshot.fetchedAt);
      window.localStorage.setItem(MARKET_UPDATED_AT_STORAGE, snapshot.fetchedAt);
      setNotice('อัปเดตราคาตลาดโลก (XAU/USD Realtime) เรียบร้อยแล้ว');
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'เชื่อมต่อผู้ให้บริการราคาไม่สำเร็จ',
      );
      return false;
    } finally {
      setMarketStatus('idle');
    }
  };

  const connectMarketPrices = async (apiKey: string) => {
    const normalizedKey = apiKey.trim();
    setMarketApiKey(normalizedKey);
    window.localStorage.setItem(MARKET_API_KEY_STORAGE, normalizedKey);
    if (await refreshMarketPrices(normalizedKey)) setMarketOpen(false);
  };

  const disconnectMarketPrices = () => {
    window.localStorage.removeItem(MARKET_API_KEY_STORAGE);
    window.localStorage.removeItem(MARKET_UPDATED_AT_STORAGE);
    setMarketApiKey('');
    setMarketUpdatedAt('');
    setAutoSync(false);
    setMarketOpen(false);
    setNotice('ลบ API key แล้ว ราคาที่บันทึกในพอร์ตยังคงเดิม');
  };

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `riskledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('ส่งออกไฟล์สำรองเรียบร้อย');
  };

  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isPortfolioState(parsed)) throw new Error('invalid');
      setState(
        normalizePortfolioState({
          ...parsed,
          updatedAt: new Date().toISOString(),
        }),
      );
      setNotice('นำเข้าข้อมูลสำรองเรียบร้อย');
    } catch {
      setNotice('ไฟล์สำรองไม่ถูกต้อง จึงไม่ได้เปลี่ยนข้อมูลเดิม');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'เข้าสู่ระบบ Google ไม่สำเร็จ',
      );
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await logoutFirebase();
      setNotice('ออกจากระบบแล้ว ข้อมูลในเครื่องยังคงอยู่');
    } catch {
      setNotice('ออกจากระบบไม่สำเร็จ');
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      {notice && (
        <output className="fixed right-4 top-4 z-[80] flex max-w-sm items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-xl">
          <Save className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="leading-5">{notice}</span>
          <button
            aria-label="ปิดข้อความ"
            className="ml-auto text-muted-foreground"
            onClick={() => setNotice('')}
          >
            <X className="size-4" />
          </button>
        </output>
      )}

      <div className="mx-auto max-w-[1540px] px-4 py-5 sm:px-7 lg:px-10">
        <header className="mb-5 flex flex-col gap-4 border-b border-border/70 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                Portfolio risk ledger
              </p>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${saveStatus === 'error' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}
              >
                <span
                  className={`size-1.5 rounded-full ${saveStatus === 'saving' ? 'animate-pulse bg-amber-500' : saveStatus === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}
                />
                {saveStatus === 'loading'
                  ? 'กำลังเปิดข้อมูล'
                  : saveStatus === 'saving'
                    ? 'กำลังบันทึก'
                    : saveStatus === 'error'
                      ? 'บันทึกไม่สำเร็จ'
                      : 'บันทึกอัตโนมัติแล้ว'}
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
              สมุดบันทึกพอร์ต XAU & Oil
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              ข้อมูลเดิมจาก Excel ถูกนำมาเป็นรายการตั้งต้น รองรับ Buy, Sell
              และการปิดบางส่วน
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {currentUser ? (
              <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/65 px-2.5 py-1 text-xs">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'User'}
                    className="size-6 rounded-full border border-border"
                  />
                ) : (
                  <CloudCheck className="size-4 text-emerald-600" />
                )}
                <div className="hidden sm:block">
                  <span className="block max-w-[130px] truncate font-medium text-foreground">
                    {currentUser.displayName || currentUser.email}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                    <CloudCheck className="size-3" />
                    {cloudSyncStatus === 'syncing' ? 'กำลังซิงค์...' : 'Sync คลาวด์แล้ว'}
                  </span>
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={handleGoogleLogout}
                  title="ออกจากระบบ"
                >
                  <LogOut className="size-3.5 text-muted-foreground hover:text-foreground" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                onClick={handleGoogleLogin}
              >
                <LogIn data-icon="inline-start" /> เข้าสู่ระบบ Google เพื่อ Sync
              </Button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => void importBackup(event.target.files?.[0])}
            />
            <Button
              variant="outline"
              onClick={() => fileInput.current?.click()}
            >
              <Upload data-icon="inline-start" /> นำเข้า
            </Button>
            <Button variant="outline" onClick={exportBackup}>
              <Download data-icon="inline-start" /> สำรองข้อมูล
            </Button>
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings2 data-icon="inline-start" /> ตั้งค่า
            </Button>
            <Button
              size="lg"
              className="bg-primary px-4 shadow-[0_8px_24px_-10px_var(--primary)]"
              onClick={() => setAddOpen(true)}
            >
              <Plus data-icon="inline-start" /> เพิ่มออเดอร์
            </Button>
          </div>
        </header>

        <section className="price-strip mb-4 grid gap-3 rounded-xl border border-border/75 bg-card/80 p-3 shadow-[0_14px_42px_-38px_rgb(15_23_42/0.8)] sm:grid-cols-2 xl:grid-cols-[1fr_1fr_minmax(310px,auto)] xl:items-center">
          <PriceInput
            symbol="XAUUSD"
            label="ราคาทองปัจจุบัน"
            value={state.currentPrices.XAUUSD}
            onChange={updatePrice}
          />
          <PriceInput
            symbol="USOIL"
            label="ราคาน้ำมันปัจจุบัน"
            value={state.currentPrices.USOIL}
            onChange={updatePrice}
          />
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/65 px-3 py-2 sm:col-span-2 xl:col-span-1">
            <div className="min-w-44 flex-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-2 font-medium text-foreground">
                {marketUpdatedAt ? (
                  <RefreshCw className="size-4 text-emerald-600" />
                ) : (
                  <PencilLine className="size-4 text-primary" />
                )}
                {marketUpdatedAt
                  ? MARKET_DATA_PROVIDER
                  : 'ราคา XM / ราคาที่กรอกเอง'}
              </span>
              <span className="mt-0.5 block">
                {marketUpdatedAt
                  ? `ดึงล่าสุด ${dateTime(marketUpdatedAt)}`
                  : 'กด "ดึงราคาตลาดสด" หรือกรอกราคาเอง'}
              </span>
            </div>
            <Button
              size="sm"
              variant={autoSync ? 'default' : 'outline'}
              className={
                autoSync
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                  : 'text-muted-foreground'
              }
              onClick={() => {
                const next = !autoSync;
                setAutoSync(next);
                if (next) void refreshMarketPrices();
              }}
              title="ดึงราคา Realtime อัตโนมัติทุก 15 วินาที"
            >
              <span
                className={`inline-block size-2 rounded-full mr-1.5 ${
                  autoSync ? 'bg-white animate-pulse' : 'bg-emerald-500'
                }`}
              />
              {autoSync ? 'Auto (15s)' : 'เปิด Auto'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={marketStatus === 'loading'}
              onClick={() => void refreshMarketPrices()}
            >
              <RefreshCw
                className={marketStatus === 'loading' ? 'animate-spin' : ''}
              />
              ดึงราคาตลาดสด
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="ตั้งค่าผู้ให้บริการราคา"
              onClick={() => setMarketOpen(true)}
            >
              <KeyRound />
            </Button>
          </div>
          <p className="text-[11px] leading-4 text-muted-foreground sm:col-span-2 xl:col-span-3">
            ราคาตลาดเป็น XAU/USD spot และ WTI/USD spot จาก Twelve Data อาจต่างจาก
            Bid/Ask ของ XM; ตรวจราคาใน MT4/MT5 ก่อนใช้ตัดสินใจจริง
          </p>
        </section>

        <section className="mb-4">
          <Card className="border border-border/80 shadow-[0_14px_42px_-38px_rgb(15_23_42/0.6)]">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="size-4 text-primary" />
                  กราฟราคา Realtime (TradingView)
                </CardTitle>
                <CardDescription className="text-xs">
                  ข้อมูลสด Realtime จากตลาดโลก • ไม่ต้องใช้ API Key • ปลอดภัย 100% ไม่เสี่ยง Key หลุด
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg bg-muted p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setChartSymbol('OANDA:XAUUSD')}
                    className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                      chartSymbol === 'OANDA:XAUUSD'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    ทองคำ (XAU/USD)
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartSymbol('TVC:USOIL')}
                    className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                      chartSymbol === 'TVC:USOIL'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    น้ำมันดิบ (USOIL)
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChartOpen(!chartOpen)}
                >
                  {chartOpen ? 'ซ่อนกราฟ' : 'แสดงกราฟ'}
                </Button>
              </div>
            </CardHeader>
            {chartOpen && (
              <CardContent className="p-2 sm:p-4">
                <TradingViewChart
                  symbol={chartSymbol}
                  theme="light"
                  interval="15"
                  height={480}
                />
              </CardContent>
            )}
          </Card>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<WalletCards />}
            label="Balance หลังปิดออเดอร์"
            value={money(accountBalance)}
            note={`Realized P/L ${signedMoney(realizedPnl)}`}
          />
          <MetricCard
            icon={<CircleDollarSign />}
            label="Equity ปัจจุบัน"
            value={money(equity)}
            note="สูตร Excel ถือว่าทุนหมดเมื่อ Equity = $0"
            positive={equity >= LIQUIDATION_EQUITY}
            danger={equity < LIQUIDATION_EQUITY}
          />
          <MetricCard
            icon={unrealizedPnl >= 0 ? <ArrowUpRight /> : <ArrowDownRight />}
            label="Unrealized P/L"
            value={signedMoney(unrealizedPnl)}
            note="รวม XAUUSD และ USOIL"
            positive={unrealizedPnl >= 0}
            danger={unrealizedPnl < 0}
          />
          <MetricCard
            icon={<Landmark />}
            label="รายการที่เปิด"
            value={`${openOrders.length} orders`}
            note={`${number(totalLots, 2)} lots รวมทุกสินทรัพย์`}
          />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(350px,0.8fr)]">
          <Card className="border-0 shadow-[0_18px_55px_-38px_rgb(15_23_42/0.45)]">
            <CardHeader className="border-b border-border/70">
              <CardTitle>ภาพรวมสถานะที่เปิดอยู่</CardTitle>
              <CardDescription>
                แยก Buy/Sell และคำนวณต้นทุนเฉลี่ยถ่วงน้ำหนักตาม Lot
              </CardDescription>
              <CardAction>
                <Badge variant="outline">{summaries.length} positions</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="px-0">
              {summaries.length ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/45 hover:bg-muted/45">
                      <TableHead className="pl-4">สินทรัพย์</TableHead>
                      <TableHead>ฝั่ง</TableHead>
                      <TableHead className="text-right">ต้นทุนเฉลี่ย</TableHead>
                      <TableHead className="text-right">ราคาปัจจุบัน</TableHead>
                      <TableHead className="text-right">Lot</TableHead>
                      <TableHead className="pr-4 text-right">P/L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaries.map((position) => (
                      <TableRow key={`${position.symbol}-${position.side}`}>
                        <TableCell className="pl-4 font-semibold">
                          {position.symbol}
                        </TableCell>
                        <TableCell>
                          <SideBadge side={position.side} />
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {number(position.averageEntry)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {number(position.currentPrice)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {number(position.lots, 2)}
                        </TableCell>
                        <TableCell
                          className={`pr-4 text-right font-mono font-semibold ${position.unrealizedPnl >= 0 ? 'text-emerald-700' : 'text-red-700'}`}
                        >
                          {signedMoney(position.unrealizedPnl)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState label="ยังไม่มีออเดอร์ที่เปิดอยู่" />
              )}
            </CardContent>
          </Card>

          <Card className="risk-card border-0 text-white shadow-[0_22px_60px_-34px_rgb(8_47_73/0.75)]">
            <CardHeader>
              <CardTitle className="text-white">ราคาล้างตามสูตร Excel</CardTitle>
              <CardDescription className="text-sky-100/75">
                ใช้ Balance เต็มจำนวนคำนวณแต่ละ Position แยกจากกัน โดยไม่หัก P/L
                ของอีกสินทรัพย์
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {standaloneLiquidations.length ? (
                standaloneLiquidations.map(({ position, result }) => (
                  <StandaloneLiquidationBlock
                    key={`${position.symbol}-${position.side}`}
                    symbol={position.symbol}
                    side={position.side}
                    result={result}
                  />
                ))
              ) : (
                <p className="py-5 text-center text-sm text-sky-100/70">
                  ยังไม่มี Position ที่เปิดอยู่
                </p>
              )}
              <p className="pt-1 text-xs leading-5 text-sky-100/65">
                ค่าคงที่: GOLD Ultra Low Micro ×1 oz และ OIL/OILCash ×100 barrels —
                ไม่สามารถแก้ได้จากหน้าเว็บ
              </p>
            </CardContent>
          </Card>
        </section>

        <Card className="mt-4 border-dashed bg-card/65 shadow-none">
          <CardHeader>
            <CardTitle>แบบจำลองทุนร่วม XAU + Oil (ส่วนเสริม)</CardTitle>
            <CardDescription>
              คำนวณราคาของสินทรัพย์หนึ่งที่ทำให้ Equity รวมเป็น $0 โดยตรึงราคาอีกสินทรัพย์ไว้ ณ
              ราคาปัจจุบัน ผลส่วนนี้ไม่ได้นำไปแทนสูตรหลักจาก Excel
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <SharedCriticalBlock
              symbol="XAUUSD"
              result={xauSharedCritical}
              otherLabel={`ตรึง Oil ที่ ${money(state.currentPrices.USOIL)}`}
            />
            <SharedCriticalBlock
              symbol="USOIL"
              result={oilSharedCritical}
              otherLabel={`ตรึง XAU ที่ ${money(state.currentPrices.XAUUSD)}`}
            />
            <p className="text-xs leading-5 text-muted-foreground md:col-span-2">
              เป็นแบบจำลอง Equity เท่านั้น ไม่รวม used margin, spread, swap และระดับ
              Stop-out จริงของโบรกเกอร์
            </p>
          </CardContent>
        </Card>

        <section className="mt-4 grid gap-4 2xl:grid-cols-[minmax(0,1.5fr)_minmax(420px,0.9fr)]">
          <Card className="border-0 shadow-[0_18px_55px_-42px_rgb(15_23_42/0.55)]">
            <CardHeader className="border-b border-border/70">
              <CardTitle>รายการออเดอร์ที่ยังเปิด</CardTitle>
              <CardDescription>
                เลือกปิดบางส่วนหรือทั้งหมด รายการเดิมและประวัติจะไม่ถูกลบ
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {openOrders.length ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/45 hover:bg-muted/45">
                      <TableHead className="pl-4">เปิดเมื่อ</TableHead>
                      <TableHead>สินทรัพย์</TableHead>
                      <TableHead>ฝั่ง</TableHead>
                      <TableHead className="text-right">ราคาเข้า</TableHead>
                      <TableHead className="text-right">Lot คงเหลือ</TableHead>
                      <TableHead className="text-right">P/L</TableHead>
                      <TableHead className="pr-4 text-right">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openOrders.map((order) => {
                      const pnl = calculateOrderUnrealized(
                        order,
                        state.currentPrices[order.symbol],
                        getContractSize(order.symbol),
                      );
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="pl-4 text-xs text-muted-foreground">
                            {dateTime(order.openedAt)}
                          </TableCell>
                          <TableCell className="font-semibold">
                            {order.symbol}
                          </TableCell>
                          <TableCell>
                            <SideBadge side={order.side} />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {number(order.entryPrice)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {number(order.openLots, 2)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono ${pnl >= 0 ? 'text-emerald-700' : 'text-red-700'}`}
                          >
                            {signedMoney(pnl)}
                          </TableCell>
                          <TableCell className="pr-4 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setClosingOrder(order)}
                            >
                              ปิดออเดอร์
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState label="พอร์ตว่าง — เพิ่มออเดอร์ใหม่ได้เลย" />
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-[0_18px_55px_-42px_rgb(15_23_42/0.55)]">
            <CardHeader className="border-b border-border/70">
              <CardTitle>ประวัติล่าสุด</CardTitle>
              <CardDescription>การปิดออเดอร์และการเพิ่ม/ถอนทุน</CardDescription>
              <CardAction>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCashOpen(true)}
                >
                  <Plus /> ปรับทุน
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-1 px-3 py-2">
              <HistoryList state={state} />
            </CardContent>
          </Card>
        </section>

        <footer className="mt-6 flex flex-col gap-2 border-t border-border/70 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>RiskLedger v1 · บันทึกในฐานข้อมูลของเบราว์เซอร์เครื่องนี้</span>
          <span>อัปเดตล่าสุด {dateTime(state.updatedAt)}</span>
        </footer>
      </div>

      <AddOrderDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={(order) => {
          setState((current) => ({
            ...current,
            orders: [order, ...current.orders],
            updatedAt: new Date().toISOString(),
          }));
          setAddOpen(false);
          setNotice('เพิ่มออเดอร์และบันทึกแล้ว');
        }}
      />
      {closingOrder && (
        <CloseOrderDialog
          key={closingOrder.id}
          order={closingOrder}
          state={state}
          onOpenChange={(open) => !open && setClosingOrder(null)}
          onSubmit={(input) => {
            try {
              setState((current) => closeOrder(current, input));
              setClosingOrder(null);
              setNotice('ปิดออเดอร์และบันทึกกำไร/ขาดทุนจริงแล้ว');
            } catch (error) {
              setNotice(
                error instanceof Error ? error.message : 'ปิดออเดอร์ไม่สำเร็จ',
              );
            }
          }}
        />
      )}
      <CashFlowDialog
        open={cashOpen}
        onOpenChange={setCashOpen}
        onSubmit={(flow) => {
          setState((current) => ({
            ...current,
            cashFlows: [flow, ...current.cashFlows],
            updatedAt: new Date().toISOString(),
          }));
          setCashOpen(false);
          setNotice(
            flow.kind === 'DEPOSIT' ? 'บันทึกการเพิ่มทุนแล้ว' : 'บันทึกการถอนทุนแล้ว',
          );
        }}
      />
      {marketOpen && (
        <MarketPriceDialog
          open={marketOpen}
          onOpenChange={setMarketOpen}
          initialApiKey={marketApiKey}
          busy={marketStatus === 'loading'}
          onConnect={connectMarketPrices}
          onDisconnect={disconnectMarketPrices}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          key={state.updatedAt}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          state={state}
          onSubmit={(settings) => {
            setState((current) => ({
              ...current,
              initialBalance: settings.initialBalance,
              updatedAt: new Date().toISOString(),
            }));
            setSettingsOpen(false);
            setNotice('บันทึกการตั้งค่าแล้ว');
          }}
        />
      )}
    </main>
  );
}

function PriceInput({
  symbol,
  label,
  value,
  onChange,
}: {
  symbol: SymbolCode;
  label: string;
  value: number;
  onChange: (symbol: SymbolCode, value: string) => void;
}) {
  return (
    <label className="flex min-w-0 items-center gap-3 rounded-lg border border-transparent px-2 py-1 transition hover:border-border hover:bg-background/65">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${symbol === 'XAUUSD' ? 'bg-amber-100 text-amber-800' : 'bg-slate-900 text-white'}`}
      >
        {symbol === 'XAUUSD' ? 'AU' : 'WTI'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block font-semibold">{symbol}</span>
      </span>
      <span className="text-muted-foreground">$</span>
      <Input
        className="w-28 text-right font-mono font-semibold sm:w-36"
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => onChange(symbol, event.target.value)}
      />
    </label>
  );
}

function MetricCard({
  icon,
  label,
  value,
  note,
  positive = false,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  positive?: boolean;
  danger?: boolean;
}) {
  return (
    <Card className="border-0 bg-card/92 shadow-[0_16px_48px_-38px_rgb(15_23_42/0.65)]">
      <CardHeader>
        <CardDescription className="flex items-center gap-2 [&_svg]:size-4">
          {icon}
          <span>{label}</span>
        </CardDescription>
        <CardTitle
          className={`mt-2 font-mono text-xl ${danger ? 'text-red-700' : positive ? 'text-emerald-700' : ''}`}
        >
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}

function SideBadge({ side }: { side: Side }) {
  return side === 'BUY' ? (
    <Badge className="bg-sky-100 text-sky-800">BUY</Badge>
  ) : (
    <Badge className="bg-orange-100 text-orange-800">SELL</Badge>
  );
}

function StandaloneLiquidationBlock({
  symbol,
  side,
  result,
}: {
  symbol: SymbolCode;
  side: Side;
  result: ReturnType<typeof getStandaloneLiquidationPrice>;
}) {
  const description =
    result.kind === 'NO_EXPOSURE'
      ? 'ไม่มี Position'
      : result.kind === 'BELOW_ZERO'
        ? 'ไม่ล้างเหนือ $0'
        : money(result.price ?? 0);
  return (
    <div className="rounded-lg border border-white/10 bg-white/8 p-4">
      <div className="flex items-center justify-between gap-3 text-xs text-sky-100/70">
        <span>คิดแยกตามสูตรเดิม</span>
        <ShieldAlert className="size-4 shrink-0" />
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 font-semibold text-sky-100">
          {displaySymbol(symbol)} <SideBadge side={side} />
        </span>
        <p className="text-right font-mono text-xl font-semibold">
          {description}
        </p>
      </div>
      {result.kind === 'BELOW_ZERO' && (
        <p className="mt-2 text-right text-[11px] text-sky-100/55">
          ราคาที่สูตรคำนวณได้ {money(result.price ?? 0)}
        </p>
      )}
    </div>
  );
}

function SharedCriticalBlock({
  symbol,
  result,
  otherLabel,
}: {
  symbol: SymbolCode;
  result: ReturnType<typeof getSharedPortfolioLiquidationPrice>;
  otherLabel: string;
}) {
  const description =
    result.kind === 'NO_EXPOSURE'
      ? 'ไม่มี Net exposure'
      : result.kind === 'BELOW_ZERO'
        ? 'ไม่มีจุดวิกฤตเหนือ $0'
        : money(result.price ?? 0);
  return (
    <div className="rounded-lg border bg-background/70 p-4">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{otherLabel}</span>
        <ShieldAlert className="size-4 shrink-0" />
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="font-semibold">{displaySymbol(symbol)}</span>
        <p className="text-right font-mono text-xl font-semibold">
          {description}
        </p>
      </div>
      {result.kind === 'BELOW_ZERO' && (
        <p className="mt-2 text-right text-[11px] text-muted-foreground">
          ค่าที่คำนวณได้ {money(result.price ?? 0)}
        </p>
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
      <ArchiveRestore className="size-6" />
      <p>{label}</p>
    </div>
  );
}

function HistoryList({ state }: { state: PortfolioState }) {
  const items = [
    ...state.closes.map((close) => ({
      id: close.id,
      date: close.closedAt,
      title: `ปิด ${close.symbol} ${close.side}`,
      detail: `${number(close.lots, 2)} lot @ ${money(close.exitPrice)}`,
      amount: close.realizedPnl,
    })),
    ...state.cashFlows.map((flow) => ({
      id: flow.id,
      date: flow.occurredAt,
      title: flow.kind === 'DEPOSIT' ? 'เพิ่มทุน' : 'ถอนทุน',
      detail: flow.note || 'ปรับยอดทุน',
      amount: flow.kind === 'DEPOSIT' ? flow.amount : -flow.amount,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
  if (!items.length) return <EmptyState label="ยังไม่มีประวัติการปิดหรือปรับทุน" />;
  return items.map((item) => (
    <div
      key={item.id}
      className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/55"
    >
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${item.amount >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
      >
        <History className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{item.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {item.detail} · {dateTime(item.date)}
        </span>
      </span>
      <span
        className={`font-mono text-xs font-semibold ${item.amount >= 0 ? 'text-emerald-700' : 'text-red-700'}`}
      >
        {signedMoney(item.amount)}
      </span>
    </div>
  ));
}

function AddOrderDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (order: Order) => void;
}) {
  const [symbol, setSymbol] = useState<SymbolCode>('XAUUSD');
  const [side, setSide] = useState<Side>('BUY');
  const [price, setPrice] = useState('');
  const [lots, setLots] = useState('0.10');
  const [openedAt, setOpenedAt] = useState(nowForInput());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const submit = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const entryPrice = Number(price);
    const initialLots = Number(lots);
    if (!(entryPrice > 0) || !(initialLots > 0)) {
      setError('กรุณากรอกราคาและ Lot ให้มากกว่า 0');
      return;
    }
    onSubmit({
      id: crypto.randomUUID(),
      symbol,
      side,
      entryPrice,
      initialLots,
      openLots: initialLots,
      openedAt: new Date(openedAt).toISOString(),
      note: note.trim(),
    });
    setPrice('');
    setLots('0.10');
    setOpenedAt(nowForInput());
    setNote('');
    setError('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>เพิ่มออเดอร์ใหม่</DialogTitle>
          <DialogDescription>
            รายการจะถูกเพิ่มในพอร์ตและบันทึกอัตโนมัติ
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="สินทรัพย์">
              <NativeSelect
                className="w-full"
                value={symbol}
                onChange={(event) =>
                  setSymbol(event.target.value as SymbolCode)
                }
              >
                <NativeSelectOption value="XAUUSD">
                  GOLD micro — XAUUSD ×1
                </NativeSelectOption>
                <NativeSelectOption value="USOIL">
                  OIL / OILCash — WTI ×100
                </NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field label="ฝั่ง">
              <NativeSelect
                className="w-full"
                value={side}
                onChange={(event) => setSide(event.target.value as Side)}
              >
                <NativeSelectOption value="BUY">BUY — ซื้อ</NativeSelectOption>
                <NativeSelectOption value="SELL">SELL — ขาย</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field label="ราคาเข้า (USD)">
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="Lot">
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={lots}
                onChange={(event) => setLots(event.target.value)}
              />
            </Field>
          </div>
          <Field label="วันที่และเวลาเปิด">
            <Input
              type="datetime-local"
              value={openedAt}
              onChange={(event) => setOpenedAt(event.target.value)}
            />
          </Field>
          <Field label="บันทึกเพิ่มเติม">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="เช่น เหตุผลที่เข้า, แผนการตามทุน"
            />
          </Field>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              ยกเลิก
            </Button>
            <Button type="submit">
              <Plus /> เพิ่มออเดอร์
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CloseOrderDialog({
  order,
  state,
  onOpenChange,
  onSubmit,
}: {
  order: Order;
  state: PortfolioState;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    orderId: string;
    lots: number;
    exitPrice: number;
    closedAt: string;
    note: string;
  }) => void;
}) {
  const [lots, setLots] = useState(String(order.openLots));
  const [exitPrice, setExitPrice] = useState(
    String(state.currentPrices[order.symbol]),
  );
  const [closedAt, setClosedAt] = useState(nowForInput());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const preview =
    Number(lots) > 0 && Number(exitPrice) > 0
      ? (order.side === 'BUY' ? 1 : -1) *
        (Number(exitPrice) - order.entryPrice) *
        Number(lots) *
        getContractSize(order.symbol)
      : 0;
  const submit = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const closeLots = Number(lots);
    const closePrice = Number(exitPrice);
    if (
      !(closeLots > 0) ||
      closeLots - order.openLots > 1e-9 ||
      !(closePrice > 0)
    ) {
      setError('ตรวจสอบ Lot และราคาปิดอีกครั้ง');
      return;
    }
    onSubmit({
      orderId: order.id,
      lots: closeLots,
      exitPrice: closePrice,
      closedAt: new Date(closedAt).toISOString(),
      note: note.trim(),
    });
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>ปิดออเดอร์ {order.symbol}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{order.side}</span>{' '}
            เข้า {money(order.entryPrice)} · เหลือ {number(order.openLots, 2)} lot
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Lot ที่ต้องการปิด">
              <Input
                type="number"
                min="0"
                max={order.openLots}
                step="0.01"
                value={lots}
                onChange={(event) => setLots(event.target.value)}
              />
            </Field>
            <Field label="ราคาปิด (USD)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={exitPrice}
                onChange={(event) => setExitPrice(event.target.value)}
              />
            </Field>
          </div>
          <Field label="วันที่และเวลาปิด">
            <Input
              type="datetime-local"
              value={closedAt}
              onChange={(event) => setClosedAt(event.target.value)}
            />
          </Field>
          <Field label="บันทึก">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="เหตุผลที่ปิดหรือแผนถัดไป"
            />
          </Field>
          <div
            className={`rounded-lg px-3 py-2.5 text-sm ${preview >= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}
          >
            Realized P/L โดยประมาณ{' '}
            <strong className="float-right font-mono">
              {signedMoney(preview)}
            </strong>
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              ยกเลิก
            </Button>
            <Button type="submit">ยืนยันปิดออเดอร์</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CashFlowDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (flow: CashFlow) => void;
}) {
  const [kind, setKind] = useState<CashFlow['kind']>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(nowForInput());
  const [note, setNote] = useState('');
  const submit = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) return;
    onSubmit({
      id: crypto.randomUUID(),
      kind,
      amount: value,
      occurredAt: new Date(occurredAt).toISOString(),
      note: note.trim(),
    });
    setAmount('');
    setNote('');
    setOccurredAt(nowForInput());
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>เพิ่มหรือถอนทุน</DialogTitle>
          <DialogDescription>
            การปรับทุนจะมีประวัติและนำไปคำนวณ Balance
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="ประเภท">
            <NativeSelect
              className="w-full"
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as CashFlow['kind'])
              }
            >
              <NativeSelectOption value="DEPOSIT">เพิ่มทุน</NativeSelectOption>
              <NativeSelectOption value="WITHDRAWAL">ถอนทุน</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field label="จำนวนเงิน (USD)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label="วันที่และเวลา">
            <Input
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </Field>
          <Field label="บันทึก">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              ยกเลิก
            </Button>
            <Button type="submit">บันทึก</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  state,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: PortfolioState;
  onSubmit: (settings: { initialBalance: number }) => void;
}) {
  const [initialBalance, setInitialBalance] = useState(
    String(state.initialBalance),
  );
  const submit = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = { initialBalance: Number(initialBalance) };
    if (!Number.isFinite(values.initialBalance) || values.initialBalance < 0)
      return;
    onSubmit(values);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>ตั้งค่าทุนตั้งต้น</DialogTitle>
          <DialogDescription>
            สูตรและตัวคูณสัญญาถูกล็อกให้ตรงกับไฟล์ Excel
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="ทุนเริ่มต้น (USD)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={initialBalance}
              onChange={(event) => setInitialBalance(event.target.value)}
            />
          </Field>
          <div className="grid gap-2 rounded-lg bg-sky-50 px-3 py-3 text-xs leading-5 text-sky-950">
            <p>
              <strong>GOLD Ultra Low Micro:</strong> 1 lot = 1 oz → ตัวคูณ ×1
            </p>
            <p>
              <strong>OIL / OILCash:</strong> 1 lot = 100 barrels → ตัวคูณ ×100
            </p>
            <p>
              <strong>จุดล้างตาม Excel:</strong> Equity = $0
            </p>
          </div>
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            ห้ามใช้กับ OILMn ซึ่งเป็นสัญญา Mini และมีขนาดต่างจาก OIL/OILCash ในไฟล์นี้
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              ยกเลิก
            </Button>
            <Button type="submit">บันทึกทุนตั้งต้น</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MarketPriceDialog({
  open,
  onOpenChange,
  initialApiKey,
  busy,
  onConnect,
  onDisconnect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialApiKey: string;
  busy: boolean;
  onConnect: (apiKey: string) => Promise<void>;
  onDisconnect: () => void;
}) {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const submit = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (apiKey.trim()) void onConnect(apiKey);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>เชื่อมราคาตลาด XAU และ Oil</DialogTitle>
          <DialogDescription>
            ใช้ XAU/USD spot และ WTI/USD spot จาก Twelve Data
            แล้วนำค่าที่ดึงได้มาใส่ในช่องราคาปัจจุบัน
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Twelve Data API key หรือ Cloudflare Proxy URL">
            <Input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="ใส่ API key หรือ URL เช่น https://..."
            />
          </Field>
          <div className="grid gap-2 rounded-lg bg-sky-50 px-3 py-3 text-xs leading-5 text-sky-950">
            <p>
              <strong>แหล่งราคา:</strong> XAU/USD และ WTI/USD Commodity Aggregate
            </p>
            <p>
              <strong>ความปลอดภัย:</strong> บันทึกเฉพาะในเบราว์เซอร์เครื่องนี้ (localStorage) ไม่ถูกส่งขึ้น GitHub
            </p>
            <p>
              <strong>คำแนะนำ:</strong> สามารถใส่ Twelve Data API key ตรงๆ หรือใส่ Cloudflare Worker Proxy URL เพื่อซ่อน Key 100%
            </p>
          </div>
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            ราคานี้เป็นราคาอ้างอิง spot ไม่ใช่ Bid/Ask ของ XM และไม่ได้รวม spread
            หรือช่วงตลาดปิด
          </div>
          <a
            className="text-sm font-medium text-primary underline underline-offset-4"
            href="https://twelvedata.com/"
            target="_blank"
            rel="noreferrer"
          >
            สมัครหรือเปิดหน้า API key ของ Twelve Data
          </a>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={!initialApiKey || busy}
              onClick={onDisconnect}
            >
              ลบ API key
            </Button>
            <span className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={!apiKey.trim() || busy}>
                {busy ? <RefreshCw className="animate-spin" /> : <KeyRound />}{' '}
                บันทึกและดึงราคา
              </Button>
            </span>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function signedMoney(value: number) {
  if (Math.abs(value) < 0.005) return money(0);
  return `${value > 0 ? '+' : '-'}${money(Math.abs(value))}`;
}

function displaySymbol(symbol: SymbolCode) {
  return symbol === 'XAUUSD' ? 'XAUUSD / GOLD micro' : 'OIL / OILCash';
}
